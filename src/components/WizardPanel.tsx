'use client'

import { cn } from '@/lib/utils'
import { ChevronDown, Check } from 'lucide-react'
import { Project } from '@/lib/supabase'
import { SetupStep } from '@/components/wizard/SetupStep'
import { ContextStep } from '@/components/wizard/ContextStep'
import { CompaniesStep } from '@/components/wizard/CompaniesStep'
import { ContactsStep } from '@/components/wizard/ContactsStep'

export type WizardStep = 'setup' | 'context' | 'companies' | 'contacts' | 'emails'

interface StepConfig {
  id: WizardStep
  number: number
  title: string
}

const STEPS: StepConfig[] = [
  { id: 'setup', number: 1, title: 'Setup' },
  { id: 'context', number: 2, title: 'Context' },
  { id: 'companies', number: 3, title: 'Companies' },
  { id: 'contacts', number: 4, title: 'Contacts' },
  { id: 'emails', number: 5, title: 'Emails' },
]

interface WizardPanelProps {
  project: Project
  expandedStep: WizardStep
  onStepChange: (step: WizardStep) => void
  onProjectUpdate: (project: Project) => void
  completedSteps?: WizardStep[]
}

export function WizardPanel({
  project,
  expandedStep,
  onStepChange,
  onProjectUpdate,
  completedSteps = [],
}: WizardPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Wizard</h2>
      <div className="flex-1 flex flex-col gap-1">
        {STEPS.map((step) => {
          const isExpanded = expandedStep === step.id
          const isCompleted = completedSteps.includes(step.id)

          return (
            <div
              key={step.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Step Header */}
              <button
                onClick={() => onStepChange(step.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  isExpanded
                    ? 'bg-blue-50 border-b border-gray-200'
                    : 'bg-white hover:bg-gray-50'
                )}
              >
                {/* Step Number */}
                <div
                  className={cn(
                    'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isExpanded
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-600'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    step.number
                  )}
                </div>

                {/* Step Title */}
                <span
                  className={cn(
                    'flex-1 font-medium',
                    isExpanded ? 'text-blue-700' : 'text-gray-700'
                  )}
                >
                  {step.title}
                </span>

                {/* Expand/Collapse Indicator */}
                <ChevronDown
                  className={cn(
                    'w-5 h-5 text-gray-400 transition-transform duration-200',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>

              {/* Step Content */}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-200 ease-in-out',
                  isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className="p-4 bg-white max-h-[560px] overflow-y-auto">
                  <StepContent
                    step={step.id}
                    project={project}
                    onProjectUpdate={onProjectUpdate}
                    onStepComplete={() => onStepChange(getNextStep(step.id))}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getNextStep(current: WizardStep): WizardStep {
  const stepOrder: WizardStep[] = ['setup', 'context', 'companies', 'contacts', 'emails']
  const currentIndex = stepOrder.indexOf(current)
  return stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)]
}

interface StepContentProps {
  step: WizardStep
  project: Project
  onProjectUpdate: (project: Project) => void
  onStepComplete: () => void
}

function StepContent({ step, project, onProjectUpdate, onStepComplete }: StepContentProps) {
  switch (step) {
    case 'setup':
      return (
        <SetupStep
          project={project}
          onUpdate={onProjectUpdate}
          onComplete={onStepComplete}
        />
      )
    case 'context':
      return (
        <ContextStep
          project={project}
          onUpdate={onProjectUpdate}
          onComplete={onStepComplete}
        />
      )
    case 'companies':
      return (
        <CompaniesStep
          project={project}
          onUpdate={onProjectUpdate}
          onComplete={onStepComplete}
        />
      )
    case 'contacts':
      return (
        <ContactsStep
          project={project}
          onUpdate={onProjectUpdate}
          onComplete={onStepComplete}
        />
      )
    case 'emails':
      return (
        <div className="text-sm text-gray-500">
          Generate and manage outreach emails.
        </div>
      )
    default:
      return null
  }
}
