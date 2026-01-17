'use client'

import { useState, useMemo } from 'react'
import { Check, Loader2, Search, Linkedin, AlertTriangle, Mail, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { Company, ResearchedContact, ProjectContext, Person } from '@/types'
import { ApiKeyModal, getApiKey } from '@/components/ApiKeyModal'
import { useToast } from '@/components/ui/Toast'
import { loggedFetch } from '@/lib/promptLogger'

interface ContactsStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function ContactsStep({ project, onUpdate, onComplete }: ContactsStepProps) {
  const { addToast } = useToast()
  const schemaConfig = project.schema_config as {
    extractedContext?: ProjectContext
    companies?: Company[]
    contacts?: ResearchedContact[]
  }

  const companies: Company[] = schemaConfig.companies || []
  const existingContacts: ResearchedContact[] = useMemo(
    () => schemaConfig.contacts || [],
    [schemaConfig.contacts]
  )

  // Track selected company IDs for research
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(() => {
    return new Set(companies.map((c) => c.id))
  })

  // Research state
  const [isResearching, setIsResearching] = useState(false)
  const [researchProgress, setResearchProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Found contacts state
  const [foundContacts, setFoundContacts] = useState<ResearchedContact[]>([])
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())

  // Apollo search state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showApolloConfirm, setShowApolloConfirm] = useState(false)
  const [isApolloSearching, setIsApolloSearching] = useState(false)
  const [apolloError, setApolloError] = useState<string | null>(null)

  // Email enrichment state
  const [showEnrichConfirm, setShowEnrichConfirm] = useState(false)
  const [isEnrichingEmails, setIsEnrichingEmails] = useState(false)
  const [enrichError, setEnrichError] = useState<string | null>(null)
  const [enrichSuccess, setEnrichSuccess] = useState<{ emailsFound: number; total: number } | null>(null)
  const [selectedExistingContactIds, setSelectedExistingContactIds] = useState<Set<string>>(() => {
    // Default select contacts without emails
    return new Set(existingContacts.filter((c) => !(c as ResearchedContact & { email?: string }).email).map((c) => c.id))
  })

  // Compute contacts without emails for enrichment - MUST be before early returns
  const contactsWithoutEmails = useMemo(() => {
    return existingContacts.filter((c) => {
      const email = (c as ResearchedContact & { email?: string }).email
      return !email || email.trim() === ''
    })
  }, [existingContacts])

  // Selected existing contacts for email enrichment - MUST be before early returns
  const selectedExistingContacts = useMemo(() => {
    return existingContacts.filter((c) => selectedExistingContactIds.has(c.id))
  }, [existingContacts, selectedExistingContactIds])

  // No companies yet
  if (companies.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 3 (Companies) first to add target companies.
      </div>
    )
  }

  const handleToggleCompany = (companyId: string) => {
    setSelectedCompanyIds((prev) => {
      const next = new Set(prev)
      if (next.has(companyId)) {
        next.delete(companyId)
      } else {
        next.add(companyId)
      }
      return next
    })
  }

  const handleSelectAllCompanies = () => {
    setSelectedCompanyIds(new Set(companies.map((c) => c.id)))
  }

  const handleDeselectAllCompanies = () => {
    setSelectedCompanyIds(new Set())
  }

  const handleToggleContact = (contactId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }

  const handleSelectAllContacts = () => {
    setSelectedContactIds(new Set(foundContacts.map((c) => c.id)))
  }

  const handleDeselectAllContacts = () => {
    setSelectedContactIds(new Set())
  }

  const selectedCompanyCount = selectedCompanyIds.size
  const targetRoles = schemaConfig.extractedContext?.targetRoles || []

  // Toggle selection for existing contacts
  const handleToggleExistingContact = (contactId: string) => {
    setSelectedExistingContactIds((prev) => {
      const next = new Set(prev)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }

  const handleSelectAllExisting = () => {
    setSelectedExistingContactIds(new Set(contactsWithoutEmails.map((c) => c.id)))
  }

  const handleDeselectAllExisting = () => {
    setSelectedExistingContactIds(new Set())
  }

  // Research contacts for selected companies
  const handleResearchContacts = async () => {
    const selectedCompanies = companies.filter((c) => selectedCompanyIds.has(c.id))
    if (selectedCompanies.length === 0) return

    setIsResearching(true)
    setError(null)
    setResearchProgress({ current: 0, total: selectedCompanies.length })

    try {
      const response = await loggedFetch('/api/find-contacts-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: selectedCompanies,
          context: schemaConfig.extractedContext || {},
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to research contacts')
      }

      const data = await response.json()
      const contacts: ResearchedContact[] = data.contacts || []

      // Set found contacts and select all by default
      setFoundContacts(contacts)
      setSelectedContactIds(new Set(contacts.map((c) => c.id)))
      setResearchProgress({ current: selectedCompanies.length, total: selectedCompanies.length })
    } catch (err) {
      console.error('Research contacts error:', err)
      setError(err instanceof Error ? err.message : 'Failed to research contacts')
    } finally {
      setIsResearching(false)
      setResearchProgress(null)
    }
  }

  // Apollo paid search - check API key first
  const handleApolloSearchClick = () => {
    const apolloKey = getApiKey('apollo')
    if (!apolloKey) {
      setShowApiKeyModal(true)
    } else {
      setShowApolloConfirm(true)
    }
  }

  // Apollo paid search execution
  const handleApolloSearch = async () => {
    setShowApolloConfirm(false)
    const apolloKey = getApiKey('apollo')
    if (!apolloKey) {
      setApolloError('Apollo API key not found')
      return
    }

    const selectedCompanies = companies.filter((c) => selectedCompanyIds.has(c.id))
    if (selectedCompanies.length === 0) return

    setIsApolloSearching(true)
    setApolloError(null)
    setResearchProgress({ current: 0, total: selectedCompanies.length })

    try {
      const response = await loggedFetch('/api/find-contacts-apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: selectedCompanies,
          context: schemaConfig.extractedContext || {},
          apiKey: apolloKey,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to search Apollo')
      }

      const data = await response.json()
      const apolloPersons: Person[] = data.persons || []

      // Convert Person results to ResearchedContact format
      const contacts: ResearchedContact[] = apolloPersons.map((p) => ({
        id: p.id,
        company: p.company,
        companyId: p.companyId,
        name: p.name,
        title: p.title,
        linkedinUrl: p.linkedin || '',
        email: p.email || undefined,
        seniority: p.seniority || 'Unknown',
        relevanceScore: p.emailCertainty ? Math.round(p.emailCertainty / 10) : 7,
        reasoning: `Found via Apollo API - ${p.emailSource || 'contact search'}`,
        source: 'web_research' as const,
        verified: p.emailVerified || false,
      }))

      // Set found contacts and select all by default
      setFoundContacts(contacts)
      setSelectedContactIds(new Set(contacts.map((c) => c.id)))
      setResearchProgress({ current: selectedCompanies.length, total: selectedCompanies.length })
    } catch (err) {
      console.error('Apollo search error:', err)
      setApolloError(err instanceof Error ? err.message : 'Failed to search Apollo')
    } finally {
      setIsApolloSearching(false)
      setResearchProgress(null)
    }
  }

  // Email enrichment - check API key first
  const handleEnrichEmailsClick = () => {
    const apolloKey = getApiKey('apollo')
    if (!apolloKey) {
      setShowApiKeyModal(true)
    } else {
      setShowEnrichConfirm(true)
    }
  }

  // Email enrichment execution
  const handleEnrichEmails = async () => {
    setShowEnrichConfirm(false)
    const apolloKey = getApiKey('apollo')
    if (!apolloKey) {
      setEnrichError('Apollo API key not found')
      return
    }

    const contactsToEnrich = selectedExistingContacts.filter((c) => {
      const email = (c as ResearchedContact & { email?: string }).email
      return !email || email.trim() === ''
    })

    if (contactsToEnrich.length === 0) {
      setEnrichError('No contacts without emails selected')
      return
    }

    setIsEnrichingEmails(true)
    setEnrichError(null)
    setEnrichSuccess(null)

    try {
      // Build company domains mapping
      const companyDomains: Record<string, string> = {}
      for (const contact of contactsToEnrich) {
        const company = companies.find((c) => c.id === contact.companyId || c.name === contact.company)
        if (company?.domain) {
          companyDomains[contact.companyId] = company.domain
        }
      }

      const response = await loggedFetch('/api/enrich-contacts-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: contactsToEnrich,
          companyDomains,
          apiKey: apolloKey,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to enrich contacts')
      }

      const data = await response.json()
      const enrichedPersons = data.persons || []
      const summary = data.summary || { emailsFound: 0 }

      // Update contacts with enriched data
      const supabase = getSupabase()
      const updatedContacts = existingContacts.map((contact) => {
        const enriched = enrichedPersons.find((p: { id: string; email?: string; linkedin?: string }) =>
          p.id === contact.id.replace('free-', 'person-') || p.id === contact.id
        )
        if (enriched && enriched.email) {
          return {
            ...contact,
            email: enriched.email,
            linkedinUrl: enriched.linkedin || contact.linkedinUrl,
            verified: true,
          } as ResearchedContact & { email?: string }
        }
        return contact
      })

      // Update contacts in Supabase
      for (const contact of updatedContacts) {
        const contactEmail = (contact as ResearchedContact & { email?: string }).email
        if (contactEmail) {
          await supabase
            .from('contacts')
            .update({
              email: contactEmail,
              verified: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', contact.id)
        }
      }

      // Update project schema_config with updated contacts
      const updatedSchemaConfig = {
        ...schemaConfig,
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
        throw updateError
      }

      // Update local state
      const updatedProject: Project = {
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      }
      onUpdate(updatedProject)

      // Show success message
      setEnrichSuccess({
        emailsFound: summary.emailsFound || 0,
        total: contactsToEnrich.length,
      })

      // Show success toast
      addToast(`Found ${summary.emailsFound || 0} email addresses`, 'success')

      // Clear selection
      setSelectedExistingContactIds(new Set())
    } catch (err) {
      console.error('Email enrichment error:', err)
      setEnrichError(err instanceof Error ? err.message : 'Failed to enrich contacts with emails')
      addToast('Failed to find emails', 'error')
    } finally {
      setIsEnrichingEmails(false)
    }
  }

  // Save selected contacts to Supabase
  const handleSaveContacts = async () => {
    const contactsToSave = foundContacts.filter((c) => selectedContactIds.has(c.id))
    if (contactsToSave.length === 0) return

    setIsResearching(true)
    setError(null)

    try {
      const supabase = getSupabase()

      // Save contacts to contacts table
      for (const contact of contactsToSave) {
        // Find the company's database ID
        const companyResult = await supabase
          .from('companies')
          .select('id')
          .eq('project_id', project.id)
          .eq('name', contact.company)
          .single()

        const dbCompanyId = companyResult.data?.id || contact.companyId

        // Detect source based on contact ID prefix or reasoning
        const isApolloContact = contact.id.startsWith('person-apollo-') || contact.reasoning?.includes('Apollo')
        const source = isApolloContact ? 'apollo' : 'ai_research'
        // Type assertion for email field on ResearchedContact
        const contactEmail = (contact as ResearchedContact & { email?: string }).email

        await supabase.from('contacts').upsert({
          id: contact.id,
          company_id: dbCompanyId,
          name: contact.name,
          title: contact.title,
          email: contactEmail || null,
          linkedin_url: contact.linkedinUrl || null,
          source,
          verified: contact.verified || false,
          custom_fields: {
            seniority: contact.seniority,
            relevanceScore: contact.relevanceScore,
            reasoning: contact.reasoning,
            companyName: contact.company,
          },
        })
      }

      // Merge with existing contacts in schema_config
      const allContacts = [...existingContacts, ...contactsToSave]

      // Update project schema_config with contacts list
      const updatedSchemaConfig = {
        ...schemaConfig,
        contacts: allContacts,
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

      // Show success toast
      addToast(`Added ${contactsToSave.length} contacts to the table`, 'success')

      // Clear found contacts state
      setFoundContacts([])
      setSelectedContactIds(new Set())

      // Move to next step
      onComplete()
    } catch (err) {
      console.error('Save contacts error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save contacts')
      addToast('Failed to save contacts', 'error')
    } finally {
      setIsResearching(false)
    }
  }

  // Show found contacts for selection
  if (foundContacts.length > 0) {
    const selectedContactCount = selectedContactIds.size
    const contactsByCompany = foundContacts.reduce((acc, contact) => {
      const company = contact.company
      if (!acc[company]) acc[company] = []
      acc[company].push(contact)
      return acc
    }, {} as Record<string, ResearchedContact[]>)

    return (
      <div className="space-y-4">
        {/* Header with selection controls */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">{selectedContactCount}</span> of{' '}
            <span className="font-semibold">{foundContacts.length}</span> contacts selected
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSelectAllContacts}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDeselectAllContacts}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Deselect all
            </button>
          </div>
        </div>

        {/* Contacts grouped by company */}
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {Object.entries(contactsByCompany).map(([companyName, contacts]) => (
            <div key={companyName} className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {companyName}
              </h4>
              <div className="space-y-2">
                {contacts.map((contact) => {
                  const isSelected = selectedContactIds.has(contact.id)
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleToggleContact(contact.id)}
                      className={cn(
                        'w-full p-3 border rounded-lg text-left transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox indicator */}
                        <div
                          className={cn(
                            'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                            isSelected
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-gray-300 bg-white'
                          )}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>

                        {/* Contact info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-medium text-gray-900 text-sm">
                              {contact.name}
                            </h5>
                            {contact.linkedinUrl && (
                              <a
                                href={contact.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Linkedin className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {contact.title}
                          </p>
                          {/* Email display if available */}
                          {(contact as ResearchedContact & { email?: string }).email && (
                            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {(contact as ResearchedContact & { email?: string }).email}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              contact.seniority === 'Executive' ? 'bg-purple-100 text-purple-700' :
                              contact.seniority === 'Director' ? 'bg-blue-100 text-blue-700' :
                              contact.seniority === 'Manager' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            )}>
                              {contact.seniority}
                            </span>
                            <span className="text-xs text-gray-400">
                              Relevance: {contact.relevanceScore}/10
                            </span>
                          </div>
                          {contact.reasoning && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                              {contact.reasoning}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
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
            onClick={handleSaveContacts}
            disabled={selectedContactCount === 0 || isResearching}
            className={cn(
              'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
              selectedContactCount === 0 || isResearching
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {isResearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save Selected ({selectedContactCount})
              </>
            )}
          </button>
          <button
            onClick={() => {
              setFoundContacts([])
              setSelectedContactIds(new Set())
            }}
            disabled={isResearching}
            className="py-2 px-4 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Show existing contacts view if we have contacts already
  if (existingContacts.length > 0 && foundContacts.length === 0) {
    const contactsByCompany = existingContacts.reduce((acc, contact) => {
      const company = contact.company
      if (!acc[company]) acc[company] = []
      acc[company].push(contact)
      return acc
    }, {} as Record<string, ResearchedContact[]>)

    const contactsWithEmails = existingContacts.filter((c) => (c as ResearchedContact & { email?: string }).email)
    const contactsMissingEmails = contactsWithoutEmails.length

    return (
      <div className="space-y-4">
        {/* Summary stats */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-600">
            <span className="font-semibold">{existingContacts.length}</span> contacts found
          </div>
          <div className="flex items-center gap-3">
            <span className="text-green-600 flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />
              {contactsWithEmails.length} with email
            </span>
            {contactsMissingEmails > 0 && (
              <span className="text-amber-600">
                {contactsMissingEmails} need email
              </span>
            )}
          </div>
        </div>

        {/* Email enrichment section */}
        {contactsMissingEmails > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Mail className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-amber-800">
                  Find emails for {contactsMissingEmails} contacts
                </h4>
                <p className="text-xs text-amber-600 mt-0.5">
                  Use Apollo to find email addresses for contacts
                </p>
              </div>
            </div>

            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-amber-700">
                <span className="font-semibold">{selectedExistingContactIds.size}</span> selected for enrichment
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllExisting}
                  className="text-xs text-amber-700 hover:text-amber-900"
                >
                  Select all
                </button>
                <span className="text-amber-400">|</span>
                <button
                  onClick={handleDeselectAllExisting}
                  className="text-xs text-amber-600 hover:text-amber-800"
                >
                  Deselect all
                </button>
              </div>
            </div>

            {/* Find Emails button */}
            <button
              onClick={handleEnrichEmailsClick}
              disabled={selectedExistingContactIds.size === 0 || isEnrichingEmails}
              className={cn(
                'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
                selectedExistingContactIds.size === 0 || isEnrichingEmails
                  ? 'bg-amber-200 text-amber-500 cursor-not-allowed'
                  : 'bg-amber-600 text-white hover:bg-amber-700'
              )}
            >
              {isEnrichingEmails ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finding emails...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Find Emails ({selectedExistingContactIds.size} contacts)
                </>
              )}
            </button>
            <p className="text-xs text-amber-600 text-center">
              ~{selectedExistingContactIds.size} Apollo credits
            </p>
          </div>
        )}

        {/* Success message */}
        {enrichSuccess && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Found {enrichSuccess.emailsFound} emails out of {enrichSuccess.total} contacts
          </div>
        )}

        {/* Error message */}
        {enrichError && (
          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
            {enrichError}
          </div>
        )}

        {/* Contacts list grouped by company */}
        <div className="space-y-4 max-h-[350px] overflow-y-auto">
          {Object.entries(contactsByCompany).map(([companyName, contacts]) => (
            <div key={companyName} className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {companyName}
              </h4>
              <div className="space-y-2">
                {contacts.map((contact) => {
                  const contactEmail = (contact as ResearchedContact & { email?: string }).email
                  const hasEmail = !!contactEmail && contactEmail.trim() !== ''
                  const isSelected = selectedExistingContactIds.has(contact.id)

                  return (
                    <div
                      key={contact.id}
                      className={cn(
                        'p-3 border rounded-lg transition-all',
                        hasEmail
                          ? 'border-green-200 bg-green-50/50'
                          : isSelected
                            ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                            : 'border-gray-200 bg-white'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox for contacts without email */}
                        {!hasEmail && (
                          <button
                            onClick={() => handleToggleExistingContact(contact.id)}
                            className={cn(
                              'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                              isSelected
                                ? 'bg-amber-500 border-amber-500'
                                : 'border-gray-300 bg-white hover:border-amber-400'
                            )}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        )}

                        {/* Contact info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h5 className="font-medium text-gray-900 text-sm">
                              {contact.name}
                            </h5>
                            {contact.linkedinUrl && (
                              <a
                                href={contact.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Linkedin className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {contact.title}
                          </p>
                          {/* Email display */}
                          {hasEmail ? (
                            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {contactEmail}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              No email
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              contact.seniority === 'Executive' ? 'bg-purple-100 text-purple-700' :
                              contact.seniority === 'Director' ? 'bg-blue-100 text-blue-700' :
                              contact.seniority === 'Manager' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600'
                            )}>
                              {contact.seniority}
                            </span>
                            <span className="text-xs text-gray-400">
                              Relevance: {contact.relevanceScore}/10
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={onComplete}
            className="flex-1 py-2 px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Continue to Emails
          </button>
        </div>

        {/* Email enrichment confirmation modal */}
        {showEnrichConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowEnrichConfirm(false)} />
            <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Mail className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Find Emails</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    This will search for email addresses for {selectedExistingContactIds.size} contacts.
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Estimated cost:</strong> ~{selectedExistingContactIds.size} Apollo credits
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Apollo charges ~1 credit per contact lookup
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEnrichConfirm(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEnrichEmails}
                  className="flex-1 py-2 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                >
                  Find Emails
                </button>
              </div>
            </div>
          </div>
        )}

        {/* API Key Modal */}
        <ApiKeyModal
          isOpen={showApiKeyModal}
          requiredKey="apollo"
          onClose={() => setShowApiKeyModal(false)}
          onSave={() => {
            setShowApiKeyModal(false)
            setShowEnrichConfirm(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with selection controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{selectedCompanyCount}</span> of{' '}
          <span className="font-semibold">{companies.length}</span> companies selected
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAllCompanies}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Select all
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDeselectAllCompanies}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Explanation */}
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-md">
        Find contacts at selected companies using AI research (free)
        {targetRoles.length > 0 && (
          <span className="block mt-1">
            Target roles: {targetRoles.slice(0, 3).join(', ')}
            {targetRoles.length > 3 && ` +${targetRoles.length - 3} more`}
          </span>
        )}
      </div>

      {/* Existing contacts count */}
      {existingContacts.length > 0 && (
        <div className="text-xs text-green-600 bg-green-50 p-2 rounded-md">
          {existingContacts.length} contacts already found
        </div>
      )}

      {/* Progress bar during research */}
      {researchProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Researching contacts...</span>
            <span>{researchProgress.current} / {researchProgress.total} companies</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(researchProgress.current / researchProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Company list with checkboxes */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {companies.map((company) => {
          const isSelected = selectedCompanyIds.has(company.id)
          return (
            <button
              key={company.id}
              onClick={() => handleToggleCompany(company.id)}
              disabled={isResearching}
              className={cn(
                'w-full p-3 border rounded-lg text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300',
                isResearching && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                    isSelected
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>

                {/* Company info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 text-sm">
                    {company.name}
                  </h4>
                  {company.type && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {company.type}
                    </p>
                  )}
                  {company.website && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {company.website}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Error messages */}
      {apolloError && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {apolloError}
        </div>
      )}

      {/* Search buttons */}
      <div className="space-y-2">
        {/* Free research button */}
        <button
          onClick={handleResearchContacts}
          disabled={selectedCompanyCount === 0 || isResearching || isApolloSearching}
          className={cn(
            'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            selectedCompanyCount === 0 || isResearching || isApolloSearching
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isResearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Researching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Research Contacts (Free) - {selectedCompanyCount} companies
            </>
          )}
        </button>

        {/* Apollo paid search button */}
        <button
          onClick={handleApolloSearchClick}
          disabled={selectedCompanyCount === 0 || isResearching || isApolloSearching}
          className={cn(
            'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 border',
            selectedCompanyCount === 0 || isResearching || isApolloSearching
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white text-orange-600 border-orange-300 hover:bg-orange-50'
          )}
        >
          {isApolloSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching Apollo...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4" />
              Find with Apollo (Paid) - {selectedCompanyCount} companies
            </>
          )}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Apollo search includes email addresses when available
        </p>
      </div>

      {/* Apollo confirmation modal */}
      {showApolloConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowApolloConfirm(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Confirm Apollo Search</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will search for contacts at {selectedCompanyCount} companies using Apollo.
                </p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-amber-800">
                <strong>Estimated cost:</strong> ~{selectedCompanyCount * 5} Apollo credits
              </p>
              <p className="text-xs text-amber-600 mt-1">
                Apollo charges ~1 credit per contact returned (up to 5 contacts per company)
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowApolloConfirm(false)}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApolloSearch}
                className="flex-1 py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Proceed with Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        requiredKey="apollo"
        onClose={() => setShowApiKeyModal(false)}
        onSave={() => {
          setShowApiKeyModal(false)
          // After saving key, show confirmation modal
          setShowApolloConfirm(true)
        }}
      />
    </div>
  )
}
