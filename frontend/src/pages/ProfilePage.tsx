import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuthStore } from '../store/auth'
import { useToast } from '../components/Toast'
import type { Stats } from '../types'

interface ProfileData {
  id: string
  name: string
  email: string
  match_threshold: number
  has_resume: boolean
  is_verified: boolean
  created_at: string | null
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-white/60" style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div>
        <div className="text-xl font-extrabold text-white tracking-tight">{value}</div>
        <div className="text-xs text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const toast      = useToast()
  const user       = useAuthStore(s => s.user)
  const setAuth    = useAuthStore(s => s.setAuth)
  const logout     = useAuthStore(s => s.logout)

  // Edit profile state
  const [name,  setName]  = useState(user?.name  ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  // Change password state
  const [currPw, setCurrPw]       = useState('')
  const [newPw,  setNewPw]        = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw]   = useState(false)

  // Delete account state
  const [deletePw, setDeletePw]     = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting]     = useState(false)

  const { data: profile } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn:  () => apiFetch('/user/me'),
  })

  // Sync form fields when profile loads (in case it differs from cached store)
  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setEmail(profile.email)
    }
  }, [profile])

  const { data: stats } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn:  () => apiFetch('/stats'),
  })

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—'

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      const res = await apiFetch<{ name: string; email: string; is_verified: boolean }>(
        '/user/profile',
        { method: 'PATCH', body: JSON.stringify({ name: name.trim(), email }) }
      )
      if (user) setAuth({ ...user, name: res.name, email: res.email, is_verified: res.is_verified })
      qc.invalidateQueries({ queryKey: ['profile'] })
      toast('Profile updated!')
      if (!res.is_verified && email !== user?.email) {
        toast('Verification email sent to your new address.')
      }
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPw !== confirmPw) {
      toast('Passwords do not match', false)
      return
    }
    setSavingPw(true)
    try {
      await apiFetch('/user/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password: currPw, new_password: newPw }),
      })
      toast('Password changed successfully!')
      setCurrPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setSavingPw(false)
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    setDeleting(true)
    try {
      await apiFetch('/user/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePw }),
      })
      await logout()
      navigate('/login')
    } catch (err) {
      toast((err as Error).message, false)
    } finally {
      setDeleting(false)
    }
  }

  const initials = (user?.name ?? 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="h-full flex flex-col bg-[#111111] dot-grid overflow-hidden">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-8 md:px-12 border-b border-white/[0.03] bg-[#111111] flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Profile</h1>
          <p className="text-sm font-medium tracking-tight text-white/45">Manage your account</p>
        </div>
        <button
          onClick={async () => { await logout(); navigate('/login') }}
          className="flex items-center gap-2 px-4 py-2 text-white/40 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg text-sm font-medium transition-all"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign Out
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8 md:p-12 flex flex-col gap-8">

          {/* Account card */}
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-6 flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white text-xl font-black flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-white font-bold text-lg truncate">{profile?.name ?? user?.name}</h2>
                {profile?.is_verified
                  ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/10 text-white/70 text-[10px] font-bold rounded uppercase tracking-wide">
                      <span className="material-symbols-outlined" style={{ fontSize: 11, fontVariationSettings: "'FILL' 1" }}>verified</span>
                      Verified
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-amber-950/60 text-amber-400 text-[10px] font-bold rounded uppercase tracking-wide border border-amber-700/30">
                      Unverified
                    </span>
                  )
                }
              </div>
              <p className="text-white/40 text-sm truncate mt-0.5">{profile?.email ?? user?.email}</p>
              <p className="text-white/25 text-xs mt-1">Member since {memberSince}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Jobs"  value={stats?.total_jobs  ?? '—'} icon="work" />
            <StatCard label="Emails Sent" value={stats?.emailed     ?? '—'} icon="mail" />
            <StatCard label="Avg Score"   value={stats?.avg_score != null ? `${stats.avg_score}%` : '—'} icon="percent" />
            <StatCard label="This Week"   value={stats?.recent_7d   ?? '—'} icon="calendar_today" />
          </div>

          {/* Edit Profile */}
          <section className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04]">
              <h3 className="text-sm font-bold text-white">Edit Profile</h3>
              <p className="text-xs text-white/40 mt-0.5">Update your name or email address</p>
            </div>
            <form onSubmit={handleSaveProfile} className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors"
                />
                <p className="text-xs text-white/25 mt-1.5">Changing your email will require re-verification.</p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingProfile || (name.trim() === (profile?.name ?? user?.name) && email === (profile?.email ?? user?.email))}
                  className="px-6 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-all disabled:opacity-40"
                >
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </section>

          {/* Change Password */}
          <section className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.04]">
              <h3 className="text-sm font-bold text-white">Change Password</h3>
              <p className="text-xs text-white/40 mt-0.5">Minimum 6 characters</p>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">Current Password</label>
                <input
                  type="password"
                  value={currPw}
                  onChange={e => setCurrPw(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">New Password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className={`w-full bg-[#111] border rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-colors
                      ${confirmPw && confirmPw !== newPw ? 'border-red-500/50 focus:border-red-500' : 'border-white/[0.08] focus:border-white/30'}`}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingPw || !currPw || !newPw || !confirmPw}
                  className="px-6 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-all disabled:opacity-40"
                >
                  {savingPw ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </section>

          {/* Danger Zone */}
          <section className="bg-[#1a1a1a] border border-red-900/30 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-red-900/20">
              <h3 className="text-sm font-bold text-red-400">Danger Zone</h3>
              <p className="text-xs text-white/40 mt-0.5">These actions are permanent and cannot be undone</p>
            </div>
            <div className="p-6">
              {!showDelete ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Delete Account</p>
                    <p className="text-xs text-white/40 mt-0.5">Permanently remove your account and all associated data</p>
                  </div>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="px-4 py-2 border border-red-700/40 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-950/40 transition-all"
                  >
                    Delete Account
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDeleteAccount} className="flex flex-col gap-4">
                  <div className="flex items-start gap-3 p-4 bg-red-950/20 border border-red-900/30 rounded-xl">
                    <span className="material-symbols-outlined text-red-400 flex-shrink-0" style={{ fontSize: 20 }}>warning</span>
                    <p className="text-xs text-red-300/80">
                      This will permanently delete your account, all jobs, resumes, and saved data. Enter your password to confirm.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/50 mb-1.5 block uppercase tracking-wide">Confirm Password</label>
                    <input
                      type="password"
                      value={deletePw}
                      onChange={e => setDeletePw(e.target.value)}
                      required
                      placeholder="Enter your password to confirm"
                      className="w-full bg-[#111] border border-red-900/30 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-red-600/50 transition-colors"
                    />
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowDelete(false); setDeletePw('') }}
                      className="px-4 py-2 text-white/50 hover:text-white text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={deleting || !deletePw}
                      className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-40"
                    >
                      {deleting ? 'Deleting…' : 'Permanently Delete'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
