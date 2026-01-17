'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Company, Person, EmailDraft } from '@/types'
import { StatusDropdown, Status } from './StatusDropdown'
import { useToast } from './ui/Toast'
import { Copy, Mail, Download, Loader2, RefreshCw, Trash2, X, ChevronUp, ChevronDown, Search, Filter } from 'lucide-react'

// Sort configuration
type SortField = 'company' | 'contact' | 'title' | 'email' | 'status' | 'dateSent'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  field: SortField | null
  direction: SortDirection
}

// Filter options
type FilterOption = 'all' | 'needs_contact' | 'needs_email' | 'needs_followup'

interface TablePreferences {
  sort: SortConfig
  filter: FilterOption
  search: string
}

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
  projectId: string
  onStatusChange?: (index: number, status: Status) => void
  onDateChange?: (index: number, date: string | null) => void
  onBulkDelete?: (indices: number[]) => void
  onBulkStatusChange?: (indices: number[], status: Status) => void
  isSaving?: boolean
  onRetry?: () => void
}

const STORAGE_KEY_PREFIX = 'outreach-table-prefs-'

const defaultPreferences: TablePreferences = {
  sort: { field: null, direction: 'asc' },
  filter: 'all',
  search: ''
}

// Sortable header component
function SortableHeader({
  field,
  label,
  sort,
  onSort
}: {
  field: SortField
  label: string
  sort: SortConfig
  onSort: (field: SortField) => void
}) {
  const isActive = sort.field === field
  return (
    <th
      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="flex flex-col">
          <ChevronUp
            className={cn(
              'w-3 h-3 -mb-1',
              isActive && sort.direction === 'asc' ? 'text-blue-600' : 'text-gray-300'
            )}
          />
          <ChevronDown
            className={cn(
              'w-3 h-3 -mt-1',
              isActive && sort.direction === 'desc' ? 'text-blue-600' : 'text-gray-300'
            )}
          />
        </span>
      </div>
    </th>
  )
}

