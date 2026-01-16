'use client'

import { useEffect, useCallback, useRef } from 'react'

export interface Shortcut {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  action: () => void
  description: string
  enabled?: boolean
}

interface UseKeyboardShortcutsOptions {
  shortcuts: Shortcut[]
  enabled?: boolean
}

export function useKeyboardShortcuts({ shortcuts, enabled = true }: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs, textareas, or contenteditable
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    for (const shortcut of shortcutsRef.current) {
      if (shortcut.enabled === false) continue

      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
      const metaMatch = shortcut.metaKey ? (e.metaKey || e.ctrlKey) : !e.metaKey && !e.ctrlKey
      const shiftMatch = shortcut.shiftKey ? e.shiftKey : !e.shiftKey

      if (keyMatch && metaMatch && shiftMatch) {
        e.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}

// Helper to format shortcut for display
export function formatShortcut(shortcut: Pick<Shortcut, 'key' | 'metaKey' | 'shiftKey'>): string {
  const parts: string[] = []

  // Use ⌘ for Mac, Ctrl for others (detect at runtime)
  if (shortcut.metaKey) {
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
    parts.push(isMac ? '⌘' : 'Ctrl')
  }

  if (shortcut.shiftKey) {
    parts.push('⇧')
  }

  // Format the key nicely
  const keyDisplay = shortcut.key.length === 1
    ? shortcut.key.toUpperCase()
    : shortcut.key === 'ArrowUp' ? '↑'
    : shortcut.key === 'ArrowDown' ? '↓'
    : shortcut.key === 'ArrowLeft' ? '←'
    : shortcut.key === 'ArrowRight' ? '→'
    : shortcut.key === 'Enter' ? '↵'
    : shortcut.key === 'Escape' ? 'Esc'
    : shortcut.key

  parts.push(keyDisplay)

  return parts.join('')
}
