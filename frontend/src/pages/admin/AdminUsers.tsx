import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'
import { useToast } from '../../components/Toast'
import { useAuthStore } from '../../store/auth'

interface AdminUser {
  id: string; name: string; email: string
  is_verified: boolean; is_admin: boolean
  locked_until: string | null; failed_attempts: number
  created_at: string | null; job_count: number
  emails_sent: number; last_active: string | null
}
interface UsersPage { users: AdminUser[]; total: number; page: number; pages: number }

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${color}`}>
      {label}
    </span>
  )
}

export default function AdminUsers() {
  const toast      = useToast()
  const qc         = useQueryClient()
  const me         = useAuthStore(s => s.user)
  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

  const { data, isLoading } = useQuery<UsersPage>({
    queryKey: ['admin-users', search, page],
    queryFn: () => apiFetch(`/admin/users?search=${encodeURIComponent(search)}&page=${page}&page_size=20`),
    placeholderData: prev => prev,
  })

  async function action(url: string, method = 'POST', label = '') {
    try {
      await apiFetch(url, { method })
      toast(label || 'Done!')
      qc.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (err) { toast((err as Error).message, false) }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111]">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/[0.04] flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Users</h1>
          <p className="text-xs text-white/40 mt-0.5">{data?.total ?? '…'} total accounts</p>
        </div>
        <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2 w-64">
          <span className="material-symbols-outlined text-white/30" style={{ fontSize: 16 }}>search</span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search name or email…"
            className="bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none flex-1"
          />
        </div>
      </header>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04] text-white/30 text-[10px] uppercase tracking-widest">
                <th className="text-left px-6 py-3 font-semibold">User</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Jobs</th>
                <th className="text-right px-4 py-3 font-semibold">Emails</th>
                <th className="text-left px-4 py-3 font-semibold">Joined</th>
                <th className="text-left px-4 py-3 font-semibold">Last Active</th>
                <th className="text-right px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {(data?.users ?? []).map(u => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  {/* User */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                        {u.name[0]?.toUpperCase() ?? 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate max-w-[180px]">{u.name}</p>
                        <p className="text-white/40 text-xs truncate max-w-[180px]">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Status badges */}
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      {u.is_admin    && <Badge label="Admin"     color="bg-white/20 text-white" />}
                      {u.is_verified && <Badge label="Verified"  color="bg-white/10 text-white/60" />}
                      {!u.is_verified && <Badge label="Unverified" color="bg-amber-950/60 text-amber-400 border border-amber-800/30" />}
                      {u.locked_until && new Date(u.locked_until) > new Date() &&
                        <Badge label="Locked" color="bg-red-950/60 text-red-400" />}
                    </div>
                  </td>

                  <td className="px-4 py-4 text-right text-white/70 font-mono text-xs">{u.job_count}</td>
                  <td className="px-4 py-4 text-right text-white/70 font-mono text-xs">{u.emails_sent}</td>

                  <td className="px-4 py-4 text-white/40 text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-4 text-white/40 text-xs">
                    {u.last_active ? new Date(u.last_active).toLocaleDateString() : 'Never'}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {!u.is_verified && (
                        <button
                          onClick={() => action(`/admin/users/${u.id}/verify`, 'POST', `Verified ${u.email}`)}
                          title="Force verify"
                          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified</span>
                        </button>
                      )}
                      {u.locked_until && new Date(u.locked_until) > new Date() && (
                        <button
                          onClick={() => action(`/admin/users/${u.id}/unlock`, 'POST', `Unlocked ${u.email}`)}
                          title="Unlock account"
                          className="p-1.5 rounded-lg text-amber-400/60 hover:text-amber-400 hover:bg-amber-950/30 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock_open</span>
                        </button>
                      )}
                      {u.id !== me?.id && (
                        <button
                          onClick={() => action(`/admin/users/${u.id}/admin`, 'PATCH',
                            u.is_admin ? `Removed admin from ${u.email}` : `Made ${u.email} admin`)}
                          title={u.is_admin ? 'Remove admin' : 'Make admin'}
                          className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            {u.is_admin ? 'shield' : 'shield_with_heart'}
                          </span>
                        </button>
                      )}
                      {u.id !== me?.id && (
                        <button
                          onClick={() => setConfirmDelete(u)}
                          title="Delete user"
                          className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-950/20 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 border-t border-white/[0.04] flex-shrink-0">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 transition-colors">
            ← Prev
          </button>
          <span className="text-xs text-white/30">{page} / {data?.pages}</span>
          <button onClick={() => setPage(p => Math.min(data?.pages ?? 1, p + 1))} disabled={page === (data?.pages ?? 1)}
            className="px-3 py-1.5 text-xs text-white/50 hover:text-white disabled:opacity-30 transition-colors">
            Next →
          </button>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold mb-2">Delete user?</h3>
            <p className="text-white/50 text-sm mb-1">
              This will permanently delete <strong className="text-white">{confirmDelete.email}</strong>
            </p>
            <p className="text-white/30 text-xs mb-6">
              All their jobs, resumes, and data will be erased.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm text-white/50 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  action(`/admin/users/${confirmDelete.id}`, 'DELETE', `Deleted ${confirmDelete.email}`)
                  setConfirmDelete(null)
                }}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-all">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
