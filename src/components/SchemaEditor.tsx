'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, GripVertical, FileSpreadsheet, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SchemaColumn {
  id: string
  key: string       // Normalized key (e.g., "company_name")
  label: string     // Display label (e.g., "Company Name")
  type: 'text' | 'url' | 'email' | 'number' | 'select'
  category: 'company' | 'contact' | 'email' | 'custom'
  required: boolean
  options?: string[] // For select type
}

export interface ProjectSchema {
  columns: SchemaColumn[]
}

// Default columns that match the built-in fields
export const DEFAULT_SCHEMA: SchemaColumn[] = [
  { id: '1', key: 'company_name', label: 'Company', type: 'text', category: 'company', required: true },
  { id: '2', key: 'company_website', label: 'Website', type: 'url', category: 'company', required: false },
  { id: '3', key: 'company_description', label: 'Description', type: 'text', category: 'company', required: false },
  { id: '4', key: 'company_relevance', label: 'Relevance', type: 'text', category: 'company', required: false },
  { id: '5', key: 'company_status', label: 'Status', type: 'select', category: 'company', required: false, options: ['not_contacted', 'reached_out', 'meeting_set', 'rejected'] },
  { id: '6', key: 'contact_name', label: 'Contact Name', type: 'text', category: 'contact', required: false },
  { id: '7', key: 'contact_title', label: 'Title', type: 'text', category: 'contact', required: false },
  { id: '8', key: 'contact_email', label: 'Email', type: 'email', category: 'contact', required: false },
  { id: '9', key: 'contact_phone', label: 'Phone', type: 'text', category: 'contact', required: false },
  { id: '10', key: 'contact_linkedin', label: 'LinkedIn', type: 'url', category: 'contact', required: false },
  { id: '11', key: 'email_subject', label: 'Email Subject', type: 'text', category: 'email', required: false },
  { id: '12', key: 'email_body', label: 'Email Body', type: 'text', category: 'email', required: false },
]

// Map common header names to standard keys
const HEADER_MAPPINGS: Record<string, { key: string; category: SchemaColumn['category']; type: SchemaColumn['type'] }> = {
  'company': { key: 'company_name', category: 'company', type: 'text' },
  'company name': { key: 'company_name', category: 'company', type: 'text' },
  'organization': { key: 'company_name', category: 'company', type: 'text' },
  'website': { key: 'company_website', category: 'company', type: 'url' },
  'url': { key: 'company_website', category: 'company', type: 'url' },
  'domain': { key: 'company_website', category: 'company', type: 'url' },
  'description': { key: 'company_description', category: 'company', type: 'text' },
  'company description': { key: 'company_description', category: 'company', type: 'text' },
  'about': { key: 'company_description', category: 'company', type: 'text' },
  'relevance': { key: 'company_relevance', category: 'company', type: 'text' },
  'relevance notes': { key: 'company_relevance', category: 'company', type: 'text' },
  'fit': { key: 'company_relevance', category: 'company', type: 'text' },
  'status': { key: 'company_status', category: 'company', type: 'select' },
  'company status': { key: 'company_status', category: 'company', type: 'select' },
  'name': { key: 'contact_name', category: 'contact', type: 'text' },
  'contact': { key: 'contact_name', category: 'contact', type: 'text' },
  'contact name': { key: 'contact_name', category: 'contact', type: 'text' },
  'person': { key: 'contact_name', category: 'contact', type: 'text' },
  'title': { key: 'contact_title', category: 'contact', type: 'text' },
  'job title': { key: 'contact_title', category: 'contact', type: 'text' },
  'role': { key: 'contact_title', category: 'contact', type: 'text' },
  'position': { key: 'contact_title', category: 'contact', type: 'text' },
  'email': { key: 'contact_email', category: 'contact', type: 'email' },
  'email address': { key: 'contact_email', category: 'contact', type: 'email' },
  'phone': { key: 'contact_phone', category: 'contact', type: 'text' },
  'phone number': { key: 'contact_phone', category: 'contact', type: 'text' },
  'linkedin': { key: 'contact_linkedin', category: 'contact', type: 'url' },
  'linkedin url': { key: 'contact_linkedin', category: 'contact', type: 'url' },
  'subject': { key: 'email_subject', category: 'email', type: 'text' },
  'email subject': { key: 'email_subject', category: 'email', type: 'text' },
  'body': { key: 'email_body', category: 'email', type: 'text' },
  'email body': { key: 'email_body', category: 'email', type: 'text' },
  'message': { key: 'email_body', category: 'email', type: 'text' },
}

