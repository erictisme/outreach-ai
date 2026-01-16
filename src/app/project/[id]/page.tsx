import Link from 'next/link'

type WizardStep = 'companies' | 'contacts' | 'emails' | 'export'

const STEPS: { key: WizardStep; label: string; description: string }[] = [
  { key: 'companies', label: 'Companies', description: 'Build your target list' },
  { key: 'contacts', label: 'Contacts', description: 'Find decision makers' },
  { key: 'emails', label: 'Emails', description: 'Generate personalized outreach' },
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

      <nav className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
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
