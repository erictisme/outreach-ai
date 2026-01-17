'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  FileText, Sparkles, Building2, Users, Mail, MessageSquare,
  ChevronRight, ChevronLeft, Loader2, Plus, Upload, Check, Edit2, Save, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Step, Project, ProjectContext, Company, Person, EmailDraft, Segment,
  Conversation, UploadedDoc, ProviderSelection, ProjectObjective, OBJECTIVE_OPTIONS,
  SeniorityLevel, SENIORITY_OPTIONS
} from '@/types'
import {
  extractDomain, normalizeName, isDuplicateCompany
} from '@/lib/storage'
import { getSupabase } from '@/lib/supabase'
import { ContextInput } from '@/components/ContextInput'
import { SchemaEditor } from '@/components/SchemaEditor'
import { ResultsTable } from '@/components/ResultsTable'
import { EmailEditor } from '@/components/EmailEditor'
import { ConversationList } from '@/components/ConversationList'
import { ConversationThread } from '@/components/ConversationThread'
import { ApiKeyModal, getApiKey, hasAnyContactProvider, ApiKeyType } from '@/components/ApiKeyModal'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useToast } from '@/components/ui/Toast'

// Step configuration - simplified for enrichment-focused workflow
const STEPS: { id: Step; label: string; icon: typeof FileText }[] = [
  { id: 'context', label: 'Context', icon: FileText },
  { id: 'extract', label: 'Review', icon: Edit2 },
  { id: 'list', label: 'Companies', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'emails', label: 'Emails', icon: Mail },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
]

// Common target roles for B2B outreach
const COMMON_ROLES = [
  'CEO', 'CFO', 'COO', 'CMO', 'CTO',
  'Managing Director', 'General Manager',
  'VP Sales', 'VP Marketing', 'VP Operations', 'VP Business Development',
  'Sales Director', 'Marketing Director', 'Operations Director',
  'Head of Procurement', 'Head of Purchasing', 'Head of Supply Chain',
  'Procurement Manager', 'Purchasing Manager', 'Buyer', 'Category Manager',
  'Innovation Manager', 'Product Manager', 'Business Development Manager',
  'Owner', 'Founder', 'Partner',
]

// Workflow state stored in localStorage (keyed by supabase project ID)
const WORKFLOW_KEY_PREFIX = 'outreach-workflow-'

function getWorkflowState(projectId: string): Partial<Project> | null {
  if (typeof window === 'undefined') return null
  const data = localStorage.getItem(WORKFLOW_KEY_PREFIX + projectId)
  return data ? JSON.parse(data) : null
}

function saveWorkflowState(projectId: string, state: Partial<Project>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(WORKFLOW_KEY_PREFIX + projectId, JSON.stringify(state))
}

