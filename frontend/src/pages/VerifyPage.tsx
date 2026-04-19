import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { useAuthStore } from '../store/auth'
import { LogoMark } from '../components/Logo'

type State = 'verifying' | 'success' | 'error'

export default function VerifyPage() {
  const [params]   = useSearchParams()
  const [state, setState] = useState<State>('verifying')
  const [message, setMessage] = useState('')
  const setAuth    = useAuthStore(s => s.setAuth)
  const user       = useAuthStore(s => s.user)
  const navigate   = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setState('error')
      setMessage('No verification token found in the link.')
      return
    }

    apiFetch<{ message: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async data => {
        setState('success')
        setMessage(data.message)
        // Re-fetch /auth/me so Zustand gets the server-confirmed is_verified: true.
        // This is more reliable than patching state locally — if the DB commit failed
        // for any reason, we'd see the real state here rather than wrongly hiding the banner.
        try {
          const me = await apiFetch<import('../types').User>('/auth/me')
          setAuth(me)
        } catch {
          // Fallback: patch locally if /auth/me fails (e.g. not logged in yet)
          if (user) setAuth({ ...user, is_verified: true })
        }
      })
      .catch(err => {
        setState('error')
        setMessage((err as Error).message)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-[#0e0e0e] dot-grid flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <LogoMark size={48} />
        <h1 className="text-white font-black text-2xl mt-3 tracking-tight mb-8" style={{ letterSpacing: '0.12em' }}>WORKFINDERX</h1>

        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-8">
          {state === 'verifying' && (
            <>
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/60 text-sm">Verifying your email…</p>
            </>
          )}

          {state === 'success' && (
            <>
              <span className="material-symbols-outlined text-5xl text-white mb-4 block"
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <h2 className="text-white font-bold text-lg mb-2">Email Verified!</h2>
              <p className="text-white/50 text-sm mb-6">{message}</p>
              <button
                onClick={() => navigate('/feed')}
                className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all"
              >
                Go to Dashboard
              </button>
            </>
          )}

          {state === 'error' && (
            <>
              <span className="material-symbols-outlined text-5xl text-white/40 mb-4 block">
                error
              </span>
              <h2 className="text-white font-bold text-lg mb-2">Verification Failed</h2>
              <p className="text-white/50 text-sm mb-6">{message}</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all"
              >
                Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
