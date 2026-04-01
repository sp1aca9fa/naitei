import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { AnalyzePage } from '@/pages/AnalyzePage'
import { MyJobsPage } from '@/pages/MyJobsPage'
import { JobDetailPage } from '@/pages/JobDetailPage'
import { supabaseMisconfigured } from '@/lib/supabase'

export default function App() {
  if (supabaseMisconfigured) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full">
          <h1 className="text-lg font-bold text-red-700 mb-2">Missing environment variables</h1>
          <p className="text-sm text-gray-600 mb-4">
            Copy <code className="bg-gray-100 px-1 rounded">frontend/.env.example</code> to{' '}
            <code className="bg-gray-100 px-1 rounded">frontend/.env</code> and fill in your
            Supabase credentials.
          </p>
          <pre className="bg-gray-100 rounded p-3 text-xs text-gray-700">
            {`VITE_SUPABASE_URL=https://xxx.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
          <Route path="/jobs" element={<ProtectedRoute><AppLayout><MyJobsPage /></AppLayout></ProtectedRoute>} />
          <Route path="/jobs/analyze" element={<ProtectedRoute><AppLayout><AnalyzePage /></AppLayout></ProtectedRoute>} />
          <Route path="/jobs/:id" element={<ProtectedRoute><AppLayout><JobDetailPage /></AppLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><AppLayout><ProfilePage /></AppLayout></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
