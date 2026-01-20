'use client'

import { useState } from 'react'
import { ArrowLeft, Copy, Check, RefreshCw, Send, Calendar, MessageSquare, ThumbsUp, HelpCircle, Loader2 } from 'lucide-react'
import { Conversation, Person, Company, EmailDraft, Message, ResponseType, ProjectContext } from '@/types'
import { cn } from '@/lib/utils'

interface ConversationThreadProps {
  conversation: Conversation
  person: Person
  company: Company
  initialEmail?: EmailDraft
  context: ProjectContext | null
  onBack: () => void
  onUpdateConversation: (conversation: Conversation) => void
}

const RESPONSE_TYPES: { type: ResponseType; label: string; icon: typeof Calendar; description: string }[] = [
  { type: 'schedule', label: 'Schedule', icon: Calendar, description: 'Propose meeting times' },
  { type: 'confirm', label: 'Confirm', icon: Check, description: 'Confirm meeting details' },
  { type: 'reschedule', label: 'Reschedule', icon: RefreshCw, description: 'Propose new times' },
  { type: 'followup', label: 'Follow-up', icon: MessageSquare, description: 'Bump the conversation' },
  { type: 'thankyou', label: 'Thank You', icon: ThumbsUp, description: 'Post-meeting thanks' },
  { type: 'clarify', label: 'Clarify', icon: HelpCircle, description: 'Ask for clarification' },
]

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

export function ConversationThread({
  conversation,
  person,
  company,
  initialEmail: _initialEmail,
  context,
  onBack,
  onUpdateConversation,
}: ConversationThreadProps) {
  const [replyText, setReplyText] = useState('')
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [selectedResponseType, setSelectedResponseType] = useState<ResponseType>('schedule')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copiedField, setCopiedField] = useState<'subject' | 'body' | null>(null)

  // Add their reply to the conversation
  const handleAddReply = () => {
    if (!replyText.trim()) return

    const now = Date.now()
    const newMessage: Message = {
      id: `msg-${now}`,
      sender: 'them',
      content: replyText.trim(),
      timestamp: now,
    }

    const updatedConversation: Conversation = {
      ...conversation,
      messages: [...conversation.messages, newMessage],
      status: 'reply_received',
      updatedAt: now,
    }

    onUpdateConversation(updatedConversation)
    setReplyText('')
  }

  // Generate AI response
  const handleGenerateResponse = async () => {
    setIsGenerating(true)

    try {
      const res = await fetch('/api/draft-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          person,
          company,
          messages: conversation.messages,
          responseType: selectedResponseType,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate response')

      const data = await res.json()
      setDraftSubject(data.subject || '')
      setDraftBody(data.body || '')
    } catch (err) {
      console.error('Failed to generate response:', err)
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
  const handleMarkSent = () => {
    if (!draftBody.trim()) return

    const now = Date.now()
    const newMessage: Message = {
      id: `msg-${now}`,
      sender: 'you',
      content: draftBody.trim(),
      subject: draftSubject || undefined,
      timestamp: now,
    }

    const updatedConversation: Conversation = {
      ...conversation,
      messages: [...conversation.messages, newMessage],
      status: 'awaiting_reply',
      updatedAt: now,
    }

    onUpdateConversation(updatedConversation)
    setDraftSubject('')
    setDraftBody('')
  }

  // Update conversation status
  const handleStatusChange = (status: Conversation['status'], meetingDetails?: string) => {
    onUpdateConversation({
      ...conversation,
      status,
      meetingDetails,
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to conversations</span>
        </button>

        <div className="flex items-center gap-2">
          <select
            value={conversation.status}
            onChange={(e) => {
              const newStatus = e.target.value as Conversation['status']
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
              {person.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{person.name}</div>
            <div className="text-sm text-gray-500">{person.title} at {company.name}</div>
          </div>
        </div>
        {conversation.meetingDetails && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <span className="text-sm text-green-600 font-medium">Meeting: {conversation.meetingDetails}</span>
          </div>
        )}
      </div>

      {/* Message Thread */}
      <div className="space-y-4">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'rounded-lg p-4',
              message.sender === 'you'
                ? 'bg-blue-50 border border-blue-100'
                : 'bg-gray-50 border border-gray-200'
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                'text-xs font-medium uppercase',
                message.sender === 'you' ? 'text-blue-600' : 'text-gray-600'
              )}>
                {message.sender === 'you' ? 'You' : person.name.split(' ')[0]}
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
        ))}
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
            disabled={!replyText.trim()}
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
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors',
                selectedResponseType === type
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateResponse}
          disabled={isGenerating}
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
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
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
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
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
            disabled={!draftBody.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            Mark as Sent & Add to Thread
          </button>
        </div>
      </div>
    </div>
  )
}
