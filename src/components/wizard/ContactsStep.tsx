'use client'

import { useState, useMemo } from 'react'
import { Check, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Project } from '@/lib/supabase'
import { Company } from '@/types'

interface CompanyWithSelection extends Company {
  selected: boolean
}

interface ContactsStepProps {
  project: Project
  onUpdate: (project: Project) => void
  onComplete: () => void
}

export function ContactsStep({ project, onUpdate, onComplete }: ContactsStepProps) {
  const schemaConfig = project.schema_config as {
    extractedContext?: { targetRoles?: string[] }
    companies?: Company[]
  }

  const companies: Company[] = schemaConfig.companies || []

  // Track selected company IDs
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Default: all companies selected
    return new Set(companies.map((c) => c.id))
  })

  // No companies yet
  if (companies.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4 text-center">
        Complete Step 3 (Companies) first to add target companies.
      </div>
    )
  }

  const handleToggle = (companyId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(companyId)) {
        next.delete(companyId)
      } else {
        next.add(companyId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(companies.map((c) => c.id)))
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const selectedCount = selectedIds.size
  const targetRoles = schemaConfig.extractedContext?.targetRoles || []

  return (
    <div className="space-y-4">
      {/* Header with selection controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{selectedCount}</span> of{' '}
          <span className="font-semibold">{companies.length}</span> companies selected
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Select all
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDeselectAll}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Deselect all
          </button>
        </div>
      </div>

      {/* Explanation */}
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded-md">
        Find contacts at selected companies
        {targetRoles.length > 0 && (
          <span className="block mt-1">
            Target roles: {targetRoles.slice(0, 3).join(', ')}
            {targetRoles.length > 3 && ` +${targetRoles.length - 3} more`}
          </span>
        )}
      </div>

      {/* Company list with checkboxes */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {companies.map((company) => {
          const isSelected = selectedIds.has(company.id)
          return (
            <button
              key={company.id}
              onClick={() => handleToggle(company.id)}
              className={cn(
                'w-full p-3 border rounded-lg text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox indicator */}
                <div
                  className={cn(
                    'flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                    isSelected
                      ? 'bg-blue-500 border-blue-500'
                      : 'border-gray-300 bg-white'
                  )}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>

                {/* Company info */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-gray-900 text-sm">
                    {company.name}
                  </h4>
                  {company.type && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {company.type}
                    </p>
                  )}
                  {company.website && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {company.website}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Next button */}
      <button
        onClick={onComplete}
        disabled={selectedCount === 0}
        className={cn(
          'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2',
          selectedCount === 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        )}
      >
        <Users className="w-4 h-4" />
        Find Contacts ({selectedCount} companies)
      </button>
    </div>
  )
}
