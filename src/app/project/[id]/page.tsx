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
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <Link href="/" className="text-blue-600 hover:underline text-sm mb-2 inline-block">
          ← Back to projects
        </Link>
        <h1 className="text-2xl font-bold">Project: {id}</h1>
        <p className="text-gray-600 mt-1">Follow the steps to complete your outreach campaign.</p>
      </header>

      <nav className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STEPS.map((step, index) => (
          <Link
            key={step.key}
            href={`/project/${id}/${step.key}`}
            className="border border-gray-200 rounded-lg p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-sm text-gray-500 mb-1">Step {index + 1}</div>
            <div className="font-semibold">{step.label}</div>
            <div className="text-sm text-gray-600 mt-1">{step.description}</div>
          </Link>
        ))}
      </nav>
    </main>
  )
}
