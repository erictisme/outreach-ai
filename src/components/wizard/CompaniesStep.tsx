'use client'

import { useState } from 'react'
import { Minus, Plus, Sparkles, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project } from '@/lib/supabase'
import { ProjectContext, Segment } from '@/types'

interface SegmentWithCount extends Segment {
  count: number
}

interface CompaniesStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function CompaniesStep({ project }: CompaniesStepProps) {
  const schemaConfig = project.schema_config as {
    extractedContext?: ProjectContext
  }

  const extractedContext = schemaConfig.extractedContext

  // Initialize segments with counts
  const [segmentsWithCounts, setSegmentsWithCounts] = useState<SegmentWithCount[]>(
    () => (extractedContext?.segments || []).map((seg) => ({
      ...seg,
      count: 5, // default count per segment
    }))
  )

  const [showImport, setShowImport] = useState(false)

  // No extracted context yet
  if (!extractedContext) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 2 (Context) first to define target segments.
      </div>
    )
  }

  // No segments defined
  if (segmentsWithCounts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        No segments defined. Go back to Step 2 (Context) to add target segments.
      </div>
    )
  }

  const handleCountChange = (segmentId: string, delta: number) => {
    setSegmentsWithCounts((prev) =>
      prev.map((seg) =>
        seg.id === segmentId
          ? { ...seg, count: Math.max(1, Math.min(50, seg.count + delta)) }
          : seg
      )
    )
  }

  const handleCountInput = (segmentId: string, value: string) => {
    const num = parseInt(value, 10)
    if (!isNaN(num)) {
      setSegmentsWithCounts((prev) =>
        prev.map((seg) =>
          seg.id === segmentId
            ? { ...seg, count: Math.max(1, Math.min(50, num)) }
            : seg
        )
      )
    }
  }

  const totalCount = segmentsWithCounts.reduce((sum, seg) => sum + seg.count, 0)

  const handleGenerate = () => {
    // F10 will implement this
    console.log('Generate companies:', segmentsWithCounts)
  }

  const handleImportClick = () => {
    setShowImport(true)
  }

  return (
    <div className="space-y-4">
      {/* Segment Cards */}
      <div className="space-y-3">
        {segmentsWithCounts.map((segment) => (
          <div
            key={segment.id}
            className="p-3 border border-gray-200 rounded-lg bg-white"
          >
            <div className="flex items-start gap-3">
              {/* Segment Info */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900 text-sm">
                  {segment.name}
                </h4>
                {segment.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {segment.description}
                  </p>
                )}
              </div>

              {/* Count Controls */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleCountChange(segment.id, -1)}
                  disabled={segment.count <= 1}
                  className={cn(
                    'p-1.5 rounded-md border transition-colors',
                    segment.count <= 1
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  value={segment.count}
                  onChange={(e) => handleCountInput(segment.id, e.target.value)}
                  className="w-10 text-center text-sm font-medium border border-gray-300 rounded-md py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={() => handleCountChange(segment.id, 1)}
                  disabled={segment.count >= 50}
                  className={cn(
                    'p-1.5 rounded-md border transition-colors',
                    segment.count >= 50
                      ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Total Count */}
      <div className="text-sm text-gray-600 text-right">
        Total: <span className="font-semibold">{totalCount}</span> companies
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          className="flex-1 py-2 px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Generate Companies
        </button>
        <button
          onClick={handleImportClick}
          className="py-2 px-4 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <Upload className="w-4 h-4" />
          I have companies
        </button>
      </div>

      {/* Import Section (revealed when clicking "I have companies") */}
      {showImport && (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-900">Import Companies</h4>
            <button
              onClick={() => setShowImport(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
          <textarea
            placeholder="Paste company names (one per line)..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Upload CSV
            </button>
            <button
              className="flex-1 py-2 px-3 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Import & Enrich
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
