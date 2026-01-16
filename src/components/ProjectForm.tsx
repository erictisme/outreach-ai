'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Upload, FileText, X, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UploadedDoc, ProjectContext } from '@/types'
import { SchemaEditor, SchemaColumn, DEFAULT_SCHEMA } from './SchemaEditor'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { ShortcutBadge } from './ShortcutHint'

export interface ProjectFormData {
  clientName: string
  productDescription: string
  targetMarket: string
  targetSegment: string
  briefContent: string
  documents: UploadedDoc[]
  extractedContext: ProjectContext | null
  schemaColumns: SchemaColumn[]
}

interface ProjectFormProps {
  initialData?: Partial<ProjectFormData>
  onSubmit: (data: ProjectFormData) => Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
}

export function ProjectForm({
  initialData,
  onSubmit,
  submitLabel = 'Create Project',
  isSubmitting = false
}: ProjectFormProps) {
  const [clientName, setClientName] = useState(initialData?.clientName ?? '')
  const [productDescription, setProductDescription] = useState(initialData?.productDescription ?? '')
  const [targetMarket, setTargetMarket] = useState(initialData?.targetMarket ?? '')
  const [targetSegment, setTargetSegment] = useState(initialData?.targetSegment ?? '')
  const [briefContent, setBriefContent] = useState(initialData?.briefContent ?? '')
  const [documents, setDocuments] = useState<UploadedDoc[]>(initialData?.documents ?? [])
  const [extractedContext, setExtractedContext] = useState<ProjectContext | null>(initialData?.extractedContext ?? null)
  const [schemaColumns, setSchemaColumns] = useState<SchemaColumn[]>(initialData?.schemaColumns ?? [])

  const [dragActive, setDragActive] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showSchemaEditor, setShowSchemaEditor] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const processFiles = useCallback(async (files: File[]) => {
    const newDocs: UploadedDoc[] = []

    for (const file of files) {
      const content = await file.text()
      const doc: UploadedDoc = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.doc') || file.name.endsWith('.docx') ? 'doc' : 'text',
        label: file.name.replace(/\.[^/.]+$/, ''),
        content
      }
      newDocs.push(doc)
    }

    setDocuments(prev => [...prev, ...newDocs])
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    await processFiles(files)
  }, [processFiles])

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
  }, [processFiles])

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id))
  }, [])

  const handleExtract = async () => {
    if (!briefContent && documents.length === 0) {
      setExtractError('Please enter some context or upload documents first')
      return
    }

    setIsExtracting(true)
    setExtractError(null)

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextDump: briefContent,
          documents
        })
      })

      if (!response.ok) {
        throw new Error('Failed to extract context')
      }

      const { context } = await response.json()
      setExtractedContext(context)

      // Auto-fill form fields from extracted context
      if (context.clientName && !clientName) setClientName(context.clientName)
      if (context.product && !productDescription) setProductDescription(context.product)
      if (context.targetMarket && !targetMarket) setTargetMarket(context.targetMarket)
      if (context.targetSegment && !targetSegment) setTargetSegment(context.targetSegment)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract context')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Use default schema if none provided
    const finalSchema = schemaColumns.length > 0 ? schemaColumns : DEFAULT_SCHEMA
    await onSubmit({
      clientName,
      productDescription,
      targetMarket,
      targetSegment,
      briefContent,
      documents,
      extractedContext,
      schemaColumns: finalSchema
    })
  }

  const canExtract = briefContent.trim() || documents.length > 0
  const canSubmit = Boolean(clientName.trim()) && !isSubmitting

  // Keyboard shortcut for save (Cmd+S)
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: 's',
        metaKey: true,
        description: 'Save form',
        action: () => {
          if (canSubmit && formRef.current) {
            formRef.current.requestSubmit()
          }
        },
        enabled: canSubmit
      }
    ]
  })

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Project Details</h2>

        <div>
          <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
            Client Name <span className="text-red-500">*</span>
          </label>
          <input
            id="clientName"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
            placeholder="e.g., Gustafsberg"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
          />
        </div>

        <div>
          <label htmlFor="productDescription" className="block text-sm font-medium text-gray-700 mb-1">
            Product/Service Description
          </label>
          <textarea
            id="productDescription"
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="e.g., Premium Swedish bone china, supplies Royal Court of Sweden"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 placeholder:text-gray-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="targetMarket" className="block text-sm font-medium text-gray-700 mb-1">
              Target Market
            </label>
            <input
              id="targetMarket"
              type="text"
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value)}
              placeholder="e.g., Singapore"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
            />
          </div>
          <div>
            <label htmlFor="targetSegment" className="block text-sm font-medium text-gray-700 mb-1">
              Target Segment
            </label>
            <input
              id="targetSegment"
              type="text"
              value={targetSegment}
              onChange={(e) => setTargetSegment(e.target.value)}
              placeholder="e.g., Distributors, boutique retailers"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Brief/Context Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Brief & Documents</h2>
        <p className="text-sm text-gray-500">
          Add context about the project. Upload pitch decks, briefs, or paste notes. AI will extract key information.
        </p>

        <div>
          <label htmlFor="briefContent" className="block text-sm font-medium text-gray-700 mb-1">
            Context / Notes
          </label>
          <textarea
            id="briefContent"
            value={briefContent}
            onChange={(e) => setBriefContent(e.target.value)}
            placeholder="Paste kickoff notes, company description, target criteria, visit dates, key differentiators..."
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm text-gray-900 placeholder:text-gray-400"
          />
        </div>

        {/* File upload area */}
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-4 sm:p-6 text-center transition-colors",
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600 mb-1">
            Drag and drop files here, or{' '}
            <label className="text-blue-600 hover:text-blue-700 cursor-pointer">
              browse
              <input
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                accept=".pdf,.doc,.docx,.txt,.md"
              />
            </label>
          </p>
          <p className="text-xs text-gray-400">PDF, DOC, TXT, MD supported</p>
        </div>

        {/* Uploaded documents list */}
        {documents.length > 0 && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{doc.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDocument(doc.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Extract button */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleExtract}
            disabled={!canExtract || isExtracting}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
              canExtract && !isExtracting
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
          >
            {isExtracting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isExtracting ? 'Extracting...' : 'Extract with AI'}
          </button>
          {extractError && (
            <p className="text-sm text-red-500">{extractError}</p>
          )}
        </div>

        {/* Extracted context preview */}
        {extractedContext && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-sm font-medium text-green-800 mb-2">Extracted Context</h3>
            <div className="text-sm text-green-700 space-y-1">
              <p><span className="font-medium">Client:</span> {extractedContext.clientName}</p>
              <p><span className="font-medium">Product:</span> {extractedContext.product}</p>
              <p><span className="font-medium">Value Prop:</span> {extractedContext.valueProposition}</p>
              <p><span className="font-medium">Target Market:</span> {extractedContext.targetMarket}</p>
              {extractedContext.segments && extractedContext.segments.length > 0 && (
                <p><span className="font-medium">Segments:</span> {extractedContext.segments.map(s => s.name).join(', ')}</p>
              )}
              {extractedContext.targetRoles && extractedContext.targetRoles.length > 0 && (
                <p><span className="font-medium">Target Roles:</span> {extractedContext.targetRoles.join(', ')}</p>
              )}
              {extractedContext.keyDifferentiators && extractedContext.keyDifferentiators.length > 0 && (
                <p><span className="font-medium">Differentiators:</span> {extractedContext.keyDifferentiators.join(', ')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Schema Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Export Schema</h2>
            <p className="text-sm text-gray-500">
              Define columns for your export. Paste Excel headers or use the default.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSchemaEditor(!showSchemaEditor)}
            className="text-sm text-blue-600 hover:underline self-start sm:self-center"
          >
            {showSchemaEditor ? 'Hide' : schemaColumns.length > 0 ? 'Edit' : 'Customize'}
          </button>
        </div>

        {!showSchemaEditor && schemaColumns.length === 0 && (
          <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
            Using default schema (Company, Website, Contact, Email, etc.)
          </div>
        )}

        {!showSchemaEditor && schemaColumns.length > 0 && (
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            Custom schema: {schemaColumns.length} columns ({schemaColumns.slice(0, 4).map(c => c.label).join(', ')}{schemaColumns.length > 4 ? '...' : ''})
          </div>
        )}

        {showSchemaEditor && (
          <SchemaEditor
            schema={schemaColumns}
            onChange={setSchemaColumns}
          />
        )}
      </div>

      {/* Submit */}
      <div className="pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
            canSubmit
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              {submitLabel}
              <ShortcutBadge shortcut={{ key: 's', metaKey: true }} className="bg-blue-500 border-blue-400 text-blue-100" />
            </>
          )}
        </button>
      </div>
    </form>
  )
}
