'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, Copy, Check, Plus, Sparkles, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmailDraft, Message, Conversation, Person, Company, ResponseType, ProjectContext } from '@/types'

interface ConversationModalProps {
  isOpen: boolean
  contact: Person
  company: Company
  initialEmail: EmailDraft
  existingConversation?: Conversation
  projectContext?: ProjectContext
  onClose: () => void
  onSave: (conversation: Conversation) => void
}

const RESPONSE_TYPE_OPTIONS: { value: ResponseType; label: string }[] = [
  { value: 'schedule', label: 'Schedule Meeting' },
  { value: 'confirm', label: 'Confirm Details' },
  { value: 'reschedule', label: 'Reschedule' },
  { value: 'thankyou', label: 'Thank You' },
  { value: 'clarify', label: 'Clarify' },
  { value: 'custom', label: 'General' },
]

export function ConversationModal({
  isOpen,
  contact,
  company,
  initialEmail,
  existingConversation,
  projectContext,
  onClose,
  onSave,
}: ConversationModalProps) {
  // Initialize conversation from existing or create new
  const [conversation, setConversation] = useState<Conversation>(() => {
    if (existingConversation) {
      return existingConversation
    }
    // Create new conversation with initial email as first message
    return {
      id: `conv-${contact.id}-${Date.now()}`,
      personId: contact.id,
      companyId: company.id,
      status: 'awaiting_reply',
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender: 'you',
          subject: initialEmail.subject,
          content: initialEmail.body,
          timestamp: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  })

  const [copiedField, setCopiedField] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Reply handling state
  const [replyText, setReplyText] = useState('')
  const [responseType, setResponseType] = useState<ResponseType>('custom')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedResponse, setGeneratedResponse] = useState<{ subject: string; body: string } | null>(null)
  const [showResponseTypeDropdown, setShowResponseTypeDropdown] = useState(false)

  // Reset conversation when modal opens with new contact
  useEffect(() => {
    if (isOpen) {
      if (existingConversation) {
        setConversation(existingConversation)
      } else {
        setConversation({
          id: `conv-${contact.id}-${Date.now()}`,
          personId: contact.id,
          companyId: company.id,
          status: 'awaiting_reply',
          messages: [
            {
              id: `msg-${Date.now()}`,
              sender: 'you',
              subject: initialEmail.subject,
              content: initialEmail.body,
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      }
    }
  }, [isOpen, contact.id, existingConversation, initialEmail, company.id])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation.messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldId)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  const handleSaveAndClose = () => {
    const updatedConversation = {
      ...conversation,
      updatedAt: Date.now(),
    }
    onSave(updatedConversation)
    onClose()
  }

  // Add their reply to the thread
  const handleAddReply = () => {
    if (!replyText.trim()) return

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'them',
      content: replyText.trim(),
      timestamp: Date.now(),
    }

    setConversation((prev) => ({
      ...prev,
      status: 'reply_received',
      messages: [...prev.messages, newMessage],
      updatedAt: Date.now(),
    }))

    setReplyText('')
    setGeneratedResponse(null)
  }

  // Generate AI response
  const handleGenerateResponse = async () => {
    if (!projectContext) {
      console.error('Project context required for response generation')
      return
    }

    setIsGenerating(true)
    setGeneratedResponse(null)

    try {
      const response = await fetch('/api/draft-response', {
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
    } catch (error) {
      console.error('Error generating response:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  // Add generated response to thread as sent message
  const handleSendResponse = () => {
    if (!generatedResponse) return

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'you',
      subject: generatedResponse.subject,
      content: generatedResponse.body,
      timestamp: Date.now(),
    }

    setConversation((prev) => ({
      ...prev,
      status: 'awaiting_reply',
      messages: [...prev.messages, newMessage],
      updatedAt: Date.now(),
    }))

    setGeneratedResponse(null)
  }

  // Check if last message is from them (we need to respond)
  const lastMessage = conversation.messages[conversation.messages.length - 1]
  const awaitingOurResponse = lastMessage?.sender === 'them'

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {contact.name}
            </h2>
            <p className="text-sm text-gray-500">
              {contact.title} at {company.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
          {conversation.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onCopy={handleCopy}
              copiedField={copiedField}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Input Section */}
        <div className="border-t border-gray-200 p-4 space-y-3">
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

        {/* Footer with Save button */}
        <div className="border-t border-gray-200 p-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Save & Close
          </button>
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
    <div
      className={cn('flex', isYou ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg p-3 space-y-2',
          isYou
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 text-gray-900'
        )}
      >
        {/* Subject line if present */}
        {message.subject && (
          <div className={cn(
            'text-xs font-medium pb-1 border-b',
            isYou ? 'border-blue-400 text-blue-100' : 'border-gray-300 text-gray-500'
          )}>
            Subject: {message.subject}
          </div>
        )}

        {/* Message content */}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Footer with timestamp and copy */}
        <div className={cn(
          'flex items-center justify-between pt-1',
          isYou ? 'text-blue-200' : 'text-gray-400'
        )}>
          <span className="text-xs">
            {formatTimestamp(message.timestamp)}
          </span>
          <button
            onClick={() => onCopy(message.content, copyId)}
            className={cn(
              'flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors',
              isYou
                ? 'hover:bg-blue-500 text-blue-100'
                : 'hover:bg-gray-200 text-gray-500'
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
    return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}
