'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Plus, X, RefreshCw, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import {
  ProjectContext,
  SeniorityLevel,
  SENIORITY_OPTIONS,
} from '@/types'

// Suggested roles for quick selection
const SUGGESTED_ROLES = [
  'CEO',
  'CFO',
  'COO',
  'VP Sales',
  'Director',
  'Buyer',
  'Category Manager',
  'Purchasing Manager',
  'Partnership Manager',
  'Business Development',
  'Merchandiser',
  'Store Manager',
  'General Manager',
  'Owner',
]
import { loggedFetch } from '@/lib/promptLogger'

interface SchemaConfig {
  context?: string
  documents?: { name: string; content: string }[]
  extractedContext?: ProjectContext
  contextUpdatedAt?: string  // ISO timestamp when context/segments were last saved
  companiesGeneratedAt?: string  // ISO timestamp when companies were last generated
}

interface ContextStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function ContextStep({ project, onUpdate, onComplete }: ContextStepProps) {
  const schemaConfig = project.schema_config as SchemaConfig

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
  const [productFocus, setProductFocus] = useState(extractedContext?.productFocus || '')
  const [newRole, setNewRole] = useState('')

  const [saving, setSaving] = useState(false)
  const [reextracting, setReextracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSaved, setShowSaved] = useState(false)

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
      setProductFocus(extractedContext.productFocus || '')
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
        productFocus: productFocus.trim() || undefined,
      }

      const newSchemaConfig = {
        ...schemaConfig,
        extractedContext: updatedContext,
        contextUpdatedAt: new Date().toISOString(),
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

      // Show saved confirmation briefly before advancing
      setShowSaved(true)
      setTimeout(() => {
        setShowSaved(false)
        onComplete()
      }, 800)
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

      // Update state with new extracted values (except segments - handled in SegmentsStep)
      setClientName(newExtractedContext.clientName || '')
      setProduct(newExtractedContext.product || '')
      setValueProposition(newExtractedContext.valueProposition || '')
      setTargetMarket(newExtractedContext.targetMarket || '')
      setTargetSeniority(newExtractedContext.targetSeniority || 'any')
      setTargetRoles(newExtractedContext.targetRoles || [])
      setProductFocus(newExtractedContext.productFocus || '')

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

      {/* Product/Service Focus */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Product/Service Focus
        </label>
        <input
          type="text"
          value={productFocus}
          onChange={(e) => setProductFocus(e.target.value)}
          disabled={isLoading}
          placeholder="e.g., sells porcelain plates, carries tableware, luxury homeware"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
        <p className="text-xs text-gray-500 mt-1">
          Describe what products/services your target companies should sell or carry
        </p>
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
        {/* Suggested roles */}
        {SUGGESTED_ROLES.filter((role) => !targetRoles.includes(role)).length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-gray-500 mr-2">Suggestions:</span>
            <div className="inline-flex flex-wrap gap-1.5 mt-1">
              {SUGGESTED_ROLES.filter((role) => !targetRoles.includes(role)).map((role) => (
                <button
                  key={role}
                  onClick={() => setTargetRoles([...targetRoles, role])}
                  disabled={isLoading}
                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + {role}
                </button>
              ))}
            </div>
          </div>
        )}
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
          disabled={isLoading || !clientName.trim() || showSaved}
          className={cn(
            'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
            showSaved
              ? 'bg-green-500 text-white'
              : isLoading || !clientName.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {showSaved && <Check className="w-4 h-4" />}
          {showSaved ? 'Saved!' : saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}
