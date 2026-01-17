'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, Copy, Trash2, Check, Clock, AlertCircle, CheckCircle } from 'lucide-react'
import { PromptLogEntry, getPromptLog, clearPromptLog, subscribeToPromptLog } from '@/lib/promptLogger'
import { cn } from '@/lib/utils'

interface PromptInspectorProps {
  isOpen: boolean
  onToggle: () => void
}

export function PromptInspector({ isOpen, onToggle }: PromptInspectorProps) {
  const [entries, setEntries] = useState<PromptLogEntry[]>([])
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Subscribe to log updates
  useEffect(() => {
    // Subscribe immediately - the subscription callback will set initial entries
    const unsubscribe = subscribeToPromptLog((newEntries) => {
      setEntries(newEntries)
    })

    return unsubscribe
  }, [])

  // Handle copy to clipboard
  const handleCopy = async (text: string, id: string, type: 'request' | 'response') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(`${id}-${type}`)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Handle clear all
  const handleClear = () => {
    clearPromptLog()
    setExpandedEntry(null)
  }

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Format duration
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '...'
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // Get status icon
  const StatusIcon = ({ status }: { status: PromptLogEntry['status'] }) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500 animate-pulse" />
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
    }
  }

  // Format JSON for display
  const formatJSON = (data: unknown) => {
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
  }

  // Get endpoint display name
  const getEndpointName = (endpoint: string) => {
    const parts = endpoint.split('/')
    return parts[parts.length - 1] || endpoint
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg shadow-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
      >
        <ChevronUp className="w-4 h-4" />
        Prompts ({entries.length})
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-gray-100 shadow-2xl border-t border-gray-700"
      style={{ maxHeight: '50vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Prompt Inspector</h3>
          <span className="text-xs text-gray-400">
            {entries.length} {entries.length === 1 ? 'call' : 'calls'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            disabled={entries.length === 0}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Clear
          </button>
          <button
            onClick={onToggle}
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(50vh - 44px)' }}>
        {entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No API calls logged yet. Make requests to see them here.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {entries.map((entry) => (
              <div key={entry.id} className="bg-gray-900">
                {/* Entry header */}
                <button
                  onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                  className="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-800/50 transition-colors"
                >
                  <StatusIcon status={entry.status} />
                  <span className="text-xs text-gray-500 font-mono">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-blue-400">
                    {getEndpointName(entry.endpoint)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDuration(entry.duration)}
                  </span>
                  {expandedEntry === entry.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  )}
                </button>

                {/* Expanded details */}
                {expandedEntry === entry.id && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Request */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-400 uppercase">Request</span>
                        <button
                          onClick={() => handleCopy(formatJSON(entry.request), entry.id, 'request')}
                          className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          title="Copy request"
                        >
                          {copiedId === `${entry.id}-request` ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      <pre className="text-xs font-mono bg-gray-800 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                        {formatJSON(entry.request)}
                      </pre>
                    </div>

                    {/* Response or Error */}
                    {entry.status !== 'pending' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            'text-xs font-medium uppercase',
                            entry.status === 'error' ? 'text-red-400' : 'text-gray-400'
                          )}>
                            {entry.status === 'error' ? 'Error' : 'Response'}
                          </span>
                          {entry.response !== null && (
                            <button
                              onClick={() => handleCopy(formatJSON(entry.response), entry.id, 'response')}
                              className="p-1 text-gray-500 hover:text-white hover:bg-gray-700 rounded transition-colors"
                              title="Copy response"
                            >
                              {copiedId === `${entry.id}-response` ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                        {entry.error ? (
                          <div className="text-xs font-mono bg-red-900/30 text-red-400 p-3 rounded">
                            {entry.error}
                          </div>
                        ) : (
                          <pre className="text-xs font-mono bg-gray-800 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                            {formatJSON(entry.response)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Full endpoint */}
                    <div className="text-xs text-gray-500">
                      <span className="text-gray-600">Endpoint:</span> {entry.endpoint}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
