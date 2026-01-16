'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm, ProjectFormData } from '@/components/ProjectForm'
import { getSupabase, Project } from '@/lib/supabase'
import { Spinner, ErrorMessage } from '@/components/ui'

export default function EditProjectPage() {
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadProject() {
      try {
        const supabase = getSupabase()
        const { data, error: fetchError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (fetchError) throw fetchError
        setProject(data)
      } catch (err) {
        console.error('Error loading project:', err)
        setError('Failed to load project')
      } finally {
        setLoading(false)
      }
    }

    loadProject()
  }, [projectId])

  const handleSubmit = async (data: ProjectFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Build schema_config from extracted context and schema columns
      const schemaConfig: Record<string, unknown> = {}
      if (data.extractedContext) {
        schemaConfig.extractedContext = data.extractedContext
        schemaConfig.documents = data.documents.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          label: d.label
        }))
      }
      if (data.schemaColumns && data.schemaColumns.length > 0) {
        schemaConfig.columns = data.schemaColumns
      }

      const supabase = getSupabase()
      const { error: updateError } = await supabase
        .from('projects')
        .update({
          client_name: data.clientName,
          product_description: data.productDescription || null,
          target_market: data.targetMarket || null,
          target_segment: data.targetSegment || null,
          brief_content: data.briefContent || null,
          schema_config: schemaConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      router.push(`/project/${projectId}`)
    } catch (err) {
      console.error('Error updating project:', err)
      setError(err instanceof Error ? err.message : 'Failed to update project')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      </main>
    )
  }

  if (!project) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
        <ErrorMessage message="Project not found" />
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
          Back to Dashboard
        </Link>
      </main>
    )
  }

  // Extract initial data from project
  const schemaConfig = project.schema_config || {}
  const initialData: Partial<ProjectFormData> = {
    clientName: project.client_name,
    productDescription: project.product_description || '',
    targetMarket: project.target_market || '',
    targetSegment: project.target_segment || '',
    briefContent: project.brief_content || '',
    documents: (schemaConfig.documents as ProjectFormData['documents']) || [],
    extractedContext: (schemaConfig.extractedContext as ProjectFormData['extractedContext']) || null,
    schemaColumns: (schemaConfig.columns as ProjectFormData['schemaColumns']) || []
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href={`/project/${projectId}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Project
        </Link>
      </div>

      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Edit Project</h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">
          Update project details and settings.
        </p>
      </header>

      {error && (
        <ErrorMessage
          message={error}
          onDismiss={() => setError(null)}
          className="mb-6"
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
        <ProjectForm
          initialData={initialData}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Save Changes"
        />
      </div>
    </main>
  )
}
