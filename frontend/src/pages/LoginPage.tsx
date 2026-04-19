import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import { LogoFull } from '../components/Logo'
import { useAuthStore } from '../store/auth'
import { useToast } from '../components/Toast'
import type { User } from '../types'

interface TokenResponse {
  user_id: string
  name: string
  email: string
}

type Mode = 'login' | 'register' | 'forgot' | 'reset'

export default function LoginPage() {
  const [mode, setMode]         = useState<Mode>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode]         = useState('')
  const [newPassword, setNew]   = useState('')
  const [loading, setLoading]   = useState(false)

  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()
  const toast    = useToast()

  async function handleAuth(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'register') {
        await apiFetch<TokenResponse>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, name }),
        })
      } else {
        await apiFetch<TokenResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
      }
      // Cookie is now set by the server — fetch the user profile to populate the store
      const me = await apiFetch<Omit<User, 'has_resume'>>('/auth/me')
      setAuth({ ...me, has_resume: false, is_verified: me.is_verified ?? false })
      navigate('/feed')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      toast('Reset code sent! Check your email.')
      setMode('reset')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, code, new_password: newPassword }),
      })
      toast('Password updated! You can now log in.')
      setMode('login')
      setCode('')
      setNew('')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] dot-grid flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <LogoFull size={52} />
          <p className="text-white/40 text-sm mt-3">AI-powered job discovery</p>
        </div>

        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-8">

          {/* ── Login / Register ── */}
          {(mode === 'login' || mode === 'register') && (
            <>
              <div className="flex bg-[#111] rounded-xl p-1 mb-8">
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all
                      ${mode === m ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {mode === 'register' && (
                  <input
                    type="text"
                    placeholder="Full name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {mode === 'login' && (
                <button
                  onClick={() => setMode('forgot')}
                  className="mt-4 w-full text-center text-white/30 text-xs hover:text-white/60 transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </>
          )}

          {/* ── Forgot password ── */}
          {mode === 'forgot' && (
            <>
              <div className="mb-6">
                <h2 className="text-white font-bold text-lg">Reset Password</h2>
                <p className="text-white/40 text-sm mt-1">
                  Enter your email and we'll send a 6-digit code.
                </p>
              </div>
              <form onSubmit={handleForgot} className="space-y-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send Reset Code'}
                </button>
              </form>
              <button
                onClick={() => setMode('login')}
                className="mt-4 w-full text-center text-white/30 text-xs hover:text-white/60 transition-colors"
              >
                ← Back to sign in
              </button>
            </>
          )}

          {/* ── Enter reset code ── */}
          {mode === 'reset' && (
            <>
              <div className="mb-6">
                <h2 className="text-white font-bold text-lg">Enter Code</h2>
                <p className="text-white/40 text-sm mt-1">
                  Check your email for the 6-digit code.
                </p>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <input
                  type="text"
                  placeholder="6-digit code"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  maxLength={6}
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 tracking-[0.3em] text-center font-bold"
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNew(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Set New Password'}
                </button>
              </form>
              <button
                onClick={() => setMode('forgot')}
                className="mt-4 w-full text-center text-white/30 text-xs hover:text-white/60 transition-colors"
              >
                ← Resend code
              </button>
            </>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">WorkfinderX v3.0.0</p>
      </div>
    </div>
  )
}
