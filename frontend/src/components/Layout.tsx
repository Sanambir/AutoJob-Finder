import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../store/auth'
import { apiFetch } from '../api/client'
import { useToast } from './Toast'
import type { User } from '../types'

interface SiteBanner { message: string | null; color: 'info' | 'warning' | 'success' | 'error' }

const BANNER_DISMISS_KEY = 'wfx_banner_dismissed'

const BANNER_STYLES: Record<string, string> = {
  info:    'bg-blue-950/60 border-blue-700/30 text-blue-300',
  warning: 'bg-amber-950/60 border-amber-700/30 text-amber-300',
  success: 'bg-emerald-950/60 border-emerald-700/30 text-emerald-300',
  error:   'bg-red-950/60 border-red-700/30 text-red-300',
}
const BANNER_ICON: Record<string, string> = {
  info: 'info', warning: 'warning', success: 'check_circle', error: 'error',
}

export default function Layout() {
  const user    = useAuthStore(s => s.user)
  const setAuth = useAuthStore(s => s.setAuth)
  const logout  = useAuthStore(s => s.logout)
  const toast   = useToast()
  const [sending, setSending] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [siteBanner, setSiteBanner] = useState<SiteBanner | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

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

  // Fetch site-wide banner
  useEffect(() => {
    apiFetch<SiteBanner>('/banner')
      .then(b => {
        if (b?.message) {
          // Dismiss state is keyed to the message content so new messages always show
          const dismissedMsg = sessionStorage.getItem(BANNER_DISMISS_KEY)
          setSiteBanner(b)
          setBannerDismissed(dismissedMsg === b.message)
        }
      })
      .catch(() => {}) // non-critical
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
      <div className="flex-1 flex flex-col overflow-hidden pb-16 md:pb-0">
        {siteBanner?.message && !bannerDismissed && (
          <div className={`flex items-center gap-3 px-5 py-2.5 border-b text-xs flex-shrink-0 ${BANNER_STYLES[siteBanner.color] ?? BANNER_STYLES.info}`}>
            <span className="material-symbols-outlined text-base flex-shrink-0">{BANNER_ICON[siteBanner.color] ?? 'info'}</span>
            <span className="flex-1">{siteBanner.message}</span>
            <button
              onClick={() => { sessionStorage.setItem(BANNER_DISMISS_KEY, siteBanner.message!); setBannerDismissed(true) }}
              className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}
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
