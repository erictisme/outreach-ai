'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Wand2, Check, RefreshCw, Edit3, Save, X, FileText, BookmarkPlus, ChevronDown } from 'lucide-react'
import { getSupabase, Company as DbCompany, Contact as DbContact, Project as DbProject, EmailTemplate as DbEmailTemplate } from '@/lib/supabase'
import { ProjectContext, Company, Person, EmailDraft, EmailTemplate, EmailTemplateCategory, TEMPLATE_VARIABLES } from '@/types'
import { WizardNav, WizardStep } from '@/components/WizardNav'
import { useToast, ErrorMessage } from '@/components/ui'

interface LocalEmail {
  id: string
  contactId: string
  contactName: string
  contactEmail: string
  companyId: string
  companyName: string
  subject: string
  body: string
  status: 'draft' | 'ready' | 'sent'
  isSaved?: boolean
  isNew?: boolean
}

export default function EmailsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { addToast } = useToast()

  const [project, setProject] = useState<DbProject | null>(null)
  const [emails, setEmails] = useState<LocalEmail[]>([])
  const [contacts, setContacts] = useState<DbContact[]>([])
  const [companies, setCompanies] = useState<DbCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')

  // Bulk refine state
  const [refineInstruction, setRefineInstruction] = useState('')
  const [refining, setRefining] = useState(false)

  // Template state
  const [templates, setTemplates] = useState<DbEmailTemplate[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveTemplateEmail, setSaveTemplateEmail] = useState<LocalEmail | null>(null)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateCategory, setNewTemplateCategory] = useState<EmailTemplateCategory>('cold_outreach')
  const [newTemplateDescription, setNewTemplateDescription] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

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

          // Load existing emails
          const contactIds = (conts || []).map(c => c.id)
          if (contactIds.length > 0) {
            const { data: existingEmails, error: emailsError } = await supabase
              .from('emails')
              .select('*')
              .in('contact_id', contactIds)

            if (emailsError) throw emailsError

            // Map to local emails
            const localEmails: LocalEmail[] = (existingEmails || []).map(e => {
              const contact = conts?.find(c => c.id === e.contact_id)
              const company = comps?.find(c => c.id === contact?.company_id)
              return {
                id: e.id,
                contactId: e.contact_id,
                contactName: contact?.name || '',
                contactEmail: contact?.email || '',
                companyId: contact?.company_id || '',
                companyName: company?.name || '',
                subject: e.subject || '',
                body: e.body || '',
                status: (e.status as 'draft' | 'ready' | 'sent') || 'draft',
                isSaved: true
              }
            })
            setEmails(localEmails)

            // Pre-select all saved emails
            setSelectedIds(new Set(localEmails.map(e => e.id)))
          }
        }

        // Load templates (global + project-specific)
        const { data: templateData, error: templatesError } = await supabase
          .from('email_templates')
          .select('*')
          .or(`project_id.is.null,project_id.eq.${projectId}`)
          .order('is_default', { ascending: false })
          .order('name', { ascending: true })

        if (!templatesError && templateData) {
          setTemplates(templateData)
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

  // Generate emails for contacts without emails
  const handleGenerate = async () => {
    if (!project || contacts.length === 0) return
    setGenerating(true)
    setError(null)

    try {
      // Get contacts that don't have emails yet
      const existingContactIds = new Set(emails.map(e => e.contactId))
      const contactsWithoutEmails = contacts.filter(c => !existingContactIds.has(c.id))

      if (contactsWithoutEmails.length === 0) {
        setError('All contacts already have emails generated')
        setGenerating(false)
        return
      }

      // Build context from project
      const schemaConfig = project.schema_config as Record<string, unknown>
      const extractedContext = schemaConfig?.extractedContext as Record<string, unknown> | undefined

      const context: ProjectContext = {
        clientName: project.client_name,
        product: project.product_description || '',
        valueProposition: (extractedContext?.valueProposition as string) || project.product_description || '',
        targetMarket: project.target_market || '',
        targetSegment: project.target_segment || '',
        segments: [],
        targetRoles: (extractedContext?.targetRoles as string[]) || [],
        targetSeniority: 'any',
        visitDates: (extractedContext?.visitDates as string) || undefined,
        keyDifferentiators: (extractedContext?.keyDifferentiators as string[]) || [],
        credibilitySignals: (extractedContext?.credibilitySignals as string[]) || []
      }

      // Build companies and persons arrays for API
      const apiCompanies: Company[] = companies.map(c => ({
        id: c.id,
        name: c.name,
        type: '',
        website: c.website || '',
        domain: c.website ? new URL(c.website.startsWith('http') ? c.website : `https://${c.website}`).hostname.replace('www.', '') : '',
        description: c.description || '',
        relevance: c.relevance_notes || '',
        status: 'not_contacted',
        verificationStatus: 'unverified',
        verificationSource: 'manual',
        verifiedAt: null,
        websiteAccessible: true
      }))

      const apiPersons: Person[] = contactsWithoutEmails.map(c => {
        const company = companies.find(comp => comp.id === c.company_id)
        return {
          id: c.id,
          company: company?.name || '',
          companyId: c.company_id,
          name: c.name,
          title: c.title || '',
          email: c.email || '',
          linkedin: c.linkedin_url || '',
          source: c.source as Person['source'],
          verificationStatus: c.verified ? 'verified' : 'unverified',
          emailCertainty: (c.custom_fields as Record<string, number>)?.emailCertainty || 0,
          emailSource: 'Apollo',
          emailVerified: c.verified
        }
      })

      const response = await fetch('/api/write-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          companies: apiCompanies,
          persons: apiPersons
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate emails')
      }

      const data = await response.json()

      if (data.emails && data.emails.length > 0) {
        // Convert to local emails
        const newLocalEmails: LocalEmail[] = data.emails.map((e: EmailDraft) => ({
          id: crypto.randomUUID(),
          contactId: e.to.id,
          contactName: e.to.name,
          contactEmail: e.to.email,
          companyId: e.company.id,
          companyName: e.company.name,
          subject: e.subject,
          body: e.body,
          status: 'draft' as const,
          isSaved: false,
          isNew: true
        }))

        setEmails(prev => [...prev, ...newLocalEmails])
        setSelectedIds(prev => {
          const next = new Set(prev)
          newLocalEmails.forEach(e => next.add(e.id))
          return next
        })

        addToast(`Generated ${newLocalEmails.length} emails`, 'success')
      }

    } catch (err) {
      console.error('Error generating emails:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate emails')
      addToast('Failed to generate emails', 'error')
    } finally {
      setGenerating(false)
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
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(emails.map(e => e.id)))
  }, [emails])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // Start editing an email
  const startEdit = (email: LocalEmail) => {
    setEditingId(email.id)
    setEditSubject(email.subject)
    setEditBody(email.body)
  }

  // Save edit
  const saveEdit = () => {
    if (!editingId) return
    setEmails(prev => prev.map(e => {
      if (e.id === editingId) {
        return { ...e, subject: editSubject, body: editBody, isSaved: false }
      }
      return e
    }))
    setEditingId(null)
    setEditSubject('')
    setEditBody('')
  }

  // Cancel edit
  const cancelEdit = () => {
    setEditingId(null)
    setEditSubject('')
    setEditBody('')
  }

  // Bulk refine selected emails
  const handleBulkRefine = async () => {
    if (!refineInstruction.trim() || selectedIds.size === 0) return
    setRefining(true)
    setError(null)

    try {
      const selectedEmails = emails.filter(e => selectedIds.has(e.id))

      // Refine each email
      for (const email of selectedEmails) {
        const response = await fetch('/api/refine-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: {
              to: { name: email.contactName, email: email.contactEmail },
              company: { name: email.companyName },
              subject: email.subject,
              body: email.body,
              type: 'cold'
            },
            instruction: refineInstruction
          })
        })

        if (response.ok) {
          const data = await response.json()
          setEmails(prev => prev.map(e => {
            if (e.id === email.id) {
              return { ...e, subject: data.subject, body: data.body, isSaved: false }
            }
            return e
          }))
        }
      }

      setRefineInstruction('')
      addToast(`Refined ${selectedEmails.length} emails`, 'success')
    } catch (err) {
      console.error('Error refining emails:', err)
      setError('Failed to refine some emails')
      addToast('Failed to refine emails', 'error')
    } finally {
      setRefining(false)
    }
  }

  // Save emails to Supabase
  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const supabase = getSupabase()

      // Get emails to save (unsaved ones that are selected)
      const emailsToSave = emails.filter(e => selectedIds.has(e.id) && !e.isSaved)
      const emailsToUpdate = emails.filter(e => selectedIds.has(e.id) && e.isSaved)

      // Insert new emails
      if (emailsToSave.length > 0) {
        const newEmails = emailsToSave.map(e => ({
          contact_id: e.contactId,
          subject: e.subject,
          body: e.body,
          status: e.status
        }))

        const { data: inserted, error: insertError } = await supabase
          .from('emails')
          .insert(newEmails)
          .select()

        if (insertError) throw insertError

        // Update local state with new IDs and saved status
        setEmails(prev => {
          let insertIndex = 0
          return prev.map(e => {
            if (emailsToSave.some(es => es.id === e.id)) {
              const savedEmail = inserted?.[insertIndex]
              insertIndex++
              return { ...e, id: savedEmail?.id || e.id, isSaved: true, isNew: false }
            }
            return e
          })
        })
      }

      // Update existing emails that were edited
      for (const email of emailsToUpdate) {
        await supabase
          .from('emails')
          .update({ subject: email.subject, body: email.body, status: email.status })
          .eq('id', email.id)
      }

      // Mark all as saved
      setEmails(prev => prev.map(e => ({ ...e, isSaved: true, isNew: false })))

      const totalSaved = emailsToSave.length + emailsToUpdate.length
      addToast(`Saved ${totalSaved} emails`, 'success')

    } catch (err) {
      console.error('Error saving emails:', err)
      setError('Failed to save emails')
      addToast('Failed to save emails', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Extract variables from email content (convert actual values to {{variable}} placeholders)
  const extractVariablesFromEmail = (email: LocalEmail): { subject: string; body: string; variables: string[] } => {
    let subject = email.subject
    let body = email.body
    const usedVariables: Set<string> = new Set()

    // Replace actual values with placeholders
    const company = companies.find(c => c.id === email.companyId)
    const schemaConfig = project?.schema_config as Record<string, unknown>
    const extractedContext = schemaConfig?.extractedContext as Record<string, unknown> | undefined

    const replacements: Array<{ value: string; variable: string }> = [
      { value: email.contactName, variable: 'contact_name' },
      { value: email.companyName, variable: 'company_name' },
      { value: project?.client_name || '', variable: 'client_name' },
      { value: project?.product_description || '', variable: 'product_description' },
      { value: (extractedContext?.valueProposition as string) || '', variable: 'value_proposition' },
      { value: (extractedContext?.visitDates as string) || '', variable: 'visit_dates' },
    ]

    for (const { value, variable } of replacements) {
      if (value && value.length > 2) {
        const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        if (regex.test(subject)) {
          subject = subject.replace(regex, `{{${variable}}}`)
          usedVariables.add(variable)
        }
        if (regex.test(body)) {
          body = body.replace(regex, `{{${variable}}}`)
          usedVariables.add(variable)
        }
      }
    }

    return { subject, body, variables: Array.from(usedVariables) }
  }

  // Save email as template
  const handleSaveAsTemplate = async () => {
    if (!saveTemplateEmail || !newTemplateName.trim()) return
    setSavingTemplate(true)

    try {
      const supabase = getSupabase()
      const { subject, body, variables } = extractVariablesFromEmail(saveTemplateEmail)

      const { data: newTemplate, error: templateError } = await supabase
        .from('email_templates')
        .insert({
          project_id: projectId,
          name: newTemplateName.trim(),
          category: newTemplateCategory,
          description: newTemplateDescription.trim() || null,
          subject,
          body,
          variables,
          is_default: false
        })
        .select()
        .single()

      if (templateError) throw templateError

      setTemplates(prev => [...prev, newTemplate])
      setShowSaveTemplate(false)
      setSaveTemplateEmail(null)
      setNewTemplateName('')
      setNewTemplateCategory('cold_outreach')
      setNewTemplateDescription('')
      addToast('Template saved successfully', 'success')

    } catch (err) {
      console.error('Error saving template:', err)
      addToast('Failed to save template', 'error')
    } finally {
      setSavingTemplate(false)
    }
  }

  // Apply template with variable substitution
  const applyTemplate = (template: DbEmailTemplate, contact: DbContact, company: DbCompany): { subject: string; body: string } => {
    const schemaConfig = project?.schema_config as Record<string, unknown>
    const extractedContext = schemaConfig?.extractedContext as Record<string, unknown> | undefined

    const variables: Record<string, string> = {
      contact_name: contact.name,
      contact_title: contact.title || '',
      contact_email: contact.email || '',
      company_name: company.name,
      client_name: project?.client_name || '',
      product_description: project?.product_description || '',
      value_proposition: (extractedContext?.valueProposition as string) || project?.product_description || '',
      visit_dates: (extractedContext?.visitDates as string) || '',
      previous_subject: '',
    }

    let subject = template.subject
    let body = template.body

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi')
      subject = subject.replace(regex, value)
      body = body.replace(regex, value)
    }

    return { subject, body }
  }

  // Generate emails from template
  const handleGenerateFromTemplate = async (template: DbEmailTemplate) => {
    if (!project || contacts.length === 0) return
    setGenerating(true)
    setError(null)
    setShowTemplatePicker(false)

    try {
      // Get contacts that don't have emails yet
      const existingContactIds = new Set(emails.map(e => e.contactId))
      const contactsWithoutEmails = contacts.filter(c => !existingContactIds.has(c.id))

      if (contactsWithoutEmails.length === 0) {
        setError('All contacts already have emails generated')
        setGenerating(false)
        return
      }

      // Generate emails by applying template to each contact
      const newLocalEmails: LocalEmail[] = contactsWithoutEmails.map(contact => {
        const company = companies.find(c => c.id === contact.company_id)!
        const { subject, body } = applyTemplate(template, contact, company)

        return {
          id: crypto.randomUUID(),
          contactId: contact.id,
          contactName: contact.name,
          contactEmail: contact.email || '',
          companyId: contact.company_id,
          companyName: company?.name || '',
          subject,
          body,
          status: 'draft' as const,
          isSaved: false,
          isNew: true
        }
      })

      setEmails(prev => [...prev, ...newLocalEmails])
      setSelectedIds(prev => {
        const next = new Set(prev)
        newLocalEmails.forEach(e => next.add(e.id))
        return next
      })

      addToast(`Generated ${newLocalEmails.length} emails from template`, 'success')

    } catch (err) {
      console.error('Error generating from template:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate emails')
      addToast('Failed to generate emails', 'error')
    } finally {
      setGenerating(false)
    }
  }

  // Open save template modal
  const openSaveTemplateModal = (email: LocalEmail) => {
    setSaveTemplateEmail(email)
    setShowSaveTemplate(true)
  }

  // Count stats
  const totalEmails = emails.length
  const selectedCount = selectedIds.size
  const unsavedCount = emails.filter(e => selectedIds.has(e.id) && !e.isSaved).length
  const contactsWithoutEmails = contacts.filter(c => !emails.some(e => e.contactId === c.id)).length

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full sm:w-96 mb-8"></div>
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
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← All Projects
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{project?.client_name || 'Project'}</h1>
      </header>

      <WizardNav projectId={projectId} completedSteps={completedSteps} />

      <div className="mb-6">
        <h2 className="text-xl font-semibold">Generate Emails</h2>
        <p className="text-gray-600 mt-1">
          Create personalized outreach emails for your contacts
        </p>
      </div>

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleGenerate}
          disabled={generating || contacts.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Generate with AI {contactsWithoutEmails > 0 && `(${contactsWithoutEmails} pending)`}
            </>
          )}
        </button>

        {/* Template picker dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTemplatePicker(!showTemplatePicker)}
            disabled={generating || contacts.length === 0 || contactsWithoutEmails === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-4 h-4" />
            Use Template
            <ChevronDown className="w-4 h-4" />
          </button>
          {showTemplatePicker && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
              {templates.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No templates available</div>
              ) : (
                <>
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleGenerateFromTemplate(template)}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.is_default && (
                          <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Default</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {template.category.replace('_', ' ')}
                      </div>
                      {template.description && (
                        <div className="text-xs text-gray-400 mt-1">{template.description}</div>
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {totalEmails > 0 && (
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
                <Save className="w-4 h-4" />
                Save emails ({unsavedCount} unsaved)
              </>
            )}
          </button>
        )}
      </div>

      {/* Bulk refine */}
      {selectedCount > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex gap-3">
            <input
              type="text"
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              placeholder="Refine instruction (e.g., 'Make it shorter', 'Add urgency')"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleBulkRefine}
              disabled={refining || !refineInstruction.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {refining ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Refining...
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" />
                  Refine {selectedCount} emails
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">Contacts:</span>{' '}
            <span className="font-medium">{contacts.length}</span>
          </div>
          <div>
            <span className="text-gray-500">Emails generated:</span>{' '}
            <span className="font-medium">{totalEmails}</span>
          </div>
          <div>
            <span className="text-gray-500">Selected:</span>{' '}
            <span className="font-medium">{selectedCount}</span>
          </div>
        </div>
      </div>

      {/* No contacts message */}
      {contacts.length === 0 && (
        <div className="text-center py-12 border border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-4">No contacts in this project yet.</p>
          <Link
            href={`/project/${projectId}/contacts`}
            className="text-blue-600 hover:underline"
          >
            Find contacts first
          </Link>
        </div>
      )}

      {/* Emails list */}
      <div className="space-y-4">
        {emails.map(email => (
          <div
            key={email.id}
            className={`border rounded-lg overflow-hidden ${email.isNew ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}
          >
            {/* Email header */}
            <div className="px-3 sm:px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(email.id)}
                  onChange={() => toggleSelect(email.id)}
                  className="rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{email.contactName}</span>
                    <span className="text-gray-400 hidden sm:inline">at</span>
                    <span className="font-medium truncate hidden sm:inline">{email.companyName}</span>
                    {email.isSaved && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Saved</span>
                    )}
                    {email.isNew && !email.isSaved && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">New</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 truncate">{email.contactEmail}</div>
                  <div className="text-sm text-gray-500 truncate sm:hidden">{email.companyName}</div>
                </div>
              </div>
              {editingId !== email.id && (
                <div className="flex items-center gap-1 ml-7 sm:ml-0">
                  <button
                    onClick={() => openSaveTemplateModal(email)}
                    className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                    title="Save as template"
                  >
                    <BookmarkPlus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startEdit(email)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Edit email"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Email content */}
            <div className="p-3 sm:p-4">
              {editingId === email.id ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2">
                    <span className="text-sm text-gray-500">Subject: </span>
                    <span className="font-medium">{email.subject}</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{email.body}</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* No emails yet */}
      {contacts.length > 0 && emails.length === 0 && (
        <div className="text-center py-12 border border-gray-200 rounded-lg">
          <p className="text-gray-500 mb-4">No emails generated yet.</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-blue-600 hover:underline"
          >
            Click &quot;Generate with AI&quot; to create outreach emails
          </button>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplate && saveTemplateEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Save as Template</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Partnership Intro"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newTemplateCategory}
                    onChange={(e) => setNewTemplateCategory(e.target.value as EmailTemplateCategory)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cold_outreach">Cold Outreach</option>
                    <option value="followup">Follow-up</option>
                    <option value="introduction_request">Introduction Request</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={newTemplateDescription}
                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                    placeholder="Brief description of when to use this template"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700 mb-2">Preview (with variables)</div>
                  <div className="text-xs text-gray-500 mb-2">
                    Contact-specific values will be replaced with {'{{variables}}'} for reuse
                  </div>
                  <div className="text-sm">
                    <div className="mb-1">
                      <span className="text-gray-500">Subject: </span>
                      <span className="font-mono text-xs bg-white px-1 rounded">
                        {extractVariablesFromEmail(saveTemplateEmail).subject}
                      </span>
                    </div>
                    <div className="text-gray-700 whitespace-pre-wrap font-mono text-xs bg-white p-2 rounded max-h-32 overflow-y-auto">
                      {extractVariablesFromEmail(saveTemplateEmail).body}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowSaveTemplate(false)
                    setSaveTemplateEmail(null)
                    setNewTemplateName('')
                    setNewTemplateCategory('cold_outreach')
                    setNewTemplateDescription('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate || !newTemplateName.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {savingTemplate ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <BookmarkPlus className="w-4 h-4" />
                      Save Template
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}
