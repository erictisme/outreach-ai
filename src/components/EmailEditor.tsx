'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Copy, Check, Sparkles, Loader2, Wand2 } from 'lucide-react'
import { EmailDraft, EmailVersion } from '@/types'
import { cn } from '@/lib/utils'

interface EmailEditorProps {
  emails: EmailDraft[]
  onEmailsChange: (emails: EmailDraft[]) => void
}

export function EmailEditor({ emails, onEmailsChange }: EmailEditorProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([0]))
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null)
  const [refinePrompt, setRefinePrompt] = useState('')

  // Bulk refinement state
  const [showBulkRefine, setShowBulkRefine] = useState(false)
  const [bulkPrompt, setBulkPrompt] = useState('')
  const [goldStandard, setGoldStandard] = useState('')
  const [bulkRefining, setBulkRefining] = useState(false)

  const toggleExpand = (index: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
    setRefinePrompt('')
  }

  const expandAll = () => {
    setExpandedIds(new Set(emails.map((_, i) => i)))
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  const [copiedField, setCopiedField] = useState<{ index: number; field: 'subject' | 'body' } | null>(null)

  const copyField = (index: number, field: 'subject' | 'body') => {
    const email = emails[index]
    const text = field === 'subject' ? email.subject : email.body
    navigator.clipboard.writeText(text)
    setCopiedField({ index, field })
    setTimeout(() => setCopiedField(null), 2000)
  }

  const updateEmail = (index: number, field: 'subject' | 'body', value: string) => {
    const updated = [...emails]
    updated[index] = { ...updated[index], [field]: value }
    onEmailsChange(updated)
  }

  // Save current state as a version before making changes
  const saveVersion = (index: number, prompt?: string): EmailDraft[] => {
    const updated = [...emails]
    const email = updated[index]
    const version: EmailVersion = {
      subject: email.subject,
      body: email.body,
      prompt,
      timestamp: Date.now(),
    }
    const versions = email.versions || []
    const currentIdx = email.currentVersionIndex ?? -1

    // If we're not at the latest version, truncate future versions
    const newVersions = currentIdx >= 0 && currentIdx < versions.length - 1
      ? [...versions.slice(0, currentIdx + 1), version]
      : [...versions, version]

    updated[index] = {
      ...email,
      versions: newVersions,
      currentVersionIndex: newVersions.length - 1,
    }
    return updated
  }

  // Navigate to a specific version
  const goToVersion = (emailIndex: number, direction: 'prev' | 'next') => {
    const email = emails[emailIndex]
    const versions = email.versions || []
    const currentIdx = email.currentVersionIndex ?? versions.length - 1

    let newIdx: number
    if (direction === 'prev') {
      newIdx = Math.max(0, currentIdx - 1)
    } else {
      newIdx = Math.min(versions.length - 1, currentIdx + 1)
    }

    if (newIdx !== currentIdx && versions[newIdx]) {
      const updated = [...emails]
      updated[emailIndex] = {
        ...email,
        subject: versions[newIdx].subject,
        body: versions[newIdx].body,
        currentVersionIndex: newIdx,
      }
      onEmailsChange(updated)
    }
  }

  const refineWithAI = async (index: number) => {
    if (!refinePrompt.trim()) return

    // Save current version first
    let updated = saveVersion(index, refinePrompt)
    onEmailsChange(updated)

    setRefiningIndex(index)
    try {
      const res = await fetch('/api/refine-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: updated[index],
          instruction: refinePrompt,
        }),
      })

      if (!res.ok) throw new Error('Failed to refine email')

      const data = await res.json()
      updated = [...updated]
      updated[index] = {
        ...updated[index],
        subject: data.subject,
        body: data.body,
      }
      onEmailsChange(updated)
      setRefinePrompt('')
    } catch (error) {
      console.error('Refine error:', error)
    } finally {
      setRefiningIndex(null)
    }
  }

  // Bulk refine all emails
  const bulkRefineAll = async () => {
    if (!bulkPrompt.trim() && !goldStandard.trim()) return

    setBulkRefining(true)
    try {
      // Save versions for all emails first
      let updated = [...emails]
      for (let i = 0; i < updated.length; i++) {
        const email = updated[i]
        const version: EmailVersion = {
          subject: email.subject,
          body: email.body,
          prompt: bulkPrompt || 'Bulk style match',
          timestamp: Date.now(),
        }
        const versions = email.versions || []
        updated[i] = {
          ...email,
          versions: [...versions, version],
          currentVersionIndex: versions.length,
        }
      }
      onEmailsChange(updated)

      // Call bulk refine API
      const res = await fetch('/api/refine-email-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: updated,
          instruction: bulkPrompt,
          goldStandard: goldStandard,
        }),
      })

      if (!res.ok) throw new Error('Failed to bulk refine emails')

      const data = await res.json()

      // Update all emails with refined versions
      updated = [...updated]
      for (let i = 0; i < data.emails.length; i++) {
        updated[i] = {
          ...updated[i],
          subject: data.emails[i].subject,
          body: data.emails[i].body,
        }
      }
      onEmailsChange(updated)
      setBulkPrompt('')
      setGoldStandard('')
      setShowBulkRefine(false)
    } catch (error) {
      console.error('Bulk refine error:', error)
    } finally {
      setBulkRefining(false)
    }
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No emails yet. Run the pipeline to generate emails.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with expand/collapse and bulk refine */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{emails.length} emails</span>
          <button
            onClick={() => {
              if (expandedIds.size === emails.length) {
                collapseAll()
              } else {
                expandAll()
              }
            }}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            {expandedIds.size === emails.length ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
        <button
          onClick={() => setShowBulkRefine(!showBulkRefine)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors border",
            showBulkRefine
              ? "bg-purple-100 text-purple-700 border-purple-300"
              : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
          )}
        >
          <Wand2 className="w-4 h-4" />
          Edit All with AI
        </button>
      </div>

      {/* Bulk refinement panel */}
      {showBulkRefine && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-purple-800 mb-2">
              Refinement instruction (applies to all {emails.length} emails)
            </label>
            <input
              type="text"
              value={bulkPrompt}
              onChange={(e) => setBulkPrompt(e.target.value)}
              placeholder="e.g., Make all emails shorter, More professional tone..."
              className="w-full p-2 border border-purple-200 rounded-lg text-gray-900 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
              disabled={bulkRefining}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-800 mb-2">
              Or paste a gold standard email to match style
            </label>
            <textarea
              value={goldStandard}
              onChange={(e) => setGoldStandard(e.target.value)}
              placeholder="Paste an example email you've used before that you want all emails to match in style and tone..."
              rows={6}
              className="w-full p-3 border border-purple-200 rounded-lg text-gray-900 text-sm font-mono focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none resize-y"
              disabled={bulkRefining}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowBulkRefine(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={bulkRefining}
            >
              Cancel
            </button>
            <button
              onClick={bulkRefineAll}
              disabled={bulkRefining || (!bulkPrompt.trim() && !goldStandard.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bulkRefining ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Apply to All {emails.length} Emails
            </button>
          </div>
        </div>
      )}

      {/* Email list */}
      <div className="space-y-3">
        {emails.map((email, index) => {
          const isExpanded = expandedIds.has(index)
          const isRefining = refiningIndex === index
          const versions = email.versions || []
          const currentVersionIdx = email.currentVersionIndex ?? versions.length - 1
          const hasVersions = versions.length > 0
          const canGoPrev = hasVersions && currentVersionIdx > 0
          const canGoNext = hasVersions && currentVersionIdx < versions.length - 1

          return (
            <div
              key={index}
              className={cn(
                "border rounded-lg transition-all",
                isExpanded ? "border-blue-300 shadow-sm" : "border-gray-200"
              )}
            >
              {/* Collapsed header - always visible */}
              <div
                onClick={() => toggleExpand(index)}
                className={cn(
                  "flex items-center justify-between p-4 cursor-pointer",
                  isExpanded ? "border-b" : ""
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{email.to.name}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-sm text-gray-500 truncate">{email.company.name}</span>
                    {hasVersions && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        v{currentVersionIdx + 1}/{versions.length}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 truncate mt-0.5">
                    {email.subject}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="p-4 space-y-4">
                  {/* Recipient info + version navigation */}
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      To: {email.to.name} &lt;{email.to.email}&gt;
                    </div>

                    {/* Version navigation */}
                    {hasVersions && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => goToVersion(index, 'prev')}
                          disabled={!canGoPrev}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            canGoPrev
                              ? "text-gray-600 hover:bg-gray-100"
                              : "text-gray-300 cursor-not-allowed"
                          )}
                          title="Previous version"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-gray-500 min-w-[60px] text-center">
                          Version {currentVersionIdx + 1} of {versions.length}
                        </span>
                        <button
                          onClick={() => goToVersion(index, 'next')}
                          disabled={!canGoNext}
                          className={cn(
                            "p-1.5 rounded transition-colors",
                            canGoNext
                              ? "text-gray-600 hover:bg-gray-100"
                              : "text-gray-300 cursor-not-allowed"
                          )}
                          title="Next version"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Show what prompt created this version */}
                  {hasVersions && versions[currentVersionIdx]?.prompt && (
                    <div className="text-xs text-gray-400 italic">
                      Refined with: "{versions[currentVersionIdx].prompt}"
                    </div>
                  )}

                  {/* Editable subject */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Subject</label>
                      <button
                        onClick={() => copyField(index, 'subject')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                      >
                        {copiedField?.index === index && copiedField?.field === 'subject' ? (
                          <>
                            <Check className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={email.subject}
                      onChange={(e) => updateEmail(index, 'subject', e.target.value)}
                      className="w-full p-2 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                    />
                  </div>

                  {/* Editable body */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-500">Body</label>
                      <button
                        onClick={() => copyField(index, 'body')}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                      >
                        {copiedField?.index === index && copiedField?.field === 'body' ? (
                          <>
                            <Check className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      value={email.body}
                      onChange={(e) => updateEmail(index, 'body', e.target.value)}
                      rows={10}
                      className="w-full p-3 border border-gray-200 rounded-lg text-gray-900 text-sm font-mono leading-relaxed focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-y"
                    />
                  </div>

                  {/* AI Refine section */}
                  <div className="pt-3 border-t">
                    <label className="block text-xs font-medium text-gray-500 mb-2">
                      Refine with AI
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refinePrompt}
                        onChange={(e) => setRefinePrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            refineWithAI(index)
                          }
                        }}
                        placeholder="e.g., Make it shorter, Add urgency, More formal..."
                        className="flex-1 p-2 border border-gray-200 rounded-lg text-gray-900 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                        disabled={isRefining}
                      />
                      <button
                        onClick={() => refineWithAI(index)}
                        disabled={isRefining || !refinePrompt.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isRefining ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Sparkles className="w-4 h-4" />
                        )}
                        Refine
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['Make it shorter', 'More formal', 'Add urgency', 'Friendlier tone', 'Add call-to-action'].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setRefinePrompt(suggestion)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
