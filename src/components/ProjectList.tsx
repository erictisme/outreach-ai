'use client'

import { Plus, Sparkles, FolderOpen } from 'lucide-react'
import { ProjectSummary } from '@/types'
import { ProjectCard } from './ProjectCard'

interface ProjectListProps {
  projects: ProjectSummary[]
  onLoadProject: (id: string) => void
  onNewProject: () => void
  onDeleteProject: (id: string) => void
}

export function ProjectList({ projects, onLoadProject, onNewProject, onDeleteProject }: ProjectListProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Outreach AI</h1>
          </div>
          <p className="text-gray-600 mt-2">
            Generate targeted company lists, find contacts, and write personalized outreach emails.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Title + New Project button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Your Projects</h2>
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Project grid or empty state */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onLoad={onLoadProject}
                onDelete={onDeleteProject}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-500 mb-6">
              Start your first outreach campaign by creating a new project.
            </p>
            <button
              onClick={onNewProject}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Your First Project
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
