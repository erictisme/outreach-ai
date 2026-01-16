'use client'

import { useState } from 'react'
import { Upload, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UploadedDoc } from '@/types'

interface ContextInputProps {
  onContextChange: (context: string) => void
  onDocumentsChange: (docs: UploadedDoc[]) => void
  documents: UploadedDoc[]
  contextDump: string
}

export function ContextInput({
  onContextChange,
  onDocumentsChange,
  documents,
  contextDump
}: ContextInputProps) {
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    await processFiles(files)
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
  }

  const processFiles = async (files: File[]) => {
    const newDocs: UploadedDoc[] = []

    for (const file of files) {
      const content = await file.text()
      const doc: UploadedDoc = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        type: file.name.endsWith('.pdf') ? 'pdf' : file.name.endsWith('.doc') || file.name.endsWith('.docx') ? 'doc' : 'text',
        label: file.name.replace(/\.[^/.]+$/, ''), // Remove extension for label
        content
      }
      newDocs.push(doc)
    }

    onDocumentsChange([...documents, ...newDocs])
  }

  const removeDocument = (id: string) => {
    onDocumentsChange(documents.filter(d => d.id !== id))
  }

  const updateDocumentLabel = (id: string, label: string) => {
    onDocumentsChange(documents.map(d => d.id === id ? { ...d, label } : d))
  }

  return (
    <div className="space-y-6">
      {/* Context dump textarea */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Context Dump
        </label>
        <p className="text-sm text-gray-500 mb-2">
          Paste any relevant context: kickoff notes, company description, target criteria, etc.
        </p>
        <textarea
          value={contextDump}
          onChange={(e) => onContextChange(e.target.value)}
          placeholder="Paste your project context here...

Example:
Client: Gustafsberg
Product: Premium Swedish bone china, supplies Royal Court
Target: Singapore distributors and boutique retailers
Visit: CEO visiting Jan 26-28
Key differentiators: 200-year heritage, handcrafted in Sweden, Cartier/Acne collabs"
          className="w-full h-48 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* File upload area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Documents
        </label>
        <p className="text-sm text-gray-500 mb-2">
          Upload pitch decks, OneNote exports, PDFs, or any supporting documents
        </p>
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 mb-2">
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
          <p className="text-sm text-gray-400">
            PDF, DOC, TXT, MD files supported
          </p>
        </div>
      </div>

      {/* Uploaded documents list */}
      {documents.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Uploaded Documents ({documents.length})
          </label>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 truncate">{doc.name}</p>
                  <input
                    type="text"
                    value={doc.label}
                    onChange={(e) => updateDocumentLabel(doc.id, e.target.value)}
                    placeholder="Label this document..."
                    className="mt-1 w-full text-xs p-1 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
