'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  MessageSquare,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Calendar,
  ThumbsUp,
  HelpCircle,
  Send,
  Loader2,
} from 'lucide-react'
import { getSupabase, Company as DbCompany, Contact as DbContact, Project as DbProject, Email as DbEmail } from '@/lib/supabase'
import { ProjectContext, Message, ConversationStatus, ResponseType } from '@/types'
import { WizardNav, WizardStep } from '@/components/WizardNav'
import { useToast, ErrorMessage } from '@/components/ui'

// Conversation stored in contact's custom_fields
interface StoredConversation {
  id: string
  status: ConversationStatus
  messages: Message[]
  meetingDetails?: string
  createdAt: number
  updatedAt: number
}

// Enriched conversation with contact/company info
interface ConversationWithContact {
  conversation: StoredConversation
  contact: DbContact
  company: DbCompany
  email?: DbEmail
}

const STATUS_CONFIG: Record<ConversationStatus, { label: string; icon: typeof Clock; color: string; bgColor: string }> = {
  awaiting_reply: {
    label: 'Awaiting Reply',
    icon: Clock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  reply_received: {
    label: 'Reply Received',
    icon: MessageSquare,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  meeting_set: {
    label: 'Meeting Set',
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  closed: {
    label: 'Closed',
    icon: CheckCircle,
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
}

const RESPONSE_TYPES: { type: ResponseType; label: string; icon: typeof Calendar; description: string }[] = [
  { type: 'schedule', label: 'Schedule', icon: Calendar, description: 'Propose meeting times' },
  { type: 'confirm', label: 'Confirm', icon: Check, description: 'Confirm meeting details' },
  { type: 'reschedule', label: 'Reschedule', icon: RefreshCw, description: 'Propose new times' },
  { type: 'followup', label: 'Follow-up', icon: MessageSquare, description: 'Bump the conversation' },
  { type: 'thankyou', label: 'Thank You', icon: ThumbsUp, description: 'Post-meeting thanks' },
  { type: 'clarify', label: 'Clarify', icon: HelpCircle, description: 'Ask for clarification' },
]

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ConversationsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { addToast } = useToast()

  const [project, setProject] = useState<DbProject | null>(null)
  const [conversations, setConversations] = useState<ConversationWithContact[]>([])
  const [contacts, setContacts] = useState<DbContact[]>([])
  const [companies, setCompanies] = useState<DbCompany[]>([])
  const [emails, setEmails] = useState<DbEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected conversation
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  // Thread view state
  const [replyText, setReplyText] = useState('')
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [selectedResponseType, setSelectedResponseType] = useState<ResponseType>('schedule')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | null>(null)
  const [saving, setSaving] = useState(false)

  // Load data
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

        if (compsError) throw compsError
        setCompanies(comps || [])

        if (!comps || comps.length === 0) {
          setLoading(false)
          return
        }

        // Load contacts
        const companyIds = comps.map(c => c.id)
        const { data: conts, error: contsError } = await supabase
          .from('contacts')
          .select('*')
          .in('company_id', companyIds)

        if (contsError) throw contsError
        setContacts(conts || [])

        if (!conts || conts.length === 0) {
          setLoading(false)
          return
        }

        // Load emails
        const contactIds = conts.map(c => c.id)
        const { data: emailData, error: emailError } = await supabase
          .from('emails')
          .select('*')
          .in('contact_id', contactIds)

        if (emailError) throw emailError
        setEmails(emailData || [])

        // Build conversations from contacts with conversation data
        const conversationsWithContacts: ConversationWithContact[] = []

        for (const contact of conts) {
          const customFields = (contact.custom_fields || {}) as Record<string, unknown>
          const storedConv = customFields.conversation as StoredConversation | undefined

          if (storedConv) {
            const company = comps.find(c => c.id === contact.company_id)
            const email = emailData?.find(e => e.contact_id === contact.id)

            if (company) {
              conversationsWithContacts.push({
                conversation: storedConv,
                contact,
                company,
                email,
              })
            }
          }
        }

        // Sort by status priority and then by updatedAt
        conversationsWithContacts.sort((a, b) => {
          const statusPriority: Record<ConversationStatus, number> = {
            reply_received: 0,
            awaiting_reply: 1,
            meeting_set: 2,
            declined: 3,
            closed: 4,
          }
          const priorityDiff = statusPriority[a.conversation.status] - statusPriority[b.conversation.status]
          if (priorityDiff !== 0) return priorityDiff
          return b.conversation.updatedAt - a.conversation.updatedAt
        })

        setConversations(conversationsWithContacts)
      } catch (err) {
        console.error('Error loading data:', err)
        setError('Failed to load conversations')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  // Get selected conversation data
  const selectedData = selectedConversationId
    ? conversations.find(c => c.conversation.id === selectedConversationId)
    : null

  // Build context from project
  const buildContext = useCallback((): ProjectContext | null => {
    if (!project) return null
    const schemaConfig = project.schema_config as Record<string, unknown>
    const extractedContext = schemaConfig?.extractedContext as Record<string, unknown> | undefined

    return {
      objective: (extractedContext?.objective as ProjectContext['objective']) || 'sales_prospects',
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
  }, [project])

  // Save conversation to Supabase
  const saveConversation = useCallback(async (contactId: string, conversation: StoredConversation) => {
    setSaving(true)
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
      customFields.conversation = conversation

      // Update contact status based on conversation
      if (conversation.status === 'meeting_set') {
        customFields.outreachStatus = 'meeting_secured'
      } else if (conversation.status === 'declined') {
        customFields.outreachStatus = 'rejected'
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update({ custom_fields: customFields })
        .eq('id', contactId)

      if (updateError) throw updateError

      // Update local state
      setConversations(prev => prev.map(c => {
        if (c.contact.id === contactId) {
          return { ...c, conversation }
        }
        return c
      }))

      // Also update contacts state
      setContacts(prev => prev.map(c => {
        if (c.id === contactId) {
          return { ...c, custom_fields: customFields }
        }
        return c
      }))

      addToast('Conversation saved', 'success')
    } catch (err) {
      console.error('Error saving conversation:', err)
      addToast('Failed to save conversation', 'error')
    } finally {
      setSaving(false)
    }
  }, [addToast])

  // Start a new conversation for a contact
  const startConversation = useCallback(async (contact: DbContact) => {
    const email = emails.find(e => e.contact_id === contact.id)
    const now = Date.now()

    const newConversation: StoredConversation = {
      id: `conv-${contact.id}-${now}`,
      status: 'awaiting_reply',
      messages: email && email.body ? [{
        id: `msg-${now}`,
        sender: 'you',
        content: email.body,
        subject: email.subject || undefined,
        timestamp: now,
      }] : [],
      createdAt: now,
      updatedAt: now,
    }

    await saveConversation(contact.id, newConversation)

    // Add to local conversations list
    const company = companies.find(c => c.id === contact.company_id)
    if (company) {
      const newConvWithContact: ConversationWithContact = {
        conversation: newConversation,
        contact,
        company,
        email,
      }
      setConversations(prev => [newConvWithContact, ...prev])
      setSelectedConversationId(newConversation.id)
    }
  }, [emails, companies, saveConversation])

  // Add their reply to the conversation
  const handleAddReply = async () => {
    if (!replyText.trim() || !selectedData) return

    const now = Date.now()
    const newMessage: Message = {
      id: `msg-${now}`,
      sender: 'them',
      content: replyText.trim(),
      timestamp: now,
    }

    const updatedConversation: StoredConversation = {
      ...selectedData.conversation,
      messages: [...selectedData.conversation.messages, newMessage],
      status: 'reply_received',
      updatedAt: now,
    }

    await saveConversation(selectedData.contact.id, updatedConversation)
    setReplyText('')
  }

  // Generate AI response
  const handleGenerateResponse = async () => {
    if (!selectedData) return
    setIsGenerating(true)

    try {
      const context = buildContext()
      if (!context) throw new Error('No context available')

      const res = await fetch('/api/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          person: {
            id: selectedData.contact.id,
            name: selectedData.contact.name,
            title: selectedData.contact.title || '',
            company: selectedData.company.name,
            companyId: selectedData.company.id,
            email: selectedData.contact.email || '',
            linkedin: selectedData.contact.linkedin_url || '',
            source: 'apollo',
            verificationStatus: 'verified',
            emailCertainty: 100,
            emailSource: 'Apollo',
            emailVerified: true,
          },
          company: {
            id: selectedData.company.id,
            name: selectedData.company.name,
            type: '',
            website: selectedData.company.website || '',
            domain: selectedData.company.website ? new URL(selectedData.company.website.startsWith('http') ? selectedData.company.website : `https://${selectedData.company.website}`).hostname.replace('www.', '') : '',
            description: selectedData.company.description || '',
            relevance: selectedData.company.relevance_notes || '',
            status: 'not_contacted',
            verificationStatus: 'verified',
            verificationSource: 'apollo',
            verifiedAt: Date.now(),
            websiteAccessible: true,
          },
          messages: selectedData.conversation.messages,
          responseType: selectedResponseType,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate response')

      const data = await res.json()
      setDraftSubject(data.subject || '')
      setDraftBody(data.body || '')
    } catch (err) {
      console.error('Failed to generate response:', err)
      addToast('Failed to generate response', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  // Copy to clipboard
  const handleCopy = async (field: 'subject' | 'body') => {
    const text = field === 'subject' ? draftSubject : draftBody
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // Add our sent message to conversation
  const handleMarkSent = async () => {
    if (!draftBody.trim() || !selectedData) return

    const now = Date.now()
    const newMessage: Message = {
      id: `msg-${now}`,
      sender: 'you',
      content: draftBody.trim(),
      subject: draftSubject || undefined,
      timestamp: now,
    }

    const updatedConversation: StoredConversation = {
      ...selectedData.conversation,
      messages: [...selectedData.conversation.messages, newMessage],
      status: 'awaiting_reply',
      updatedAt: now,
    }

    await saveConversation(selectedData.contact.id, updatedConversation)
    setDraftSubject('')
    setDraftBody('')
  }

  // Update conversation status
  const handleStatusChange = async (status: ConversationStatus, meetingDetails?: string) => {
    if (!selectedData) return

    const updatedConversation: StoredConversation = {
      ...selectedData.conversation,
      status,
      meetingDetails,
      updatedAt: Date.now(),
    }

    await saveConversation(selectedData.contact.id, updatedConversation)
  }

  // Get contacts that can start conversations (have emails, no conversation yet)
  const contactsWithoutConversation = contacts.filter(contact => {
    const hasConversation = conversations.some(c => c.contact.id === contact.id)
    const hasEmail = emails.some(e => e.contact_id === contact.id)
    return !hasConversation && hasEmail
  })

  // Stats
  const replyReceivedCount = conversations.filter(c => c.conversation.status === 'reply_received').length
  const awaitingReplyCount = conversations.filter(c => c.conversation.status === 'awaiting_reply').length
  const meetingSetCount = conversations.filter(c => c.conversation.status === 'meeting_set').length

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-8"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </main>
    )
  }

  // Completed steps for nav
  const completedSteps: WizardStep[] = []
  if (companies.length > 0) completedSteps.push('companies')
  if (contacts.length > 0) completedSteps.push('contacts')
  if (emails.length > 0) completedSteps.push('emails')
  if (conversations.length > 0) completedSteps.push('conversations')

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
      <header className="mb-4">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← All Projects
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold truncate">{project?.client_name || 'Project'}</h1>
      </header>

      <WizardNav projectId={projectId} completedSteps={completedSteps} />

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      {/* Selected conversation thread view */}
      {selectedData ? (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setSelectedConversationId(null)
                setReplyText('')
                setDraftSubject('')
                setDraftBody('')
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to conversations</span>
            </button>

            <div className="flex items-center gap-2">
              {saving && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
              <select
                value={selectedData.conversation.status}
                onChange={(e) => {
                  const newStatus = e.target.value as ConversationStatus
                  if (newStatus === 'meeting_set') {
                    const details = prompt('Enter meeting details (e.g., "Jan 27, 2pm at their office")')
                    if (details) handleStatusChange(newStatus, details)
                  } else {
                    handleStatusChange(newStatus)
                  }
                }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white"
              >
                <option value="awaiting_reply">Awaiting Reply</option>
                <option value="reply_received">Reply Received</option>
                <option value="meeting_set">Meeting Set</option>
                <option value="declined">Declined</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-indigo-600 font-medium">
                  {selectedData.contact.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div>
                <div className="font-medium text-gray-900">{selectedData.contact.name}</div>
                <div className="text-sm text-gray-500">{selectedData.contact.title} at {selectedData.company.name}</div>
              </div>
            </div>
            {selectedData.conversation.meetingDetails && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <span className="text-sm text-green-600 font-medium">Meeting: {selectedData.conversation.meetingDetails}</span>
              </div>
            )}
          </div>

          {/* Message Thread */}
          <div className="space-y-4">
            {selectedData.conversation.messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No messages yet. Add the initial email or start the conversation.
              </div>
            ) : (
              selectedData.conversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg p-4 ${
                    message.sender === 'you'
                      ? 'bg-blue-50 border border-blue-100'
                      : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-medium uppercase ${
                      message.sender === 'you' ? 'text-blue-600' : 'text-gray-600'
                    }`}>
                      {message.sender === 'you' ? 'You' : selectedData.contact.name.split(' ')[0]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatMessageTime(message.timestamp)}
                    </span>
                  </div>
                  {message.subject && (
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      Subject: {message.subject}
                    </div>
                  )}
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Their Reply */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Add Their Reply</h3>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Paste their reply here..."
              className="w-full h-32 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleAddReply}
                disabled={!replyText.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4" />
                Add to Thread
              </button>
            </div>
          </div>

          {/* Draft Response */}
          <div className="border-t pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Draft Response</h3>

            {/* Response Type Selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {RESPONSE_TYPES.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => setSelectedResponseType(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                    selectedResponseType === type
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateResponse}
              disabled={isGenerating || selectedData.conversation.messages.length === 0}
              className="w-full mb-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Generate {RESPONSE_TYPES.find(t => t.type === selectedResponseType)?.label} Response
                </>
              )}
            </button>

            {/* Draft Subject */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Subject</label>
                <button
                  onClick={() => handleCopy('subject')}
                  disabled={!draftSubject}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50"
                >
                  {copiedField === 'subject' ? (
                    <><Check className="w-3 h-3" /> Copied</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy</>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
                placeholder="Re: ..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Draft Body */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Body</label>
                <button
                  onClick={() => handleCopy('body')}
                  disabled={!draftBody}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50"
                >
                  {copiedField === 'body' ? (
                    <><Check className="w-3 h-3" /> Copied</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy</>
                  )}
                </button>
              </div>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Your response..."
                className="w-full h-48 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Mark as Sent */}
            <div className="flex justify-end">
              <button
                onClick={handleMarkSent}
                disabled={!draftBody.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4" />
                Mark as Sent & Add to Thread
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Conversation List View */
        <>
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Conversations</h2>
            <p className="text-gray-600 mt-1">
              Track replies and follow-ups with your contacts
            </p>
          </div>

          {/* Stats bar */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Total conversations:</span>{' '}
              <span className="font-medium">{conversations.length}</span>
            </div>
            {replyReceivedCount > 0 && (
              <div className="flex items-center gap-1 text-blue-600">
                <MessageSquare className="w-4 h-4" />
                <span className="font-medium">{replyReceivedCount} replied</span>
              </div>
            )}
            {awaitingReplyCount > 0 && (
              <div className="flex items-center gap-1 text-amber-600">
                <Clock className="w-4 h-4" />
                <span className="font-medium">{awaitingReplyCount} awaiting reply</span>
              </div>
            )}
            {meetingSetCount > 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="font-medium">{meetingSetCount} meetings set</span>
              </div>
            )}
          </div>

          {/* Start new conversation section */}
          {contactsWithoutConversation.length > 0 && (
            <div className="mb-6 p-4 border border-dashed border-gray-300 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Start Conversation</h3>
              <p className="text-sm text-gray-500 mb-3">
                {contactsWithoutConversation.length} contacts have emails but no conversation started
              </p>
              <div className="flex flex-wrap gap-2">
                {contactsWithoutConversation.slice(0, 5).map(contact => {
                  const company = companies.find(c => c.id === contact.company_id)
                  return (
                    <button
                      key={contact.id}
                      onClick={() => startConversation(contact)}
                      className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    >
                      {contact.name} <span className="text-gray-400">at</span> {company?.name}
                    </button>
                  )
                })}
                {contactsWithoutConversation.length > 5 && (
                  <span className="px-3 py-1.5 text-sm text-gray-500">
                    +{contactsWithoutConversation.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Conversation list */}
          {conversations.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
              <p className="text-gray-500 mb-4">
                Start a conversation by clicking on a contact above, or generate emails first.
              </p>
              {emails.length === 0 && (
                <Link
                  href={`/project/${projectId}/emails`}
                  className="text-blue-600 hover:underline"
                >
                  Generate emails first
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((item) => {
                const config = STATUS_CONFIG[item.conversation.status]
                const StatusIcon = config.icon

                return (
                  <button
                    key={item.conversation.id}
                    onClick={() => setSelectedConversationId(item.conversation.id)}
                    className="w-full text-left p-4 rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {item.contact.name}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-600 truncate">
                            {item.company.name}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 truncate mb-2">
                          {item.contact.title}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                          {item.conversation.meetingDetails && (
                            <span className="text-xs text-gray-500">
                              {item.conversation.meetingDetails}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <span>{formatRelativeTime(item.conversation.updatedAt)}</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                    {item.email && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500 truncate">
                          Last: {item.email.subject}
                        </p>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
