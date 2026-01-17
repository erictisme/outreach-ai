'use client'

import { cn } from '@/lib/utils'

// Status type definition
export type Status = 'not_contacted' | 'email_sent' | 'replied' | 'meeting_secured' | 'rejected' | 'closed'

// Status configuration with labels and colors
export const STATUS_CONFIG: Record<Status, { label: string; color: string }> = {
  not_contacted: { label: 'Not Contacted', color: 'text-gray-600 bg-gray-100' },
  email_sent: { label: 'Email Sent', color: 'text-blue-600 bg-blue-100' },
  replied: { label: 'Replied', color: 'text-green-600 bg-green-100' },
  meeting_secured: { label: 'Meeting Secured', color: 'text-purple-600 bg-purple-100' },
  rejected: { label: 'Rejected', color: 'text-red-600 bg-red-100' },
  closed: { label: 'Closed', color: 'text-gray-800 bg-gray-200' },
}

export const STATUS_OPTIONS: Status[] = [
  'not_contacted',
  'email_sent',
  'replied',
  'meeting_secured',
  'rejected',
  'closed',
]

interface StatusDropdownProps {
  value: Status
  onChange?: (status: Status) => void
  disabled?: boolean
}

export function StatusDropdown({ value, onChange, disabled }: StatusDropdownProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange?.(e.target.value as Status)}
      disabled={disabled}
      className={cn(
        'px-2 py-1 rounded text-xs font-medium cursor-pointer',
        'border border-transparent hover:border-gray-300 focus:border-blue-400',
        'focus:ring-2 focus:ring-blue-400 focus:outline-none',
        'transition-colors',
        STATUS_CONFIG[value].color,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_CONFIG[status].label}
        </option>
      ))}
    </select>
  )
}