// Normalize a header string to a key
function normalizeToKey(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

// Parse headers from pasted text (tab or comma separated)
export function parseHeadersToSchema(headerText: string): SchemaColumn[] {
  // Split by tab, comma, or newline
  const headers = headerText
    .split(/[\t,\n]+/)
    .map(h => h.trim())
    .filter(h => h.length > 0)

  const columns: SchemaColumn[] = []
  const usedKeys = new Set<string>()

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim()
    const mapping = HEADER_MAPPINGS[normalizedHeader]

    let key: string
    let category: SchemaColumn['category']
    let type: SchemaColumn['type']

    if (mapping) {
      // Use standard mapping
      key = mapping.key
      category = mapping.category
      type = mapping.type
    } else {
      // Create custom column
      key = normalizeToKey(header)
      if (!key) key = `column_${index + 1}`
      category = 'custom'
      type = header.toLowerCase().includes('email') ? 'email' :
             header.toLowerCase().includes('url') || header.toLowerCase().includes('link') ? 'url' :
             'text'
    }

    // Handle duplicate keys
    let finalKey = key
    let suffix = 2
    while (usedKeys.has(finalKey)) {
      finalKey = `${key}_${suffix}`
      suffix++
    }
    usedKeys.add(finalKey)

    columns.push({
      id: `col-${Date.now()}-${index}`,
      key: finalKey,
      label: header,
      type,
      category,
      required: finalKey === 'company_name', // Only company name required by default
    })
  })

  return columns
}

interface SchemaEditorProps {
  schema: SchemaColumn[]
  onChange: (schema: SchemaColumn[]) => void
  compact?: boolean
}

