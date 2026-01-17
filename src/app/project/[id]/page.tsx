import Link from 'next/link'
import { Zap } from 'lucide-react'

type WizardStep = 'companies' | 'contacts' | 'emails' | 'data' | 'export'

const STEPS: { key: WizardStep; label: string; description: string }[] = [
  { key: 'companies', label: 'Companies', description: 'Build your target list' },
  { key: 'contacts', label: 'Contacts', description: 'Find decision makers' },
  { key: 'emails', label: 'Emails', description: 'Generate personalized outreach' },
  { key: 'data', label: 'Data', description: 'Track outreach & follow-ups' },
  { key: 'export', label: 'Export', description: 'Download your data' },
]

interface ProjectPageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { id } = await params

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <header className="mb-6 sm:mb-8">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← Back to projects
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold">Project: {id}</h1>
        <p className="text-gray-600 mt-1 text-sm sm:text-base">Follow the steps to complete your outreach campaign.</p>
      </header>

      {/* Single-Page Workflow Button */}
      <div className="mb-6 sm:mb-8">
        <Link
          href={`/project/${id}/workflow`}
          className="flex items-center justify-center gap-3 w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Zap className="w-5 h-5" />
          <span className="font-semibold text-lg">Open Single-Page Workflow</span>
        </Link>
        <p className="text-center text-sm text-gray-500 mt-2">
          Streamlined view with all steps on one page
        </p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-slate-50 px-3 text-sm text-gray-500">Or use step-by-step view</span>
        </div>
      </div>

      <nav className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mt-6">
        {STEPS.map((step, index) => (
          <Link
            key={step.key}
            href={`/project/${id}/${step.key}`}
            className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-xs sm:text-sm text-gray-500 mb-1">Step {index + 1}</div>
            <div className="font-semibold text-sm sm:text-base">{step.label}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1 hidden sm:block">{step.description}</div>
          </Link>
        ))}
      </nav>
    </main>
  )
}
