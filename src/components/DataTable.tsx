'use client'

import { cn } from '@/lib/utils'
import { Company, Person, EmailDraft } from '@/types'

// Combined row type for unified display
export interface DataTableRow {
  company: Company
  contact: Person | null
  email: EmailDraft | null
  status: 'not_contacted' | 'email_sent' | 'replied' | 'meeting_secured' | 'rejected' | 'closed'
  dateSent: string | null // ISO date string
}

interface DataTableProps {
  data: DataTableRow[]
  onStatusChange?: (index: number, status: DataTableRow['status']) => void
  onDateChange?: (index: number, date: string | null) => void
}

// Status configuration
const STATUS_CONFIG: Record<DataTableRow['status'], { label: string; color: string }> = {
  not_contacted: { label: 'Not Contacted', color: 'text-gray-600 bg-gray-100' },
  email_sent: { label: 'Email Sent', color: 'text-blue-600 bg-blue-100' },
  replied: { label: 'Replied', color: 'text-green-600 bg-green-100' },
  meeting_secured: { label: 'Meeting Secured', color: 'text-purple-600 bg-purple-100' },
  rejected: { label: 'Rejected', color: 'text-red-600 bg-red-100' },
  closed: { label: 'Closed', color: 'text-gray-800 bg-gray-200' },
}

const STATUS_OPTIONS: DataTableRow['status'][] = [
  'not_contacted',
  'email_sent',
  'replied',
  'meeting_secured',
  'rejected',
  'closed',
]

export function DataTable({ data, onStatusChange, onDateChange }: DataTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <p className="text-lg font-medium mb-2">No data yet</p>
        <p className="text-sm">Use the wizard to add companies and contacts.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Contact</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Date Sent</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, index) => {
            // Calculate if follow-up is needed
            const daysSinceSent = row.dateSent
              ? Math.floor((Date.now() - new Date(row.dateSent).getTime()) / (1000 * 60 * 60 * 24))
              : null
            const needsFollowUp = row.status === 'email_sent' && daysSinceSent !== null && daysSinceSent >= 3

            return (
              <tr
                key={`${row.company.id}-${row.contact?.id || index}`}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  needsFollowUp && 'bg-amber-50 hover:bg-amber-100'
                )}
              >
                {/* Company */}
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{row.company.name}</div>
                  {row.company.website && (
                    <a
                      href={row.company.website.startsWith('http') ? row.company.website : `https://${row.company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {row.company.domain || row.company.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </td>

                {/* Contact */}
                <td className="px-4 py-3 text-gray-900">
                  {row.contact?.name || <span className="text-gray-400">-</span>}
                </td>

                {/* Title */}
                <td className="px-4 py-3 text-gray-600">
                  {row.contact?.title || <span className="text-gray-400">-</span>}
                </td>

                {/* Email */}
                <td className="px-4 py-3">
                  {row.contact?.email ? (
                    <a
                      href={`mailto:${row.contact.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.contact.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <select
                    value={row.status}
                    onChange={(e) => onStatusChange?.(index, e.target.value as DataTableRow['status'])}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer focus:ring-2 focus:ring-blue-400',
                      STATUS_CONFIG[row.status].color
                    )}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_CONFIG[status].label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Date Sent */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={row.dateSent || ''}
                      onChange={(e) => onDateChange?.(index, e.target.value || null)}
                      className="px-2 py-1 text-sm border border-gray-200 rounded focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                    {needsFollowUp && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800">
                        Follow-up
                      </span>
                    )}
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.email && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`Subject: ${row.email?.subject}\n\n${row.email?.body}`)
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                      >
                        Copy Email
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
