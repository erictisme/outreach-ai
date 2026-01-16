'use client'

import { useState } from 'react'
import { Copy, Check, Download, Trash2, CheckCircle, AlertCircle, XCircle, Loader2, Shield, ExternalLink } from 'lucide-react'
import { Company, Person, EmailDraft, VerificationStatus } from '@/types'

// Verification status indicator component
function VerificationBadge({ status, source }: { status: VerificationStatus; source?: string }) {
  const icons = {
    verified: <CheckCircle className="w-4 h-4 text-green-600" />,
    unverified: <AlertCircle className="w-4 h-4 text-yellow-600" />,
    failed: <XCircle className="w-4 h-4 text-red-600" />,
  }

  const labels = {
    verified: 'Verified',
    unverified: 'Unverified',
    failed: 'Failed',
  }

  return (
    <div className="flex items-center gap-1" title={source ? `Source: ${source}` : undefined}>
      {icons[status]}
      <span className={`text-xs ${
        status === 'verified' ? 'text-green-600' :
        status === 'unverified' ? 'text-yellow-600' :
        'text-red-600'
      }`}>
        {labels[status]}
      </span>
    </div>
  )
}

// Email certainty indicator
function EmailCertainty({ certainty, source }: { certainty: number; source?: string }) {
  const color = certainty >= 80 ? 'text-green-600' :
                certainty >= 50 ? 'text-yellow-600' :
                'text-gray-400'

  return (
    <div className="flex items-center gap-1" title={source || undefined}>
      <span className={`text-xs font-medium ${color}`}>
        {certainty > 0 ? `${certainty}%` : '-'}
      </span>
      {certainty >= 80 && <CheckCircle className="w-3 h-3 text-green-600" />}
    </div>
  )
}

// Seniority badge component
function SeniorityBadge({ seniority }: { seniority?: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    'Executive': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'C-Suite' },
    'Director': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Director' },
    'Manager': { bg: 'bg-green-100', text: 'text-green-700', label: 'Manager' },
    'Staff': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Staff' },
    'Unknown': { bg: 'bg-gray-50', text: 'text-gray-400', label: '-' },
  }

  const style = config[seniority || 'Unknown'] || config['Unknown']

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

interface ResultsTableProps {
  type: 'companies' | 'persons' | 'emails'
  data: Company[] | Person[] | EmailDraft[]
  selectedIds?: Set<number>
  onSelectionChange?: (ids: Set<number>) => void
  onDelete?: (index: number) => void
  onVerifyEmail?: (index: number) => Promise<void>
  onFindEmail?: (index: number) => Promise<void>
  verifyingIds?: Set<number>
  findingEmailIds?: Set<number>
}

