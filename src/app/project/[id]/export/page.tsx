'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Download, GripVertical, Check, X, Settings } from 'lucide-react'
import { getSupabase, Company as DbCompany, Contact as DbContact, Project as DbProject, Email as DbEmail } from '@/lib/supabase'
import { SchemaColumn, DEFAULT_SCHEMA } from '@/components/SchemaEditor'
import { WizardNav, WizardStep } from '@/components/WizardNav'

interface ExportColumn {
  id: string
  key: string
  label: string
  enabled: boolean
  category?: string
}

// Dynamic row type for flexible schemas
type ExportRow = Record<string, string>

// Convert project schema columns to export columns
function schemaToExportColumns(schema: SchemaColumn[]): ExportColumn[] {
  return schema.map((col, idx) => ({
    id: col.id || String(idx + 1),
    key: col.key,
    label: col.label,
    enabled: col.category !== 'email' || col.key === 'email_subject' || col.key === 'email_body',
    category: col.category,
  }))
}

// Map schema key to legacy key format (for backward compatibility)
function mapSchemaKeyToLegacy(key: string): string {
  const mapping: Record<string, string> = {
    'company_name': 'companyName',
    'company_website': 'companyWebsite',
    'company_description': 'companyDescription',
    'company_relevance': 'companyRelevance',
    'company_status': 'companyStatus',
    'contact_name': 'contactName',
    'contact_title': 'contactTitle',
    'contact_email': 'contactEmail',
    'contact_phone': 'contactPhone',
    'contact_linkedin': 'contactLinkedin',
    'contact_verified': 'contactVerified',
    'email_subject': 'emailSubject',
    'email_body': 'emailBody',
    'email_status': 'emailStatus',
  }
  return mapping[key] || key
}

// Default export columns (fallback)
const DEFAULT_COLUMNS: ExportColumn[] = [
  { id: '1', key: 'companyName', label: 'Company', enabled: true, category: 'company' },
  { id: '2', key: 'companyWebsite', label: 'Website', enabled: true, category: 'company' },
  { id: '3', key: 'companyDescription', label: 'Company Description', enabled: true, category: 'company' },
  { id: '4', key: 'companyRelevance', label: 'Relevance Notes', enabled: true, category: 'company' },
  { id: '5', key: 'companyStatus', label: 'Company Status', enabled: false, category: 'company' },
  { id: '6', key: 'contactName', label: 'Contact Name', enabled: true, category: 'contact' },
  { id: '7', key: 'contactTitle', label: 'Title', enabled: true, category: 'contact' },
  { id: '8', key: 'contactEmail', label: 'Email', enabled: true, category: 'contact' },
  { id: '9', key: 'contactPhone', label: 'Phone', enabled: false, category: 'contact' },
  { id: '10', key: 'contactLinkedin', label: 'LinkedIn', enabled: true, category: 'contact' },
  { id: '11', key: 'contactVerified', label: 'Verified', enabled: false, category: 'contact' },
  { id: '12', key: 'emailSubject', label: 'Email Subject', enabled: true, category: 'email' },
  { id: '13', key: 'emailBody', label: 'Email Body', enabled: true, category: 'email' },
  { id: '14', key: 'emailStatus', label: 'Email Status', enabled: false, category: 'email' },
]

