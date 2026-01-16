'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Users, Mail, Clock, Trash2, Plus } from 'lucide-react'
import { getSupabase, Project } from '@/lib/supabase'
import { ErrorMessage } from '@/components/ui'

interface ProjectWithCounts extends Project {
  companyCount: number
  contactCount: number
  emailCount: number
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function Home() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProjects() {
      try {
        const supabase = getSupabase()

        // Get all projects
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('*')
          .order('updated_at', { ascending: false })

        if (projectsError) throw projectsError

        // Get counts for each project
        const projectsWithCounts: ProjectWithCounts[] = await Promise.all(
          (projectsData || []).map(async (project) => {
            // Get company count
            const { count: companyCount } = await supabase
              .from('companies')
              .select('*', { count: 'exact', head: true })
              .eq('project_id', project.id)

            // Get contact count (via companies)
            const { data: companyIds } = await supabase
              .from('companies')
              .select('id')
              .eq('project_id', project.id)

            let contactCount = 0
            let emailCount = 0

            if (companyIds && companyIds.length > 0) {
              const ids = companyIds.map(c => c.id)

              const { count: contacts } = await supabase
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .in('company_id', ids)

              contactCount = contacts || 0

              // Get email count (via contacts)
              const { data: contactIds } = await supabase
                .from('contacts')
                .select('id')
                .in('company_id', ids)

              if (contactIds && contactIds.length > 0) {
                const { count: emails } = await supabase
                  .from('emails')
                  .select('*', { count: 'exact', head: true })
                  .in('contact_id', contactIds.map(c => c.id))

                emailCount = emails || 0
              }
            }

            return {
              ...project,
              companyCount: companyCount || 0,
              contactCount,
              emailCount
            }
          })
        )

        setProjects(projectsWithCounts)
      } catch (err) {
        console.error('Error loading projects:', err)
        setError('Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const project = projects.find(p => p.id === projectId)
    if (!confirm(`Delete "${project?.client_name}"? This cannot be undone.`)) {
      return
    }

    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      setProjects(prev => prev.filter(p => p.id !== projectId))
    } catch (err) {
      console.error('Error deleting project:', err)
      setError('Failed to delete project')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8 max-w-4xl mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-8"></div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Outreach AI</h1>
        <p className="text-gray-600 mt-2">
          B2B outreach automation: Project → Companies → Contacts → Emails → Export
        </p>
      </header>

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Link
            href="/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">
            No projects yet. Create your first project to get started.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map(project => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{project.client_name}</h3>
                    {project.target_market && (
                      <p className="text-sm text-gray-500 truncate">{project.target_market}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-4 mb-3 text-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span>{project.companyCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span>{project.contactCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{project.emailCount}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-gray-400">
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
                    {project.target_segment || 'No segment'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatRelativeTime(project.updated_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
