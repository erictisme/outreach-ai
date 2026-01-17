'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { getSupabase, Project } from '@/lib/supabase'
import { Spinner } from '@/components/ui/Spinner'
import { WizardPanel, WizardStep } from '@/components/WizardPanel'
import { ConversationModal } from '@/components/ConversationModal'
import { DataTable, DataTableRow } from '@/components/DataTable'
import { Status } from '@/components/StatusDropdown'
import { useToast } from '@/components/ui/Toast'
import { EmailDraft, Conversation, Company, ResearchedContact, Person } from '@/types'

export default function ProjectPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [expandedStep, setExpandedStep] = useState<WizardStep>('setup')
  const [completedSteps, setCompletedSteps] = useState<WizardStep[]>([])

  // Conversation modal state
  const [conversationModal, setConversationModal] = useState<{
    isOpen: boolean
    contactId: string | null
    email: EmailDraft | null
  }>({ isOpen: false, contactId: null, email: null })

  // Saving state for table edits
  const [isSaving, setIsSaving] = useState(false)
  const [pendingRetry, setPendingRetry] = useState<(() => void) | null>(null)
  const { addToast } = useToast()

  // Debounce refs for status and date changes
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const DEBOUNCE_DELAY = 300

  useEffect(() => {
    async function loadProject() {
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
        setError('Failed to load project')
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [projectId])

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

  // Handle opening conversation modal
  const handleOpenConversation = (contactId: string, email: EmailDraft) => {
    setConversationModal({
      isOpen: true,
      contactId,
      email,
    })
  }

  // Handle saving conversation
  const handleSaveConversation = async (conversation: Conversation, followUpCount?: number) => {
    if (!project) return

    const existingConversations = schemaConfig?.conversations || []
    const conversationIndex = existingConversations.findIndex(
      (c) => c.personId === conversation.personId
    )

    let updatedConversations: Conversation[]
    if (conversationIndex >= 0) {
      // Update existing conversation
      updatedConversations = [...existingConversations]
      updatedConversations[conversationIndex] = conversation
    } else {
      // Add new conversation
      updatedConversations = [...existingConversations, conversation]
    }

    // Update contact with follow-up count if provided
    let updatedContacts = schemaConfig?.contacts || []
    if (followUpCount !== undefined && followUpCount > 0) {
      updatedContacts = updatedContacts.map((contact) => {
        if (contact.id === conversation.personId) {
          return {
            ...contact,
            custom_fields: {
              ...(contact as ResearchedContact & { custom_fields?: Record<string, unknown> }).custom_fields,
              followup_count: followUpCount,
            },
          }
        }
        return contact
      })
    }

    // Save to Supabase
    const supabase = getSupabase()
    const updatedSchemaConfig = {
      ...schemaConfig,
      conversations: updatedConversations,
      contacts: updatedContacts,
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id)

    if (updateError) {
      console.error('Failed to save conversation:', updateError)
      return
    }

    // Update local state
    setProject({
      ...project,
      schema_config: updatedSchemaConfig,
      updated_at: new Date().toISOString(),
    })
  }

  // Get contact and company data for conversation modal
  const getConversationData = () => {
    if (!conversationModal.contactId || !conversationModal.email) {
      return null
    }

    const contact = schemaConfig?.contacts?.find(
      (c) => c.id === conversationModal.contactId
    )
    const company = schemaConfig?.companies?.find(
      (c) => c.id === conversationModal.email?.company?.id
    )
    const existingConversation = schemaConfig?.conversations?.find(
      (c) => c.personId === conversationModal.contactId
    )

    if (!contact || !company) return null

    return {
      contact: {
        id: contact.id,
        company: contact.company,
        companyId: contact.companyId,
        name: contact.name,
        title: contact.title,
        email: (contact as ResearchedContact & { email?: string }).email || '',
        linkedin: contact.linkedinUrl || '',
        seniority: contact.seniority,
        source: 'web_research' as const,
        verificationStatus: 'unverified' as const,
        emailCertainty: 50,
        emailSource: '',
        emailVerified: false,
      },
      company,
      existingConversation,
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" label="Loading project..." />
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-red-600 text-lg">{error || 'Project not found'}</div>
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
        </div>
      </header>

      {/* Main content area - two column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Wizard */}
        <div
          className={`${
            isPanelCollapsed ? 'w-0' : 'w-80'
          } border-r border-gray-200 bg-gray-50 flex-shrink-0 transition-all duration-300 overflow-hidden`}
        >
          <div className="w-80 h-full p-4 overflow-y-auto">
            <WizardPanel
              project={project}
              expandedStep={expandedStep}
              onStepChange={setExpandedStep}
              onProjectUpdate={setProject}
              completedSteps={completedSteps}
              onOpenConversation={handleOpenConversation}
            />
          </div>
        </div>

        {/* Collapse/expand button */}
        <button
          onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          className="flex-shrink-0 w-6 bg-gray-100 hover:bg-gray-200 flex items-center justify-center border-r border-gray-200 transition-colors"
          aria-label={isPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isPanelCollapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {/* Right area - Data Table */}
        <div className="flex-1 overflow-auto p-4">
          <div className="h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
            <DataTable
              data={tableRows}
              onStatusChange={handleStatusChange}
              onDateChange={handleDateChange}
              isSaving={isSaving}
              onRetry={pendingRetry || undefined}
            />
          </div>
        </div>
      </div>

      {/* Conversation Modal */}
      {conversationModal.isOpen && conversationModal.email && (() => {
        const data = getConversationData()
        if (!data) return null
        return (
          <ConversationModal
            isOpen={conversationModal.isOpen}
            contact={data.contact}
            company={data.company}
            initialEmail={conversationModal.email}
            existingConversation={data.existingConversation}
            projectContext={(project?.schema_config as { context?: import('@/types').ProjectContext })?.context}
            onClose={() => setConversationModal({ isOpen: false, contactId: null, email: null })}
            onSave={handleSaveConversation}
          />
        )
      })()}
    </div>
  )
}
