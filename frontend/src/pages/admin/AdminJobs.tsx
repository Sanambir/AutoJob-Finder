import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'
import { useToast } from '../../components/Toast'

interface AdminJob {
  id: string; title: string; company: string; platform: string
  location: string; status: string; match_score: number | null
  error: string; created_at: string; updated_at: string
  user_email: string; user_id: string
}
interface JobsPage { jobs: AdminJob[]; total: number; page: number; pages: number }

const STATUS_FILTERS = ['all', 'error', 'emailed', 'scored', 'below_threshold', 'pending', 'queued', 'scoring', 'tailoring', 'emailing']

const STATUS_STYLE: Record<string, string> = {
  emailed:         'bg-white/10 text-white',
  scored:          'bg-white/10 text-white/70',
  below_threshold: 'bg-white/5 text-white/40',
  pending:         'bg-white/5 text-white/40',
  queued:          'bg-blue-900/40 text-blue-300',
  scoring:         'bg-blue-900/40 text-blue-300',
  tailoring:       'bg-blue-900/40 text-blue-300',
  emailing:        'bg-blue-900/40 text-blue-300',
  error:           'bg-red-900/40 text-red-300',
}

export default function AdminJobs() {
  const toast = useToast()
  const qc    = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [page, setPage]                 = useState(1)
  const [expanded, setExpanded]         = useState<string | null>(null)

  const { data, isLoading } = useQuery<JobsPage>({
    queryKey: ['admin-jobs', statusFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: '25' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      return apiFetch(`/admin/jobs?${params}`)
    },
    placeholderData: prev => prev,
  })

  const [rescoring, setRescoring] = useState(false)

  async function rescoreAll() {
    setRescoring(true)
    try {
      const res = await apiFetch<{ queued: number }>('/admin/jobs/rescore-all', { method: 'POST' })
      toast(`Re-scoring ${res.queued} jobs with updated resume reading`)
      qc.invalidateQueries({ queryKey: ['admin-jobs'] })
    } catch (err) { toast((err as Error).message, false) }
    finally { setRescoring(false) }
  }

  async function retry(id: string) {
    try {
      await apiFetch(`/admin/jobs/${id}/retry`, { method: 'POST' })
      toast('Job requeued')
      qc.invalidateQueries({ queryKey: ['admin-jobs'] })
    } catch (err) { toast((err as Error).message, false) }
  }

  async function del(id: string) {
    try {
      await apiFetch(`/admin/jobs/${id}`, { method: 'DELETE' })
      toast('Job deleted')
      qc.invalidateQueries({ queryKey: ['admin-jobs'] })
    } catch (err) { toast((err as Error).message, false) }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111]">
      {/* Header */}
      <header className="px-8 py-5 border-b border-white/[0.04] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Jobs Monitor</h1>
            <p className="text-xs text-white/40 mt-0.5">{data?.total ?? '…'} total jobs across all users</p>
          </div>
          <div className="flex items-center gap-3">
          <button
            onClick={rescoreAll}
            disabled={rescoring}
            title="Re-run scoring on all completed/errored jobs using the current resume"
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/[0.08] rounded-xl text-xs text-white/50 hover:text-white disabled:opacity-40 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {rescoring ? 'hourglass_empty' : 'replay'}
            </span>
            {rescoring ? 'Re-scoring…' : 'Re-score all'}
          </button>
          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2 w-56">
            <span className="material-symbols-outlined text-white/30" style={{ fontSize: 16 }}>search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search title or company…"
              className="bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none flex-1"
            />
          </div>
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all capitalize
                ${statusFilter === s ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
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
                <th className="text-left px-6 py-3 font-semibold">Job</th>
                <th className="text-left px-4 py-3 font-semibold">User</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Score</th>
                <th className="text-left px-4 py-3 font-semibold">Platform</th>
                <th className="text-left px-4 py-3 font-semibold">Created</th>
                <th className="text-right px-6 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {(data?.jobs ?? []).map(j => (
                <>
                  <tr key={j.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <p className="text-white font-medium truncate max-w-[220px]" title={j.title}>{j.title || '—'}</p>
                      <p className="text-white/40 text-xs truncate max-w-[220px]">{j.company}</p>
                    </td>
                    <td className="px-4 py-3 text-white/50 text-xs truncate max-w-[140px]">{j.user_email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_STYLE[j.status] ?? 'bg-white/5 text-white/40'}`}>
                        {j.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-white/60">
                      {j.match_score != null ? `${j.match_score}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs capitalize">{j.platform || '—'}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {j.error && (
                          <button
                            onClick={() => setExpanded(expanded === j.id ? null : j.id)}
                            title="View error"
                            className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-950/20 transition-all"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bug_report</span>
                          </button>
                        )}
                        {j.status === 'error' && (
                          <button onClick={() => retry(j.id)} title="Retry"
                            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all">
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
                          </button>
                        )}
                        <button onClick={() => del(j.id)} title="Delete"
                          className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-950/20 transition-all">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === j.id && j.error && (
                    <tr key={`${j.id}-err`}>
                      <td colSpan={7} className="px-6 pb-3">
                        <div className="bg-red-950/20 border border-red-900/30 rounded-lg px-4 py-3 text-xs text-red-300/80 font-mono whitespace-pre-wrap break-all">
                          {j.error}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
    </div>
  )
}
