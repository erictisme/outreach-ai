'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { ProjectContext, Segment } from '@/types'

interface SegmentsStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function SegmentsStep({ project, onUpdate, onComplete }: SegmentsStepProps) {
  const schemaConfig = project.schema_config as {
    extractedContext?: ProjectContext
  }

  const extractedContext = schemaConfig.extractedContext

  // Form state initialized from extracted context
  const [segments, setSegments] = useState<Segment[]>(
    extractedContext?.segments || []
  )

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if this is the initial mount to avoid resetting user edits
  const initialContextRef = useRef<ProjectContext | undefined>(extractedContext)

  // Sync form state when extractedContext changes (e.g., after initial extraction)
  useEffect(() => {
    if (extractedContext && extractedContext !== initialContextRef.current) {
      setSegments(extractedContext.segments || [])
      initialContextRef.current = extractedContext
    }
  }, [extractedContext])

  // No extracted context yet - show placeholder
  if (!extractedContext) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 2a (Context) first.
      </div>
    )
  }

  const handleSegmentChange = (id: string, field: 'name' | 'description', value: string) => {
    setSegments(
      segments.map((seg) =>
        seg.id === id ? { ...seg, [field]: value } : seg
      )
    )
  }

  const handleRemoveSegment = (id: string) => {
    setSegments(segments.filter((seg) => seg.id !== id))
  }

  const handleAddSegment = () => {
    const newSegment: Segment = {
      id: `seg_${Date.now()}`,
      name: '',
      description: '',
    }
    setSegments([...segments, newSegment])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const supabase = getSupabase()

      const filteredSegments = segments.filter((s) => s.name.trim())

      const updatedContext: ProjectContext = {
        ...extractedContext,
        segments: filteredSegments,
      }

      const newSchemaConfig = {
        ...schemaConfig,
        extractedContext: updatedContext,
      }

      const { data, error: updateError } = await supabase
        .from('projects')
        .update({
          schema_config: newSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)
        .select()
        .single()

      if (updateError) throw updateError

      onUpdate(data)
      onComplete()
    } catch (err) {
      console.error('Error saving segments:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Segments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Target Segments
          </label>
          <button
            onClick={handleAddSegment}
            disabled={saving}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Segment
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Define the types of companies you want to target. Each segment will generate a portion of your company list.
        </p>
        <div className="space-y-3">
          {segments.map((segment, index) => (
            <div
              key={segment.id}
              className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center justify-center">
                      {index + 1}
                    </span>
                    <input
                      type="text"
                      value={segment.name}
                      onChange={(e) =>
                        handleSegmentChange(segment.id, 'name', e.target.value)
                      }
                      disabled={saving}
                      placeholder="Segment name"
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  <textarea
                    value={segment.description}
                    onChange={(e) =>
                      handleSegmentChange(segment.id, 'description', e.target.value)
                    }
                    disabled={saving}
                    placeholder="Describe this segment (e.g., companies that...)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
                  />
                </div>
                <button
                  onClick={() => handleRemoveSegment(segment.id)}
                  disabled={saving}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                  title="Remove segment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {segments.length === 0 && (
            <div className="p-4 border-2 border-dashed border-gray-200 rounded-lg text-center">
              <p className="text-sm text-gray-500">
                No segments defined yet. Add segments to organize your target companies.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
          saving
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Saving...' : 'Save & Continue'}
      </button>
    </div>
  )
}
