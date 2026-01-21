'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Plus, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import {
  ProjectContext,
  Segment,
  SeniorityLevel,
  SENIORITY_OPTIONS,
} from '@/types'
import { loggedFetch } from '@/lib/promptLogger'

interface ContextStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function ContextStep({ project, onUpdate, onComplete }: ContextStepProps) {
  const schemaConfig = project.schema_config as {
    context?: string
    documents?: { name: string; content: string }[]
    extractedContext?: ProjectContext
  }

  const extractedContext = schemaConfig.extractedContext

  // Form state initialized from extracted context
  const [clientName, setClientName] = useState(extractedContext?.clientName || '')
  const [product, setProduct] = useState(extractedContext?.product || '')
  const [valueProposition, setValueProposition] = useState(
    extractedContext?.valueProposition || ''
  )
  const [targetMarket, setTargetMarket] = useState(extractedContext?.targetMarket || '')
  const [targetSeniority, setTargetSeniority] = useState<SeniorityLevel>(
    extractedContext?.targetSeniority || 'any'
  )
  const [targetRoles, setTargetRoles] = useState<string[]>(
    extractedContext?.targetRoles || []
  )
  const [segments, setSegments] = useState<Segment[]>(
    extractedContext?.segments || []
  )
  const [newRole, setNewRole] = useState('')

  const [saving, setSaving] = useState(false)
  const [reextracting, setReextracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track if this is the initial mount to avoid resetting user edits
  const initialContextRef = useRef<ProjectContext | undefined>(extractedContext)

  // Sync form state when extractedContext changes (e.g., after initial extraction)
  useEffect(() => {
    // Only sync if extractedContext has changed from what we initialized with
    // This handles the case where component mounts before extraction completes
    if (extractedContext && extractedContext !== initialContextRef.current) {
      setClientName(extractedContext.clientName || '')
      setProduct(extractedContext.product || '')
      setValueProposition(extractedContext.valueProposition || '')
      setTargetMarket(extractedContext.targetMarket || '')
      setTargetSeniority(extractedContext.targetSeniority || 'any')
      setTargetRoles(extractedContext.targetRoles || [])
      setSegments(extractedContext.segments || [])
      initialContextRef.current = extractedContext
    }
  }, [extractedContext])

  // No extracted context yet - show placeholder
  if (!extractedContext) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 1 (Setup) first to extract context.
      </div>
    )
  }

  const handleAddRole = () => {
    const trimmed = newRole.trim()
    if (trimmed && !targetRoles.includes(trimmed)) {
      setTargetRoles([...targetRoles, trimmed])
      setNewRole('')
    }
  }

  const handleRemoveRole = (role: string) => {
    setTargetRoles(targetRoles.filter((r) => r !== role))
  }

  const handleRoleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddRole()
    }
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

      const updatedContext: ProjectContext = {
        ...extractedContext,
        clientName,
        product,
        valueProposition,
        targetMarket,
        targetSeniority,
        targetRoles,
        segments: segments.filter((s) => s.name.trim()), // Remove empty segments
      }

      const newSchemaConfig = {
        ...schemaConfig,
        extractedContext: updatedContext,
      }

      const { data, error: updateError } = await supabase
        .from('projects')
        .update({
          client_name: clientName,
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
      console.error('Error saving context:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleReextract = async () => {
    setReextracting(true)
    setError(null)

    try {
      const extractResponse = await loggedFetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextDump: schemaConfig.context || '',
          documents: (schemaConfig.documents || []).map((f) => ({
            name: f.name,
            label: f.name,
            content: f.content,
          })),
        }),
      })

      if (!extractResponse.ok) {
        throw new Error('Failed to extract context')
      }

      const { context: newExtractedContext } = await extractResponse.json()

      // Update state with new extracted values
      setClientName(newExtractedContext.clientName || '')
      setProduct(newExtractedContext.product || '')
      setValueProposition(newExtractedContext.valueProposition || '')
      setTargetMarket(newExtractedContext.targetMarket || '')
      setTargetSeniority(newExtractedContext.targetSeniority || 'any')
      setTargetRoles(newExtractedContext.targetRoles || [])
      setSegments(newExtractedContext.segments || [])

      // Save to Supabase
      const supabase = getSupabase()
      const newSchemaConfig = {
        ...schemaConfig,
        extractedContext: newExtractedContext,
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
    } catch (err) {
      console.error('Error re-extracting:', err)
      setError(err instanceof Error ? err.message : 'Failed to re-extract')
    } finally {
      setReextracting(false)
    }
  }

  const isLoading = saving || reextracting

  return (
    <div className="space-y-4">
      {/* Client Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Client Name
        </label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      {/* Product */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Product
        </label>
        <input
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      {/* Value Proposition */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Value Proposition
        </label>
        <textarea
          value={valueProposition}
          onChange={(e) => setValueProposition(e.target.value)}
          disabled={isLoading}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
        />
      </div>

      {/* Target Market */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Market
        </label>
        <input
          type="text"
          value={targetMarket}
          onChange={(e) => setTargetMarket(e.target.value)}
          disabled={isLoading}
          placeholder="e.g., Singapore, Southeast Asia"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      {/* Target Seniority */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Seniority
        </label>
        <select
          value={targetSeniority}
          onChange={(e) => setTargetSeniority(e.target.value as SeniorityLevel)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        >
          {SENIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Target Roles (tag/chip input) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Target Roles
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {targetRoles.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
            >
              {role}
              <button
                onClick={() => handleRemoveRole(role)}
                disabled={isLoading}
                className="hover:text-blue-600 disabled:opacity-50"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={handleRoleKeyDown}
            disabled={isLoading}
            placeholder="Add role (e.g., CEO, Buyer)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          />
          <button
            onClick={handleAddRole}
            disabled={isLoading || !newRole.trim()}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Segments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Target Segments
          </label>
          <button
            onClick={handleAddSegment}
            disabled={isLoading}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Segment
          </button>
        </div>
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
                      disabled={isLoading}
                      placeholder="Segment name"
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                  <textarea
                    value={segment.description}
                    onChange={(e) =>
                      handleSegmentChange(segment.id, 'description', e.target.value)
                    }
                    disabled={isLoading}
                    placeholder="Describe this segment (e.g., companies that...)"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
                  />
                </div>
                <button
                  onClick={() => handleRemoveSegment(segment.id)}
                  disabled={isLoading}
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
      <div className="flex gap-2">
        <button
          onClick={handleReextract}
          disabled={isLoading}
          className={cn(
            'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 border',
            isLoading
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          )}
        >
          {reextracting && <Loader2 className="w-4 h-4 animate-spin" />}
          {!reextracting && <RefreshCw className="w-4 h-4" />}
          Re-extract
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading || !clientName.trim()}
          className={cn(
            'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            isLoading || !clientName.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}
