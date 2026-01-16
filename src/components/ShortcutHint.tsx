'use client'

import { ReactNode } from 'react'
import { formatShortcut } from '@/hooks/useKeyboardShortcuts'

interface ShortcutHintProps {
  shortcut: {
    key: string
    metaKey?: boolean
    shiftKey?: boolean
  }
  children: ReactNode
  className?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export function ShortcutHint({ shortcut, children, className = '', position = 'bottom' }: ShortcutHintProps) {
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1'
  }

  return (
    <span className={`relative group inline-flex ${className}`}>
      {children}
      <span
        className={`absolute ${positionClasses[position]} hidden group-hover:flex items-center px-1.5 py-0.5 text-xs font-mono bg-gray-800 text-white rounded shadow-lg whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}
      >
        {formatShortcut(shortcut)}
      </span>
    </span>
  )
}

// Inline badge version for displaying shortcuts directly in buttons
interface ShortcutBadgeProps {
  shortcut: {
    key: string
    metaKey?: boolean
    shiftKey?: boolean
  }
  className?: string
}

export function ShortcutBadge({ shortcut, className = '' }: ShortcutBadgeProps) {
  return (
    <kbd className={`ml-2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono bg-gray-100 text-gray-500 rounded border border-gray-200 ${className}`}>
      {formatShortcut(shortcut)}
    </kbd>
  )
}