export function SchemaEditor({ schema, onChange, compact = false }: SchemaEditorProps) {
  const [pasteInput, setPasteInput] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(schema.length === 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [draggedId, setDraggedId] = useState<string | null>(null)

  // Parse pasted headers
  const handleParse = useCallback(() => {
    if (!pasteInput.trim()) return
    const parsed = parseHeadersToSchema(pasteInput)
    if (parsed.length > 0) {
      onChange(parsed)
      setPasteInput('')
      setShowPasteArea(false)
    }
  }, [pasteInput, onChange])

  // Add custom column
  const handleAddColumn = useCallback(() => {
    const newCol: SchemaColumn = {
      id: `col-${Date.now()}`,
      key: `custom_field_${schema.length + 1}`,
      label: `Custom Field ${schema.length + 1}`,
      type: 'text',
      category: 'custom',
      required: false,
    }
    onChange([...schema, newCol])
  }, [schema, onChange])

  // Remove column
  const handleRemove = useCallback((id: string) => {
    onChange(schema.filter(col => col.id !== id))
  }, [schema, onChange])

  // Start editing label
  const startEdit = useCallback((col: SchemaColumn) => {
    setEditingId(col.id)
    setEditLabel(col.label)
  }, [])

  // Save label edit
  const saveEdit = useCallback(() => {
    if (!editingId) return
    onChange(schema.map(col =>
      col.id === editingId ? { ...col, label: editLabel } : col
    ))
    setEditingId(null)
    setEditLabel('')
  }, [editingId, editLabel, schema, onChange])

  // Update column type
  const updateType = useCallback((id: string, type: SchemaColumn['type']) => {
    onChange(schema.map(col =>
      col.id === id ? { ...col, type } : col
    ))
  }, [schema, onChange])

  // Update column category
  const updateCategory = useCallback((id: string, category: SchemaColumn['category']) => {
    onChange(schema.map(col =>
      col.id === id ? { ...col, category } : col
    ))
  }, [schema, onChange])

  // Toggle required
  const toggleRequired = useCallback((id: string) => {
    onChange(schema.map(col =>
      col.id === id ? { ...col, required: !col.required } : col
    ))
  }, [schema, onChange])

  // Drag handlers
  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return

    const draggedIndex = schema.findIndex(c => c.id === draggedId)
    const targetIndex = schema.findIndex(c => c.id === targetId)
    const newSchema = [...schema]
    const [removed] = newSchema.splice(draggedIndex, 1)
    newSchema.splice(targetIndex, 0, removed)
    onChange(newSchema)
  }, [draggedId, schema, onChange])

  const handleDragEnd = useCallback(() => {
    setDraggedId(null)
  }, [])

  // Use default schema
  const handleUseDefault = useCallback(() => {
    onChange([...DEFAULT_SCHEMA])
    setShowPasteArea(false)
  }, [onChange])

  // Category color
  const categoryColor = (cat: SchemaColumn['category']) => {
    switch (cat) {
      case 'company': return 'bg-blue-100 text-blue-700'
      case 'contact': return 'bg-green-100 text-green-700'
      case 'email': return 'bg-purple-100 text-purple-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (compact && schema.length > 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Schema: {schema.length} columns
          </span>
          <button
            type="button"
            onClick={() => setShowPasteArea(!showPasteArea)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showPasteArea ? 'Hide editor' : 'Edit schema'}
          </button>
        </div>
        {!showPasteArea && (
          <div className="flex flex-wrap gap-1">
            {schema.slice(0, 8).map(col => (
              <span
                key={col.id}
                className={cn('px-2 py-0.5 text-xs rounded', categoryColor(col.category))}
              >
                {col.label}
              </span>
            ))}
            {schema.length > 8 && (
              <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">
                +{schema.length - 8} more
              </span>
            )}
          </div>
        )}
        {showPasteArea && (
          <SchemaEditorFull
            schema={schema}
            onChange={onChange}
            pasteInput={pasteInput}
            setPasteInput={setPasteInput}
            handleParse={handleParse}
            handleUseDefault={handleUseDefault}
            handleAddColumn={handleAddColumn}
            handleRemove={handleRemove}
            startEdit={startEdit}
            saveEdit={saveEdit}
            editingId={editingId}
            editLabel={editLabel}
            setEditLabel={setEditLabel}
            setEditingId={setEditingId}
            updateType={updateType}
            updateCategory={updateCategory}
            toggleRequired={toggleRequired}
            handleDragStart={handleDragStart}
            handleDragOver={handleDragOver}
            handleDragEnd={handleDragEnd}
            draggedId={draggedId}
            categoryColor={categoryColor}
          />
        )}
      </div>
    )
  }

  return (
    <SchemaEditorFull
      schema={schema}
      onChange={onChange}
      pasteInput={pasteInput}
      setPasteInput={setPasteInput}
      handleParse={handleParse}
      handleUseDefault={handleUseDefault}
      handleAddColumn={handleAddColumn}
      handleRemove={handleRemove}
      startEdit={startEdit}
      saveEdit={saveEdit}
      editingId={editingId}
      editLabel={editLabel}
      setEditLabel={setEditLabel}
      setEditingId={setEditingId}
      updateType={updateType}
      updateCategory={updateCategory}
      toggleRequired={toggleRequired}
      handleDragStart={handleDragStart}
      handleDragOver={handleDragOver}
      handleDragEnd={handleDragEnd}
      draggedId={draggedId}
      categoryColor={categoryColor}
      showPasteArea={showPasteArea}
      setShowPasteArea={setShowPasteArea}
    />
  )
}

