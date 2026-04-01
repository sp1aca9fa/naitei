import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Naitei</h1>
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">Dashboard</Link>
          <Link to="/profile" className="text-sm text-gray-600 hover:text-gray-900">Profile</Link>
          <span className="text-sm text-gray-500">{user?.email}</span>
          <button onClick={signOut} className="text-sm text-gray-600 hover:text-gray-900">Sign out</button>
        </div>
      </header>
      {children}
    </div>
  )
}
