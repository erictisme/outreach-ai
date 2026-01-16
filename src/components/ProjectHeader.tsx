'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Sparkles, Check, Pencil } from 'lucide-react'

interface ProjectHeaderProps {
  projectName: string
  onNameChange: (name: string) => void
  onBack: () => void
  isSaving?: boolean
  lastSaved?: number
}

export function ProjectHeader({
  projectName,
  onNameChange,
  onBack,
  isSaving = false,
  lastSaved,
}: ProjectHeaderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(projectName)
  const [showSaved, setShowSaved] = useState(false)

  // Show "Saved" indicator briefly after save
  useEffect(() => {
    if (lastSaved) {
      setShowSaved(true)
      const timer = setTimeout(() => setShowSaved(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [lastSaved])

  const handleSubmit = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== projectName) {
      onNameChange(trimmed)
    } else {
      setEditName(projectName)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setEditName(projectName)
      setIsEditing(false)
    }
  }

  return (
    <div className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Back + Logo + Name */}
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Projects</span>
            </button>

            <div className="h-6 w-px bg-gray-200" />

            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-600" />

              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSubmit}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-blue-500 outline-none px-1"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditName(projectName)
                    setIsEditing(true)
                  }}
                  className="flex items-center gap-2 text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors group"
                >
                  <span>{projectName}</span>
                  <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Save status */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {isSaving ? (
              <span>Saving...</span>
            ) : showSaved ? (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="w-4 h-4" />
                Saved
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
