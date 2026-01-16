'use client'

import { Clock, MessageSquare, CheckCircle, XCircle, ChevronRight } from 'lucide-react'
import { Conversation, Person, Company, EmailDraft, ConversationStatus } from '@/types'
import { cn } from '@/lib/utils'

interface ConversationListProps {
  conversations: Conversation[]
  persons: Person[]
  companies: Company[]
  emails: EmailDraft[]
  onSelectConversation: (id: string) => void
  activeConversationId: string | null
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

export function ConversationList({
  conversations,
  persons,
  companies,
  emails,
  onSelectConversation,
  activeConversationId,
}: ConversationListProps) {
  // Sort conversations: reply_received first, then by updatedAt
  const sortedConversations = [...conversations].sort((a, b) => {
    // Priority: reply_received > awaiting_reply > meeting_set > declined > closed
    const statusPriority: Record<ConversationStatus, number> = {
      reply_received: 0,
      awaiting_reply: 1,
      meeting_set: 2,
      declined: 3,
      closed: 4,
    }
    const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
    if (priorityDiff !== 0) return priorityDiff
    return b.updatedAt - a.updatedAt
  })

  if (conversations.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No conversations yet</h3>
        <p className="text-gray-500">
          Conversations will appear here after you write and send emails in Step 7.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sortedConversations.map((conversation) => {
        const person = persons.find(p => p.id === conversation.personId)
        const company = companies.find(c => c.id === conversation.companyId)
        const email = conversation.initialEmailIndex !== undefined
          ? emails[conversation.initialEmailIndex]
          : undefined
        const config = STATUS_CONFIG[conversation.status]
        const StatusIcon = config.icon
        const isActive = conversation.id === activeConversationId

        if (!person) return null

        return (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation.id)}
            className={cn(
              'w-full text-left p-4 rounded-lg border transition-all',
              isActive
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900 truncate">
                    {person.name}
                  </span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-600 truncate">
                    {company?.name || person.company}
                  </span>
                </div>
                <div className="text-sm text-gray-500 truncate mb-2">
                  {person.title}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                    config.bgColor,
                    config.color
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {config.label}
                  </span>
                  {conversation.meetingDetails && (
                    <span className="text-xs text-gray-500">
                      {conversation.meetingDetails}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>{formatRelativeTime(conversation.updatedAt)}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
            {email && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 truncate">
                  Last: {email.subject}
                </p>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
