'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Copy, Check, Plus, Sparkles, Loader2, ChevronDown, Building2, Mail, Linkedin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { EmailDraft, Message, Conversation, Person, Company, ResponseType, ProjectContext, ResearchedContact } from '@/types'
import { loggedFetch } from '@/lib/promptLogger'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const RESPONSE_TYPE_OPTIONS: { value: ResponseType; label: string }[] = [
  { value: 'schedule', label: 'Schedule Meeting' },
  { value: 'confirm', label: 'Confirm Details' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'thankyou', label: 'Thank You' },
  { value: 'clarify', label: 'Clarify' },
  { value: 'custom', label: 'General' },
]

const FOLLOWUP_TYPE_OPTIONS: { value: ResponseType; label: string }[] = [
  { value: 'followup', label: 'Gentle Follow-up' },
  { value: 'custom', label: 'Custom Follow-up' },
]

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const contactId = params.contactId as string

  // Loading and error states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Project data
  const [project, setProject] = useState<Project | null>(null)
  const [contact, setContact] = useState<Person | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [initialEmail, setInitialEmail] = useState<EmailDraft | null>(null)
  const [projectContext, setProjectContext] = useState<ProjectContext | undefined>(undefined)

  // Conversation state
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Reply handling state
  const [replyText, setReplyText] = useState('')
  const [responseType, setResponseType] = useState<ResponseType>('custom')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedResponse, setGeneratedResponse] = useState<{ subject: string; body: string } | null>(null)
  const [showResponseTypeDropdown, setShowResponseTypeDropdown] = useState(false)

  // Follow-up state
  const [followUpType, setFollowUpType] = useState<ResponseType>('followup')
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false)
  const [generatedFollowUp, setGeneratedFollowUp] = useState<{ subject: string; body: string } | null>(null)
  const [showFollowUpTypeDropdown, setShowFollowUpTypeDropdown] = useState(false)
  const [followUpCount, setFollowUpCount] = useState<number>(0)

  // Saving state
  const [isSaving, setIsSaving] = useState(false)

  // Load project and conversation data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = getSupabase()
      const { data: projectData, error: fetchError } = await supabase
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

      setProject(projectData)

      // Extract data from schema_config
      const schemaConfig = projectData.schema_config as {
        extractedContext?: ProjectContext
        companies?: Company[]
        contacts?: ResearchedContact[]
        emails?: EmailDraft[]
        conversations?: Conversation[]
      }

      setProjectContext(schemaConfig.extractedContext)

      // Find contact
      const foundContact = schemaConfig.contacts?.find((c) => c.id === contactId)
      if (!foundContact) {
        setError('Contact not found')
        return
      }

      // Convert ResearchedContact to Person
      const contactEmail = (foundContact as ResearchedContact & { email?: string }).email
      const person: Person = {
        id: foundContact.id,
        company: foundContact.company,
        companyId: foundContact.companyId,
        name: foundContact.name,
        title: foundContact.title,
        email: contactEmail || '',
        linkedin: foundContact.linkedinUrl || '',
        seniority: foundContact.seniority,
        source: 'web_research',
        verificationStatus: foundContact.verified ? 'verified' : 'unverified',
        emailCertainty: foundContact.verified ? 80 : 50,
        emailSource: 'web_research',
        emailVerified: foundContact.verified || false,
      }
      setContact(person)

      // Set follow-up count from contact's custom fields
      const count = (foundContact as ResearchedContact & { followup_count?: number }).followup_count
      setFollowUpCount(typeof count === 'number' ? count : 0)

      // Find company
      const foundCompany = schemaConfig.companies?.find((c) => c.id === foundContact.companyId)
      if (!foundCompany) {
        setError('Company not found')
        return
      }
      setCompany(foundCompany)

      // Find email for this contact
      const email = schemaConfig.emails?.find((e) => e.to?.id === contactId)
      if (email) {
        setInitialEmail(email)
      }

      // Find or create conversation
      const existingConversation = schemaConfig.conversations?.find((c) => c.personId === contactId)
      if (existingConversation) {
        setConversation(existingConversation)
      } else if (email) {
        // Create new conversation from email
        const newConversation: Conversation = {
          id: `conv-${contactId}-${Date.now()}`,
          personId: contactId,
          companyId: foundCompany.id,
          status: 'awaiting_reply',
          messages: [
            {
              id: `msg-${Date.now()}`,
              sender: 'you',
              subject: email.subject,
              content: email.body,
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        setConversation(newConversation)
      }
    } catch (err) {
      console.error('Error loading data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId, contactId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages])

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  // Save conversation to Supabase
  const saveConversation = async (updatedConversation: Conversation, newFollowUpCount?: number) => {
    if (!project) return

    setIsSaving(true)

    try {
      const supabase = getSupabase()
      const schemaConfig = project.schema_config as {
        conversations?: Conversation[]
        contacts?: ResearchedContact[]
        [key: string]: unknown
      }

      const existingConversations = schemaConfig.conversations || []
      const conversationIndex = existingConversations.findIndex(
        (c) => c.personId === updatedConversation.personId
      )

      let updatedConversations: Conversation[]
      if (conversationIndex >= 0) {
        updatedConversations = [...existingConversations]
        updatedConversations[conversationIndex] = updatedConversation
      } else {
        updatedConversations = [...existingConversations, updatedConversation]
      }

      // Update contact with follow-up count if provided
      let updatedContacts = schemaConfig.contacts || []
      if (newFollowUpCount !== undefined && newFollowUpCount > 0) {
        updatedContacts = updatedContacts.map((c) => {
          if (c.id === updatedConversation.personId) {
            return {
              ...c,
              followup_count: newFollowUpCount,
            }
          }
          return c
        })
      }

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
        throw updateError
      }

      setProject({
        ...project,
        schema_config: updatedSchemaConfig,
        updated_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Failed to save conversation:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // Add their reply to the thread
  const handleAddReply = async () => {
    if (!replyText.trim() || !conversation) return

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'them',
      content: replyText.trim(),
      timestamp: Date.now(),
    }

    const updatedConversation = {
      ...conversation,
      status: 'reply_received' as const,
      messages: [...conversation.messages, newMessage],
      updatedAt: Date.now(),
    }

    setConversation(updatedConversation)
    setReplyText('')
    setGeneratedResponse(null)

    await saveConversation(updatedConversation)
  }

  // Generate AI response
  const handleGenerateResponse = async () => {
    if (!projectContext || !contact || !company || !conversation) return

    setIsGenerating(true)
    setGeneratedResponse(null)

    try {
      const response = await loggedFetch('/api/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: projectContext,
          person: contact,
          company,
          messages: conversation.messages,
          responseType,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate response')
      }

      const data = await response.json()
      setGeneratedResponse({
        subject: data.subject || '',
        body: data.body || '',
      })
    } catch (err) {
      console.error('Error generating response:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  // Add generated response to thread as sent message
  const handleSendResponse = async () => {
    if (!generatedResponse || !conversation) return

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'you',
      subject: generatedResponse.subject,
      content: generatedResponse.body,
      timestamp: Date.now(),
    }

    const updatedConversation = {
      ...conversation,
      status: 'awaiting_reply' as const,
      messages: [...conversation.messages, newMessage],
      updatedAt: Date.now(),
    }

    setConversation(updatedConversation)
    setGeneratedResponse(null)

    await saveConversation(updatedConversation)
  }

  // Generate follow-up email when no reply received
  const handleGenerateFollowUp = async () => {
    if (!projectContext || !contact || !company || !conversation) return

    setIsGeneratingFollowUp(true)
    setGeneratedFollowUp(null)

    try {
      const response = await loggedFetch('/api/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: projectContext,
          person: contact,
          company,
          messages: conversation.messages,
          responseType: followUpType,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate follow-up')
      }

      const data = await response.json()
      setGeneratedFollowUp({
        subject: data.subject || '',
        body: data.body || '',
      })
    } catch (err) {
      console.error('Error generating follow-up:', err)
    } finally {
      setIsGeneratingFollowUp(false)
    }
  }

  // Add follow-up to thread and increment counter
  const handleSendFollowUp = async () => {
    if (!generatedFollowUp || !conversation) return

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'you',
      subject: generatedFollowUp.subject,
      content: generatedFollowUp.body,
      timestamp: Date.now(),
    }

    const newFollowUpCount = followUpCount + 1

    const updatedConversation = {
      ...conversation,
      status: 'awaiting_reply' as const,
      messages: [...conversation.messages, newMessage],
      updatedAt: Date.now(),
    }

    setConversation(updatedConversation)
    setFollowUpCount(newFollowUpCount)
    setGeneratedFollowUp(null)

    await saveConversation(updatedConversation, newFollowUpCount)
  }

  // Check if last message is from them (we need to respond)
  const lastMessage = conversation?.messages[conversation.messages.length - 1]
  const awaitingOurResponse = lastMessage?.sender === 'them'
  const awaitingTheirReply = lastMessage?.sender === 'you'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" label="Loading conversation..." />
      </div>
    )
  }

  if (error || !contact || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <ErrorMessage
          message={error || 'Could not load conversation'}
          variant="error"
          retry={loadData}
        />
        <Link
          href={`/project/${projectId}`}
          className="inline-flex items-center gap-2 px-4 py-2 text-blue-600 hover:text-blue-800 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Project
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{contact.name}</h1>
              <p className="text-sm text-gray-500">{contact.title}</p>
            </div>
          </div>
          {isSaving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col overflow-hidden p-4">
          {/* Contact info card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex-shrink-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-lg">
                    {contact.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{contact.name}</h2>
                  <p className="text-sm text-gray-600">{contact.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Building2 className="w-3 h-3" />
                      {company.name}
                    </span>
                    {contact.email && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Mail className="w-3 h-3" />
                        {contact.email}
                      </span>
                    )}
                    {contact.linkedin && (
                      <a
                        href={contact.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <Linkedin className="w-3 h-3" />
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {followUpCount > 0 && (
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                  {followUpCount} follow-up{followUpCount > 1 ? 's' : ''} sent
                </span>
              )}
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 overflow-y-auto bg-white rounded-lg border border-gray-200 p-4">
            <div className="space-y-4">
              {conversation?.messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onCopy={handleCopy}
                  copiedField={copiedField}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Reply Input Section - Sticky at bottom */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4 flex-shrink-0 space-y-3">
            {/* Paste their reply textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Paste their reply here
              </label>
              <div className="flex gap-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Paste the email reply you received..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
                <button
                  onClick={handleAddReply}
                  disabled={!replyText.trim()}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 self-end"
                >
                  <Plus className="w-4 h-4" />
                  Add Reply
                </button>
              </div>
            </div>

            {/* No Reply Yet / Follow-up Section */}
            {awaitingTheirReply && (
              <div className="bg-amber-50 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-amber-800">No reply yet?</span>
                    {followUpCount > 0 && (
                      <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                        {followUpCount} follow-up{followUpCount > 1 ? 's' : ''} sent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setShowFollowUpTypeDropdown(!showFollowUpTypeDropdown)}
                        className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-sm flex items-center gap-2 hover:bg-amber-50"
                      >
                        {FOLLOWUP_TYPE_OPTIONS.find((o) => o.value === followUpType)?.label}
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      {showFollowUpTypeDropdown && (
                        <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                          {FOLLOWUP_TYPE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                setFollowUpType(option.value)
                                setShowFollowUpTypeDropdown(false)
                              }}
                              className={cn(
                                'w-full px-3 py-2 text-left text-sm hover:bg-gray-50',
                                followUpType === option.value && 'bg-amber-50 text-amber-700'
                              )}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleGenerateFollowUp}
                      disabled={isGeneratingFollowUp || !projectContext}
                      className="px-4 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                      {isGeneratingFollowUp ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate Follow-up
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Generated Follow-up */}
                {generatedFollowUp && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Subject: {generatedFollowUp.subject}</div>
                    <textarea
                      value={generatedFollowUp.body}
                      onChange={(e) =>
                        setGeneratedFollowUp((prev) =>
                          prev ? { ...prev, body: e.target.value } : null
                        )
                      }
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
                      rows={5}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(generatedFollowUp.body, 'generated-followup')}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
                      >
                        {copiedField === 'generated-followup' ? (
                          <>
                            <Check className="w-4 h-4 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSendFollowUp}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm flex items-center gap-1"
                      >
                        <Send className="w-4 h-4" />
                        Add to Thread
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generate Response Section - show after they add a reply */}
            {awaitingOurResponse && (
              <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setShowResponseTypeDropdown(!showResponseTypeDropdown)}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
                    >
                      {RESPONSE_TYPE_OPTIONS.find((o) => o.value === responseType)?.label}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showResponseTypeDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px]">
                        {RESPONSE_TYPE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setResponseType(option.value)
                              setShowResponseTypeDropdown(false)
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm hover:bg-gray-50',
                              responseType === option.value && 'bg-blue-50 text-blue-700'
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleGenerateResponse}
                    disabled={isGenerating || !projectContext}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate Response
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Response */}
                {generatedResponse && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Subject: {generatedResponse.subject}</div>
                    <textarea
                      value={generatedResponse.body}
                      onChange={(e) =>
                        setGeneratedResponse((prev) =>
                          prev ? { ...prev, body: e.target.value } : null
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      rows={5}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopy(generatedResponse.body, 'generated-response')}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
                      >
                        {copiedField === 'generated-response' ? (
                          <>
                            <Check className="w-4 h-4 text-green-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleSendResponse}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
                      >
                        <Send className="w-4 h-4" />
                        Add to Thread
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  onCopy: (text: string, fieldId: string) => void
  copiedField: string | null
}

function MessageBubble({ message, onCopy, copiedField }: MessageBubbleProps) {
  const isYou = message.sender === 'you'
  const copyId = `msg-${message.id}`

  return (
    <div className={cn('flex', isYou ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg p-3 space-y-2',
          isYou ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        )}
      >
        {/* Subject line if present */}
        {message.subject && (
          <div
            className={cn(
              'text-xs font-medium pb-1 border-b',
              isYou ? 'border-blue-400 text-blue-100' : 'border-gray-300 text-gray-500'
            )}
          >
            Subject: {message.subject}
          </div>
        )}

        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Footer with timestamp and copy */}
        <div
          className={cn(
            'flex items-center justify-between pt-1',
            isYou ? 'text-blue-200' : 'text-gray-400'
          )}
        >
          <span className="text-xs">{formatTimestamp(message.timestamp)}</span>
          <button
            onClick={() => onCopy(message.content, copyId)}
            className={cn(
              'flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors',
              isYou ? 'hover:bg-blue-500 text-blue-100' : 'hover:bg-gray-200 text-gray-500'
            )}
          >
            {copiedField === copyId ? (
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
      </div>
    </div>
  )
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays < 7) {
    return (
      date.toLocaleDateString([], { weekday: 'short' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  } else {
    return (
      date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }
}
