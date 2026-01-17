'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmailDraft, Message, Conversation, Person, Company } from '@/types'

interface ConversationModalProps {
  isOpen: boolean
  contact: Person
  company: Company
  initialEmail: EmailDraft
  existingConversation?: Conversation
  onClose: () => void
  onSave: (conversation: Conversation) => void
}

export function ConversationModal({
  isOpen,
  contact,
  company,
  initialEmail,
  existingConversation,
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
