import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'
import { useToast } from '../../components/Toast'

interface AdminActivityLog {
  id: number
  event_type: string
  message: string
  created_at: string
  user_email: string
  user_id: string
  job_id: string | null
}

interface ActivityPage {
  logs: AdminActivityLog[]
  total: number
  page: number
  pages: number
}

const EVENT_STYLE: Record<string, string> = {
  search:      'bg-blue-900/30 text-blue-300',
  pipeline:    'bg-purple-900/30 text-purple-300',
  email:       'bg-emerald-900/30 text-emerald-300',
  error:       'bg-red-900/30 text-red-300',
  login:       'bg-white/10 text-white/60',
  register:    'bg-white/10 text-white/60',
  delete:      'bg-red-900/20 text-red-400/80',
  verify:      'bg-emerald-900/20 text-emerald-400/80',
  score:       'bg-blue-900/20 text-blue-300/80',
  tailor:      'bg-purple-900/20 text-purple-300/80',
}

const EVENT_TYPES = ['all', 'search', 'pipeline', 'email', 'error', 'login', 'register', 'score', 'tailor', 'delete']

function eventStyle(type: string) {
  const key = Object.keys(EVENT_STYLE).find(k => type.toLowerCase().includes(k))
  return key ? EVENT_STYLE[key] : 'bg-white/5 text-white/40'
}

export default function AdminActivity() {
  const toast = useToast()
  const qc    = useQueryClient()
  const [eventFilter, setEventFilter] = useState('all')
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(1)

  const { data, isLoading } = useQuery<ActivityPage>({
    queryKey: ['admin-activity', eventFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), page_size: '50' })
      if (eventFilter !== 'all') params.set('event_type', eventFilter)
      if (search) params.set('search', search)
      return apiFetch(`/admin/activity?${params}`)
    },
    placeholderData: prev => prev,
    refetchInterval: 15_000,
  })

  async function clearAll() {
    try {
      await apiFetch('/admin/activity', { method: 'DELETE' })
      toast('Activity cleared')
      qc.invalidateQueries({ queryKey: ['admin-activity'] })
    } catch (err) { toast((err as Error).message, false) }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111]">
      {/* Header */}
      <header className="px-8 py-5 border-b border-white/[0.04] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Activity Feed</h1>
            <p className="text-xs text-white/40 mt-0.5">{data?.total ?? '…'} total events across all users</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2 w-56">
              <span className="material-symbols-outlined text-white/30" style={{ fontSize: 16 }}>search</span>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search message or user…"
                className="bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none flex-1"
              />
            </div>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 rounded-xl text-xs text-red-400/70 hover:text-red-400 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete_sweep</span>
              Clear all
            </button>
          </div>
        </div>

        {/* Event type pills */}
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => { setEventFilter(t); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all capitalize
                ${eventFilter === t ? 'bg-white text-black' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : (data?.logs ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="material-symbols-outlined text-white/20" style={{ fontSize: 36 }}>history</span>
            <p className="text-white/30 text-sm">No activity found</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {(data?.logs ?? []).map(log => (
              <div key={log.id} className="flex items-start gap-4 px-8 py-3.5 hover:bg-white/[0.015] transition-colors">
                {/* Event type badge */}
                <span className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase flex-shrink-0 w-24 text-center ${eventStyle(log.event_type)}`}>
                  {log.event_type.replace('_', ' ')}
                </span>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <p className="text-white/75 text-sm leading-snug">{log.message}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-white/30 text-[10px]">{log.user_email}</span>
                    {log.job_id && (
                      <span className="text-white/20 text-[10px] font-mono">job:{log.job_id.slice(0, 8)}</span>
                    )}
                  </div>
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-white/25 text-[10px] font-mono">
                    {new Date(log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z').toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
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
