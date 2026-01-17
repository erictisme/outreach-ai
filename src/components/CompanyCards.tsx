'use client'

import { useState } from 'react'
import { Check, Building2, ExternalLink, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Company } from '@/types'
import { cn } from '@/lib/utils'

interface CompanyCardsProps {
  companies: Company[]
  selectedIds: Set<number>
  onSelectionChange: (ids: Set<number>) => void
  onDelete?: (index: number) => void
}

export function CompanyCards({ companies, selectedIds, onSelectionChange, onDelete }: CompanyCardsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(index)) {
      newSelected.delete(index)
    } else {
      newSelected.add(index)
    }
    onSelectionChange(newSelected)
  }

  const selectAll = () => {
    onSelectionChange(new Set(companies.map((_, i) => i)))
  }

  const deselectAll = () => {
    onSelectionChange(new Set())
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>No companies yet</p>
        <p className="text-sm mt-1">Generate with AI or paste company names above</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Selection controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">{selectedIds.size}</span> of {companies.length} selected
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Select All
          </button>
          <button
            onClick={deselectAll}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Company cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((company, index) => {
          const isSelected = selectedIds.has(index)
          const isExpanded = expandedId === company.id

          return (
            <div
              key={company.id || index}
              className={cn(
                'relative rounded-xl border-2 p-4 transition-all cursor-pointer',
                isSelected
                  ? 'border-blue-500 bg-blue-50/50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              )}
              onClick={() => toggleSelect(index)}
            >
              {/* Selection checkmark */}
              <div
                className={cn(
                  'absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center transition-colors',
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-400'
                )}
              >
                <Check className="w-4 h-4" />
              </div>

              {/* Company info */}
              <div className="pr-8">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
                  {company.name}
                </h3>
                {company.type && (
                  <span className="inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded mb-2">
                    {company.type}
                  </span>
                )}
                {company.description && (
                  <p className={cn(
                    'text-sm text-gray-600 mb-2',
                    isExpanded ? '' : 'line-clamp-2'
                  )}>
                    {company.description}
                  </p>
                )}
              </div>

              {/* Footer with website and actions */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {company.website ? (
                    <a
                      href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {company.domain || 'Website'}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400 italic">No website</span>
                  )}
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {company.description && company.description.length > 80 && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : company.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                      title={isExpanded ? 'Show less' : 'Show more'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(index)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Remove company"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Relevance indicator */}
              {company.relevance && (
                <div className="absolute bottom-3 left-3">
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded',
                    company.relevance.toLowerCase().includes('high')
                      ? 'bg-green-100 text-green-700'
                      : company.relevance.toLowerCase().includes('low')
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  )}>
                    {company.relevance.split('-')[0].trim()}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
