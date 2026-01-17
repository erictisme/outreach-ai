'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, Mail, Save, RefreshCw, Copy, Check, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { Company, ResearchedContact, ProjectContext, Person, EmailDraft } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { loggedFetch } from '@/lib/promptLogger'

interface EmailsStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
  onOpenConversation?: (contactId: string, email: EmailDraft) => void
}

export function EmailsStep({ project, onUpdate, onOpenConversation }: EmailsStepProps) {
  const { addToast } = useToast()
  const schemaConfig = project.schema_config as {
    extractedContext?: ProjectContext
    companies?: Company[]
    contacts?: ResearchedContact[]
    masterPrompt?: string
    emails?: EmailDraft[]
  }

  const companies: Company[] = schemaConfig.companies || []
  const contacts: ResearchedContact[] = schemaConfig.contacts || []
  const existingEmails: EmailDraft[] = schemaConfig.emails || []

  // Master prompt state
  const [masterPrompt, setMasterPrompt] = useState<string>(schemaConfig.masterPrompt || '')
  const [isSavingPrompt, setIsSavingPrompt] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-email state
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set())
  const [individualPrompts, setIndividualPrompts] = useState<Record<string, string>>({})
  const [regeneratingEmail, setRegeneratingEmail] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // No contacts yet
  if (contacts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 4 (Contacts) first to add contacts.
      </div>
    )
  }

  // Count contacts with emails
  const contactsWithEmails = contacts.filter((c) => {
    const email = (c as ResearchedContact & { email?: string }).email
    return email && email.trim() !== ''
  })

  // Save master prompt to Supabase
  const handleSavePrompt = async () => {
    setIsSavingPrompt(true)
    setError(null)

    try {
      const supabase = getSupabase()

      const updatedSchemaConfig = {
        ...schemaConfig,
        masterPrompt,
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

      setPromptSaved(true)
      setTimeout(() => setPromptSaved(false), 2000)
    } catch (err) {
      console.error('Save prompt error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save prompt')
    } finally {
      setIsSavingPrompt(false)
    }
  }

  // Generate emails for all contacts
  const handleGenerateEmails = async () => {
    setShowConfirmModal(false)
    setIsGenerating(true)
    setError(null)

    try {
      // Convert ResearchedContact to Person for API
      const persons: Person[] = contacts.map((contact) => ({
        id: contact.id,
        company: contact.company,
        companyId: contact.companyId,
        name: contact.name,
        title: contact.title,
        email: (contact as ResearchedContact & { email?: string }).email || '',
        linkedin: contact.linkedinUrl || '',
        seniority: contact.seniority,
        source: 'web_research' as const,
        verificationStatus: contact.verified ? 'verified' as const : 'unverified' as const,
        emailCertainty: contact.verified ? 80 : 50,
        emailSource: 'ai_research',
        emailVerified: contact.verified || false,
      }))

      const response = await loggedFetch('/api/write-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: schemaConfig.extractedContext || {},
          companies,
          persons,
          masterPrompt: masterPrompt.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate emails')
      }

      const data = await response.json()
      const generatedEmails: EmailDraft[] = data.emails || []

      // Save emails to schema_config
      const supabase = getSupabase()

      const updatedSchemaConfig = {
        ...schemaConfig,
        masterPrompt,
        emails: generatedEmails,
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
      addToast(`Generated ${generatedEmails.length} emails`, 'success')
    } catch (err) {
      console.error('Generate emails error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate emails')
      addToast('Failed to generate emails', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Copy to clipboard helper
  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // Toggle individual prompt visibility
  const togglePrompt = (emailId: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev)
      if (next.has(emailId)) {
        next.delete(emailId)
      } else {
        next.add(emailId)
      }
      return next
    })
  }

  // Regenerate single email
  const handleRegenerateEmail = async (email: EmailDraft, index: number) => {
    const emailId = `email-${index}`
    setRegeneratingEmail(emailId)
    setError(null)

    try {
      // Convert the single contact back to Person format
      const person: Person = {
        id: email.to.id,
        company: email.to.company,
        companyId: email.to.companyId,
        name: email.to.name,
        title: email.to.title,
        email: email.to.email,
        linkedin: email.to.linkedin || '',
        seniority: email.to.seniority,
        source: email.to.source || ('web_research' as const),
        verificationStatus: email.to.verificationStatus || ('unverified' as const),
        emailCertainty: email.to.emailCertainty || 50,
        emailSource: email.to.emailSource || '',
        emailVerified: email.to.emailVerified || false,
      }

      const response = await loggedFetch('/api/write-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: schemaConfig.extractedContext || {},
          companies: [email.company],
          persons: [person],
          masterPrompt: masterPrompt.trim() || undefined,
          individualPrompt: individualPrompts[emailId]?.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to regenerate email')
      }

      const data = await response.json()
      const regeneratedEmails: EmailDraft[] = data.emails || []

      if (regeneratedEmails.length > 0) {
        // Update the specific email in the array
        const updatedEmails = [...existingEmails]
        updatedEmails[index] = regeneratedEmails[0]

        // Save to Supabase
        const supabase = getSupabase()
        const updatedSchemaConfig = {
          ...schemaConfig,
          emails: updatedEmails,
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
        addToast('Email regenerated', 'success')
      }
    } catch (err) {
      console.error('Regenerate email error:', err)
      setError(err instanceof Error ? err.message : 'Failed to regenerate email')
      addToast('Failed to regenerate email', 'error')
    } finally {
      setRegeneratingEmail(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-600">
          <span className="font-semibold">{contacts.length}</span> contacts
        </div>
        <div className="flex items-center gap-3">
          <span className="text-green-600 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" />
            {contactsWithEmails.length} with email
          </span>
          {existingEmails.length > 0 && (
            <span className="text-blue-600">
              {existingEmails.length} emails generated
            </span>
          )}
        </div>
      </div>

      {/* Master Prompt Section */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Master Prompt
        </label>
        <textarea
          value={masterPrompt}
          onChange={(e) => setMasterPrompt(e.target.value)}
          placeholder="Add custom instructions for email generation. For example:&#10;&#10;- Keep emails under 150 words&#10;- Mention our new product launch in January&#10;- Use a more casual tone&#10;- Focus on partnership opportunities rather than sales&#10;&#10;These instructions will apply to ALL generated emails."
          rows={6}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Optional instructions that apply to all emails
          </p>
          <button
            onClick={handleSavePrompt}
            disabled={isSavingPrompt}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              promptSaved
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {isSavingPrompt ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : promptSaved ? (
              <>
                <Save className="w-3.5 h-3.5" />
                Saved!
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save Prompt
              </>
            )}
          </button>
        </div>
      </div>

      {/* Warning Banner */}
      {existingEmails.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">
              This will regenerate ALL emails
            </p>
            <p className="text-amber-600 mt-0.5">
              Existing {existingEmails.length} email(s) will be replaced with new ones.
            </p>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={() => setShowConfirmModal(true)}
        disabled={isGenerating || contacts.length === 0}
        className={cn(
          'w-full py-2.5 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
          isGenerating || contacts.length === 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating emails...
          </>
        ) : existingEmails.length > 0 ? (
          <>
            <RefreshCw className="w-4 h-4" />
            Regenerate All Emails ({contacts.length} contacts)
          </>
        ) : (
          <>
            <Mail className="w-4 h-4" />
            Generate All Emails ({contacts.length} contacts)
          </>
        )}
      </button>

      {/* Per-Contact Email Display */}
      {existingEmails.length > 0 && !isGenerating && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Generated Emails ({existingEmails.length})
            </h3>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {existingEmails.map((email, index) => {
              const emailId = `email-${index}`
              const isExpanded = expandedPrompts.has(emailId)
              const isRegenerating = regeneratingEmail === emailId

              return (
                <div
                  key={emailId}
                  className="border border-gray-200 rounded-lg bg-white overflow-hidden"
                >
                  {/* Contact Header */}
                  <div className="p-3 bg-gray-50 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900 text-sm">
                          {email.to.name}
                        </h4>
                        <p className="text-xs text-gray-600">
                          {email.to.title} at {email.company.name}
                        </p>
                      </div>
                      {/* Enter Conversation button */}
                      {onOpenConversation && (
                        <button
                          onClick={() => onOpenConversation(email.to.id, email)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 rounded-md hover:bg-purple-100 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Enter Conversation
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Email Content */}
                  <div className="p-3 space-y-3">
                    {/* Subject Line */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Subject
                        </span>
                        <button
                          onClick={() => handleCopy(email.subject, `${emailId}-subject`)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                            copiedField === `${emailId}-subject`
                              ? 'text-green-700 bg-green-50'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          )}
                        >
                          {copiedField === `${emailId}-subject` ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-gray-800 font-medium">
                        {email.subject}
                      </p>
                    </div>

                    {/* Body Preview */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Body
                        </span>
                        <button
                          onClick={() => handleCopy(email.body, `${emailId}-body`)}
                          className={cn(
                            'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors',
                            copiedField === `${emailId}-body`
                              ? 'text-green-700 bg-green-50'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          )}
                        >
                          {copiedField === `${emailId}-body` ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                        {email.body}
                      </p>
                    </div>

                    {/* Individual Prompt (Collapsible) */}
                    <div className="pt-2 border-t border-gray-100">
                      <button
                        onClick={() => togglePrompt(emailId)}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                        Individual prompt
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={individualPrompts[emailId] || ''}
                            onChange={(e) =>
                              setIndividualPrompts((prev) => ({
                                ...prev,
                                [emailId]: e.target.value,
                              }))
                            }
                            placeholder="Add specific instructions for regenerating this email..."
                            rows={3}
                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                          />
                          <button
                            onClick={() => handleRegenerateEmail(email, index)}
                            disabled={isRegenerating}
                            className={cn(
                              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors',
                              isRegenerating
                                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            )}
                          >
                            {isRegenerating ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Regenerating...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3 h-3" />
                                Regenerate
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {existingEmails.length > 0 ? 'Regenerate Emails?' : 'Generate Emails?'}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will generate personalized emails for {contacts.length} contact(s).
                </p>
              </div>
            </div>

            {existingEmails.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <p className="text-sm text-amber-800 font-medium">
                    {existingEmails.length} existing email(s) will be replaced
                  </p>
                </div>
              </div>
            )}

            {masterPrompt.trim() && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 mb-1">Master prompt:</p>
                <p className="text-sm text-gray-700 line-clamp-3">{masterPrompt}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateEmails}
                className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {existingEmails.length > 0 ? 'Regenerate' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
