import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ToastProvider } from './components/Toast'
import { useAuthStore } from './store/auth'
import { queryClient } from './queryClient'
import { apiFetch } from './api/client'
import type { User } from './types'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import FeedPage from './pages/FeedPage'
import SearchPage from './pages/SearchPage'
import SavedPage from './pages/SavedPage'
import BoardPage from './pages/BoardPage'
import ConfigPage from './pages/ConfigPage'
import VerifyPage from './pages/VerifyPage'
import ProfilePage from './pages/ProfilePage'
import AnalyticsPage from './pages/AnalyticsPage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminJobs from './pages/admin/AdminJobs'
import AdminSystem from './pages/admin/AdminSystem'
import AdminActivity from './pages/admin/AdminActivity'
import PrivacyPage from './pages/PrivacyPage'
import SupportPage from './pages/SupportPage'
import DocsPage from './pages/DocsPage'

/**
 * AuthGuard — runs on every page load (full reload triggered by login/logout).
 *
 * The fundamental issue we're fixing: the app trusts localStorage (Zustand)
 * to know who is logged in. But the server trusts the httpOnly cookie.
 * If they disagree — stale localStorage, replaced cookie, etc. — the user
 * sees the wrong account.
 *
 * Fix: on every mount, ask the server "who am I?" via /auth/me (reads the
 * real cookie). If the answer differs from localStorage, or if the server
 * says 401, we correct Zustand immediately before rendering anything.
 *
 * While verifying we show a full-screen spinner so no page renders with
 * potentially wrong user data.
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const user    = useAuthStore(s => s.user)
  const setAuth = useAuthStore(s => s.setAuth)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // No user in localStorage → not logged in, nothing to verify
    if (!user) { setReady(true); return }

    apiFetch<Omit<User, 'has_resume'>>('/auth/me')
      .then(me => {
        if (me.id !== user.id) {
          // Cookie belongs to a DIFFERENT user than what's in localStorage.
          // Clear every cached query so the new user sees only their data.
          queryClient.clear()
        }
        setAuth({ ...me, has_resume: false })
        setReady(true)
      })
      .catch(() => {
        // 401 / network error — session is invalid, clear local state.
        // ProtectedRoute will redirect to /login once user becomes null.
        queryClient.clear()
        useAuthStore.setState({ user: null })
        setReady(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (!user.is_admin) return <Navigate to="/feed" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthGuard>
        <Routes>
          <Route path="/login"   element={<LoginPage />} />
          <Route path="/verify"  element={<VerifyPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/docs"    element={<DocsPage />} />

          {/* Admin panel */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index        element={<AdminDashboard />} />
            <Route path="users"    element={<AdminUsers />} />
            <Route path="jobs"     element={<AdminJobs />} />
            <Route path="system"   element={<AdminSystem />} />
            <Route path="activity" element={<AdminActivity />} />
          </Route>

          {/* Main app */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/feed" replace />} />
            <Route path="feed"    element={<FeedPage />} />
            <Route path="search"  element={<SearchPage />} />
            <Route path="saved"   element={<SavedPage />} />
            <Route path="board"   element={<BoardPage />} />
            <Route path="config"    element={<ConfigPage />} />
            <Route path="profile"   element={<ProfilePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
        </AuthGuard>
      </BrowserRouter>
    </ToastProvider>
  )
}
