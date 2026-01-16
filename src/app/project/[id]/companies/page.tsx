'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Sparkles, Upload, Trash2, RefreshCw, Check } from 'lucide-react'
import { getSupabase, Company as DbCompany, Project as DbProject } from '@/lib/supabase'
import { WizardNav, WizardStep } from '@/components/WizardNav'

interface LocalCompany {
  id: string
  name: string
  website: string
  description: string
  relevance_score: number | null
  relevance_notes: string
  type: string
  status: string
  isNew?: boolean
}

export default function CompaniesPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<DbProject | null>(null)
  const [companies, setCompanies] = useState<LocalCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [enriching, setEnriching] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')
  const [importType, setImportType] = useState<'csv' | 'paste'>('paste')
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Manual add form state
  const [newCompany, setNewCompany] = useState({
    name: '',
    website: '',
    notes: ''
  })

  // Load project and companies
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = getSupabase()

        // Load project
        const { data: proj, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (projError) throw projError
        setProject(proj)

        // Load companies
        const { data: comps, error: compsError } = await supabase
          .from('companies')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })

        if (compsError) throw compsError
        setCompanies((comps || []).map(c => ({
          id: c.id,
          name: c.name,
          website: c.website || '',
          description: c.description || '',
          relevance_score: c.relevance_score,
          relevance_notes: c.relevance_notes || '',
          type: (c.custom_fields as Record<string, string>)?.type || '',
          status: c.status
        })))
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load project data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // Generate companies with AI
  const handleGenerate = async () => {
    if (!project) return
    setGenerating(true)
    setError(null)

    try {
      // Get extracted context from schema_config if available
      const extractedContext = (project.schema_config as Record<string, unknown>)?.extractedContext as Record<string, unknown> | undefined

      // Build context from project data
      const context = {
        clientName: project.client_name,
        product: project.product_description || '',
        valueProposition: (extractedContext?.valueProposition as string) || project.product_description || '',
        targetMarket: project.target_market || '',
        targetSegment: project.target_segment || '',
        keyDifferentiators: (extractedContext?.keyDifferentiators as string[]) || [] as string[],
        credibilitySignals: (extractedContext?.credibilitySignals as string[]) || [] as string[]
      }

      // Default segment if not specified
      const segments = [{
        id: 'default',
        name: project.target_segment || 'Target Companies',
        description: `Companies in ${project.target_market || 'the target market'} that would benefit from ${project.product_description || 'the product'}`
      }]

      const response = await fetch('/api/generate-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          segments,
          countPerSegment: 10,
          excludeNames: companies.map(c => c.name)
        })
      })

      if (!response.ok) throw new Error('Failed to generate companies')

      const data = await response.json()

      if (data.companies && data.companies.length > 0) {
        // Save to Supabase
        const supabase = getSupabase()
        const newCompanies: DbCompany[] = data.companies.map((c: { name: string; website?: string; description?: string; relevance?: string; type?: string }) => ({
          project_id: projectId,
          name: c.name,
          website: c.website || null,
          description: c.description || null,
          relevance_score: c.relevance?.toLowerCase().includes('high') ? 9 : c.relevance?.toLowerCase().includes('medium') ? 6 : 3,
          relevance_notes: c.relevance || null,
          status: 'not_contacted',
          custom_fields: { type: c.type || '' }
        }))

        const { data: inserted, error: insertError } = await supabase
          .from('companies')
          .insert(newCompanies)
          .select()

        if (insertError) throw insertError

        // Add to local state
        const localCompanies: LocalCompany[] = (inserted || []).map(c => ({
          id: c.id,
          name: c.name,
          website: c.website || '',
          description: c.description || '',
          relevance_score: c.relevance_score,
          relevance_notes: c.relevance_notes || '',
          type: (c.custom_fields as Record<string, string>)?.type || '',
          status: c.status,
          isNew: true
        }))

        setCompanies(prev => [...localCompanies, ...prev])
      }
    } catch (err) {
      console.error('Error generating companies:', err)
      setError('Failed to generate companies. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // Add company manually
  const handleAddManual = async () => {
    if (!newCompany.name.trim()) return
    setError(null)

    try {
      const supabase = getSupabase()
      const { data: inserted, error: insertError } = await supabase
        .from('companies')
        .insert({
          project_id: projectId,
          name: newCompany.name.trim(),
          website: newCompany.website.trim() || null,
          description: newCompany.notes.trim() || null,
          status: 'not_contacted',
          custom_fields: {}
        })
        .select()
        .single()

      if (insertError) throw insertError

      setCompanies(prev => [{
        id: inserted.id,
        name: inserted.name,
        website: inserted.website || '',
        description: inserted.description || '',
        relevance_score: inserted.relevance_score,
        relevance_notes: inserted.relevance_notes || '',
        type: '',
        status: inserted.status,
        isNew: true
      }, ...prev])

      setNewCompany({ name: '', website: '', notes: '' })
      setShowAddForm(false)
    } catch (err) {
      console.error('Error adding company:', err)
      setError('Failed to add company')
    }
  }

  // Import from CSV/paste
  const handleImport = async () => {
    if (!importText.trim()) return
    setError(null)

    try {
      const response = await fetch('/api/parse-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: importText,
          targetType: 'companies'
        })
      })

      if (!response.ok) throw new Error('Failed to parse data')

      const data = await response.json()

      if (data.companies && data.companies.length > 0) {
        // Save to Supabase
        const supabase = getSupabase()
        const newCompanies = data.companies.map((c: { name: string; website?: string; description?: string; relevance?: string; type?: string }) => ({
          project_id: projectId,
          name: c.name,
          website: c.website || null,
          description: c.description || null,
          relevance_score: null,
          relevance_notes: c.relevance || null,
          status: 'not_contacted',
          custom_fields: { type: c.type || '' }
        }))

        const { data: inserted, error: insertError } = await supabase
          .from('companies')
          .insert(newCompanies)
          .select()

        if (insertError) throw insertError

        const localCompanies: LocalCompany[] = (inserted || []).map(c => ({
          id: c.id,
          name: c.name,
          website: c.website || '',
          description: c.description || '',
          relevance_score: c.relevance_score,
          relevance_notes: c.relevance_notes || '',
          type: (c.custom_fields as Record<string, string>)?.type || '',
          status: c.status,
          isNew: true
        }))

        setCompanies(prev => [...localCompanies, ...prev])
        setImportText('')
        setShowImportModal(false)
      } else {
        setError('No companies found in the pasted data')
      }
    } catch (err) {
      console.error('Error importing companies:', err)
      setError('Failed to import companies')
    }
  }

  // Enrich a single company with AI
  const handleEnrich = async (company: LocalCompany) => {
    setEnriching(company.id)
    setError(null)

    try {
      const context = project ? {
        clientName: project.client_name,
        product: project.product_description || '',
        valueProposition: project.product_description || '',
        targetMarket: project.target_market || '',
        targetSegment: project.target_segment || '',
        keyDifferentiators: [],
        credibilitySignals: []
      } : null

      const response = await fetch('/api/enrich-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: [{
            name: company.name,
            website: company.website,
            description: company.description,
            type: company.type
          }],
          context
        })
      })

      if (!response.ok) throw new Error('Failed to enrich company')

      const data = await response.json()

      if (data.companies && data.companies.length > 0) {
        const enriched = data.companies[0]

        // Update in Supabase
        const supabase = getSupabase()
        const { error: updateError } = await supabase
          .from('companies')
          .update({
            website: enriched.website || company.website,
            description: enriched.description || company.description,
            relevance_score: enriched.relevance?.toLowerCase().includes('high') ? 9 : enriched.relevance?.toLowerCase().includes('medium') ? 6 : 3,
            relevance_notes: enriched.relevance || company.relevance_notes,
            custom_fields: { type: enriched.type || company.type }
          })
          .eq('id', company.id)

        if (updateError) throw updateError

        // Update local state
        setCompanies(prev => prev.map(c =>
          c.id === company.id ? {
            ...c,
            website: enriched.website || c.website,
            description: enriched.description || c.description,
            relevance_score: enriched.relevance?.toLowerCase().includes('high') ? 9 : enriched.relevance?.toLowerCase().includes('medium') ? 6 : 3,
            relevance_notes: enriched.relevance || c.relevance_notes,
            type: enriched.type || c.type
          } : c
        ))
      }
    } catch (err) {
      console.error('Error enriching company:', err)
      setError('Failed to enrich company')
    } finally {
      setEnriching(null)
    }
  }

  // Delete selected companies
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    setError(null)

    try {
      const supabase = getSupabase()
      const { error: deleteError } = await supabase
        .from('companies')
        .delete()
        .in('id', Array.from(selectedIds))

      if (deleteError) throw deleteError

      setCompanies(prev => prev.filter(c => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
    } catch (err) {
      console.error('Error deleting companies:', err)
      setError('Failed to delete companies')
    }
  }

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === companies.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(companies.map(c => c.id)))
    }
  }, [companies, selectedIds.size])

  if (loading) {
    return (
      <main className="min-h-screen p-8 max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-8"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </main>
    )
  }

  // Determine completed steps
  const completedSteps: WizardStep[] = []
  if (companies.length > 0) completedSteps.push('companies')

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← All Projects
        </Link>
        <h1 className="text-2xl font-bold">{project?.client_name || 'Project'}</h1>
      </header>

      <WizardNav projectId={projectId} completedSteps={completedSteps} />

      <div className="mb-6">
        <h2 className="text-xl font-semibold">Companies</h2>
        <p className="text-gray-600 mt-1">
          Build your target company list
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </>
          )}
        </button>

        <button
          onClick={() => setShowAddForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" />
          Add manually
        </button>

        <button
          onClick={() => setShowImportModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Upload className="w-4 h-4" />
          Import CSV / Paste
        </button>

        {selectedIds.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Manual add form */}
      {showAddForm && (
        <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-white">
          <h3 className="font-semibold mb-3">Add Company</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Company name *"
              value={newCompany.name}
              onChange={e => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Website (optional)"
              value={newCompany.website}
              onChange={e => setNewCompany(prev => ({ ...prev, website: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Notes (optional)"
              value={newCompany.notes}
              onChange={e => setNewCompany(prev => ({ ...prev, notes: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleAddManual}
              disabled={!newCompany.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
            <h3 className="font-semibold text-lg mb-4">Import Companies</h3>

            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setImportType('paste')}
                className={`px-4 py-2 rounded-lg ${importType === 'paste' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100'} border`}
              >
                Paste from Excel
              </button>
              <button
                onClick={() => setImportType('csv')}
                className={`px-4 py-2 rounded-lg ${importType === 'csv' ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100'} border`}
              >
                CSV Data
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              {importType === 'paste'
                ? 'Copy cells from Excel/Google Sheets and paste below. Include headers if possible.'
                : 'Paste CSV data below. The AI will detect columns automatically.'
              }
            </p>

            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={importType === 'paste'
                ? "Company Name\tWebsite\tDescription\nAcme Inc\tacme.com\tWidgets manufacturer"
                : "Company Name,Website,Description\nAcme Inc,acme.com,Widgets manufacturer"
              }
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleImport}
                disabled={!importText.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Import
              </button>
              <button
                onClick={() => { setShowImportModal(false); setImportText('') }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Companies table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.size === companies.length && companies.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Company</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Relevance</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <th className="w-24 px-4 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {companies.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  No companies yet. Generate with AI, add manually, or import from CSV.
                </td>
              </tr>
            ) : (
              companies.map(company => (
                <tr
                  key={company.id}
                  className={`hover:bg-gray-50 ${company.isNew ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => toggleSelect(company.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{company.name}</div>
                    {company.website && (
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {company.website}
                      </a>
                    )}
                    {company.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{company.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {company.type || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {company.relevance_score !== null ? (
                      <div>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          company.relevance_score >= 7 ? 'bg-green-100 text-green-700' :
                          company.relevance_score >= 4 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {company.relevance_score >= 7 ? 'High' : company.relevance_score >= 4 ? 'Medium' : 'Low'}
                        </span>
                        {company.relevance_notes && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{company.relevance_notes}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">Not rated</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      company.status === 'meeting_set' ? 'bg-green-100 text-green-700' :
                      company.status === 'reached_out' ? 'bg-blue-100 text-blue-700' :
                      company.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {company.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleEnrich(company)}
                      disabled={enriching === company.id}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      title="Enrich with AI"
                    >
                      {enriching === company.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      {companies.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          <span>{companies.length} companies</span>
        </div>
      )}
    </main>
  )
}
