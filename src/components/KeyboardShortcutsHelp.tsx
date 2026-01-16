'use client'

import { useState, useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import { useKeyboardShortcuts, formatShortcut } from '@/hooks/useKeyboardShortcuts'

interface ShortcutItem {
  keys: { key: string; metaKey?: boolean; shiftKey?: boolean }
  description: string
}

interface KeyboardShortcutsHelpProps {
  shortcuts: ShortcutItem[]
  className?: string
}

export function KeyboardShortcutsHelp({ shortcuts, className = '' }: KeyboardShortcutsHelpProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Toggle help with ? key
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: '?',
        shiftKey: true,
        description: 'Show keyboard shortcuts',
        action: () => setIsOpen(prev => !prev)
      }
    ]
  })

  // Close with Escape
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors ${className}`}
        title="Keyboard shortcuts (?)"
      >
        <Keyboard className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Shortcuts</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsOpen(false)}>
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <span className="text-gray-700">{shortcut.description}</span>
                  <kbd className="px-2 py-1 text-sm font-mono bg-gray-100 text-gray-600 rounded border border-gray-200">
                    {formatShortcut(shortcut.keys)}
                  </kbd>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-200">?</kbd> to toggle this help
            </div>
          </div>
        </div>
      )}
    </>
  )
}
