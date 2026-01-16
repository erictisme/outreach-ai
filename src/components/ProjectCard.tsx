'use client'

import { Building2, Users, Mail, Clock, Trash2 } from 'lucide-react'
import { ProjectSummary, Step } from '@/types'

interface ProjectCardProps {
  project: ProjectSummary
  onLoad: (id: string) => void
  onDelete: (id: string) => void
}

const STEP_LABELS: Record<Step, string> = {
  context: 'Input Context',
  extract: 'Extract Fields',
  segments: 'Select Segments',
  list: 'Generate List',
  research: 'Review Contacts',
  contacts: 'Find Contacts',
  emails: 'Write Emails',
  conversations: 'Conversations',
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function ProjectCard({ project, onLoad, onDelete }: ProjectCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      onDelete(project.id)
    }
  }

  return (
    <div
      onClick={() => onLoad(project.id)}
      className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
          {project.clientName && (
            <p className="text-sm text-gray-500 truncate">{project.clientName}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
          title="Delete project"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-3 text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-gray-400" />
          <span>{project.companyCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-gray-400" />
          <span>{project.personCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-gray-400" />
          <span>{project.emailCount}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
          {STEP_LABELS[project.currentStep]}
        </span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formatRelativeTime(project.updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}