export function ResultsTable({ type, data, selectedIds, onSelectionChange, onDelete, onVerifyEmail, onFindEmail, verifyingIds, findingEmailIds }: ResultsTableProps) {
  const [copied, setCopied] = useState(false)

  const toggleSelect = (index: number) => {
    if (!onSelectionChange || !selectedIds) return
    const newSelected = new Set(selectedIds)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    onSelectionChange(newSelected)
  }

  const toggleSelectAll = () => {
    if (!onSelectionChange || !selectedIds) return
    if (selectedIds.size === data.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(data.map((_, i) => i)))
    }
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data yet. Run the pipeline to generate results.
      </div>
    )
  }

  const copyToClipboard = () => {
    let text = ''

    if (type === 'companies') {
      const companies = data as Company[]
      const headers = ['Company', 'Type', 'Website', 'Description', 'Relevance', 'Status']
      text = headers.join('\t') + '\n'
      text += companies.map(c =>
        [c.name, c.type, c.website, c.description, c.relevance, c.status].join('\t')
      ).join('\n')
    } else if (type === 'persons') {
      const persons = data as Person[]
      const headers = ['Company', 'Name', 'Title', 'Email', 'LinkedIn', 'Source']
      text = headers.join('\t') + '\n'
      text += persons.map(p =>
        [p.company, p.name, p.title, p.email, p.linkedin, p.emailSource].join('\t')
      ).join('\n')
    } else if (type === 'emails') {
      const emails = data as EmailDraft[]
      text = emails.map(e =>
        `To: ${e.to.name} (${e.to.email})\nCompany: ${e.company.name}\nSubject: ${e.subject}\n\n${e.body}\n\n---\n`
      ).join('\n')
    }

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCSV = () => {
    let csv = ''

    if (type === 'companies') {
      const companies = data as Company[]
      csv = 'Company,Type,Website,Description,Relevance,Status\n'
      csv += companies.map(c =>
        [c.name, c.type, c.website, c.description, c.relevance, c.status]
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ).join('\n')
    } else if (type === 'persons') {
      const persons = data as Person[]
      csv = 'Company,Name,Title,Email,LinkedIn,Source\n'
      csv += persons.map(p =>
        [p.company, p.name, p.title, p.email, p.linkedin, p.emailSource]
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(',')
      ).join('\n')
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {data.length} {type}
        </span>
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors border border-gray-300"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy TSV'}
          </button>
          {type !== 'emails' && (
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors border border-gray-300"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        {type === 'companies' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {selectedIds && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === data.length && data.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Website</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Verified</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Relevance</th>
                {onDelete && <th className="px-4 py-3 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data as Company[]).map((company, i) => (
                <tr
                  key={company.id || i}
                  onClick={() => selectedIds && toggleSelect(i)}
                  className={`
                    ${selectedIds ? 'cursor-pointer' : ''}
                    ${selectedIds && !selectedIds.has(i) ? 'opacity-40' : ''}
                    ${company.verificationStatus === 'failed' ? 'bg-red-50/50' : ''}
                    ${selectedIds && selectedIds.has(i) ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}
                  `}
                >
                  {selectedIds && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(i)}
                        onChange={() => toggleSelect(i)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-gray-900">{company.name}</td>
                  <td className="px-4 py-3 text-gray-600">{company.type}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {company.website ? (
                      <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {company.domain || company.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs italic">Not found</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <VerificationBadge
                      status={company.verificationStatus || 'unverified'}
                      source={company.verificationSource}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{company.relevance}</td>
                  {onDelete && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDelete(i)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove company"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {type === 'persons' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {selectedIds && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === data.length && data.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-600">Company</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Level</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">LinkedIn</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Certainty</th>
                {onVerifyEmail && <th className="px-4 py-3 text-left font-medium text-gray-600">Verify</th>}
                <th className="px-4 py-3 text-left font-medium text-gray-600">Source</th>
                {onDelete && <th className="px-4 py-3 w-10"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data as Person[]).map((person, i) => (
                <tr
                  key={person.id || i}
                  onClick={() => selectedIds && toggleSelect(i)}
                  className={`
                    ${selectedIds ? 'cursor-pointer' : ''}
                    ${selectedIds && !selectedIds.has(i) ? 'opacity-40' : ''}
                    ${selectedIds && selectedIds.has(i) ? 'hover:bg-blue-50' : 'hover:bg-gray-50'}
                  `}
                >
                  {selectedIds && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(i)}
                        onChange={() => toggleSelect(i)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600">{person.company}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{person.name}</td>
                  <td className="px-4 py-3 text-gray-600">{person.title}</td>
                  <td className="px-4 py-3">
                    <SeniorityBadge seniority={person.seniority} />
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {person.linkedin ? (
                      <a
                        href={person.linkedin.startsWith('http') ? person.linkedin : `https://${person.linkedin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                        title={person.linkedin}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="text-xs">Profile</span>
                      </a>
                    ) : (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {person.email ? (
                      <div className="flex flex-col">
                        <a href={`mailto:${person.email}`} className="text-blue-600 hover:underline">
                          {person.email}
                        </a>
                        {(person.emailCertainty || 0) < 80 && (
                          <span className="text-xs text-amber-600 italic">
                            ⚠️ {(person.emailCertainty || 0) < 50 ? 'Uncertain - pattern guess' : 'Likely correct'}
                          </span>
                        )}
                      </div>
                    ) : onFindEmail ? (
                      <button
                        onClick={() => onFindEmail(i)}
                        disabled={findingEmailIds?.has(i)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 rounded border border-amber-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Try to find email (uses credits)"
                      >
                        {findingEmailIds?.has(i) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {findingEmailIds?.has(i) ? 'Finding...' : 'Find Email'}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs italic">No email found</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EmailCertainty
                      certainty={person.emailCertainty || 0}
                      source={person.emailSource}
                    />
                  </td>
                  {onVerifyEmail && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {person.emailVerified ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      ) : person.email ? (
                        <button
                          onClick={() => onVerifyEmail(i)}
                          disabled={verifyingIds?.has(i)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Verify email with Hunter API (uses 1 credit)"
                        >
                          {verifyingIds?.has(i) ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Shield className="w-3 h-3" />
                          )}
                          {verifyingIds?.has(i) ? 'Verifying...' : 'Verify'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {person.source === 'apollo' ? 'Apollo' :
                       person.source === 'hunter' ? 'Hunter' :
                       person.source === 'apify' ? 'Apify' :
                       person.source === 'website_scrape' ? 'Website' :
                       person.source === 'web_research' ? 'AI' :
                       person.source === 'import' ? 'Import' :
                       person.source === 'manual' ? 'Manual' :
                       'AI'}
                    </span>
                  </td>
                  {onDelete && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDelete(i)}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Remove contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {type === 'emails' && (
          <div className="divide-y">
            {(data as EmailDraft[]).map((email, i) => (
              <div key={i} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{email.to.name}</p>
                    <p className="text-sm text-gray-500">{email.to.email} • {email.company.name}</p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
                    }}
                    className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded border border-gray-300"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm font-medium text-gray-700 mb-2">Subject: {email.subject}</p>
                <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans">{email.body}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
