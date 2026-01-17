'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSupabase, Project } from '@/lib/supabase'
import { OBJECTIVE_OPTIONS, ProjectObjective } from '@/types'

interface SetupStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

interface UploadedFile {
  name: string
  content: string
}

export function SetupStep({ project, onUpdate, onComplete }: SetupStepProps) {
  const schemaConfig = project.schema_config as {
    objective?: ProjectObjective
    customObjective?: string
    clientName?: string
    context?: string
    emailTemplate?: string
    documents?: UploadedFile[]
  }

  const [objective, setObjective] = useState<ProjectObjective>(
    schemaConfig.objective || 'sales_prospects'
  )
  const [customObjective, setCustomObjective] = useState(
    schemaConfig.customObjective || ''
  )
  const [clientName, setClientName] = useState(
    schemaConfig.clientName || project.client_name || ''
  )
  const [context, setContext] = useState(schemaConfig.context || '')
  const [emailTemplate, setEmailTemplate] = useState(
    schemaConfig.emailTemplate || ''
  )
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(
    schemaConfig.documents || []
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newFiles: UploadedFile[] = []

    for (const file of Array.from(files)) {
      try {
        const content = await file.text()
        newFiles.push({
          name: file.name,
          content,
        })
      } catch (err) {
        console.error(`Error reading file ${file.name}:`, err)
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles])

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const supabase = getSupabase()

      const newSchemaConfig = {
        ...project.schema_config,
        objective,
        customObjective: objective === 'custom' ? customObjective : undefined,
        clientName,
        context,
        emailTemplate: emailTemplate || undefined,
        documents: uploadedFiles,
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

      // Now trigger extraction
      setExtracting(true)

      const extractResponse = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextDump: context,
          documents: uploadedFiles.map((f) => ({
            name: f.name,
            label: f.name,
            content: f.content,
          })),
        }),
      })

      if (!extractResponse.ok) {
        throw new Error('Failed to extract context')
      }

      const { context: extractedContext } = await extractResponse.json()

      // Save extracted context
      const finalSchemaConfig = {
        ...newSchemaConfig,
        extractedContext,
      }

      const { data: finalData, error: finalError } = await supabase
        .from('projects')
        .update({
          schema_config: finalSchemaConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)
        .select()
        .single()

      if (finalError) throw finalError

      onUpdate(finalData)
      onComplete()
    } catch (err) {
      console.error('Error saving setup:', err)
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
      setExtracting(false)
    }
  }

  const isLoading = saving || extracting

  return (
    <div className="space-y-4">
      {/* Objective Dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Objective
        </label>
        <select
          value={objective}
          onChange={(e) => setObjective(e.target.value as ProjectObjective)}
          disabled={isLoading}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        >
          {OBJECTIVE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Custom Objective (if selected) */}
      {objective === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom Objective
          </label>
          <input
            type="text"
            value={customObjective}
            onChange={(e) => setCustomObjective(e.target.value)}
            disabled={isLoading}
            placeholder="Describe your objective..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          />
        </div>
      )}

      {/* Client Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Company / Client Name
        </label>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          disabled={isLoading}
          placeholder="e.g., Acme Corp"
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      {/* Context Textarea */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project Context
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={isLoading}
          placeholder="Describe your product, target market, value proposition, visit dates (if applicable), etc."
          rows={5}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
        />
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Upload Documents (optional)
        </label>
        <div
          onClick={() => !isLoading && fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed border-gray-300 rounded-md p-4 text-center transition-colors',
            isLoading
              ? 'bg-gray-100 cursor-not-allowed'
              : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
          )}
        >
          <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">
            Click to upload PDFs or text files
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.doc,.docx"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded text-sm"
              >
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="flex-1 truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  disabled={isLoading}
                  className="p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Template (optional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email Template (optional)
        </label>
        <textarea
          value={emailTemplate}
          onChange={(e) => setEmailTemplate(e.target.value)}
          disabled={isLoading}
          placeholder="Paste an example email or template to guide email generation..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isLoading || !clientName.trim()}
        className={cn(
          'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
          isLoading || !clientName.trim()
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {extracting
          ? 'Extracting context...'
          : saving
          ? 'Saving...'
          : 'Save & Extract'}
      </button>
    </div>
  )
}
