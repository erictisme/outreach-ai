'use client'

import { useState, useMemo, useEffect } from 'react'
import { Check, Loader2, Search, Linkedin, AlertTriangle, Mail, CheckCircle, Trash2, ExternalLink, Key } from 'lucide-react'
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

  // Track selected company IDs for research
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(() => {
    return new Set(companies.map((c) => c.id))
  })

  // Research state
  const [isSearching, setIsSearching] = useState(false)
  const [researchProgress, setResearchProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Contacts state - loaded from Supabase
  const [contacts, setContacts] = useState<ResearchedContact[]>(schemaConfig.contacts || [])
  const [isLoadingContacts, setIsLoadingContacts] = useState(true)

  // API Key modal state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Check if Apollo API key exists
  const hasApolloKey = useMemo(() => {
    return !!getApiKey('apollo')
  }, [])

  // Load contacts from Supabase on mount
  useEffect(() => {
    const loadContacts = async () => {
      setIsLoadingContacts(true)
      try {
        const supabase = getSupabase()

        // Load contacts for this project's companies
        const { data: dbContacts, error: loadError } = await supabase
          .from('contacts')
          .select('*')
          .in('company_id', companies.map(c => c.id))

        if (loadError) {
          // Extract meaningful error message - Supabase errors can be empty objects
          const errorMessage = loadError.message || loadError.details || loadError.hint || JSON.stringify(loadError)
          if (errorMessage && errorMessage !== '{}') {
            console.error('Error loading contacts:', errorMessage)
          }
          // Fall back to schema_config contacts
          setContacts(schemaConfig.contacts || [])
        } else if (dbContacts && dbContacts.length > 0) {
          // Convert DB contacts to ResearchedContact format
          const loadedContacts: ResearchedContact[] = dbContacts.map(dbContact => {
            const customFields = dbContact.custom_fields || {}
            return {
              id: dbContact.id,
              company: customFields.companyName || '',
              companyId: dbContact.company_id,
              name: dbContact.name,
              title: dbContact.title || '',
              linkedinUrl: dbContact.linkedin_url || '',
              email: dbContact.email || undefined,
              seniority: customFields.seniority || 'Unknown',
              relevanceScore: customFields.relevanceScore || 5,
              reasoning: customFields.reasoning || '',
              source: dbContact.source === 'apollo' ? 'web_research' : 'web_research',
              verified: dbContact.verified || false,
            }
          })
          setContacts(loadedContacts)

          // Also update schema_config if different
          if (JSON.stringify(loadedContacts) !== JSON.stringify(schemaConfig.contacts)) {
            const updatedSchemaConfig = {
              ...schemaConfig,
              contacts: loadedContacts,
            }
            await supabase
              .from('projects')
              .update({
                schema_config: updatedSchemaConfig,
                updated_at: new Date().toISOString(),
              })
              .eq('id', project.id)

            onUpdate({
              ...project,
              schema_config: updatedSchemaConfig,
              updated_at: new Date().toISOString(),
            })
          }
        } else {
          // No DB contacts, use schema_config
          setContacts(schemaConfig.contacts || [])
        }
      } catch (err) {
        // Only log if there's a meaningful error
        if (err instanceof Error && err.message) {
          console.error('Error loading contacts:', err.message)
        }
        setContacts(schemaConfig.contacts || [])
      } finally {
        setIsLoadingContacts(false)
      }
    }

    if (companies.length > 0) {
      loadContacts()
    } else {
      // No companies, nothing to load - just use schema_config fallback
      setContacts(schemaConfig.contacts || [])
      setIsLoadingContacts(false)
    }
  }, [project.id]) // Only run on project change, not on every render

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

  const selectedCompanyCount = selectedCompanyIds.size
  const targetRoles = schemaConfig.extractedContext?.targetRoles || []

  // Handle find contacts button click
  const handleFindContactsClick = () => {
    const apolloKey = getApiKey('apollo')
    if (apolloKey) {
      // Has Apollo key - show confirmation for paid search
      setShowConfirmModal(true)
    } else {
      // No Apollo key - proceed with free research directly
      handleFindContacts(false)
    }
  }

  // Find contacts - uses Apollo if available, else free AI
  const handleFindContacts = async (useApollo: boolean) => {
    setShowConfirmModal(false)

    const selectedCompanies = companies.filter((c) => selectedCompanyIds.has(c.id))
    if (selectedCompanies.length === 0) return

    setIsSearching(true)
    setError(null)
    setResearchProgress({ current: 0, total: selectedCompanies.length })

    try {
      let newContacts: ResearchedContact[] = []

      if (useApollo) {
        const apolloKey = getApiKey('apollo')
        if (!apolloKey) {
          setShowApiKeyModal(true)
          return
        }

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
        newContacts = apolloPersons.map((p) => ({
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
      } else {
        // Free AI research
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
        newContacts = data.contacts || []
      }

      // IMMEDIATELY save contacts to Supabase
      const supabase = getSupabase()

      for (const contact of newContacts) {
        // Find the company's database ID
        const companyResult = await supabase
          .from('companies')
          .select('id')
          .eq('project_id', project.id)
          .eq('name', contact.company)
          .single()

        const dbCompanyId = companyResult.data?.id || contact.companyId
        const isApolloContact = contact.id.startsWith('person-apollo-') || contact.reasoning?.includes('Apollo')
        const source = isApolloContact ? 'apollo' : 'ai_research'
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

      // APPEND to existing contacts (don't replace)
      const allContacts = [...contacts, ...newContacts]

      // Update project schema_config
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
      setContacts(allContacts)
      const updatedProject: Project = {
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      }
      onUpdate(updatedProject)

      // Show success toast
      const methodUsed = useApollo ? 'Apollo' : 'AI research'
      addToast(`Found ${newContacts.length} contacts via ${methodUsed}`, 'success')

      setResearchProgress({ current: selectedCompanies.length, total: selectedCompanies.length })
    } catch (err) {
      console.error('Find contacts error:', err)
      setError(err instanceof Error ? err.message : 'Failed to find contacts')
      addToast('Failed to find contacts', 'error')
    } finally {
      setIsSearching(false)
      setResearchProgress(null)
    }
  }

  // Clear all contacts
  const handleClearContacts = async () => {
    setShowClearConfirm(false)
    setIsSearching(true)
    setError(null)

    try {
      const supabase = getSupabase()

      // Delete contacts from Supabase for this project's companies
      await supabase
        .from('contacts')
        .delete()
        .in('company_id', companies.map(c => c.id))

      // Update project schema_config
      const updatedSchemaConfig = {
        ...schemaConfig,
        contacts: [],
      }

      await supabase
        .from('projects')
        .update({
          schema_config: updatedSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)

      // Update local state
      setContacts([])
      const updatedProject: Project = {
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      }
      onUpdate(updatedProject)

      addToast('All contacts cleared', 'success')
    } catch (err) {
      console.error('Clear contacts error:', err)
      setError(err instanceof Error ? err.message : 'Failed to clear contacts')
      addToast('Failed to clear contacts', 'error')
    } finally {
      setIsSearching(false)
    }
  }

  // Compute contacts statistics
  const contactsWithEmails = contacts.filter((c) => (c as ResearchedContact & { email?: string }).email)
  const contactsMissingEmails = contacts.length - contactsWithEmails.length

  // Group contacts by company for display
  const contactsByCompany = contacts.reduce((acc, contact) => {
    const company = contact.company
    if (!acc[company]) acc[company] = []
    acc[company].push(contact)
    return acc
  }, {} as Record<string, ResearchedContact[]>)

  // Loading state
  if (isLoadingContacts) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading contacts...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats if we have contacts */}
      {contacts.length > 0 && (
        <div className="flex items-center justify-between text-sm border-b pb-3">
          <div className="text-gray-600">
            <span className="font-semibold">{contacts.length}</span> contacts found
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
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isSearching}
              className="text-red-500 hover:text-red-700 flex items-center gap-1 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Contacts table */}
      {contacts.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">LinkedIn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact) => {
                  const contactEmail = (contact as ResearchedContact & { email?: string }).email
                  return (
                    <tr key={contact.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{contact.name}</span>
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded',
                            contact.seniority === 'Executive' ? 'bg-purple-100 text-purple-700' :
                            contact.seniority === 'Director' ? 'bg-blue-100 text-blue-700' :
                            contact.seniority === 'Manager' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          )}>
                            {contact.seniority}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{contact.title}</td>
                      <td className="px-3 py-2 text-gray-600">{contact.company}</td>
                      <td className="px-3 py-2">
                        {contactEmail ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {contactEmail}
                          </span>
                        ) : (
                          <span className="text-gray-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            No email
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {contact.linkedinUrl ? (
                          <a
                            href={contact.linkedinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Company selection header */}
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

      {/* Method indicator */}
      <div className={cn(
        'text-xs p-2 rounded-md flex items-center gap-2',
        hasApolloKey ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'
      )}>
        {hasApolloKey ? (
          <>
            <Key className="w-3.5 h-3.5" />
            <span>Apollo API key detected - will use Apollo (includes emails)</span>
          </>
        ) : (
          <>
            <Search className="w-3.5 h-3.5" />
            <span>Using free AI research (no emails)</span>
          </>
        )}
        {targetRoles.length > 0 && (
          <span className="ml-auto text-gray-500">
            Target: {targetRoles.slice(0, 2).join(', ')}
            {targetRoles.length > 2 && ` +${targetRoles.length - 2}`}
          </span>
        )}
      </div>

      {/* Progress bar during research */}
      {researchProgress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Finding contacts...</span>
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
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {companies.map((company) => {
          const isSelected = selectedCompanyIds.has(company.id)
          const companyContacts = contactsByCompany[company.name] || []
          return (
            <button
              key={company.id}
              onClick={() => handleToggleCompany(company.id)}
              disabled={isSearching}
              className={cn(
                'w-full p-3 border rounded-lg text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300',
                isSearching && 'opacity-50 cursor-not-allowed'
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
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-gray-900 text-sm">
                      {company.name}
                    </h4>
                    {companyContacts.length > 0 && (
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                        {companyContacts.length} contacts
                      </span>
                    )}
                  </div>
                  {company.type && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {company.type}
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

      {/* Action buttons */}
      <div className="space-y-2">
        {/* Single Find Contacts button */}
        <button
          onClick={handleFindContactsClick}
          disabled={selectedCompanyCount === 0 || isSearching}
          className={cn(
            'w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            selectedCompanyCount === 0 || isSearching
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : hasApolloKey
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {isSearching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finding contacts...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Find Contacts - {selectedCompanyCount} companies
            </>
          )}
        </button>

        {/* Continue button if we have contacts */}
        {contacts.length > 0 && (
          <button
            onClick={onComplete}
            disabled={isSearching}
            className="w-full py-2 px-4 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Continue to Emails ({contacts.length} contacts)
          </button>
        )}
      </div>

      {/* Apollo confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Key className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Find Contacts with Apollo</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Apollo API key detected. This will search for contacts with email addresses at {selectedCompanyCount} companies.
                </p>
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-orange-800">
                <strong>Estimated cost:</strong> ~{selectedCompanyCount * 5} Apollo credits
              </p>
              <p className="text-xs text-orange-600 mt-1">
                ~1 credit per contact (up to 5 contacts per company)
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false)
                  handleFindContacts(false)
                }}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Use Free AI Instead
              </button>
              <button
                onClick={() => handleFindContacts(true)}
                className="flex-1 py-2 px-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Use Apollo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Clear All Contacts</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will permanently delete all {contacts.length} contacts for this project. This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClearContacts}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Clear All
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
          setShowConfirmModal(true)
        }}
      />
    </div>
  )
}