// Full schema editor UI
interface SchemaEditorFullProps {
  schema: SchemaColumn[]
  onChange: (schema: SchemaColumn[]) => void
  pasteInput: string
  setPasteInput: (v: string) => void
  handleParse: () => void
  handleUseDefault: () => void
  handleAddColumn: () => void
  handleRemove: (id: string) => void
  startEdit: (col: SchemaColumn) => void
  saveEdit: () => void
  editingId: string | null
  editLabel: string
  setEditLabel: (v: string) => void
  setEditingId: (v: string | null) => void
  updateType: (id: string, type: SchemaColumn['type']) => void
  updateCategory: (id: string, category: SchemaColumn['category']) => void
  toggleRequired: (id: string) => void
  handleDragStart: (id: string) => void
  handleDragOver: (e: React.DragEvent, targetId: string) => void
  handleDragEnd: () => void
  draggedId: string | null
  categoryColor: (cat: SchemaColumn['category']) => string
  showPasteArea?: boolean
  setShowPasteArea?: (v: boolean) => void
}

function SchemaEditorFull({
  schema,
  pasteInput,
  setPasteInput,
  handleParse,
  handleUseDefault,
  handleAddColumn,
  handleRemove,
  startEdit,
  saveEdit,
  editingId,
  editLabel,
  setEditLabel,
  setEditingId,
  updateType,
  updateCategory,
  toggleRequired,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  draggedId,
  categoryColor,
  showPasteArea = true,
  setShowPasteArea,
}: SchemaEditorFullProps) {
  return (
    <div className="space-y-4">
      {/* Paste area */}
      {(showPasteArea || schema.length === 0) && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="w-5 h-5 text-gray-500" />
            <span className="font-medium text-gray-700">Import from Excel Headers</span>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            Copy the first row (headers) from your Excel/Google Sheets and paste below.
            The system will auto-detect column types.
          </p>
          <textarea
            value={pasteInput}
            onChange={e => setPasteInput(e.target.value)}
            placeholder="Company Name&#9;Website&#9;Contact&#9;Email&#9;Notes"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleParse}
              disabled={!pasteInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Parse Headers
            </button>
            <button
              type="button"
              onClick={handleUseDefault}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
            >
              Use Default Schema
            </button>
            {schema.length > 0 && setShowPasteArea && (
              <button
                type="button"
                onClick={() => setShowPasteArea(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Column list */}
      {schema.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              {schema.length} Columns
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddColumn}
                className="inline-flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
              >
                <Plus className="w-4 h-4" />
                Add Column
              </button>
              {setShowPasteArea && (
                <button
                  type="button"
                  onClick={() => setShowPasteArea(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Import
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {schema.map(col => (
              <div
                key={col.id}
                draggable
                onDragStart={() => handleDragStart(col.id)}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-3 px-4 py-2',
                  draggedId === col.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50',
                  'cursor-move'
                )}
              >
                <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />

                {/* Label (editable) */}
                <div className="flex-1 min-w-0">
                  {editingId === col.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit()}
                        autoFocus
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-50 rounded">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={() => startEdit(col)}
                      className="cursor-pointer hover:text-blue-600 text-sm font-medium"
                    >
                      {col.label}
                      {col.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                  )}
                  <div className="text-xs text-gray-400 font-mono">{col.key}</div>
                </div>

                {/* Category */}
                <select
                  value={col.category}
                  onChange={e => updateCategory(col.id, e.target.value as SchemaColumn['category'])}
                  className={cn(
                    'px-2 py-1 text-xs rounded border-0 cursor-pointer',
                    categoryColor(col.category)
                  )}
                >
                  <option value="company">Company</option>
                  <option value="contact">Contact</option>
                  <option value="email">Email</option>
                  <option value="custom">Custom</option>
                </select>

                {/* Type */}
                <select
                  value={col.type}
                  onChange={e => updateType(col.id, e.target.value as SchemaColumn['type'])}
                  className="px-2 py-1 text-xs bg-gray-100 rounded border-0 cursor-pointer"
                >
                  <option value="text">Text</option>
                  <option value="url">URL</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                  <option value="select">Select</option>
                </select>

                {/* Required toggle */}
                <button
                  type="button"
                  onClick={() => toggleRequired(col.id)}
                  className={cn(
                    'px-2 py-1 text-xs rounded',
                    col.required ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                  )}
                >
                  {col.required ? 'Required' : 'Optional'}
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleRemove(col.id)}
                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
