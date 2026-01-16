'use client'

import { useEffect, useCallback, useState } from 'react'

interface UseTableKeyboardNavOptions<T> {
  items: T[]
  enabled?: boolean
  onSelect?: (item: T, index: number) => void
  onToggle?: (item: T, index: number) => void
  getItemId: (item: T) => string
}

export function useTableKeyboardNav<T>({
  items,
  enabled = true,
  onSelect,
  onToggle,
  getItemId
}: UseTableKeyboardNavOptions<T>) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger when typing in inputs, textareas, or contenteditable
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    if (items.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
      case 'j': // Vim-style navigation
        e.preventDefault()
        setFocusedIndex(prev => {
          const next = prev < items.length - 1 ? prev + 1 : prev
          return next
        })
        break

      case 'ArrowUp':
      case 'k': // Vim-style navigation
        e.preventDefault()
        setFocusedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0
          return next
        })
        break

      case 'Home':
        e.preventDefault()
        setFocusedIndex(0)
        break

      case 'End':
        e.preventDefault()
        setFocusedIndex(items.length - 1)
        break

      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault()
          const item = items[focusedIndex]
          onSelect?.(item, focusedIndex)
        }
        break

      case ' ': // Space to toggle selection
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault()
          const item = items[focusedIndex]
          onToggle?.(item, focusedIndex)
        }
        break

      case 'Escape':
        setFocusedIndex(-1)
        break
    }
  }, [items, focusedIndex, onSelect, onToggle])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])

  // Reset focus index when items change significantly
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(items.length - 1)
    }
  }, [items.length, focusedIndex])

  const focusedItemId = focusedIndex >= 0 && focusedIndex < items.length
    ? getItemId(items[focusedIndex])
    : null

  return {
    focusedIndex,
    focusedItemId,
    setFocusedIndex
  }
}
