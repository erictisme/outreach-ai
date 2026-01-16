'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProjectForm, ProjectFormData } from '@/components/ProjectForm'
import { getSupabase } from '@/lib/supabase'

export default function NewProjectPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          // Don't store full content in schema_config to keep it lean
        }))
      }
      // Store column schema
      if (data.schemaColumns && data.schemaColumns.length > 0) {
        schemaConfig.columns = data.schemaColumns
      }

      // Insert project into Supabase
      const supabase = getSupabase()
      const { data: project, error: insertError } = await supabase
        .from('projects')
        .insert({
          client_name: data.clientName,
          product_description: data.productDescription || null,
          target_market: data.targetMarket || null,
          target_segment: data.targetSegment || null,
          brief_content: data.briefContent || null,
          schema_config: schemaConfig
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      // Redirect to the project wizard
      router.push(`/project/${project.id}`)
    } catch (err) {
      console.error('Error creating project:', err)
      setError(err instanceof Error ? err.message : 'Failed to create project')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
        <p className="text-gray-600 mt-1">
          Set up a new outreach project. Upload docs or enter details to get started.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ProjectForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          submitLabel="Create Project"
        />
      </div>
    </main>
  )
}
