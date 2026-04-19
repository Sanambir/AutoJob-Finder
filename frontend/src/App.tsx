import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { useAuthStore } from './store/auth'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import FeedPage from './pages/FeedPage'
import SearchPage from './pages/SearchPage'
import SavedPage from './pages/SavedPage'
import BoardPage from './pages/BoardPage'
import ConfigPage from './pages/ConfigPage'
import VerifyPage from './pages/VerifyPage'
import ProfilePage from './pages/ProfilePage'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import AdminJobs from './pages/admin/AdminJobs'
import AdminSystem from './pages/admin/AdminSystem'
import AdminActivity from './pages/admin/AdminActivity'

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
        <Routes>
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/verify" element={<VerifyPage />} />

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
            <Route path="config"  element={<ConfigPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
