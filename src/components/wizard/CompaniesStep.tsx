'use client'

import { useState } from 'react'
import { Minus, Plus, Sparkles, Upload, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { ProjectContext, Segment, Company } from '@/types'

interface SegmentWithCount extends Segment {
  count: number
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

  // No extracted context yet
  if (!extractedContext) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 2 (Context) first to define target segments.
      </div>
    )
  }

  // No segments defined
  if (segmentsWithCounts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        No segments defined. Go back to Step 2 (Context) to add target segments.
      </div>
    )
  }

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

      const response = await fetch('/api/generate-list', {
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
      const response = await fetch('/api/enrich-companies', {
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

      // Merge with existing companies
      const existingCompanies: Company[] = schemaConfig.companies || []
      const allCompanies = [...existingCompanies, ...enrichedCompanies]

      // Save to Supabase
      const supabase = getSupabase()

      // Save companies to companies table
      for (const company of enrichedCompanies) {
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

      // Clear generated companies (they're now in the table)
      setGeneratedCompanies([])

      // Move to next step
      onComplete()
    } catch (err) {
      console.error('Enrich error:', err)
      setError(err instanceof Error ? err.message : 'Failed to enrich companies')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleImportClick = () => {
    setShowImport(true)
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
      </div>

      {/* Total Count */}
      <div className="text-sm text-gray-600 text-right">
        Total: <span className="font-semibold">{totalCount}</span> companies
      </div>

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
          disabled={isGenerating}
          className={cn(
            'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            isGenerating
              ? 'bg-blue-400 text-white cursor-not-allowed'
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

      {/* Import Section (revealed when clicking "I have companies") */}
      {showImport && (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Import Companies</h4>
            <button
              onClick={() => setShowImport(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <textarea
            placeholder="Paste company names (one per line)..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Upload CSV
            </button>
            <button
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Import & Enrich
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
