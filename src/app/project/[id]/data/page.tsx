'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Copy,
  Check,
  Mail,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  AlertCircle,
  Calendar,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  MessageSquare,
  Plus,
  Upload,
  Building2,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { getSupabase, Company as DbCompany, Contact as DbContact, Project as DbProject, Email as DbEmail } from '@/lib/supabase'
import { useToast, ErrorMessage } from '@/components/ui'
import { getApiKey, ApiKeyModal, ApiKeyType } from '@/components/ApiKeyModal'
import { extractDomain } from '@/lib/storage'

// Status options for contacts
type ContactStatus = 'not_contacted' | 'email_sent' | 'accepted' | 'rejected' | 'meeting_secured' | 'done_closed'

const STATUS_OPTIONS: { value: ContactStatus; label: string; color: string }[] = [
  { value: 'not_contacted', label: 'Not Contacted', color: 'bg-gray-100 text-gray-700' },
  { value: 'email_sent', label: 'Email Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-700' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  { value: 'meeting_secured', label: 'Meeting Secured', color: 'bg-purple-100 text-purple-700' },
  { value: 'done_closed', label: 'Done/Closed', color: 'bg-gray-200 text-gray-600' },
]

// Enriched row combining contact + company + email data
interface EnrichedRow {
  id: string
  contactId: string
  contactName: string
  contactTitle: string
  contactEmail: string
  contactLinkedin: string
  companyId: string
  companyName: string
  companyWebsite: string
  companyDescription: string
  status: ContactStatus
  dateSent: string | null
  emailSubject: string | null
  emailId: string | null
  source: string
  verified: boolean
  needsFollowUp: boolean
  hasConversation: boolean
  updatedAt: string
  isNewlyAdded: boolean // Added within last 24 hours
}

type SortKey = keyof EnrichedRow
type SortDirection = 'asc' | 'desc'

export default function DataPage() {
  const params = useParams()
  const projectId = params.id as string
  const { addToast } = useToast()

  const [project, setProject] = useState<DbProject | null>(null)
  const [rows, setRows] = useState<EnrichedRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>('companyName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  // Filter/search state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all' | 'needs_followup'>('all')

  // Copy state
  const [copied, setCopied] = useState<string | null>(null)

  // Add companies modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState<'paste' | 'csv'>('paste')
  const [pastedCompanies, setPastedCompanies] = useState('')
  const [addingCompanies, setAddingCompanies] = useState(false)
  const [enrichingCompanies, setEnrichingCompanies] = useState(false)
  const [findingContacts, setFindingContacts] = useState(false)
  const [addProgress, setAddProgress] = useState({ step: '', current: 0, total: 0 })
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false)
  const [requiredApiKey, setRequiredApiKey] = useState<ApiKeyType | undefined>()

  // Load all data
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
        const { data: companies, error: compError } = await supabase
          .from('companies')
          .select('*')
          .eq('project_id', projectId)

        if (compError) throw compError

        if (!companies || companies.length === 0) {
          setRows([])
          setLoading(false)
          return
        }

        // Load contacts
        const companyIds = companies.map(c => c.id)
        const { data: contacts, error: contError } = await supabase
          .from('contacts')
          .select('*')
          .in('company_id', companyIds)

        if (contError) throw contError

        if (!contacts || contacts.length === 0) {
          setRows([])
          setLoading(false)
          return
        }

        // Load emails
        const contactIds = contacts.map(c => c.id)
        const { data: emails, error: emailError } = await supabase
          .from('emails')
          .select('*')
          .in('contact_id', contactIds)

        if (emailError) throw emailError

        // Build enriched rows
        const now = new Date()
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

        const enrichedRows: EnrichedRow[] = contacts.map(contact => {
          const company = companies.find(c => c.id === contact.company_id)!
          const email = emails?.find(e => e.contact_id === contact.id)
          const customFields = (contact.custom_fields || {}) as Record<string, unknown>

          // Get status from custom_fields or default
          const status = (customFields.outreachStatus as ContactStatus) || 'not_contacted'
          const dateSent = (customFields.dateSent as string) || null
          const hasConversation = !!customFields.conversation

          // Check if needs follow-up: status is email_sent and dateSent is 3+ days ago
          let needsFollowUp = false
          if (status === 'email_sent' && dateSent) {
            const sentDate = new Date(dateSent)
            needsFollowUp = sentDate < threeDaysAgo
          }

          // Check if newly added (within last 24 hours)
          const createdAt = new Date(contact.created_at)
          const isNewlyAdded = createdAt > oneDayAgo

          return {
            id: contact.id,
            contactId: contact.id,
            contactName: contact.name,
            contactTitle: contact.title || '',
            contactEmail: contact.email || '',
            contactLinkedin: contact.linkedin_url || '',
            companyId: company.id,
            companyName: company.name,
            companyWebsite: company.website || '',
            companyDescription: company.description || '',
            status,
            dateSent,
            emailSubject: email?.subject || null,
            emailId: email?.id || null,
            source: contact.source || '',
            verified: contact.verified || false,
            needsFollowUp,
            hasConversation,
            updatedAt: contact.updated_at,
            isNewlyAdded,
          }
        })

        setRows(enrichedRows)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // Update contact status in Supabase
  const updateContactStatus = useCallback(async (contactId: string, newStatus: ContactStatus) => {
    setSaving(prev => new Set(prev).add(contactId))

    try {
      const supabase = getSupabase()

      // Get current custom_fields
      const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single()

      if (fetchError) throw fetchError

      const customFields = (contact?.custom_fields || {}) as Record<string, unknown>
      customFields.outreachStatus = newStatus

      // If status changed to email_sent and no dateSent, set it to today
      if (newStatus === 'email_sent' && !customFields.dateSent) {
        customFields.dateSent = new Date().toISOString().split('T')[0]
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ custom_fields: customFields })
        .eq('id', contactId)

      if (updateError) throw updateError

      // Update local state
      setRows(prev => prev.map(row => {
        if (row.contactId === contactId) {
          const dateSent = newStatus === 'email_sent' && !row.dateSent
            ? new Date().toISOString().split('T')[0]
            : row.dateSent

          // Recalculate needsFollowUp
          const now = new Date()
          const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
          let needsFollowUp = false
          if (newStatus === 'email_sent' && dateSent) {
            needsFollowUp = new Date(dateSent) < threeDaysAgo
          }

          return { ...row, status: newStatus, dateSent, needsFollowUp }
        }
        return row
      }))

      addToast('Status updated', 'success')
    } catch (err) {
      console.error('Error updating status:', err)
      addToast('Failed to update status', 'error')
    } finally {
      setSaving(prev => {
        const next = new Set(prev)
        next.delete(contactId)
        return next
      })
    }
  }, [addToast])

  // Update date sent
  const updateDateSent = useCallback(async (contactId: string, newDate: string | null) => {
    setSaving(prev => new Set(prev).add(contactId))

    try {
      const supabase = getSupabase()

      const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('custom_fields')
        .eq('id', contactId)
        .single()

      if (fetchError) throw fetchError

      const customFields = (contact?.custom_fields || {}) as Record<string, unknown>
      customFields.dateSent = newDate

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ custom_fields: customFields })
        .eq('id', contactId)

      if (updateError) throw updateError

      // Update local state
      setRows(prev => prev.map(row => {
        if (row.contactId === contactId) {
          // Recalculate needsFollowUp
          const now = new Date()
          const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
          let needsFollowUp = false
          if (row.status === 'email_sent' && newDate) {
            needsFollowUp = new Date(newDate) < threeDaysAgo
          }

          return { ...row, dateSent: newDate, needsFollowUp }
        }
        return row
      }))

      addToast('Date updated', 'success')
    } catch (err) {
      console.error('Error updating date:', err)
      addToast('Failed to update date', 'error')
    } finally {
      setSaving(prev => {
        const next = new Set(prev)
        next.delete(contactId)
        return next
      })
    }
  }, [addToast])

  // Sorting
  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }, [sortKey])

  // Filter and sort rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(row =>
        row.contactName.toLowerCase().includes(query) ||
        row.companyName.toLowerCase().includes(query) ||
        row.contactEmail.toLowerCase().includes(query) ||
        row.contactTitle.toLowerCase().includes(query)
      )
    }

    // Apply status filter
    if (statusFilter === 'needs_followup') {
      result = result.filter(row => row.needsFollowUp)
    } else if (statusFilter !== 'all') {
      result = result.filter(row => row.status === statusFilter)
    }

    // Sort
    result.sort((a, b) => {
      const aRaw = a[sortKey]
      const bRaw = b[sortKey]

      // Handle null/undefined - convert to comparable values
      let aVal: string | number = aRaw == null ? '' : (typeof aRaw === 'boolean' ? (aRaw ? 1 : 0) : aRaw)
      let bVal: string | number = bRaw == null ? '' : (typeof bRaw === 'boolean' ? (bRaw ? 1 : 0) : bRaw)

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal)
        return sortDirection === 'asc' ? cmp : -cmp
      }

      // Number comparison
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [rows, searchQuery, statusFilter, sortKey, sortDirection])

  // Copy functions
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const copyAllAsTSV = useCallback(() => {
    const headers = ['Company', 'Contact Name', 'Title', 'Email', 'LinkedIn', 'Status', 'Date Sent', 'Source']
    const lines = [headers.join('\t')]

    filteredAndSortedRows.forEach(row => {
      const statusLabel = STATUS_OPTIONS.find(s => s.value === row.status)?.label || row.status
      lines.push([
        row.companyName,
        row.contactName,
        row.contactTitle,
        row.contactEmail,
        row.contactLinkedin,
        statusLabel,
        row.dateSent || '',
        row.source,
      ].join('\t'))
    })

    navigator.clipboard.writeText(lines.join('\n'))
    addToast(`Copied ${filteredAndSortedRows.length} rows as TSV`, 'success')
  }, [filteredAndSortedRows, addToast])

  const copyEmailsOnly = useCallback(() => {
    const emails = filteredAndSortedRows
      .map(row => row.contactEmail)
      .filter(email => email)
      .join('\n')

    navigator.clipboard.writeText(emails)
    addToast(`Copied ${emails.split('\n').length} emails`, 'success')
  }, [filteredAndSortedRows, addToast])

  const copyRow = useCallback((row: EnrichedRow) => {
    const statusLabel = STATUS_OPTIONS.find(s => s.value === row.status)?.label || row.status
    const text = [
      row.companyName,
      row.contactName,
      row.contactTitle,
      row.contactEmail,
      row.contactLinkedin,
      statusLabel,
      row.dateSent || '',
      row.source,
    ].join('\t')

    copyToClipboard(text, row.id)
  }, [copyToClipboard])

  // Handle CSV file import
  const handleCSVImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

      if (lines.length < 2) {
        addToast('CSV file must have at least a header row and one data row', 'error')
        return
      }

      // Parse CSV header
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
      const nameIndex = headers.findIndex(h => h === 'name' || h === 'company' || h === 'company name')

      if (nameIndex === -1) {
        addToast('CSV must have a "name" or "company" column', 'error')
        return
      }

      // Parse data rows
      const companyNames = lines.slice(1).map(line => {
        // Simple CSV parsing (handles quoted values)
        const values: string[] = []
        let current = ''
        let inQuotes = false
        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        values.push(current.trim())
        return values[nameIndex] || ''
      }).filter(Boolean)

      setPastedCompanies(companyNames.join('\n'))
      setAddMode('paste')
      addToast(`Loaded ${companyNames.length} companies from CSV`, 'success')

      // Reset file input
      e.target.value = ''
    } catch (err) {
      console.error('CSV import error:', err)
      addToast('Failed to parse CSV file', 'error')
    }
  }, [addToast])

  // Add companies flow: parse → enrich → find contacts → save to Supabase
  const handleAddCompanies = useCallback(async () => {
    if (!pastedCompanies.trim() || !project) return

    const names = pastedCompanies.split('\n').map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return

    setAddingCompanies(true)
    setAddProgress({ step: 'Creating companies...', current: 0, total: names.length })

    try {
      const supabase = getSupabase()

      // Step 1: Create basic company records
      const basicCompanies = names.map((name, i) => ({
        id: crypto.randomUUID(),
        name,
        type: '',
        website: '',
        domain: '',
        description: '',
        relevance: 'Medium',
      }))

      // Step 2: Enrich companies with LLM
      setEnrichingCompanies(true)
      setAddProgress({ step: 'Enriching companies with AI...', current: 0, total: basicCompanies.length })

      let enrichedCompanies = basicCompanies
      try {
        const enrichRes = await fetch('/api/enrich-companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: basicCompanies,
            context: project.schema_config?.extractedContext || null,
          }),
        })

        if (enrichRes.ok) {
          const enrichData = await enrichRes.json()
          enrichedCompanies = enrichData.companies || basicCompanies
        }
      } catch (err) {
        console.error('Enrichment error:', err)
        // Continue with basic companies
      }

      setEnrichingCompanies(false)
      setAddProgress({ step: 'Saving companies to database...', current: 0, total: enrichedCompanies.length })

      // Step 3: Save companies to Supabase
      const dbCompanies = enrichedCompanies.map(c => ({
        id: c.id,
        project_id: projectId,
        name: c.name,
        website: c.website || null,
        description: c.description || null,
        relevance_score: c.relevance === 'High' ? 90 : c.relevance === 'Medium' ? 70 : 50,
        relevance_notes: c.relevance || null,
        status: 'not_contacted',
        custom_fields: { type: c.type || 'Unknown' },
      }))

      const { error: companyError } = await supabase
        .from('companies')
        .insert(dbCompanies)

      if (companyError) {
        throw new Error(`Failed to save companies: ${companyError.message}`)
      }

      // Step 4: Find contacts using Apollo (if API key available)
      const apolloKey = getApiKey('apollo')
      let newContacts: DbContact[] = []

      if (apolloKey) {
        setFindingContacts(true)
        setAddProgress({ step: 'Finding contacts via Apollo...', current: 0, total: enrichedCompanies.length })

        try {
          const contactRes = await fetch('/api/find-contacts-apollo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companies: enrichedCompanies.map(c => ({
                id: c.id,
                name: c.name,
                website: c.website,
                domain: c.domain || extractDomain(c.website || ''),
              })),
              context: project.schema_config?.extractedContext || null,
              apiKey: apolloKey,
            }),
          })

          if (contactRes.ok) {
            const contactData = await contactRes.json()
            const persons = contactData.persons || []

            // Save contacts to Supabase
            if (persons.length > 0) {
              setAddProgress({ step: 'Saving contacts to database...', current: 0, total: persons.length })

              const dbContacts = persons.map((p: { id: string; companyId: string; name: string; title?: string; email?: string; linkedin?: string; source?: string }) => ({
                id: p.id || crypto.randomUUID(),
                company_id: p.companyId,
                name: p.name,
                title: p.title || null,
                email: p.email || null,
                phone: null,
                linkedin_url: p.linkedin || null,
                source: p.source || 'apollo',
                verified: !!p.email,
                custom_fields: {},
              }))

              const { data: insertedContacts, error: contactError } = await supabase
                .from('contacts')
                .insert(dbContacts)
                .select()

              if (contactError) {
                console.error('Contact save error:', contactError)
              } else {
                newContacts = insertedContacts || []
              }
            }
          }
        } catch (err) {
          console.error('Contact finding error:', err)
          // Continue without contacts
        }

        setFindingContacts(false)
      }

      // Step 5: Reload data to show new entries
      addToast(
        `Added ${enrichedCompanies.length} companies${newContacts.length > 0 ? ` and ${newContacts.length} contacts` : ''}`,
        'success'
      )

      // Reset modal state
      setShowAddModal(false)
      setPastedCompanies('')

      // Reload the page data
      window.location.reload()

    } catch (err) {
      console.error('Add companies error:', err)
      addToast(err instanceof Error ? err.message : 'Failed to add companies', 'error')
    } finally {
      setAddingCompanies(false)
      setEnrichingCompanies(false)
      setFindingContacts(false)
      setAddProgress({ step: '', current: 0, total: 0 })
    }
  }, [pastedCompanies, project, projectId, addToast])

  // Sort icon helper
  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 text-gray-400" />
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />
  }

  // Count stats
  const needsFollowUpCount = rows.filter(r => r.needsFollowUp).length
  const newlyAddedCount = rows.filter(r => r.isNewlyAdded).length

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-8"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <Link href={`/project/${projectId}`} className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← Back to Project
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold">{project?.client_name || 'Project'} - Contact Data</h1>
        <p className="text-gray-600 mt-1">Track outreach status and manage follow-ups</p>
      </header>

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Stats bar */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-gray-500">Total contacts:</span>{' '}
          <span className="font-medium">{rows.length}</span>
        </div>
        <div>
          <span className="text-gray-500">Showing:</span>{' '}
          <span className="font-medium">{filteredAndSortedRows.length}</span>
        </div>
        {newlyAddedCount > 0 && (
          <div className="flex items-center gap-1 text-green-600">
            <Sparkles className="w-4 h-4" />
            <span className="font-medium">{newlyAddedCount} newly added</span>
          </div>
        )}
        {needsFollowUpCount > 0 && (
          <div className="flex items-center gap-1 text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{needsFollowUpCount} need follow-up</span>
          </div>
        )}
      </div>

      {/* Filters and actions */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts, companies..."
            className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContactStatus | 'all' | 'needs_followup')}
            className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="needs_followup">Needs Follow-up</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Companies
          </button>
          <button
            onClick={copyAllAsTSV}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy All TSV
          </button>
          <button
            onClick={copyEmailsOnly}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Mail className="w-4 h-4" />
            Copy Emails
          </button>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="text-center py-12 border border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-4">No contacts in this project yet.</p>
          <Link
            href={`/project/${projectId}/contacts`}
            className="text-blue-600 hover:underline"
          >
            Find contacts first
          </Link>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('companyName')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Company
                      <SortIcon columnKey="companyName" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('contactName')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Contact
                      <SortIcon columnKey="contactName" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('contactTitle')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Title
                      <SortIcon columnKey="contactTitle" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('status')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Status
                      <SortIcon columnKey="status" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('dateSent')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Date Sent
                      <SortIcon columnKey="dateSent" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-600">LinkedIn</th>
                  <th className="px-3 py-3 text-left">
                    <button
                      onClick={() => handleSort('source')}
                      className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
                    >
                      Source
                      <SortIcon columnKey="source" />
                    </button>
                  </th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAndSortedRows.map(row => (
                  <tr
                    key={row.id}
                    className={`hover:bg-gray-50 ${row.needsFollowUp ? 'bg-amber-50' : ''} ${row.isNewlyAdded ? 'bg-green-50' : ''}`}
                  >
                    {/* Company */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-gray-900 max-w-[140px] truncate" title={row.companyName}>
                          {row.companyName}
                        </span>
                        {row.isNewlyAdded && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                            New
                          </span>
                        )}
                      </div>
                      {row.companyWebsite && (
                        <a
                          href={row.companyWebsite.startsWith('http') ? row.companyWebsite : `https://${row.companyWebsite}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline truncate block max-w-[160px]"
                        >
                          {row.companyWebsite.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{row.contactName}</div>
                      {row.verified && (
                        <span className="text-xs text-green-600">Verified</span>
                      )}
                    </td>

                    {/* Title */}
                    <td className="px-3 py-3 text-gray-600 max-w-[150px]">
                      <span className="truncate block" title={row.contactTitle}>{row.contactTitle || '-'}</span>
                    </td>

                    {/* Email */}
                    <td className="px-3 py-3">
                      {row.contactEmail ? (
                        <a href={`mailto:${row.contactEmail}`} className="text-blue-600 hover:underline text-sm">
                          {row.contactEmail}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">No email</span>
                      )}
                    </td>

                    {/* Status dropdown */}
                    <td className="px-3 py-3">
                      <div className="relative">
                        <select
                          value={row.status}
                          onChange={(e) => updateContactStatus(row.contactId, e.target.value as ContactStatus)}
                          disabled={saving.has(row.contactId)}
                          className={`appearance-none px-2 py-1 pr-6 rounded text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-500 ${
                            STATUS_OPTIONS.find(s => s.value === row.status)?.color || 'bg-gray-100'
                          } ${saving.has(row.contactId) ? 'opacity-50' : ''}`}
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {saving.has(row.contactId) ? (
                          <RefreshCw className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-gray-500" />
                        ) : (
                          <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                        )}
                      </div>
                      {row.needsFollowUp && (
                        <div className="flex items-center gap-1 mt-1 text-amber-600">
                          <AlertCircle className="w-3 h-3" />
                          <span className="text-xs">Follow up!</span>
                        </div>
                      )}
                    </td>

                    {/* Date Sent */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <input
                          type="date"
                          value={row.dateSent || ''}
                          onChange={(e) => updateDateSent(row.contactId, e.target.value || null)}
                          disabled={saving.has(row.contactId)}
                          className="text-xs border border-gray-200 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        />
                      </div>
                    </td>

                    {/* LinkedIn */}
                    <td className="px-3 py-3">
                      {row.contactLinkedin ? (
                        <a
                          href={row.contactLinkedin.startsWith('http') ? row.contactLinkedin : `https://${row.contactLinkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Profile
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {row.source === 'apollo' ? 'Apollo' :
                       row.source === 'hunter' ? 'Hunter' :
                       row.source === 'apify' ? 'Apify' :
                       row.source === 'web_research' ? 'AI' :
                       row.source === 'import' ? 'Import' :
                       row.source === 'manual' ? 'Manual' :
                       row.source || '-'}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/project/${projectId}/conversations`}
                          className={`p-1 rounded transition-colors ${
                            row.hasConversation
                              ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                          }`}
                          title={row.hasConversation ? 'View conversation' : 'Start conversation'}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => copyRow(row)}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title="Copy row as TSV"
                        >
                          {copied === row.id ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Companies Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Add More Companies
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setPastedCompanies('')
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setAddMode('paste')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    addMode === 'paste'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                  }`}
                >
                  Paste Names
                </button>
                <label
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors cursor-pointer text-center ${
                    addMode === 'csv'
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                  }`}
                >
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVImport}
                    className="hidden"
                  />
                  <Upload className="w-4 h-4 inline mr-1" />
                  Import CSV
                </label>
              </div>

              {/* Paste textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company names (one per line)
                </label>
                <textarea
                  value={pastedCompanies}
                  onChange={(e) => setPastedCompanies(e.target.value)}
                  placeholder="Acme Corp&#10;Beta Industries&#10;Gamma Solutions"
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={addingCompanies}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {pastedCompanies.split('\n').filter(l => l.trim()).length} companies entered
                </p>
              </div>

              {/* Progress indicator */}
              {addingCompanies && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">{addProgress.step}</span>
                  </div>
                  {addProgress.total > 0 && (
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(addProgress.current / addProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Info about flow */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <p className="font-medium mb-1">What happens next:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-xs">
                  <li>Companies enriched with AI (type, website, description)</li>
                  <li>Contacts discovered via Apollo API (if key is set)</li>
                  <li>New contacts appended to this table</li>
                </ol>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false)
                  setPastedCompanies('')
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                disabled={addingCompanies}
              >
                Cancel
              </button>
              <button
                onClick={handleAddCompanies}
                disabled={addingCompanies || !pastedCompanies.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {addingCompanies ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Add & Enrich
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={apiKeyModalOpen}
        onClose={() => setApiKeyModalOpen(false)}
        requiredKey={requiredApiKey}
      />
    </main>
  )
}
