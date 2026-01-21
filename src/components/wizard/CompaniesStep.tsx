'use client'

import { useState, useRef } from 'react'
import { Minus, Plus, Sparkles, Upload, Check, Loader2, FileText, X } from 'lucide-react'
import Papa from 'papaparse'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { ProjectContext, Segment, Company } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { loggedFetch } from '@/lib/promptLogger'

interface SegmentWithCount extends Segment {
  count: number
}

// Parsed company from import (before enrichment)
interface ParsedCompany {
  id: string
  name: string
  website?: string
  type?: string
  description?: string
}

// Generated company from API (before enrichment)
interface GeneratedCompany extends Company {
  selected: boolean
}

interface CompaniesStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function CompaniesStep({ project, onUpdate, onComplete }: CompaniesStepProps) {
  const { addToast } = useToast()
  const schemaConfig = project.schema_config as {
    extractedContext?: ProjectContext
    companies?: Company[]
  }

  const extractedContext = schemaConfig.extractedContext

  // Initialize segments with counts
  const [segmentsWithCounts, setSegmentsWithCounts] = useState<SegmentWithCount[]>(
    () => (extractedContext?.segments || []).map((seg) => ({
      ...seg,
      count: 5, // default count per segment
    }))
  )

  const [showImport, setShowImport] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEnriching, setIsEnriching] = useState(false)
  const [generatedCompanies, setGeneratedCompanies] = useState<GeneratedCompany[]>([])
  const [error, setError] = useState<string | null>(null)

  // Add segment state
  const [showAddSegment, setShowAddSegment] = useState(false)
  const [newSegmentName, setNewSegmentName] = useState('')
  const [newSegmentDescription, setNewSegmentDescription] = useState('')
  const [newSegmentCount, setNewSegmentCount] = useState(5)
  const [isSavingSegment, setIsSavingSegment] = useState(false)

  // Import flow state
  const [importText, setImportText] = useState('')
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompany[]>([])
  const [csvColumns, setCsvColumns] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [showColumnMapper, setShowColumnMapper] = useState(false)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // No extracted context yet
  if (!extractedContext) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 2 (Context) first to define target segments.
      </div>
    )
  }

  // Note: We no longer return early for no segments - allow adding segments here

  const handleCountChange = (segmentId: string, delta: number) => {
    setSegmentsWithCounts((prev) =>
      prev.map((seg) =>
        seg.id === segmentId
          ? { ...seg, count: Math.max(1, Math.min(50, seg.count + delta)) }
          : seg
      )
    )
  }

  const handleCountInput = (segmentId: string, value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num)) {
      setSegmentsWithCounts((prev) =>
        prev.map((seg) =>
          seg.id === segmentId
            ? { ...seg, count: Math.max(1, Math.min(50, num)) }
            : seg
        )
      )
    }
  }

  const totalCount = segmentsWithCounts.reduce((sum, seg) => sum + seg.count, 0)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      // Build segment counts map
      const segmentCounts: Record<string, number> = {}
      segmentsWithCounts.forEach((seg) => {
        segmentCounts[seg.id] = seg.count
      })

      // Get existing company names to exclude
      const existingNames = (schemaConfig.companies || []).map((c) => c.name)

      const response = await loggedFetch('/api/generate-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: extractedContext,
          segments: segmentsWithCounts,
          segmentCounts,
          excludeNames: existingNames,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate companies')
      }

      const data = await response.json()
      const companies: Company[] = data.companies || []

      // Add selected flag to each company (all selected by default)
      setGeneratedCompanies(companies.map((c) => ({ ...c, selected: true })))
    } catch (err) {
      console.error('Generate error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate companies')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleToggleSelect = (companyId: string) => {
    setGeneratedCompanies((prev) =>
      prev.map((c) =>
        c.id === companyId ? { ...c, selected: !c.selected } : c
      )
    )
  }

  const handleSelectAll = () => {
    setGeneratedCompanies((prev) => prev.map((c) => ({ ...c, selected: true })))
  }

  const handleDeselectAll = () => {
    setGeneratedCompanies((prev) => prev.map((c) => ({ ...c, selected: false })))
  }

  const selectedCount = generatedCompanies.filter((c) => c.selected).length

  const handleEnrichSelected = async () => {
    const selectedCompanies = generatedCompanies.filter((c) => c.selected)
    if (selectedCompanies.length === 0) return

    setIsEnriching(true)
    setError(null)

    try {
      // Call enrich API
      const response = await loggedFetch('/api/enrich-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: selectedCompanies,
          context: extractedContext,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to enrich companies')
      }

      const data = await response.json()
      const enrichedCompanies: Company[] = data.companies || []

      // Merge with existing companies (with duplicate detection)
      const existingCompanies: Company[] = schemaConfig.companies || []

      // Create sets for quick duplicate lookup
      const existingNames = new Set(existingCompanies.map((c) => c.name.toLowerCase().trim()))
      const existingDomains = new Set(
        existingCompanies
          .map((c) => c.domain?.toLowerCase().trim())
          .filter((d): d is string => !!d)
      )

      // Filter out duplicates
      const newCompanies = enrichedCompanies.filter((c) => {
        const nameLower = c.name.toLowerCase().trim()
        const domainLower = c.domain?.toLowerCase().trim()

        // Check if name already exists
        if (existingNames.has(nameLower)) return false

        // Check if domain already exists (if company has a domain)
        if (domainLower && existingDomains.has(domainLower)) return false

        return true
      })

      const duplicateCount = enrichedCompanies.length - newCompanies.length
      const allCompanies = [...existingCompanies, ...newCompanies]

      // Save to Supabase
      const supabase = getSupabase()

      // Save only new companies to companies table
      for (const company of newCompanies) {
        await supabase.from('companies').upsert({
          id: company.id,
          project_id: project.id,
          name: company.name,
          website: company.website || null,
          description: company.description || null,
          relevance_score: company.relevance?.includes('High') ? 3 : company.relevance?.includes('Medium') ? 2 : 1,
          relevance_notes: company.relevance || null,
          status: company.status || 'not_contacted',
          custom_fields: {
            type: company.type,
            domain: company.domain,
            verificationStatus: company.verificationStatus,
            verificationSource: company.verificationSource,
          },
        })
      }

      // Update project schema_config with companies list
      const updatedSchemaConfig = {
        ...schemaConfig,
        companies: allCompanies,
      }

      const { error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)

      if (updateError) {
        throw updateError
      }

      // Update local state
      const updatedProject: Project = {
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      }
      onUpdate(updatedProject)

      // Show success toast with duplicate info
      if (duplicateCount > 0) {
        addToast(
          `Added ${newCompanies.length} companies (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped)`,
          'success'
        )
      } else {
        addToast(`Added ${newCompanies.length} companies to the table`, 'success')
      }

      // Clear generated companies (they're now in the table)
      setGeneratedCompanies([])

      // Move to next step
      onComplete()
    } catch (err) {
      console.error('Enrich error:', err)
      setError(err instanceof Error ? err.message : 'Failed to enrich companies')
      addToast('Failed to add companies', 'error')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleImportClick = () => {
    setShowImport(true)
  }

  // Add new segment and sync to Supabase
  const handleAddSegment = async () => {
    if (!newSegmentName.trim()) return

    setIsSavingSegment(true)
    setError(null)

    try {
      const newSegment: SegmentWithCount = {
        id: `seg_${Date.now()}`,
        name: newSegmentName.trim(),
        description: newSegmentDescription.trim(),
        count: newSegmentCount,
      }

      // Add to local state
      const updatedSegments = [...segmentsWithCounts, newSegment]
      setSegmentsWithCounts(updatedSegments)

      // Sync back to extractedContext in Supabase
      const supabase = getSupabase()
      const updatedContext: ProjectContext = {
        ...extractedContext,
        segments: updatedSegments.map(({ count: _count, ...seg }) => seg),
      }

      const updatedSchemaConfig = {
        ...schemaConfig,
        extractedContext: updatedContext,
      }

      const { data, error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)
        .select()
        .single()

      if (updateError) throw updateError

      onUpdate(data)

      // Reset form
      setShowAddSegment(false)
      setNewSegmentName('')
      setNewSegmentDescription('')
      setNewSegmentCount(5)

      addToast(`Added segment "${newSegment.name}"`, 'success')
    } catch (err) {
      console.error('Error adding segment:', err)
      setError(err instanceof Error ? err.message : 'Failed to add segment')
    } finally {
      setIsSavingSegment(false)
    }
  }

  const handleCancelAddSegment = () => {
    setShowAddSegment(false)
    setNewSegmentName('')
    setNewSegmentDescription('')
    setNewSegmentCount(5)
  }

  // Parse pasted text into company objects
  const handleParseText = () => {
    const lines = importText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      setError('Please enter at least one company name')
      return
    }

    const parsed: ParsedCompany[] = lines.map((name, index) => ({
      id: `import-${Date.now()}-${index}`,
      name,
    }))

    setParsedCompanies(parsed)
    setError(null)
  }

  // Handle CSV file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          setError('CSV file is empty')
          return
        }

        const columns = results.meta.fields || []
        setCsvColumns(columns)
        setCsvData(results.data)

        // Auto-map columns by common names
        const autoMapping: Record<string, string> = {}
        const nameMatches = ['name', 'company', 'company_name', 'companyname', 'company name']
        const websiteMatches = ['website', 'url', 'site', 'web', 'domain']
        const typeMatches = ['type', 'category', 'segment', 'industry']
        const descMatches = ['description', 'desc', 'about', 'notes']

        columns.forEach((col) => {
          const lowerCol = col.toLowerCase()
          if (nameMatches.some((m) => lowerCol.includes(m))) {
            autoMapping.name = col
          } else if (websiteMatches.some((m) => lowerCol.includes(m))) {
            autoMapping.website = col
          } else if (typeMatches.some((m) => lowerCol.includes(m))) {
            autoMapping.type = col
          } else if (descMatches.some((m) => lowerCol.includes(m))) {
            autoMapping.description = col
          }
        })

        setColumnMapping(autoMapping)
        setShowColumnMapper(true)
        setError(null)
      },
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`)
      },
    })

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Apply column mapping and parse CSV data
  const handleApplyMapping = () => {
    if (!columnMapping.name) {
      setError('Please select a column for Company Name')
      return
    }

    const parsed: ParsedCompany[] = csvData.map((row, index) => ({
      id: `import-${Date.now()}-${index}`,
      name: row[columnMapping.name] || '',
      website: columnMapping.website ? row[columnMapping.website] : undefined,
      type: columnMapping.type ? row[columnMapping.type] : undefined,
      description: columnMapping.description ? row[columnMapping.description] : undefined,
    })).filter((c) => c.name.trim().length > 0)

    if (parsed.length === 0) {
      setError('No valid companies found in CSV')
      return
    }

    setParsedCompanies(parsed)
    setShowColumnMapper(false)
    setError(null)
  }

  // Remove a parsed company from the list
  const handleRemoveParsed = (id: string) => {
    setParsedCompanies((prev) => prev.filter((c) => c.id !== id))
  }

  // Enrich imported companies and save to database
  const handleEnrichImported = async () => {
    if (parsedCompanies.length === 0) return

    setIsEnriching(true)
    setError(null)
    setEnrichProgress({ current: 0, total: parsedCompanies.length })

    try {
      // Convert ParsedCompany to Company format for API
      const companiesToEnrich: Company[] = parsedCompanies.map((pc) => ({
        id: pc.id,
        name: pc.name,
        type: pc.type || '',
        website: pc.website || '',
        domain: '',
        description: pc.description || '',
        relevance: '',
        status: 'not_contacted' as const,
        verificationStatus: 'unverified' as const,
        verificationSource: 'import' as const,
        verifiedAt: null,
        websiteAccessible: false,
      }))

      // Enrich in batches of 10
      const batchSize = 10
      const enrichedResults: Company[] = []

      for (let i = 0; i < companiesToEnrich.length; i += batchSize) {
        const batch = companiesToEnrich.slice(i, i + batchSize)

        const response = await loggedFetch('/api/enrich-companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: batch,
            context: extractedContext,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to enrich companies')
        }

        const data = await response.json()
        enrichedResults.push(...(data.companies || []))

        setEnrichProgress({ current: Math.min(i + batchSize, companiesToEnrich.length), total: companiesToEnrich.length })
      }

      // Merge with existing companies (with duplicate detection)
      const existingCompanies: Company[] = schemaConfig.companies || []

      // Create sets for quick duplicate lookup
      const existingNames = new Set(existingCompanies.map((c) => c.name.toLowerCase().trim()))
      const existingDomains = new Set(
        existingCompanies
          .map((c) => c.domain?.toLowerCase().trim())
          .filter((d): d is string => !!d)
      )

      // Filter out duplicates
      const newCompanies = enrichedResults.filter((c) => {
        const nameLower = c.name.toLowerCase().trim()
        const domainLower = c.domain?.toLowerCase().trim()

        // Check if name already exists
        if (existingNames.has(nameLower)) return false

        // Check if domain already exists (if company has a domain)
        if (domainLower && existingDomains.has(domainLower)) return false

        return true
      })

      const duplicateCount = enrichedResults.length - newCompanies.length
      const allCompanies = [...existingCompanies, ...newCompanies]

      // Save to Supabase
      const supabase = getSupabase()

      // Save only new companies to companies table
      for (const company of newCompanies) {
        await supabase.from('companies').upsert({
          id: company.id,
          project_id: project.id,
          name: company.name,
          website: company.website || null,
          description: company.description || null,
          relevance_score: company.relevance?.includes('High') ? 3 : company.relevance?.includes('Medium') ? 2 : 1,
          relevance_notes: company.relevance || null,
          status: company.status || 'not_contacted',
          custom_fields: {
            type: company.type,
            domain: company.domain,
            verificationStatus: company.verificationStatus,
            verificationSource: company.verificationSource,
          },
        })
      }

      // Update project schema_config with companies list
      const updatedSchemaConfig = {
        ...schemaConfig,
        companies: allCompanies,
      }

      const { error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)

      if (updateError) {
        throw updateError
      }

      // Update local state
      const updatedProject: Project = {
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      }
      onUpdate(updatedProject)

      // Show success toast with duplicate info
      if (duplicateCount > 0) {
        addToast(
          `Imported ${newCompanies.length} companies (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped)`,
          'success'
        )
      } else {
        addToast(`Imported ${newCompanies.length} companies to the table`, 'success')
      }

      // Clear import state
      setParsedCompanies([])
      setImportText('')
      setShowImport(false)
      setEnrichProgress(null)

      // Move to next step
      onComplete()
    } catch (err) {
      console.error('Enrich import error:', err)
      setError(err instanceof Error ? err.message : 'Failed to enrich companies')
      addToast('Failed to import companies', 'error')
    } finally {
      setIsEnriching(false)
      setEnrichProgress(null)
    }
  }

  // Cancel import and reset state
  const handleCancelImport = () => {
    setShowImport(false)
    setParsedCompanies([])
    setImportText('')
    setCsvColumns([])
    setColumnMapping({})
    setShowColumnMapper(false)
    setCsvData([])
    setError(null)
  }

  // Show column mapper for CSV
  if (showColumnMapper) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900">Map CSV Columns</h4>
          <button
            onClick={() => setShowColumnMapper(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Found {csvData.length} rows. Map columns to import fields:
        </p>

        <div className="space-y-3">
          {/* Company Name (required) */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28">Company Name *</label>
            <select
              value={columnMapping.name || ''}
              onChange={(e) => setColumnMapping((prev) => ({ ...prev, name: e.target.value }))}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select column...</option>
              {csvColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Website (optional) */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28">Website</label>
            <select
              value={columnMapping.website || ''}
              onChange={(e) => setColumnMapping((prev) => ({ ...prev, website: e.target.value }))}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Skip</option>
              {csvColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Type (optional) */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28">Type</label>
            <select
              value={columnMapping.type || ''}
              onChange={(e) => setColumnMapping((prev) => ({ ...prev, type: e.target.value }))}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Skip</option>
              {csvColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Description (optional) */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700 w-28">Description</label>
            <select
              value={columnMapping.description || ''}
              onChange={(e) => setColumnMapping((prev) => ({ ...prev, description: e.target.value }))}
              className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Skip</option>
              {csvColumns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <button
          onClick={handleApplyMapping}
          disabled={!columnMapping.name}
          className={cn(
            'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors',
            !columnMapping.name
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          Import {csvData.length} Companies
        </button>
      </div>
    )
  }

  // Show parsed companies (editable list before enrichment)
  if (parsedCompanies.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">{parsedCompanies.length}</span> companies to import
          </div>
          <button
            onClick={handleCancelImport}
            disabled={isEnriching}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* Progress bar during enrichment */}
        {enrichProgress && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Enriching companies...</span>
              <span>{enrichProgress.current} / {enrichProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Parsed company list */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {parsedCompanies.map((company) => (
            <div
              key={company.id}
              className="p-3 border border-gray-200 rounded-lg bg-white flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 text-sm">
                  {company.name}
                </h4>
                {company.website && (
                  <p className="text-xs text-gray-500 mt-0.5">{company.website}</p>
                )}
                {company.type && (
                  <p className="text-xs text-gray-400 mt-0.5">{company.type}</p>
                )}
              </div>
              <button
                onClick={() => handleRemoveParsed(company.id)}
                disabled={isEnriching}
                className="text-gray-400 hover:text-red-500 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <button
          onClick={handleEnrichImported}
          disabled={parsedCompanies.length === 0 || isEnriching}
          className={cn(
            'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            parsedCompanies.length === 0 || isEnriching
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isEnriching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Enriching...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Enrich & Add ({parsedCompanies.length})
            </>
          )}
        </button>
      </div>
    )
  }

  // Show generated companies if we have them
  if (generatedCompanies.length > 0) {
    return (
      <div className="space-y-4">
        {/* Header with selection controls */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">{selectedCount}</span> of{' '}
            <span className="font-semibold">{generatedCompanies.length}</span> selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDeselectAll}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Deselect all
            </button>
          </div>
        </div>

        {/* Generated company cards */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {generatedCompanies.map((company) => (
            <button
              key={company.id}
              onClick={() => handleToggleSelect(company.id)}
              className={cn(
                'w-full p-3 border rounded-lg text-left transition-all',
                company.selected
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                    company.selected
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {company.selected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>

                {/* Company info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 text-sm">
                    {company.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {company.type}
                  </p>
                  {company.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleEnrichSelected}
            disabled={selectedCount === 0 || isEnriching}
            className={cn(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
              selectedCount === 0 || isEnriching
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {isEnriching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enriching...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Enrich Selected ({selectedCount})
              </>
            )}
          </button>
          <button
            onClick={() => setGeneratedCompanies([])}
            disabled={isEnriching}
            className="py-2 px-4 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Segment Cards */}
      <div className="space-y-3">
        {segmentsWithCounts.map((segment) => (
          <div
            key={segment.id}
            className="p-3 border border-gray-200 rounded-lg bg-white"
          >
            <div className="flex items-start gap-3">
              {/* Segment Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 text-sm">
                  {segment.name}
                </h4>
                {segment.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {segment.description}
                  </p>
                )}
              </div>

              {/* Count Controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleCountChange(segment.id, -1)}
                  disabled={segment.count <= 1 || isGenerating}
                  className={cn(
                    'p-1.5 rounded-md border transition-colors',
                    segment.count <= 1 || isGenerating
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={segment.count}
                  onChange={(e) => handleCountInput(segment.id, e.target.value)}
                  disabled={isGenerating}
                  className="w-10 text-center text-sm font-medium border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />
                <button
                  onClick={() => handleCountChange(segment.id, 1)}
                  disabled={segment.count >= 50 || isGenerating}
                  className={cn(
                    'p-1.5 rounded-md border transition-colors',
                    segment.count >= 50 || isGenerating
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* No segments placeholder */}
        {segmentsWithCounts.length === 0 && !showAddSegment && (
          <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center">
            <p className="text-sm text-gray-500 mb-2">
              No segments defined yet.
            </p>
            <button
              onClick={() => setShowAddSegment(true)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add your first segment
            </button>
          </div>
        )}

        {/* Add Segment Form */}
        {showAddSegment && (
          <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">New Segment</h4>
              <button
                onClick={handleCancelAddSegment}
                disabled={isSavingSegment}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                disabled={isSavingSegment}
                placeholder="Segment name (e.g., Distributors)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
              <textarea
                value={newSegmentDescription}
                onChange={(e) => setNewSegmentDescription(e.target.value)}
                disabled={isSavingSegment}
                placeholder="Describe this segment (optional)"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Companies to generate:</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setNewSegmentCount(Math.max(1, newSegmentCount - 1))}
                    disabled={newSegmentCount <= 1 || isSavingSegment}
                    className={cn(
                      'p-1.5 rounded-md border transition-colors',
                      newSegmentCount <= 1 || isSavingSegment
                        ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="text"
                    value={newSegmentCount}
                    onChange={(e) => {
                      const num = parseInt(e.target.value, 10)
                      if (!isNaN(num)) setNewSegmentCount(Math.max(1, Math.min(50, num)))
                    }}
                    disabled={isSavingSegment}
                    className="w-10 text-center text-sm font-medium border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  />
                  <button
                    onClick={() => setNewSegmentCount(Math.min(50, newSegmentCount + 1))}
                    disabled={newSegmentCount >= 50 || isSavingSegment}
                    className={cn(
                      'p-1.5 rounded-md border transition-colors',
                      newSegmentCount >= 50 || isSavingSegment
                        ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={handleAddSegment}
                disabled={!newSegmentName.trim() || isSavingSegment}
                className={cn(
                  'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
                  !newSegmentName.trim() || isSavingSegment
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {isSavingSegment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Segment'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Add Segment Button (when segments exist) */}
        {segmentsWithCounts.length > 0 && !showAddSegment && (
          <button
            onClick={() => setShowAddSegment(true)}
            disabled={isGenerating}
            className="w-full p-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Add Segment
          </button>
        )}
      </div>

      {/* Total Count */}
      {segmentsWithCounts.length > 0 && (
        <div className="text-sm text-gray-600 text-right">
          Total: <span className="font-semibold">{totalCount}</span> companies
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || segmentsWithCounts.length === 0}
          className={cn(
            'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            isGenerating || segmentsWithCounts.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate Companies
            </>
          )}
        </button>
        <button
          onClick={handleImportClick}
          disabled={isGenerating}
          className="py-2 px-4 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          I have companies
        </button>
      </div>

      {/* Hidden file input for CSV upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Import Section (revealed when clicking "I have companies") */}
      {showImport && (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Import Companies</h4>
            <button
              onClick={handleCancelImport}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste company names (one per line)..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Upload CSV
            </button>
            <button
              onClick={handleParseText}
              disabled={importText.trim().length === 0}
              className={cn(
                'flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                importText.trim().length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              Parse & Review
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
