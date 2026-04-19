import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../store/auth'
import { apiFetch } from '../api/client'
import { useToast } from './Toast'
import type { User } from '../types'

export default function Layout() {
  const user    = useAuthStore(s => s.user)
  const setAuth = useAuthStore(s => s.setAuth)
  const logout  = useAuthStore(s => s.logout)
  const toast   = useToast()
  const [sending, setSending] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Refresh user state from server on every page load.
  // Zustand persists to localStorage so is_verified / is_admin can go stale.
  useEffect(() => {
    apiFetch<User>('/auth/me')
      .then(me => setAuth(me))
      .catch((err: Error) => {
        // Only clear the session on genuine auth failures.
        // Network errors (server restarting, brief downtime) must NOT log the
        // user out — their cookie is still valid and they'll recover on next reload.
        const msg = err?.message ?? ''
        const isAuthError = msg === 'Not authenticated'
          || msg === 'Invalid or expired token'
          || msg === 'User not found'
        if (isAuthError) logout()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const showBanner = user && !user.is_verified && !dismissed

  async function resend() {
    setSending(true)
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST' })
      toast('Verification email sent — check your inbox.')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#111111]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {showBanner && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-amber-950/60 border-b border-amber-700/30 text-amber-300 text-xs flex-shrink-0">
            <span className="material-symbols-outlined text-base">mail</span>
            <span className="flex-1">
              Please verify your email address.{' '}
              <button
                onClick={resend}
                disabled={sending}
                className="underline underline-offset-2 hover:text-amber-200 transition-colors disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Resend verification email'}
              </button>
            </span>
            <button
              onClick={() => setDismissed(true)}
              className="text-amber-500 hover:text-amber-300 transition-colors"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
