'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users, Mail, Download, Check, ChevronLeft, ChevronRight, Table } from 'lucide-react'

export type WizardStep = 'companies' | 'contacts' | 'emails' | 'data' | 'export'

interface StepConfig {
  key: WizardStep
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const STEPS: StepConfig[] = [
  { key: 'companies', label: 'Companies', description: 'Build your target list', icon: Building2 },
  { key: 'contacts', label: 'Contacts', description: 'Find decision makers', icon: Users },
  { key: 'emails', label: 'Emails', description: 'Generate outreach', icon: Mail },
  { key: 'data', label: 'Data', description: 'Track & manage', icon: Table },
  { key: 'export', label: 'Export', description: 'Download your data', icon: Download },
]

interface WizardNavProps {
  projectId: string
  completedSteps?: WizardStep[]
}

export function WizardNav({ projectId, completedSteps = [] }: WizardNavProps) {
  const pathname = usePathname()

  // Determine current step from pathname
  const currentStep = STEPS.find(step => pathname.includes(`/${step.key}`))?.key || 'companies'
  const currentStepIndex = STEPS.findIndex(step => step.key === currentStep)

  const prevStep = currentStepIndex > 0 ? STEPS[currentStepIndex - 1] : null
  const nextStep = currentStepIndex < STEPS.length - 1 ? STEPS[currentStepIndex + 1] : null

  return (
    <div className="mb-6 sm:mb-8">
      {/* Progress bar */}
      <div className="flex items-center gap-1 sm:gap-2 mb-4 sm:mb-6 overflow-x-auto pb-2 -mx-1 px-1">
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep
          const isCompleted = completedSteps.includes(step.key) || index < currentStepIndex
          const Icon = step.icon

          return (
            <div key={step.key} className="flex-1 flex items-center min-w-0">
              <Link
                href={`/project/${projectId}/${step.key}`}
                className={`flex items-center gap-1 sm:gap-2 flex-1 p-2 sm:p-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : isCompleted
                    ? 'bg-green-50 border border-green-200 hover:border-green-300'
                    : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                  ) : (
                    <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                  )}
                </div>
                <div className="min-w-0 hidden sm:block">
                  <div className={`font-medium text-sm truncate ${isActive ? 'text-blue-700' : isCompleted ? 'text-green-700' : 'text-gray-700'}`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-gray-500 truncate hidden md:block">
                    {step.description}
                  </div>
                </div>
              </Link>
              {index < STEPS.length - 1 && (
                <div className={`w-2 sm:w-4 h-0.5 mx-0.5 sm:mx-1 flex-shrink-0 hidden xs:block ${
                  completedSteps.includes(step.key) || index < currentStepIndex
                    ? 'bg-green-300'
                    : 'bg-gray-200'
                }`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Back/Next navigation */}
      <div className="flex justify-between items-center gap-2">
        {prevStep ? (
          <Link
            href={`/project/${projectId}/${prevStep.key}`}
            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden xs:inline">Back to</span> {prevStep.label}
          </Link>
        ) : (
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Project Overview</span>
            <span className="sm:hidden">Overview</span>
          </Link>
        )}

        {nextStep && (
          <Link
            href={`/project/${projectId}/${nextStep.key}`}
            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <span className="hidden xs:inline">Next:</span> {nextStep.label}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

// Helper hook to determine completed steps based on data counts
export function useCompletedSteps(counts: { companies: number; contacts: number; emails: number; hasData?: boolean }): WizardStep[] {
  const completed: WizardStep[] = []

  if (counts.companies > 0) completed.push('companies')
  if (counts.contacts > 0) completed.push('contacts')
  if (counts.emails > 0) completed.push('emails')
  if (counts.contacts > 0 || counts.hasData) completed.push('data')

  return completed
}