export default function WorkflowPage() {
  const params = useParams()
  const router = useRouter()
  const { addToast } = useToast()
  const projectId = params.id as string

  // Core state
  const [project, setProject] = useState<Project | null>(null)
  const [supabaseProject, setSupabaseProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('context')

  // UI state
  const [extracting, setExtracting] = useState(false)
  const [savingContext, setSavingContext] = useState(false)
  const [generatingList, setGeneratingList] = useState(false)
  const [findingContacts, setFindingContacts] = useState(false)
  const [writingEmails, setWritingEmails] = useState(false)
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false)
  const [requiredApiKey, setRequiredApiKey] = useState<ApiKeyType | undefined>()
  const [newRoleInput, setNewRoleInput] = useState('')

  // Contact finding state
  const [selectedProviders, setSelectedProviders] = useState<ProviderSelection>({
    apollo: true,
    hunter: false,
    apify: false,
    aiSearch: false,
  })

  // Conversation view state
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  // Load project from Supabase + workflow state from localStorage
  useEffect(() => {
    async function loadProject() {
      try {
        const supabase = getSupabase()

        // Load project from Supabase
        const { data: sbProject, error: sbError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (sbError || !sbProject) {
          setError('Project not found')
          setLoading(false)
          return
        }

        setSupabaseProject(sbProject)

        // Load workflow state from localStorage (or initialize)
        const workflowState = getWorkflowState(projectId)

        // Build context from Supabase project
        const extractedContext = sbProject.schema_config?.extractedContext as ProjectContext | undefined

        const initialProject: Project = {
          id: sbProject.id,
          name: sbProject.client_name || 'Untitled Project',
          currentStep: (workflowState?.currentStep as Step) || 'context',
          objective: (workflowState?.objective as ProjectObjective) || 'sales_prospects',
          customObjective: workflowState?.customObjective || '',
          context: extractedContext || (sbProject.client_name ? {
            objective: 'sales_prospects',
            clientName: sbProject.client_name,
            product: sbProject.product_description || '',
            valueProposition: '',
            targetMarket: sbProject.target_market || '',
            targetSegment: sbProject.target_segment || '',
            segments: [],
            targetRoles: [],
            targetSeniority: 'director',
            keyDifferentiators: [],
            credibilitySignals: [],
          } : null),
          contextDump: sbProject.brief_content || workflowState?.contextDump || '',
          documents: workflowState?.documents || [],
          emailTemplate: workflowState?.emailTemplate || '',
          selectedSegmentIds: workflowState?.selectedSegmentIds || [],
          listCount: workflowState?.listCount || 5,
          companies: workflowState?.companies || [],
          selectedCompanyIds: workflowState?.selectedCompanyIds || [],
          persons: workflowState?.persons || [],
          selectedPersonIds: workflowState?.selectedPersonIds || [],
          emailsFound: workflowState?.emailsFound || false,
          emails: workflowState?.emails || [],
          conversations: workflowState?.conversations || [],
          processedDomains: workflowState?.processedDomains || [],
          processedNames: workflowState?.processedNames || [],
          lastRunAt: workflowState?.lastRunAt || null,
          apiKeys: workflowState?.apiKeys || {},
          createdAt: new Date(sbProject.created_at).getTime(),
          updatedAt: Date.now(),
        }

        setProject(initialProject)
        setCurrentStep(initialProject.currentStep)
        setLoading(false)
      } catch (err) {
        console.error('Error loading project:', err)
        setError('Failed to load project')
        setLoading(false)
      }
    }

    loadProject()
  }, [projectId])

  // Save workflow state to localStorage when project changes
  const saveProject = useCallback((updates: Partial<Project>) => {
    if (!project) return
    const updatedProject = { ...project, ...updates, updatedAt: Date.now() }
    setProject(updatedProject)
    saveWorkflowState(projectId, updatedProject)
  }, [project, projectId])

  // Navigate to step
  const goToStep = (step: Step) => {
    setCurrentStep(step)
    if (project) {
      saveProject({ currentStep: step })
    }
  }

  // Step navigation
  const stepIndex = STEPS.findIndex(s => s.id === currentStep)
  const canGoBack = stepIndex > 0
  const canGoNext = stepIndex < STEPS.length - 1

  const goBack = () => {
    if (canGoBack) {
      goToStep(STEPS[stepIndex - 1].id)
    }
  }

  const goNext = () => {
    if (canGoNext) {
      goToStep(STEPS[stepIndex + 1].id)
    }
  }

  // --- Context Step ---
  const handleContextChange = (contextDump: string) => {
    saveProject({ contextDump })
  }

  const handleDocumentsChange = (documents: UploadedDoc[]) => {
    saveProject({ documents })
  }

  // --- Extract Step ---
  const handleExtract = async () => {
    if (!project) return

    setExtracting(true)
    setError(null)

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextDump: project.contextDump,
          documents: project.documents,
        }),
      })

      if (!res.ok) throw new Error('Failed to extract context')

      const data = await res.json()
      const context: ProjectContext = data.context

      // Select all segments by default
      const segmentIds = context.segments?.map(s => s.id) || []

      saveProject({
        context,
        name: context.clientName || project.name,
        selectedSegmentIds: segmentIds,
      })

      addToast('Context extracted successfully', 'success')
    } catch (err) {
      console.error('Extract error:', err)
      setError('Failed to extract context from documents')
    } finally {
      setExtracting(false)
    }
  }

  // --- Save Context to Supabase ---
  const handleSaveContext = async () => {
    if (!project?.context) return

    setSavingContext(true)
    setError(null)

    try {
      const supabase = getSupabase()

      // Update the project in Supabase with the context
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          client_name: project.context.clientName,
          schema_config: {
            ...supabaseProject?.schema_config,
            extractedContext: project.context,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)

      if (updateError) throw updateError

      addToast('Context saved to project', 'success')
    } catch (err) {
      console.error('Save context error:', err)
      setError('Failed to save context')
    } finally {
      setSavingContext(false)
    }
  }

  // --- Update Context Field Helper ---
  const updateContextField = <K extends keyof ProjectContext>(
    field: K,
    value: ProjectContext[K]
  ) => {
    if (!project?.context) return
    const updatedContext = { ...project.context, [field]: value }
    saveProject({ context: updatedContext })
  }

  // --- List Step ---
  const handleGenerateList = async () => {
    if (!project?.context) return

    setGeneratingList(true)
    setError(null)

    try {
      // Get selected segments
      const selectedSegments = project.context.segments?.filter(
        s => project.selectedSegmentIds.includes(s.id)
      ) || []

      if (selectedSegments.length === 0) {
        setError('Please select at least one segment')
        setGeneratingList(false)
        return
      }

      // Build exclude list from existing companies
      const excludeNames = project.companies.map(c => c.name)

      const res = await fetch('/api/generate-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: project.context,
          segments: selectedSegments,
          countPerSegment: project.listCount || 5,
          excludeNames,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate list')

      const data = await res.json()

      // Filter out duplicates
      const newCompanies: Company[] = []
      const newDomains = [...(project.processedDomains || [])]
      const newNames = [...(project.processedNames || [])]

      for (const company of data.companies) {
        const { isDuplicate } = isDuplicateCompany(company, newDomains, newNames)
        if (!isDuplicate) {
          newCompanies.push(company)
          if (company.domain) newDomains.push(company.domain)
          newNames.push(normalizeName(company.name))
        }
      }

      // Add to existing companies
      const updatedCompanies = [...project.companies, ...newCompanies]
      const selectedIds = updatedCompanies.map((_, i) => i)

      saveProject({
        companies: updatedCompanies,
        selectedCompanyIds: selectedIds,
        processedDomains: newDomains,
        processedNames: newNames,
        lastRunAt: Date.now(),
      })

      addToast(`Added ${newCompanies.length} companies`, 'success')
    } catch (err) {
      console.error('Generate list error:', err)
      setError('Failed to generate company list')
    } finally {
      setGeneratingList(false)
    }
  }

  const handleCompanySelectionChange = (ids: Set<number>) => {
    saveProject({ selectedCompanyIds: Array.from(ids) })
  }

  const handleDeleteCompany = (index: number) => {
    if (!project) return
    const companies = [...project.companies]
    companies.splice(index, 1)
    const selectedIds = project.selectedCompanyIds.filter(i => i !== index).map(i => i > index ? i - 1 : i)
    saveProject({ companies, selectedCompanyIds: selectedIds })
  }

  // --- Contacts Step ---
  const handleFindContacts = async () => {
    if (!project?.context) return

    // Check for API keys
    if (selectedProviders.apollo && !getApiKey('apollo')) {
      setRequiredApiKey('apollo')
      setApiKeyModalOpen(true)
      return
    }

    setFindingContacts(true)
    setError(null)

    try {
      // Get selected companies
      const selectedCompanies = project.selectedCompanyIds.map(i => project.companies[i]).filter(Boolean)

      if (selectedCompanies.length === 0) {
        setError('Please select at least one company')
        setFindingContacts(false)
        return
      }

      // Call Apollo API (main provider)
      if (selectedProviders.apollo) {
        const res = await fetch('/api/find-contacts-apollo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companies: selectedCompanies,
            context: project.context,
            apiKey: getApiKey('apollo'),
          }),
        })

        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || 'Failed to find contacts')
        }

        const data = await res.json()

        // Filter out duplicates
        const existingEmails = new Set(project.persons.map(p => p.email?.toLowerCase()).filter(Boolean))
        const newPersons = data.persons.filter(
          (p: Person) => !p.email || !existingEmails.has(p.email.toLowerCase())
        )

        // Add to existing persons
        const updatedPersons = [...project.persons, ...newPersons]
        const selectedIds = updatedPersons.map((_, i) => i)

        saveProject({
          persons: updatedPersons,
          selectedPersonIds: selectedIds,
          emailsFound: updatedPersons.some(p => !!p.email),
        })

        addToast(`Found ${newPersons.length} contacts`, 'success')
      }
    } catch (err) {
      console.error('Find contacts error:', err)
      setError(err instanceof Error ? err.message : 'Failed to find contacts')
    } finally {
      setFindingContacts(false)
    }
  }

  const handlePersonSelectionChange = (ids: Set<number>) => {
    saveProject({ selectedPersonIds: Array.from(ids) })
  }

  const handleDeletePerson = (index: number) => {
    if (!project) return
    const persons = [...project.persons]
    persons.splice(index, 1)
    const selectedIds = project.selectedPersonIds.filter(i => i !== index).map(i => i > index ? i - 1 : i)
    saveProject({ persons, selectedPersonIds: selectedIds })
  }

  // --- Emails Step ---
  const handleWriteEmails = async () => {
    if (!project?.context) return

    setWritingEmails(true)
    setError(null)

    try {
      // Get selected persons
      const selectedPersons = project.selectedPersonIds.map(i => project.persons[i]).filter(Boolean)

      if (selectedPersons.length === 0) {
        setError('Please select at least one contact')
        setWritingEmails(false)
        return
      }

      const res = await fetch('/api/write-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: project.context,
          companies: project.companies,
          persons: selectedPersons,
        }),
      })

      if (!res.ok) throw new Error('Failed to write emails')

      const data = await res.json()

      saveProject({
        emails: [...project.emails, ...data.emails],
      })

      addToast(`Generated ${data.emails.length} emails`, 'success')
    } catch (err) {
      console.error('Write emails error:', err)
      setError('Failed to write emails')
    } finally {
      setWritingEmails(false)
    }
  }

  const handleEmailsChange = (emails: EmailDraft[]) => {
    saveProject({ emails })
  }

  // --- Conversations Step ---
  const handleStartConversation = (emailIndex: number) => {
    if (!project) return

    const email = project.emails[emailIndex]
    if (!email) return

    const now = Date.now()
    const conversation: Conversation = {
      id: `conv-${now}`,
      personId: email.to.id,
      companyId: email.company.id,
      status: 'awaiting_reply',
      initialEmailIndex: emailIndex,
      messages: [{
        id: `msg-${now}`,
        sender: 'you',
        content: email.body,
        subject: email.subject,
        timestamp: now,
      }],
      meetingDetails: undefined,
      updatedAt: now,
      createdAt: now,
    }

    saveProject({
      conversations: [...project.conversations, conversation],
    })

    setActiveConversationId(conversation.id)
    addToast('Conversation started', 'success')
  }

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id)
  }

  const handleUpdateConversation = (conversation: Conversation) => {
    if (!project) return
    const conversations = project.conversations.map(c =>
      c.id === conversation.id ? conversation : c
    )
    saveProject({ conversations })
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    )
  }

  // Error state
  if (error && !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <ErrorMessage message={error} />
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    )
  }

  if (!project) return null

  // Active conversation for thread view
  const activeConversation = project.conversations.find(c => c.id === activeConversationId)
  const activePerson = activeConversation ? project.persons.find(p => p.id === activeConversation.personId) : null
  const activeCompany = activeConversation ? project.companies.find(c => c.id === activeConversation.companyId) : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={apiKeyModalOpen}
        requiredKey={requiredApiKey}
        onClose={() => setApiKeyModalOpen(false)}
        onSave={() => {
          setApiKeyModalOpen(false)
          // Retry the action that needed the key
          if (requiredApiKey === 'apollo') {
            handleFindContacts()
          }
        }}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-500 hover:text-gray-700 mb-1"
            >
              ← Back to Projects
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              {project.name || 'Untitled Project'}
            </h1>
          </div>
          <button
            onClick={() => setApiKeyModalOpen(true)}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
          >
            API Keys
          </button>
        </div>
      </header>

      {/* Step Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 overflow-x-auto">
            {STEPS.map((step, index) => {
              const StepIcon = step.icon
              const isActive = step.id === currentStep
              const isPast = STEPS.findIndex(s => s.id === currentStep) > index

              return (
                <button
                  key={step.id}
                  onClick={() => goToStep(step.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-colors',
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : isPast
                      ? 'bg-green-50 text-green-700 hover:bg-green-100'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  )}
                >
                  {isPast ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">{step.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <ErrorMessage
            message={error}
            onDismiss={() => setError(null)}
            className="mb-6"
          />
        )}

        {/* Context Step */}
        {currentStep === 'context' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Project Setup</h2>
              <p className="text-gray-600">
                Start by providing context about your outreach project.
              </p>
            </div>

            {/* Objective Selection */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">What are you trying to achieve?</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {OBJECTIVE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => saveProject({ objective: opt.value })}
                    className={cn(
                      'p-4 rounded-xl border-2 transition-colors text-left',
                      project.objective === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    )}
                  >
                    <div className="font-medium text-gray-900 text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{opt.description}</div>
                  </button>
                ))}
              </div>
              {project.objective === 'custom' && (
                <div className="mt-4">
                  <input
                    type="text"
                    placeholder="Describe your custom objective..."
                    value={project.customObjective || ''}
                    onChange={(e) => saveProject({ customObjective: e.target.value })}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-900"
                  />
                </div>
              )}
            </div>

            {/* Client/Company Name */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Your Company</h3>
              <p className="text-sm text-gray-500 mb-4">The name of your client or company doing the outreach.</p>
              <input
                type="text"
                placeholder="e.g., Acme Corporation"
                value={project.name !== 'Untitled Project' ? project.name : ''}
                onChange={(e) => saveProject({ name: e.target.value || 'Untitled Project' })}
                className="w-full p-3 border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-900"
              />
            </div>

            {/* Project Context */}
            <ContextInput
              contextDump={project.contextDump}
              documents={project.documents}
              onContextChange={handleContextChange}
              onDocumentsChange={handleDocumentsChange}
            />

            {/* Email Template (Optional) */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">Email Template (Optional)</h3>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Optional</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Paste an existing email template you like. AI will use this as a reference when generating outreach emails.
              </p>
              <textarea
                placeholder="Hi {{contact_name}},&#10;&#10;I noticed that {{company_name}}...&#10;&#10;Best regards,&#10;[Your name]"
                value={project.emailTemplate || ''}
                onChange={(e) => saveProject({ emailTemplate: e.target.value })}
                className="w-full h-32 p-3 border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-900 text-sm font-mono"
              />
            </div>

            {/* Continue Button */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Ready to continue?</h3>
              <p className="text-sm text-gray-500 mb-4">
                AI will extract key information from your context to help generate target companies.
              </p>
              <button
                onClick={async () => {
                  // Extract context first, then go to extract/review step
                  if (project.contextDump || project.documents.length > 0) {
                    await handleExtract()
                  }
                  goToStep('extract')
                }}
                disabled={extracting || (!project.contextDump && project.documents.length === 0)}
                className="w-full p-4 flex items-center justify-center gap-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Extract & Continue
                  </>
                )}
              </button>
              {!project.contextDump && project.documents.length === 0 && (
                <p className="text-xs text-amber-600 mt-2 text-center">
                  Add some context or upload documents first
                </p>
              )}
            </div>
          </div>
        )}

        {/* Extract Step - Review & Edit Extracted Context */}
        {currentStep === 'extract' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Review Extracted Info</h2>
                <p className="text-gray-600">
                  Review and edit the extracted information before generating companies.
                </p>
              </div>
              {project.context && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExtract}
                    disabled={extracting}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg border border-purple-200"
                  >
                    {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Re-extract
                  </button>
                  <button
                    onClick={handleSaveContext}
                    disabled={savingContext}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {savingContext ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Context
                  </button>
                </div>
              )}
            </div>

            {!project.context ? (
              <div className="bg-white rounded-xl border p-8 text-center">
                <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to Extract</h3>
                <p className="text-gray-500 mb-6">
                  Click below to have AI analyze your context and extract key information.
                </p>
                <button
                  onClick={handleExtract}
                  disabled={extracting}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Extract with AI
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Editable Context Fields */}
                <div className="bg-white rounded-xl border p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Project Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Client Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                      <input
                        type="text"
                        value={project.context.clientName || ''}
                        onChange={(e) => updateContextField('clientName', e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Product */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product/Service</label>
                      <input
                        type="text"
                        value={project.context.product || ''}
                        onChange={(e) => updateContextField('product', e.target.value)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Target Market */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Target Market</label>
                      <input
                        type="text"
                        value={project.context.targetMarket || ''}
                        onChange={(e) => updateContextField('targetMarket', e.target.value)}
                        placeholder="e.g., Singapore, ASEAN, USA"
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Target Seniority */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Target Seniority</label>
                      <select
                        value={project.context.targetSeniority || 'director'}
                        onChange={(e) => updateContextField('targetSeniority', e.target.value as SeniorityLevel)}
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 bg-white"
                      >
                        {SENIORITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} - {opt.description}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Value Proposition */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Value Proposition</label>
                      <textarea
                        value={project.context.valueProposition || ''}
                        onChange={(e) => updateContextField('valueProposition', e.target.value)}
                        rows={2}
                        placeholder="Why should customers care?"
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>

                    {/* Visit Dates (optional) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Visit Dates <span className="text-gray-400">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={project.context.visitDates || ''}
                        onChange={(e) => updateContextField('visitDates', e.target.value)}
                        placeholder="e.g., Jan 26-28"
                        className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Target Roles - Chips/Multi-select */}
                <div className="bg-white rounded-xl border p-6">
                  <h3 className="font-semibold text-gray-900 mb-2">Target Roles</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Select job titles to target. Click to add/remove, or type a custom role.
                  </p>

                  {/* Selected Roles */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(project.context.targetRoles || []).map((role, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                      >
                        {role}
                        <button
                          onClick={() => {
                            const newRoles = project.context!.targetRoles.filter((_, i) => i !== idx)
                            updateContextField('targetRoles', newRoles)
                          }}
                          className="hover:text-blue-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {(project.context.targetRoles || []).length === 0 && (
                      <span className="text-gray-400 text-sm">No roles selected</span>
                    )}
                  </div>

                  {/* Add Custom Role */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newRoleInput}
                      onChange={(e) => setNewRoleInput(e.target.value)}
                      placeholder="Add custom role..."
                      className="flex-1 p-2 text-sm border border-gray-200 rounded-lg text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newRoleInput.trim()) {
                          const currentRoles = project.context!.targetRoles || []
                          if (!currentRoles.includes(newRoleInput.trim())) {
                            updateContextField('targetRoles', [...currentRoles, newRoleInput.trim()])
                          }
                          setNewRoleInput('')
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (newRoleInput.trim()) {
                          const currentRoles = project.context!.targetRoles || []
                          if (!currentRoles.includes(newRoleInput.trim())) {
                            updateContextField('targetRoles', [...currentRoles, newRoleInput.trim()])
                          }
                          setNewRoleInput('')
                        }
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Common Roles to Add */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Common roles (click to add):</p>
                    <div className="flex flex-wrap gap-1">
                      {COMMON_ROLES.filter(r => !(project.context!.targetRoles || []).includes(r)).slice(0, 15).map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            const currentRoles = project.context!.targetRoles || []
                            updateContextField('targetRoles', [...currentRoles, role])
                          }}
                          className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 hover:text-gray-800"
                        >
                          + {role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Target Segments */}
                {project.context.segments && project.context.segments.length > 0 && (
                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="font-semibold text-gray-900 mb-2">Target Segments</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Select segments and specify how many companies to find in each:
                    </p>
                    <div className="space-y-3">
                      {project.context.segments.map((segment) => {
                        const isSelected = project.selectedSegmentIds.includes(segment.id)
                        const segmentCounts = (project as any).segmentCounts || {}
                        const count = segmentCounts[segment.id] || project.listCount || 5

                        return (
                          <div
                            key={segment.id}
                            className={cn(
                              'p-4 rounded-lg border transition-colors cursor-pointer',
                              isSelected
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                            )}
                            onClick={() => {
                              const ids = isSelected
                                ? project.selectedSegmentIds.filter(id => id !== segment.id)
                                : [...project.selectedSegmentIds, segment.id]
                              saveProject({ selectedSegmentIds: ids })
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="mt-1 w-4 h-4 rounded border-gray-300"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-gray-900">{segment.name}</div>
                                  {isSelected && (
                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => {
                                          const newCount = Math.max(1, count - 1)
                                          const newCounts = { ...segmentCounts, [segment.id]: newCount }
                                          saveProject({ segmentCounts: newCounts } as any)
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        min={1}
                                        max={25}
                                        value={count}
                                        onChange={(e) => {
                                          const newCounts = { ...segmentCounts, [segment.id]: parseInt(e.target.value) || 5 }
                                          saveProject({ segmentCounts: newCounts } as any)
                                        }}
                                        className="w-12 p-1 text-sm border border-gray-300 rounded text-gray-900 text-center"
                                      />
                                      <button
                                        onClick={() => {
                                          const newCount = Math.min(25, count + 1)
                                          const newCounts = { ...segmentCounts, [segment.id]: newCount }
                                          saveProject({ segmentCounts: newCounts } as any)
                                        }}
                                        className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500 mt-1">{segment.description}</div>
                                {segment.examples && segment.examples.length > 0 && (
                                  <div className="text-xs text-gray-400 mt-1">
                                    e.g. {segment.examples.slice(0, 3).join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Summary */}
                    {project.selectedSegmentIds.length > 0 && (
                      <div className="mt-4 p-3 bg-blue-100 rounded-lg text-sm text-blue-800">
                        <strong>Total:</strong> Will generate ~{
                          project.selectedSegmentIds.reduce((sum, id) => {
                            const segmentCounts = (project as any).segmentCounts || {}
                            return sum + (segmentCounts[id] || project.listCount || 5)
                          }, 0)
                        } companies across {project.selectedSegmentIds.length} segment(s)
                      </div>
                    )}
                  </div>
                )}

                {/* Company Source Choice */}
                <div className="bg-white rounded-xl border p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">How do you want to get companies?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => goToStep('list')}
                      className="p-4 border-2 border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                    >
                      <Sparkles className="w-6 h-6 text-purple-600 mb-2" />
                      <div className="font-medium text-gray-900">Generate with AI</div>
                      <div className="text-sm text-gray-500 mt-1">
                        AI will suggest companies based on your segments
                      </div>
                    </button>

                    <button
                      onClick={() => goToStep('list')}
                      className="p-4 border-2 border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                    >
                      <Upload className="w-6 h-6 text-blue-600 mb-2" />
                      <div className="font-medium text-gray-900">I have companies</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Import from CSV or paste company names
                      </div>
                    </button>
                  </div>
                </div>

                {/* Navigation */}
                <div className="flex justify-between">
                  <button
                    onClick={goBack}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={goNext}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Continue to Companies
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* List (Companies) Step */}
        {currentStep === 'list' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Company List</h2>
              <p className="text-gray-600">
                Add companies manually, paste from clipboard, or generate with AI.
              </p>
            </div>

            {/* Import Options */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Add Companies</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Paste companies */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Paste Company Names</label>
                  <textarea
                    placeholder="Company A&#10;Company B&#10;Company C"
                    className="w-full h-24 p-3 text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-900"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) {
                        const text = (e.target as HTMLTextAreaElement).value
                        const names = text.split('\n').map(n => n.trim()).filter(Boolean)
                        if (names.length > 0) {
                          const newCompanies = names.map((name, i) => ({
                            id: `company-paste-${Date.now()}-${i}`,
                            name,
                            type: '',
                            website: '',
                            domain: '',
                            description: '',
                            relevance: 'Medium',
                            status: 'not_contacted' as const,
                            verificationStatus: 'unverified' as const,
                            verificationSource: 'manual' as const,
                            verifiedAt: null,
                            websiteAccessible: false,
                          }))
                          const all = [...project.companies, ...newCompanies]
                          saveProject({
                            companies: all,
                            selectedCompanyIds: all.map((_, i) => i),
                          })
                          ;(e.target as HTMLTextAreaElement).value = ''
                          addToast(`Added ${names.length} companies`, 'success')
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500">One per line. Press ⌘+Enter to add.</p>
                </div>

                {/* Single add */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Add Single Company</label>
                  <input
                    type="text"
                    placeholder="Company name"
                    className="w-full p-3 text-sm border border-gray-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-gray-900"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const name = (e.target as HTMLInputElement).value.trim()
                        if (name) {
                          const newCompany = {
                            id: `company-manual-${Date.now()}`,
                            name,
                            type: '',
                            website: '',
                            domain: '',
                            description: '',
                            relevance: 'Medium',
                            status: 'not_contacted' as const,
                            verificationStatus: 'unverified' as const,
                            verificationSource: 'manual' as const,
                            verifiedAt: null,
                            websiteAccessible: false,
                          }
                          const all = [...project.companies, newCompany]
                          saveProject({
                            companies: all,
                            selectedCompanyIds: all.map((_, i) => i),
                          })
                          ;(e.target as HTMLInputElement).value = ''
                          addToast(`Added ${name}`, 'success')
                        }
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500">Press Enter to add.</p>
                </div>

                {/* AI Generate */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Generate with AI</label>
                  <button
                    onClick={handleGenerateList}
                    disabled={generatingList || !project.context}
                    className="w-full p-3 inline-flex items-center justify-center gap-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingList ? (
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
                  <p className="text-xs text-gray-500">
                    {project.context ? 'Uses project context' : 'Add context first'}
                  </p>
                </div>
              </div>
            </div>

            {/* Company List */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">
                  Companies ({project.companies.length})
                </h3>
                <span className="text-sm text-gray-500">
                  Click row to select/deselect
                </span>
              </div>
              <ResultsTable
                type="companies"
                data={project.companies}
                selectedIds={new Set(project.selectedCompanyIds)}
                onSelectionChange={handleCompanySelectionChange}
                onDelete={handleDeleteCompany}
              />
            </div>

            <div className="flex justify-between">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={goNext}
                disabled={project.selectedCompanyIds.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Continue to Contacts
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Contacts Step */}
        {currentStep === 'contacts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Find Contacts</h2>
              <p className="text-gray-600">
                Search for decision makers at your target companies. Select which companies to search.
              </p>
            </div>

            {/* Company Selection for Search */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Select Companies to Search</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    <strong className="text-gray-900">{project.selectedCompanyIds.length}</strong> of {project.companies.length} selected
                  </span>
                  <button
                    onClick={() => saveProject({ selectedCompanyIds: project.companies.map((_, i) => i) })}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => saveProject({ selectedCompanyIds: [] })}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {project.companies.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No companies yet. Go back and generate companies first.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-3 py-2 w-8">
                          <input
                            type="checkbox"
                            checked={project.selectedCompanyIds.length === project.companies.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                saveProject({ selectedCompanyIds: project.companies.map((_, i) => i) })
                              } else {
                                saveProject({ selectedCompanyIds: [] })
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Company</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Website</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {project.companies.map((company, i) => (
                        <tr
                          key={company.id || i}
                          className={cn(
                            'hover:bg-gray-50 cursor-pointer',
                            project.selectedCompanyIds.includes(i) ? 'bg-blue-50' : ''
                          )}
                          onClick={() => {
                            const ids = project.selectedCompanyIds.includes(i)
                              ? project.selectedCompanyIds.filter(id => id !== i)
                              : [...project.selectedCompanyIds, i]
                            saveProject({ selectedCompanyIds: ids })
                          }}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={project.selectedCompanyIds.includes(i)}
                              onChange={() => {}}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">{company.name}</td>
                          <td className="px-3 py-2 text-gray-600">{company.type}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{company.domain || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Search Button with Warning */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                  Searching uses Apollo API credits (~1 credit per company)
                </div>
                <div className="flex items-center gap-3">
                  {!hasAnyContactProvider() && (
                    <button
                      onClick={() => {
                        setRequiredApiKey('apollo')
                        setApiKeyModalOpen(true)
                      }}
                      className="px-4 py-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100"
                    >
                      Add API Key
                    </button>
                  )}
                  <button
                    onClick={handleFindContacts}
                    disabled={findingContacts || project.selectedCompanyIds.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {findingContacts ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Searching {project.selectedCompanyIds.length} companies...
                      </>
                    ) : (
                      <>
                        <Users className="w-4 h-4" />
                        Search {project.selectedCompanyIds.length} Companies
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Contacts Found */}
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Contacts Found</h3>
                <span className="text-sm text-gray-500">
                  <strong className="text-gray-900">{project.persons.length}</strong> contacts from {
                    new Set(project.persons.map(p => p.company)).size
                  } companies
                </span>
              </div>
              <ResultsTable
                type="persons"
                data={project.persons}
                selectedIds={new Set(project.selectedPersonIds)}
                onSelectionChange={handlePersonSelectionChange}
                onDelete={handleDeletePerson}
              />
            </div>

            <div className="flex justify-between">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={goNext}
                disabled={project.selectedPersonIds.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Continue to Emails
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Emails Step */}
        {currentStep === 'emails' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Write Emails</h2>
                <p className="text-gray-600">
                  Generate personalized outreach emails for selected contacts.
                </p>
              </div>
              <button
                onClick={handleWriteEmails}
                disabled={writingEmails || project.selectedPersonIds.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {writingEmails ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Writing...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    Generate Emails
                  </>
                )}
              </button>
            </div>

            <div className="bg-white rounded-xl border p-6">
              <EmailEditor
                emails={project.emails}
                onEmailsChange={handleEmailsChange}
              />

              {project.emails.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-medium text-gray-900 mb-4">Start Conversations</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    After sending emails, click "Mark Sent" to start tracking the conversation.
                  </p>
                  <div className="space-y-2">
                    {project.emails.map((email, index) => {
                      const hasConversation = project.conversations.some(
                        c => c.initialEmailIndex === index
                      )
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <span className="font-medium text-gray-900">{email.to.name}</span>
                            <span className="text-gray-400 mx-2">•</span>
                            <span className="text-gray-600">{email.company.name}</span>
                          </div>
                          {hasConversation ? (
                            <span className="text-sm text-green-600 flex items-center gap-1">
                              <Check className="w-4 h-4" />
                              Conversation started
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStartConversation(index)}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              Mark as Sent
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={goNext}
                disabled={project.conversations.length === 0}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Continue to Conversations
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Conversations Step */}
        {currentStep === 'conversations' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Manage Conversations</h2>
              <p className="text-gray-600">
                Track replies and generate follow-up responses.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Conversation List */}
              <div className="lg:col-span-1">
                <ConversationList
                  conversations={project.conversations}
                  persons={project.persons}
                  companies={project.companies}
                  emails={project.emails}
                  onSelectConversation={handleSelectConversation}
                  activeConversationId={activeConversationId}
                />
              </div>

              {/* Conversation Thread */}
              <div className="lg:col-span-2">
                {activeConversation && activePerson && activeCompany ? (
                  <div className="bg-white rounded-xl border p-6">
                    <ConversationThread
                      conversation={activeConversation}
                      person={activePerson}
                      company={activeCompany}
                      initialEmail={activeConversation.initialEmailIndex !== undefined
                        ? project.emails[activeConversation.initialEmailIndex]
                        : undefined}
                      context={project.context}
                      onBack={() => setActiveConversationId(null)}
                      onUpdateConversation={handleUpdateConversation}
                    />
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border p-12 text-center">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Select a Conversation
                    </h3>
                    <p className="text-gray-500">
                      Click on a conversation from the list to view and manage it.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => router.push(`/project/${project.id}/export`)}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Export Data
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
