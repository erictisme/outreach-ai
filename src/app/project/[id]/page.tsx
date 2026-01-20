'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ArrowLeft, Settings, Terminal, Table2, Wand2 } from 'lucide-react'
import { getSupabase, Project } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { WizardPanel, WizardStep } from '@/components/WizardPanel'
import { DataTable, DataTableRow } from '@/components/DataTable'
import { Status } from '@/components/StatusDropdown'
import { useToast } from '@/components/ui/Toast'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcutsHelp'
import { PromptInspector } from '@/components/PromptInspector'
import { Conversation, Company, ResearchedContact, Person, EmailDraft } from '@/types'

// View modes for the full-screen layout
type ViewMode = 'wizard' | 'table'

// localStorage key for view preference
const VIEW_PREFERENCE_KEY = 'outreach-view-preference'

// Step mapping for keyboard navigation
const STEP_MAP: Record<string, WizardStep> = {
  '1': 'setup',
  '2': 'context',
  '3': 'companies',
  '4': 'contacts',
  '5': 'emails',
}

export default function ProjectPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('wizard')
  const [isMobileWizardOpen, setIsMobileWizardOpen] = useState(false)
  const [expandedStep, setExpandedStep] = useState<WizardStep>('setup')
  const [completedSteps, _setCompletedSteps] = useState<WizardStep[]>([])

  // Load view preference from localStorage on mount
  useEffect(() => {
    const savedView = localStorage.getItem(VIEW_PREFERENCE_KEY)
    if (savedView === 'wizard' || savedView === 'table') {
      setViewMode(savedView)
    }
  }, [])

  // Save view preference to localStorage when it changes
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VIEW_PREFERENCE_KEY, mode)
  }, [])

  // Prompt inspector state
  const [isPromptInspectorOpen, setIsPromptInspectorOpen] = useState(false)

  // Saving state for table edits
  const [isSaving, setIsSaving] = useState(false)
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null)
  const { addToast } = useToast()

  // Debounce refs for status and date changes
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const DEBOUNCE_DELAY = 300

  // Table ref for keyboard navigation
  const _tableRef = useRef<{ focusRow: (index: number) => void; getFocusedRow: () => number } | null>(null)
  const [focusedRowIndex, setFocusedRowIndex] = useState(-1)

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      // Cmd+S to save (shows confirmation since changes are auto-saved)
      {
        key: 's',
        metaKey: true,
        description: 'Save',
        action: () => {
          addToast('Changes are saved automatically', 'info')
        },
      },
      // Cmd+T to toggle between wizard and table views
      {
        key: 't',
        metaKey: true,
        description: 'Toggle view',
        action: () => {
          handleViewModeChange(viewMode === 'wizard' ? 'table' : 'wizard')
        },
      },
      // Cmd+1-5 to jump to wizard steps
      ...Object.entries(STEP_MAP).map(([key, step]) => ({
        key,
        metaKey: true,
        description: `Go to ${step} step`,
        action: () => {
          setExpandedStep(step)
          // Switch to wizard view if in table view
          if (viewMode === 'table') {
            handleViewModeChange('wizard')
          }
          // On mobile, open the wizard panel
          setIsMobileWizardOpen(true)
        },
      })),
      // Arrow keys for table navigation
      {
        key: 'ArrowDown',
        description: 'Next row',
        action: () => {
          if (tableRows.length > 0) {
            setFocusedRowIndex(prev => Math.min(prev + 1, tableRows.length - 1))
          }
        },
      },
      {
        key: 'ArrowUp',
        description: 'Previous row',
        action: () => {
          if (tableRows.length > 0) {
            setFocusedRowIndex(prev => Math.max(prev - 1, 0))
          }
        },
      },
      // j/k for vim-style navigation
      {
        key: 'j',
        description: 'Next row',
        action: () => {
          if (tableRows.length > 0) {
            setFocusedRowIndex(prev => Math.min(prev + 1, tableRows.length - 1))
          }
        },
      },
      {
        key: 'k',
        description: 'Previous row',
        action: () => {
          if (tableRows.length > 0) {
            setFocusedRowIndex(prev => Math.max(prev - 1, 0))
          }
        },
      },
    ],
  })

  // Shortcuts list for help modal
  const shortcutsList = [
    { keys: { key: 's', metaKey: true }, description: 'Save (auto-saved)' },
    { keys: { key: 't', metaKey: true }, description: 'Toggle Wizard/Table view' },
    { keys: { key: '1', metaKey: true }, description: 'Go to Setup' },
    { keys: { key: '2', metaKey: true }, description: 'Go to Context' },
    { keys: { key: '3', metaKey: true }, description: 'Go to Companies' },
    { keys: { key: '4', metaKey: true }, description: 'Go to Contacts' },
    { keys: { key: '5', metaKey: true }, description: 'Go to Emails' },
    { keys: { key: 'ArrowDown' }, description: 'Navigate down in table' },
    { keys: { key: 'ArrowUp' }, description: 'Navigate up in table' },
    { keys: { key: '?', shiftKey: true }, description: 'Show shortcuts help' },
  ]

  // Load project function - extracted for retry capability
  const loadProject = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabase()
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('Project not found')
        } else {
          throw fetchError
        }
        return
      }

      setProject(data)
    } catch (err) {
      console.error('Error loading project:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load project'
      // Check for network/connection errors
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')) {
        setError('Unable to connect to database. Please check your internet connection and try again.')
      } else {
        setError(errorMessage)
      }
      addToast('Failed to load project', 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, addToast])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  // Get schema config data
  const schemaConfig = project?.schema_config as {
    companies?: Company[]
    contacts?: ResearchedContact[]
    emails?: EmailDraft[]
    conversations?: Conversation[]
    tableStatuses?: Record<string, Status> // contactId -> Status
    tableDatesSent?: Record<string, string> // contactId -> ISO date string
  } | null

  // Transform schema data into DataTableRow format
  const tableRows: DataTableRow[] = useMemo(() => {
    if (!schemaConfig) return []

    const companies = schemaConfig.companies || []
    const contacts = schemaConfig.contacts || []
    const emails = schemaConfig.emails || []
    const tableStatuses = schemaConfig.tableStatuses || {}
    const tableDatesSent = schemaConfig.tableDatesSent || {}

    // Create a map of companyId -> contacts
    const contactsByCompany = new Map<string, ResearchedContact[]>()
    contacts.forEach((contact) => {
      const existing = contactsByCompany.get(contact.companyId) || []
      existing.push(contact)
      contactsByCompany.set(contact.companyId, existing)
    })

    // Create a map of contactId -> email
    const emailByContact = new Map<string, EmailDraft>()
    emails.forEach((email) => {
      if (email.to?.id) {
        emailByContact.set(email.to.id, email)
      }
    })

    const rows: DataTableRow[] = []

    companies.forEach((company) => {
      const companyContacts = contactsByCompany.get(company.id) || []

      if (companyContacts.length === 0) {
        // Company with no contacts - show as single row
        rows.push({
          company,
          contact: null,
          email: null,
          status: 'not_contacted',
          dateSent: null,
        })
      } else {
        // One row per contact
        companyContacts.forEach((contact) => {
          const email = emailByContact.get(contact.id) || null
          const contactEmail = (contact as ResearchedContact & { email?: string }).email

          // Convert ResearchedContact to Person if it has an email
          const person: Person | null = contactEmail
            ? {
                id: contact.id,
                company: contact.company,
                companyId: contact.companyId,
                name: contact.name,
                title: contact.title,
                email: contactEmail,
                linkedin: contact.linkedinUrl || '',
                seniority: contact.seniority,
                source: 'web_research',
                verificationStatus: contact.verified ? 'verified' : 'unverified',
                emailCertainty: contact.verified ? 80 : 50,
                emailSource: 'web_research',
                emailVerified: contact.verified || false,
              }
            : null

          rows.push({
            company,
            contact: person,
            email,
            status: tableStatuses[contact.id] || 'not_contacted',
            dateSent: tableDatesSent[contact.id] || null,
          })
        })
      }
    })

    return rows
  }, [schemaConfig])

  // Handle status change in data table (with debounce)
  const handleStatusChange = useCallback((index: number, status: Status) => {
    if (!project || !schemaConfig) return

    const row = tableRows[index]
    const contactId = schemaConfig.contacts?.[index]?.id

    // Find the actual contact ID from the row's contact or use company ID as fallback
    const actualContactId =
      row.contact?.id || (row.company ? `company-${row.company.id}` : contactId)
    if (!actualContactId) return

    const updatedStatuses = {
      ...(schemaConfig.tableStatuses || {}),
      [actualContactId]: status,
    }

    const updatedSchemaConfig = {
      ...schemaConfig,
      tableStatuses: updatedStatuses,
    }

    // Update local state immediately for responsiveness
    setProject({
      ...project,
      schema_config: updatedSchemaConfig,
      updated_at: new Date().toISOString(),
    })

    // Clear existing timeout
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current)
    }

    // Debounced save to Supabase
    statusTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true)
      setPendingRetry(null)

      const supabase = getSupabase()
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)

      setIsSaving(false)

      if (updateError) {
        console.error('Failed to update status:', updateError)
        addToast('Failed to save status change', 'error')
        // Set up retry function
        setPendingRetry(() => () => handleStatusChange(index, status))
      }
    }, DEBOUNCE_DELAY)
  }, [project, schemaConfig, tableRows, addToast])

  // Handle date change in data table (with debounce)
  const handleDateChange = useCallback((index: number, date: string | null) => {
    if (!project || !schemaConfig) return

    const row = tableRows[index]
    const contactId = schemaConfig.contacts?.[index]?.id

    const actualContactId =
      row.contact?.id || (row.company ? `company-${row.company.id}` : contactId)
    if (!actualContactId) return

    const updatedDates = {
      ...(schemaConfig.tableDatesSent || {}),
      [actualContactId]: date || '',
    }

    // Remove empty dates
    if (!date) {
      delete updatedDates[actualContactId]
    }

    const updatedSchemaConfig = {
      ...schemaConfig,
      tableDatesSent: updatedDates,
    }

    // Update local state immediately for responsiveness
    setProject({
      ...project,
      schema_config: updatedSchemaConfig,
      updated_at: new Date().toISOString(),
    })

    // Clear existing timeout
    if (dateTimeoutRef.current) {
      clearTimeout(dateTimeoutRef.current)
    }

    // Debounced save to Supabase
    dateTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true)
      setPendingRetry(null)

      const supabase = getSupabase()
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)

      setIsSaving(false)

      if (updateError) {
        console.error('Failed to update date:', updateError)
        addToast('Failed to save date change', 'error')
        // Set up retry function
        setPendingRetry(() => () => handleDateChange(index, date))
      }
    }, DEBOUNCE_DELAY)
  }, [project, schemaConfig, tableRows, addToast])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" label="Loading project..." />
      </div>
    )
  }

  if (error || !project) {
    const isNotFound = error === 'Project not found'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <ErrorMessage
          message={error || 'Project not found'}
          variant={isNotFound ? 'warning' : 'error'}
          retry={!isNotFound ? loadProject : undefined}
        />
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Projects</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">
              {project?.client_name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle Button */}
            <button
              onClick={() => handleViewModeChange(viewMode === 'wizard' ? 'table' : 'wizard')}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors bg-white border-gray-200 hover:bg-gray-50"
              title={viewMode === 'wizard' ? 'View Table (⌘T)' : 'View Wizard (⌘T)'}
            >
              {viewMode === 'wizard' ? (
                <>
                  <Table2 className="w-4 h-4" />
                  <span className="hidden sm:inline">View Table</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span className="hidden sm:inline">View Wizard</span>
                </>
              )}
            </button>
            <KeyboardShortcutsHelp shortcuts={shortcutsList} />
            <button
              onClick={() => setIsPromptInspectorOpen(!isPromptInspectorOpen)}
              className={`p-2 rounded-lg transition-colors ${
                isPromptInspectorOpen
                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Toggle Prompt Inspector"
            >
              <Terminal className="w-5 h-5" />
            </button>
            <Link
              href={`/project/${projectId}/settings`}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main content area - full screen views with toggle */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Mobile view toggle header (visible on mobile only) */}
        <div className="md:hidden border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setIsMobileWizardOpen(!isMobileWizardOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-left touch-manipulation"
          >
            <span className="font-medium text-gray-900">
              {viewMode === 'wizard' ? 'Wizard' : 'Table'}
            </span>
            {isMobileWizardOpen ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
        </div>

        {/* Full-screen Wizard View */}
        <div
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            viewMode === 'wizard'
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-full pointer-events-none'
          }`}
        >
          <div className="h-full overflow-y-auto p-4 md:p-6 bg-gray-50">
            <div className="max-w-3xl mx-auto">
              <WizardPanel
                project={project}
                expandedStep={expandedStep}
                onStepChange={setExpandedStep}
                onProjectUpdate={setProject}
                completedSteps={completedSteps}
              />
            </div>
          </div>
        </div>

        {/* Full-screen Table View */}
        <div
          className={`absolute inset-0 transition-all duration-300 ease-in-out ${
            viewMode === 'table'
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 translate-x-full pointer-events-none'
          }`}
        >
          <div className="h-full overflow-auto p-2 md:p-4 bg-white">
            <div className="h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
              <DataTable
                data={tableRows}
                projectId={projectId}
                onStatusChange={handleStatusChange}
                onDateChange={handleDateChange}
                isSaving={isSaving}
                onRetry={pendingRetry || undefined}
                focusedRowIndex={focusedRowIndex}
                onFocusedRowChange={setFocusedRowIndex}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Inspector */}
      <PromptInspector
        isOpen={isPromptInspectorOpen}
        onToggle={() => setIsPromptInspectorOpen(!isPromptInspectorOpen)}
      />
    </div>
    </ErrorBoundary>
  )
}