export default function ExportPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<DbProject | null>(null)
  const [companies, setCompanies] = useState<DbCompany[]>([])
  const [contacts, setContacts] = useState<DbContact[]>([])
  const [emails, setEmails] = useState<DbEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [columns, setColumns] = useState<ExportColumn[]>(DEFAULT_COLUMNS)
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  // Load project data
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

        // Load columns from project schema or use defaults
        const schemaConfig = proj.schema_config as Record<string, unknown> | null
        if (schemaConfig?.columns && Array.isArray(schemaConfig.columns)) {
          const projectSchema = schemaConfig.columns as SchemaColumn[]
          // Convert schema columns to export columns, mapping keys for compatibility
          const exportCols = projectSchema.map((col, idx) => ({
            id: col.id || String(idx + 1),
            key: mapSchemaKeyToLegacy(col.key),
            label: col.label,
            enabled: col.category !== 'email' || col.key === 'email_subject' || col.key === 'email_body',
            category: col.category,
          }))
          setColumns(exportCols)
        }

        // Load companies
        const { data: comps, error: compsError } = await supabase
          .from('companies')
          .select('*')
          .eq('project_id', projectId)
          .order('name', { ascending: true })

        if (compsError) throw compsError
        setCompanies(comps || [])

        // Load contacts
        const companyIds = (comps || []).map(c => c.id)
        if (companyIds.length > 0) {
          const { data: conts, error: contsError } = await supabase
            .from('contacts')
            .select('*')
            .in('company_id', companyIds)
            .order('name', { ascending: true })

          if (contsError) throw contsError
          setContacts(conts || [])

          // Load emails
          const contactIds = (conts || []).map(c => c.id)
          if (contactIds.length > 0) {
            const { data: existingEmails, error: emailsError } = await supabase
              .from('emails')
              .select('*')
              .in('contact_id', contactIds)

            if (emailsError) throw emailsError
            setEmails(existingEmails || [])
          }
        }

      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load project data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // Build export rows (one row per contact/email)
  const buildExportRows = useCallback((): ExportRow[] => {
    const rows: ExportRow[] = []

    contacts.forEach(contact => {
      const company = companies.find(c => c.id === contact.company_id)
      const email = emails.find(e => e.contact_id === contact.id)

      rows.push({
        companyName: company?.name || '',
        companyWebsite: company?.website || '',
        companyDescription: company?.description || '',
        companyRelevance: company?.relevance_notes || '',
        companyStatus: company?.status || '',
        contactName: contact.name,
        contactTitle: contact.title || '',
        contactEmail: contact.email || '',
        contactPhone: contact.phone || '',
        contactLinkedin: contact.linkedin_url || '',
        contactVerified: contact.verified ? 'Yes' : 'No',
        emailSubject: email?.subject || '',
        emailBody: email?.body || '',
        emailStatus: email?.status || '',
      })
    })

    // Add companies without contacts
    companies.forEach(company => {
      const hasContacts = contacts.some(c => c.company_id === company.id)
      if (!hasContacts) {
        rows.push({
          companyName: company.name,
          companyWebsite: company.website || '',
          companyDescription: company.description || '',
          companyRelevance: company.relevance_notes || '',
          companyStatus: company.status || '',
          contactName: '',
          contactTitle: '',
          contactEmail: '',
          contactPhone: '',
          contactLinkedin: '',
          contactVerified: '',
          emailSubject: '',
          emailBody: '',
          emailStatus: '',
        })
      }
    })

    return rows
  }, [companies, contacts, emails])

  // Toggle column enabled
  const toggleColumn = (id: string) => {
    setColumns(prev => prev.map(col =>
      col.id === id ? { ...col, enabled: !col.enabled } : col
    ))
  }

  // Start editing column label
  const startEditLabel = (col: ExportColumn) => {
    setEditingColumnId(col.id)
    setEditLabel(col.label)
  }

  // Save column label
  const saveLabel = () => {
    if (!editingColumnId) return
    setColumns(prev => prev.map(col =>
      col.id === editingColumnId ? { ...col, label: editLabel } : col
    ))
    setEditingColumnId(null)
    setEditLabel('')
  }

  // Handle drag start
  const handleDragStart = (id: string) => {
    setDraggedId(id)
  }

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return

    setColumns(prev => {
      const draggedIndex = prev.findIndex(c => c.id === draggedId)
      const targetIndex = prev.findIndex(c => c.id === targetId)
      const newColumns = [...prev]
      const [removed] = newColumns.splice(draggedIndex, 1)
      newColumns.splice(targetIndex, 0, removed)
      return newColumns
    })
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedId(null)
  }

  // Generate CSV content
  const generateCSV = (rows: ExportRow[]): string => {
    const enabledColumns = columns.filter(c => c.enabled)

    // Header row
    const headers = enabledColumns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')

    // Data rows
    const dataRows = rows.map(row => {
      return enabledColumns.map(col => {
        const value = row[col.key as keyof ExportRow] || ''
        // Escape quotes and wrap in quotes
        return `"${String(value).replace(/"/g, '""')}"`
      }).join(',')
    })

    return [headers, ...dataRows].join('\n')
  }

  // Download CSV
  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Export all data
  const handleExportAll = () => {
    const rows = buildExportRows()
    const csv = generateCSV(rows)
    const filename = `${project?.client_name || 'export'}-all.csv`.toLowerCase().replace(/\s+/g, '-')
    downloadCSV(filename, csv)
  }

  // Export companies only
  const handleExportCompanies = () => {
    const companyColumns = columns.filter(c => c.key.startsWith('company'))
    const enabledCompanyColumns = companyColumns.filter(c => c.enabled)

    const headers = enabledCompanyColumns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')

    const rows = companies.map(company => {
      return enabledCompanyColumns.map(col => {
        let value = ''
        switch (col.key) {
          case 'companyName': value = company.name; break
          case 'companyWebsite': value = company.website || ''; break
          case 'companyDescription': value = company.description || ''; break
          case 'companyRelevance': value = company.relevance_notes || ''; break
          case 'companyStatus': value = company.status || ''; break
        }
        return `"${String(value).replace(/"/g, '""')}"`
      }).join(',')
    })

    const csv = [headers, ...rows].join('\n')
    const filename = `${project?.client_name || 'export'}-companies.csv`.toLowerCase().replace(/\s+/g, '-')
    downloadCSV(filename, csv)
  }

  // Export contacts only
  const handleExportContacts = () => {
    const contactColumns = columns.filter(c => c.key.startsWith('contact') || c.key === 'companyName')
    const enabledContactColumns = contactColumns.filter(c => c.enabled)

    const headers = enabledContactColumns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')

    const rows = contacts.map(contact => {
      const company = companies.find(c => c.id === contact.company_id)
      return enabledContactColumns.map(col => {
        let value = ''
        switch (col.key) {
          case 'companyName': value = company?.name || ''; break
          case 'contactName': value = contact.name; break
          case 'contactTitle': value = contact.title || ''; break
          case 'contactEmail': value = contact.email || ''; break
          case 'contactPhone': value = contact.phone || ''; break
          case 'contactLinkedin': value = contact.linkedin_url || ''; break
          case 'contactVerified': value = contact.verified ? 'Yes' : 'No'; break
        }
        return `"${String(value).replace(/"/g, '""')}"`
      }).join(',')
    })

    const csv = [headers, ...rows].join('\n')
    const filename = `${project?.client_name || 'export'}-contacts.csv`.toLowerCase().replace(/\s+/g, '-')
    downloadCSV(filename, csv)
  }

  // Export emails only
  const handleExportEmails = () => {
    const emailColumns = columns.filter(c =>
      c.key.startsWith('email') || c.key === 'companyName' || c.key === 'contactName' || c.key === 'contactEmail'
    )
    const enabledEmailColumns = emailColumns.filter(c => c.enabled)

    const headers = enabledEmailColumns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',')

    const rows = emails.map(email => {
      const contact = contacts.find(c => c.id === email.contact_id)
      const company = companies.find(c => c.id === contact?.company_id)

      return enabledEmailColumns.map(col => {
        let value = ''
        switch (col.key) {
          case 'companyName': value = company?.name || ''; break
          case 'contactName': value = contact?.name || ''; break
          case 'contactEmail': value = contact?.email || ''; break
          case 'emailSubject': value = email.subject || ''; break
          case 'emailBody': value = email.body || ''; break
          case 'emailStatus': value = email.status || ''; break
        }
        return `"${String(value).replace(/"/g, '""')}"`
      }).join(',')
    })

    const csv = [headers, ...rows].join('\n')
    const filename = `${project?.client_name || 'export'}-emails.csv`.toLowerCase().replace(/\s+/g, '-')
    downloadCSV(filename, csv)
  }

  // Count stats
  const exportRows = buildExportRows()
  const enabledColumnsCount = columns.filter(c => c.enabled).length

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
  if (contacts.length > 0) completedSteps.push('contacts')
  if (emails.length > 0) completedSteps.push('emails')

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
        <h2 className="text-xl font-semibold">Export Data</h2>
        <p className="text-gray-600 mt-1">
          Preview and export your project data to CSV
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">Companies:</span>{' '}
            <span className="font-medium">{companies.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Contacts:</span>{' '}
            <span className="font-medium">{contacts.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Emails:</span>{' '}
            <span className="font-medium">{emails.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Export rows:</span>{' '}
            <span className="font-medium">{exportRows.length}</span>
          </div>
          {project?.schema_config && Boolean((project.schema_config as Record<string, unknown>).columns) && (
            <div className="flex items-center gap-1">
              <Settings className="w-3 h-3 text-blue-500" />
              <span className="text-blue-600">Custom schema</span>
            </div>
          )}
        </div>
      </div>

      {/* Download buttons */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Download</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportAll}
            disabled={exportRows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export All ({exportRows.length} rows)
          </button>
          <button
            onClick={handleExportCompanies}
            disabled={companies.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Companies ({companies.length})
          </button>
          <button
            onClick={handleExportContacts}
            disabled={contacts.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Contacts ({contacts.length})
          </button>
          <button
            onClick={handleExportEmails}
            disabled={emails.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Emails ({emails.length})
          </button>
        </div>
      </div>

      {/* Column configuration */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">
          Column Configuration
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({enabledColumnsCount} columns enabled)
          </span>
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Drag to reorder, click to rename, toggle to include/exclude columns
        </p>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {columns.map(col => (
            <div
              key={col.id}
              draggable
              onDragStart={() => handleDragStart(col.id)}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 px-4 py-2 border-b border-gray-100 last:border-b-0 ${
                draggedId === col.id ? 'bg-blue-50' : 'bg-white'
              } hover:bg-gray-50 cursor-move`}
            >
              <GripVertical className="w-4 h-4 text-gray-400" />
              <input
                type="checkbox"
                checked={col.enabled}
                onChange={() => toggleColumn(col.id)}
                className="rounded border-gray-300"
              />
              {editingColumnId === col.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLabel()}
                    autoFocus
                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={saveLabel}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingColumnId(null)}
                    className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => startEditLabel(col)}
                  className={`flex-1 cursor-pointer hover:text-blue-600 ${
                    !col.enabled ? 'text-gray-400' : ''
                  }`}
                >
                  {col.label}
                </span>
              )}
              <span className="text-xs text-gray-400 font-mono">{col.key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview table */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Preview</h2>
        {exportRows.length === 0 ? (
          <div className="text-center py-12 border border-gray-200 rounded-lg">
            <p className="text-gray-500">No data to export yet.</p>
            <Link
              href={`/project/${projectId}/companies`}
              className="text-blue-600 hover:underline mt-2 inline-block"
            >
              Add companies first
            </Link>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {columns.filter(c => c.enabled).map(col => (
                    <th
                      key={col.id}
                      className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exportRows.slice(0, 10).map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {columns.filter(c => c.enabled).map(col => (
                      <td
                        key={col.id}
                        className="px-3 py-2 border-b border-gray-100 max-w-xs truncate"
                        title={row[col.key as keyof ExportRow]}
                      >
                        {row[col.key as keyof ExportRow]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {exportRows.length > 10 && (
              <div className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-t border-gray-200">
                Showing 10 of {exportRows.length} rows
              </div>
            )}
          </div>
        )}
      </div>

    </main>
  )
}
