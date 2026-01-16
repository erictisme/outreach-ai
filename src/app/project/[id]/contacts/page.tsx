'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, Check, X, Linkedin, Mail, RefreshCw, ChevronRight } from 'lucide-react'
import { getSupabase, Company as DbCompany, Contact as DbContact, Project as DbProject } from '@/lib/supabase'

interface LocalContact {
  id: string
  companyId: string
  companyName: string
  name: string
  title: string
  email: string
  linkedin: string
  source: string
  emailCertainty: number
  isNew?: boolean
  isSaved?: boolean
}

interface CompanyWithContacts {
  id: string
  name: string
  website: string
  domain: string
  contacts: LocalContact[]
}

export default function ContactsPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<DbProject | null>(null)
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Load project and companies with existing contacts
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
          .order('name', { ascending: true })

        if (compsError) throw compsError

        // Load existing contacts
        const { data: existingContacts, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .in('company_id', (comps || []).map(c => c.id))

        if (contactsError) throw contactsError

        // Group contacts by company
        const contactsByCompany = new Map<string, LocalContact[]>()
        for (const contact of existingContacts || []) {
          const existing = contactsByCompany.get(contact.company_id) || []
          existing.push({
            id: contact.id,
            companyId: contact.company_id,
            companyName: '', // Will be filled below
            name: contact.name,
            title: contact.title || '',
            email: contact.email || '',
            linkedin: contact.linkedin_url || '',
            source: contact.source,
            emailCertainty: (contact.custom_fields as Record<string, number>)?.emailCertainty || 0,
            isSaved: true
          })
          contactsByCompany.set(contact.company_id, existing)
        }

        // Build companies with contacts
        const companiesWithContacts: CompanyWithContacts[] = (comps || []).map(c => {
          const domain = c.website
            ? new URL(c.website.startsWith('http') ? c.website : `https://${c.website}`).hostname.replace('www.', '')
            : ''

          const contacts = contactsByCompany.get(c.id) || []
          contacts.forEach(contact => { contact.companyName = c.name })

          return {
            id: c.id,
            name: c.name,
            website: c.website || '',
            domain,
            contacts
          }
        })

        setCompanies(companiesWithContacts)

        // Pre-select saved contacts
        const savedIds = new Set<string>()
        companiesWithContacts.forEach(c => {
          c.contacts.forEach(contact => {
            if (contact.isSaved) {
              savedIds.add(contact.id)
            }
          })
        })
        setSelectedIds(savedIds)

      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load project data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // Search for contacts via Apollo
  const handleSearch = async () => {
    if (!project) return
    setSearching(true)
    setError(null)

    const companiesWithWebsites = companies.filter(c => c.website || c.domain)
    setSearchProgress({ current: 0, total: companiesWithWebsites.length })

    try {
      // Get target roles from project context
      const schemaConfig = project.schema_config as Record<string, unknown>
      const extractedContext = schemaConfig?.extractedContext as Record<string, unknown> | undefined
      const targetRoles = (extractedContext?.targetRoles as string[]) || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']

      // Prepare companies for API call
      const apiCompanies = companiesWithWebsites.map(c => ({
        id: c.id,
        name: c.name,
        website: c.website,
        domain: c.domain,
        type: '',
        description: '',
        relevance: '',
        status: 'not_contacted' as const,
        verificationStatus: 'unverified' as const,
        verificationSource: 'manual' as const,
        verifiedAt: null,
        websiteAccessible: true
      }))

      const response = await fetch('/api/find-contacts-apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: apiCompanies,
          context: {
            clientName: project.client_name,
            product: project.product_description || '',
            valueProposition: project.product_description || '',
            targetMarket: project.target_market || '',
            targetSegment: project.target_segment || '',
            targetRoles,
            keyDifferentiators: [],
            credibilitySignals: []
          }
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to search contacts')
      }

      const data = await response.json()

      // Merge new contacts with existing
      if (data.persons && data.persons.length > 0) {
        setCompanies(prev => {
          const updated = [...prev]
          for (const person of data.persons) {
            const companyIndex = updated.findIndex(c => c.id === person.companyId)
            if (companyIndex !== -1) {
              // Check if contact already exists (by email or name+company)
              const existingContact = updated[companyIndex].contacts.find(
                c => (c.email && c.email === person.email) ||
                     (c.name === person.name && c.companyId === person.companyId)
              )
              if (!existingContact) {
                updated[companyIndex].contacts.push({
                  id: person.id,
                  companyId: person.companyId,
                  companyName: updated[companyIndex].name,
                  name: person.name,
                  title: person.title,
                  email: person.email,
                  linkedin: person.linkedin,
                  source: person.source,
                  emailCertainty: person.emailCertainty,
                  isNew: true,
                  isSaved: false
                })
              }
            }
          }
          return updated
        })
      }

      setSearchProgress({ current: companiesWithWebsites.length, total: companiesWithWebsites.length })

    } catch (err) {
      console.error('Error searching contacts:', err)
      setError(err instanceof Error ? err.message : 'Failed to search contacts')
    } finally {
      setSearching(false)
    }
  }

  // Toggle contact selection
  const toggleSelect = useCallback((contactId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }
      return next
    })
  }, [])

  // Select all contacts
  const selectAll = useCallback(() => {
    const allContactIds = new Set<string>()
    companies.forEach(c => {
      c.contacts.forEach(contact => {
        allContactIds.add(contact.id)
      })
    })
    setSelectedIds(allContactIds)
  }, [companies])

  // Deselect all contacts
  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Save selected contacts to Supabase
  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const supabase = getSupabase()

      // Get all selected contacts that are not yet saved
      const contactsToSave: LocalContact[] = []
      const contactsToDelete: string[] = []

      companies.forEach(company => {
        company.contacts.forEach(contact => {
          if (selectedIds.has(contact.id) && !contact.isSaved) {
            contactsToSave.push(contact)
          } else if (!selectedIds.has(contact.id) && contact.isSaved) {
            contactsToDelete.push(contact.id)
          }
        })
      })

      // Delete unselected contacts
      if (contactsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('contacts')
          .delete()
          .in('id', contactsToDelete)

        if (deleteError) throw deleteError
      }

      // Insert new selected contacts
      if (contactsToSave.length > 0) {
        const newContacts: Omit<DbContact, 'id' | 'created_at' | 'updated_at'>[] = contactsToSave.map(c => ({
          company_id: c.companyId,
          name: c.name,
          title: c.title || null,
          email: c.email || null,
          phone: null,
          linkedin_url: c.linkedin || null,
          source: c.source,
          verified: c.emailCertainty >= 90,
          custom_fields: { emailCertainty: c.emailCertainty }
        }))

        const { data: inserted, error: insertError } = await supabase
          .from('contacts')
          .insert(newContacts)
          .select()

        if (insertError) throw insertError

        // Update local state with saved status and new IDs
        setCompanies(prev => {
          const updated = [...prev]
          let insertedIndex = 0

          updated.forEach(company => {
            company.contacts = company.contacts.map(contact => {
              if (contactsToSave.some(c => c.id === contact.id)) {
                const savedContact = inserted?.[insertedIndex]
                insertedIndex++
                return {
                  ...contact,
                  id: savedContact?.id || contact.id,
                  isSaved: true,
                  isNew: false
                }
              }
              return contact
            })
          })

          // Remove deleted contacts from local state
          updated.forEach(company => {
            company.contacts = company.contacts.filter(c => !contactsToDelete.includes(c.id))
          })

          return updated
        })

        // Update selected IDs with new IDs
        const newSelectedIds = new Set<string>()
        companies.forEach(company => {
          company.contacts.forEach(contact => {
            if (selectedIds.has(contact.id) && !contactsToDelete.includes(contact.id)) {
              newSelectedIds.add(contact.id)
            }
          })
        })
        // Add newly inserted IDs
        inserted?.forEach(c => newSelectedIds.add(c.id))
        setSelectedIds(newSelectedIds)
      }

    } catch (err) {
      console.error('Error saving contacts:', err)
      setError('Failed to save contacts')
    } finally {
      setSaving(false)
    }
  }

  // Count totals
  const totalContacts = companies.reduce((sum, c) => sum + c.contacts.length, 0)
  const selectedCount = selectedIds.size
  const unsavedCount = companies.reduce((sum, c) =>
    sum + c.contacts.filter(contact => selectedIds.has(contact.id) && !contact.isSaved).length, 0
  )

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

  return (
    <main className="min-h-screen p-8 max-w-6xl mx-auto">
      <header className="mb-8">
        <Link
          href={`/project/${projectId}`}
          className="text-blue-600 hover:underline text-sm mb-2 inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to project
        </Link>
        <h1 className="text-2xl font-bold">Find Contacts</h1>
        <p className="text-gray-600 mt-1">
          Search for decision makers at your target companies
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleSearch}
          disabled={searching || companies.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searching ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Searching... ({searchProgress.current}/{searchProgress.total})
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Search Apollo
            </>
          )}
        </button>

        {totalContacts > 0 && (
          <>
            <button
              onClick={selectAll}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Check className="w-4 h-4" />
              Select all
            </button>
            <button
              onClick={deselectAll}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              Deselect all
            </button>
          </>
        )}

        {unsavedCount > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Save selected ({unsavedCount} new)
              </>
            )}
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex gap-8 text-sm">
          <div>
            <span className="text-gray-500">Companies:</span>{' '}
            <span className="font-medium">{companies.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Contacts found:</span>{' '}
            <span className="font-medium">{totalContacts}</span>
          </div>
          <div>
            <span className="text-gray-500">Selected:</span>{' '}
            <span className="font-medium">{selectedCount}</span>
          </div>
        </div>
      </div>

      {/* No companies message */}
      {companies.length === 0 && (
        <div className="text-center py-12 border border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-4">No companies in this project yet.</p>
          <Link
            href={`/project/${projectId}/companies`}
            className="text-blue-600 hover:underline"
          >
            Add companies first
          </Link>
        </div>
      )}

      {/* Companies with contacts */}
      <div className="space-y-4">
        {companies.map(company => (
          <div key={company.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Company header */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{company.name}</h3>
                  {company.website && (
                    <a
                      href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {company.domain || company.website}
                    </a>
                  )}
                </div>
                <div className="text-sm text-gray-500">
                  {company.contacts.length} contact{company.contacts.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Contacts list */}
            {company.contacts.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {company.contacts.map(contact => (
                  <div
                    key={contact.id}
                    className={`px-4 py-3 flex items-center gap-4 hover:bg-gray-50 ${contact.isNew ? 'bg-blue-50/50' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{contact.name}</span>
                        {contact.isSaved && (
                          <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Saved</span>
                        )}
                        {contact.isNew && !contact.isSaved && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">New</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-600">{contact.title}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {contact.email && (
                        <a
                          href={`mailto:${contact.email}`}
                          className="flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600"
                          title={`${contact.emailCertainty}% confidence`}
                        >
                          <Mail className="w-4 h-4" />
                          <span className="max-w-[150px] truncate">{contact.email}</span>
                          {contact.emailCertainty > 0 && (
                            <span className={`text-xs ${contact.emailCertainty >= 90 ? 'text-green-600' : contact.emailCertainty >= 70 ? 'text-yellow-600' : 'text-gray-400'}`}>
                              {contact.emailCertainty}%
                            </span>
                          )}
                        </a>
                      )}
                      {contact.linkedin && (
                        <a
                          href={contact.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                          title="LinkedIn profile"
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                No contacts found. Click &quot;Search Apollo&quot; to find contacts.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Next step */}
      {selectedCount > 0 && (
        <div className="mt-6 flex items-center justify-end">
          <Link
            href={`/project/${projectId}/emails`}
            className="inline-flex items-center gap-2 text-blue-600 hover:underline"
          >
            Next: Generate emails
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </main>
  )
}
