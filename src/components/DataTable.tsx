'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Company, Person, EmailDraft } from '@/types'
import { StatusDropdown, Status } from './StatusDropdown'
import { useToast } from './ui/Toast'
import { Copy, Mail, Download, Loader2, RefreshCw, Trash2, X } from 'lucide-react'

// Combined row type for unified display
export interface DataTableRow {
  company: Company
  contact: Person | null
  email: EmailDraft | null
  status: Status
  dateSent: string | null // ISO date string
}

interface DataTableProps {
  data: DataTableRow[]
  onStatusChange?: (index: number, status: Status) => void
  onDateChange?: (index: number, date: string | null) => void
  onBulkDelete?: (indices: number[]) => void
  onBulkStatusChange?: (indices: number[], status: Status) => void
  isSaving?: boolean
  onRetry?: () => void
}

export function DataTable({ data, onStatusChange, onDateChange, onBulkDelete, onBulkStatusChange, isSaving, onRetry }: DataTableProps) {
  const { addToast } = useToast()
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // Generate stable row IDs for selection
  const rowIds = useMemo(() => {
    return data.map((row, index) => `${row.company.id}-${row.contact?.id || index}`)
  }, [data])

  const isAllSelected = data.length > 0 && selectedRows.size === data.length
  const isPartiallySelected = selectedRows.size > 0 && selectedRows.size < data.length

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(data.map((_, i) => i)))
    }
  }

  const handleSelectRow = (index: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    setSelectedRows(newSelected)
  }

  const handleClearSelection = () => {
    setSelectedRows(new Set())
  }

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedRows.size > 0) {
      onBulkDelete(Array.from(selectedRows))
      setSelectedRows(new Set())
    }
  }

  const handleBulkStatusChange = (status: Status) => {
    if (onBulkStatusChange && selectedRows.size > 0) {
      onBulkStatusChange(Array.from(selectedRows), status)
      setSelectedRows(new Set())
    }
  }

  const handleExportSelected = () => {
    const selectedData = data.filter((_, i) => selectedRows.has(i))
    const headers = ['Company', 'Website', 'Contact', 'Title', 'Email', 'Status', 'Date Sent']
    const rows = selectedData.map(row => [
      row.company.name,
      row.company.website || '',
      row.contact?.name || '',
      row.contact?.title || '',
      row.contact?.email || '',
      row.status,
      row.dateSent || ''
    ])

    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows.map(r => r.map(escapeCSV).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `outreach-selected-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    addToast(`Exported ${selectedData.length} selected row${selectedData.length === 1 ? '' : 's'}`, 'success')
  }

  const handleCopyTSV = async () => {
    const headers = ['Company', 'Website', 'Contact', 'Title', 'Email', 'Status', 'Date Sent']
    const rows = data.map(row => [
      row.company.name,
      row.company.website || '',
      row.contact?.name || '',
      row.contact?.title || '',
      row.contact?.email || '',
      row.status,
      row.dateSent || ''
    ])
    const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n')

    try {
      await navigator.clipboard.writeText(tsv)
      addToast('Copied as TSV to clipboard', 'success')
    } catch {
      addToast('Failed to copy to clipboard', 'error')
    }
  }

  const handleCopyEmails = async () => {
    const emails = data
      .map(row => row.contact?.email)
      .filter((email): email is string => !!email)

    if (emails.length === 0) {
      addToast('No email addresses to copy', 'warning')
      return
    }

    try {
      await navigator.clipboard.writeText(emails.join('\n'))
      addToast(`Copied ${emails.length} email${emails.length === 1 ? '' : 's'} to clipboard`, 'success')
    } catch {
      addToast('Failed to copy to clipboard', 'error')
    }
  }

  const handleExportCSV = () => {
    const headers = ['Company', 'Website', 'Contact', 'Title', 'Email', 'Status', 'Date Sent']
    const rows = data.map(row => [
      row.company.name,
      row.company.website || '',
      row.contact?.name || '',
      row.contact?.title || '',
      row.contact?.email || '',
      row.status,
      row.dateSent || ''
    ])

    // Escape CSV values properly
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const csv = [
      headers.map(escapeCSV).join(','),
      ...rows.map(r => r.map(escapeCSV).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `outreach-data-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    addToast('CSV file downloaded', 'success')
  }

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
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          {selectedRows.size > 0 ? (
            <>
              {/* Selection count and bulk actions */}
              <span className="text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-md">
                {selectedRows.size} row{selectedRows.size === 1 ? '' : 's'} selected
              </span>
              <button
                onClick={handleClearSelection}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
              <div className="w-px h-6 bg-gray-300" />
              {onBulkDelete && (
                <button
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
              {onBulkStatusChange && (
                <select
                  onChange={(e) => handleBulkStatusChange(e.target.value as Status)}
                  value=""
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <option value="" disabled>Change Status</option>
                  <option value="not_contacted">Not Contacted</option>
                  <option value="email_sent">Email Sent</option>
                  <option value="replied">Replied</option>
                  <option value="meeting_booked">Meeting Booked</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              )}
              <button
                onClick={handleExportSelected}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export Selected
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleCopyTSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy as TSV
              </button>
              <button
                onClick={handleCopyEmails}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Copy Emails Only
              </button>
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </>
          )}
        </div>

        {/* Saving indicator and retry button */}
        <div className="flex items-center gap-2">
          {isSaving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
          {onRetry && !isSaving && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 w-10">
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isPartiallySelected
                }}
                onChange={handleSelectAll}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                aria-label="Select all rows"
              />
            </th>
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
            const isSelected = selectedRows.has(index)

            return (
              <tr
                key={rowIds[index]}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  needsFollowUp && 'bg-amber-50 hover:bg-amber-100',
                  isSelected && 'bg-blue-50 hover:bg-blue-100'
                )}
              >
                {/* Checkbox */}
                <td className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleSelectRow(index)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    aria-label={`Select row ${index + 1}`}
                  />
                </td>

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
                  <StatusDropdown
                    value={row.status}
                    onChange={(status) => onStatusChange?.(index, status)}
                  />
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
