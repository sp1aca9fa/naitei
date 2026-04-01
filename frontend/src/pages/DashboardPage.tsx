import { CompanyResearchCard } from '../components/CompanyResearchCard'

export function DashboardPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
        <p className="text-sm text-gray-400">Job feed and stats coming in Phase 3.</p>
      </div>
      <CompanyResearchCard />
    </main>
  )
}
