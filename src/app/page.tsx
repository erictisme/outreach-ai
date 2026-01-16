import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Outreach AI</h1>
        <p className="text-gray-600 mt-2">
          B2B outreach automation: Project → Companies → Contacts → Emails → Export
        </p>
      </header>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Link
            href="/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Project
          </Link>
        </div>

        <div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No projects yet. Create your first project to get started.
        </div>
      </section>
    </main>
  )
}