export function DataTable({ data, projectId, onStatusChange, onDateChange, onBulkDelete, onBulkStatusChange, isSaving, onRetry }: DataTableProps) {
  const { addToast } = useToast()
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())

  // Load preferences from localStorage
  const [preferences, setPreferences] = useState<TablePreferences>(defaultPreferences)

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${projectId}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as TablePreferences
        setPreferences(parsed)
      } catch {
        // Invalid stored data, use defaults
      }
    }
  }, [projectId])

  // Save preferences to localStorage
  const savePreferences = useCallback((newPrefs: TablePreferences) => {
    setPreferences(newPrefs)
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${projectId}`, JSON.stringify(newPrefs))
  }, [projectId])

  const handleSort = (field: SortField) => {
    const newDirection: SortDirection =
      preferences.sort.field === field && preferences.sort.direction === 'asc' ? 'desc' : 'asc'
    savePreferences({
      ...preferences,
      sort: { field, direction: newDirection }
    })
  }

  const handleFilterChange = (filter: FilterOption) => {
    savePreferences({ ...preferences, filter })
  }

  const handleSearchChange = (search: string) => {
    savePreferences({ ...preferences, search })
  }

  const handleClearFilters = () => {
    savePreferences(defaultPreferences)
  }

  const hasActiveFilters = preferences.filter !== 'all' || preferences.search !== '' || preferences.sort.field !== null

  // Filter and sort data
  const processedData = useMemo(() => {
    // Create array with original indices
    let result = data.map((row, originalIndex) => ({ row, originalIndex }))

    // Apply search filter
    if (preferences.search) {
      const searchLower = preferences.search.toLowerCase()
      result = result.filter(({ row }) =>
        row.company.name.toLowerCase().includes(searchLower) ||
        (row.contact?.name?.toLowerCase().includes(searchLower) ?? false)
      )
    }

    // Apply status filter
    if (preferences.filter !== 'all') {
      result = result.filter(({ row }) => {
        const daysSinceSent = row.dateSent
          ? Math.floor((Date.now() - new Date(row.dateSent).getTime()) / (1000 * 60 * 60 * 24))
          : null

        switch (preferences.filter) {
          case 'needs_contact':
            return !row.contact || !row.contact.name
          case 'needs_email':
            return row.contact && row.contact.name && !row.contact.email
          case 'needs_followup':
            return row.status === 'email_sent' && daysSinceSent !== null && daysSinceSent >= 3
          default:
            return true
        }
      })
    }

    // Apply sorting
    if (preferences.sort.field) {
      const { field, direction } = preferences.sort
      result.sort((a, b) => {
        let aVal: string = ''
        let bVal: string = ''

        switch (field) {
          case 'company':
            aVal = a.row.company.name.toLowerCase()
            bVal = b.row.company.name.toLowerCase()
            break
          case 'contact':
            aVal = (a.row.contact?.name || '').toLowerCase()
            bVal = (b.row.contact?.name || '').toLowerCase()
            break
          case 'title':
            aVal = (a.row.contact?.title || '').toLowerCase()
            bVal = (b.row.contact?.title || '').toLowerCase()
            break
          case 'email':
            aVal = (a.row.contact?.email || '').toLowerCase()
            bVal = (b.row.contact?.email || '').toLowerCase()
            break
          case 'status':
            aVal = a.row.status
            bVal = b.row.status
            break
          case 'dateSent':
            aVal = a.row.dateSent || ''
            bVal = b.row.dateSent || ''
            break
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1
        if (aVal > bVal) return direction === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [data, preferences.search, preferences.filter, preferences.sort])

  // Generate stable row IDs for selection (using processed data)
  const rowIds = useMemo(() => {
    return processedData.map(({ row, originalIndex }) => `${row.company.id}-${row.contact?.id || originalIndex}`)
  }, [processedData])

  // Selection uses original indices to maintain consistency with callbacks
  const visibleOriginalIndices = useMemo(() =>
    processedData.map(({ originalIndex }) => originalIndex),
    [processedData]
  )

  const selectedVisibleCount = visibleOriginalIndices.filter(i => selectedRows.has(i)).length
  const isAllSelected = processedData.length > 0 && selectedVisibleCount === processedData.length
  const isPartiallySelected = selectedVisibleCount > 0 && selectedVisibleCount < processedData.length

  const handleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all visible rows
      const newSelected = new Set(selectedRows)
      visibleOriginalIndices.forEach(i => newSelected.delete(i))
      setSelectedRows(newSelected)
    } else {
      // Select all visible rows
      const newSelected = new Set(selectedRows)
      visibleOriginalIndices.forEach(i => newSelected.add(i))
      setSelectedRows(newSelected)
    }
  }

  const handleSelectRow = (originalIndex: number) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(originalIndex)) {
      newSelected.delete(originalIndex)
    } else {
      newSelected.add(originalIndex)
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

      {/* Filter and search row */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
        {/* Search input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search company or contact..."
            value={preferences.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Filter dropdown */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={preferences.filter}
            onChange={(e) => handleFilterChange(e.target.value as FilterOption)}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:border-blue-400 focus:ring-1 focus:ring-blue-400 cursor-pointer"
          >
            <option value="all">All</option>
            <option value="needs_contact">Needs Contact</option>
            <option value="needs_email">Needs Email</option>
            <option value="needs_followup">Needs Follow-up</option>
          </select>
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}

        {/* Result count */}
        <span className="text-xs text-gray-500 ml-auto">
          {processedData.length === data.length
            ? `${data.length} row${data.length === 1 ? '' : 's'}`
            : `${processedData.length} of ${data.length} row${data.length === 1 ? '' : 's'}`
          }
        </span>
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
            <SortableHeader field="company" label="Company" sort={preferences.sort} onSort={handleSort} />
            <SortableHeader field="contact" label="Contact" sort={preferences.sort} onSort={handleSort} />
            <SortableHeader field="title" label="Title" sort={preferences.sort} onSort={handleSort} />
            <SortableHeader field="email" label="Email" sort={preferences.sort} onSort={handleSort} />
            <SortableHeader field="status" label="Status" sort={preferences.sort} onSort={handleSort} />
            <SortableHeader field="dateSent" label="Date Sent" sort={preferences.sort} onSort={handleSort} />
            <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {processedData.map(({ row, originalIndex }, displayIndex) => {
            // Calculate if follow-up is needed
            const daysSinceSent = row.dateSent
              ? Math.floor((Date.now() - new Date(row.dateSent).getTime()) / (1000 * 60 * 60 * 24))
              : null
            const needsFollowUp = row.status === 'email_sent' && daysSinceSent !== null && daysSinceSent >= 3
            const isSelected = selectedRows.has(originalIndex)

            return (
              <tr
                key={rowIds[displayIndex]}
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
                    onChange={() => handleSelectRow(originalIndex)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                    aria-label={`Select row ${displayIndex + 1}`}
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
                    onChange={(status) => onStatusChange?.(originalIndex, status)}
                  />
                </td>

                {/* Date Sent */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={row.dateSent || ''}
                      onChange={(e) => onDateChange?.(originalIndex, e.target.value || null)}
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
