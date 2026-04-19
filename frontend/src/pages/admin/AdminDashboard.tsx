import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'

interface Overview {
  users: { total: number; verified: number; unverified: number; new_7d: number; growth: { day: string; count: number }[] }
  jobs:  { total: number; emailed: number; errors: number; new_7d: number; today: number; avg_score: number | null; by_status: Record<string, number> }
  db_size_bytes: number
  recent_errors: { id: string; title: string; company: string; error: string; user_email: string; updated_at: string }[]
}

const STATUS_ORDER = ['emailed', 'scored', 'below_threshold', 'pending', 'queued', 'scoring', 'tailoring', 'emailing', 'error']
const STATUS_COLOR: Record<string, string> = {
  emailed: 'bg-white', scored: 'bg-white/60', below_threshold: 'bg-white/30',
  pending: 'bg-white/20', queued: 'bg-blue-400/60', scoring: 'bg-blue-400/60',
  tailoring: 'bg-blue-400/60', emailing: 'bg-blue-400/60', error: 'bg-red-500/70',
}

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="material-symbols-outlined text-white/30" style={{ fontSize: 20 }}>{icon}</span>
        {sub && <span className="text-[10px] text-white/30 font-medium">{sub}</span>}
      </div>
      <div className="text-2xl font-extrabold text-white tracking-tight">{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
    </div>
  )
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function AdminDashboard() {
  const { data, isLoading } = useQuery<Overview>({
    queryKey: ['admin-overview'],
    queryFn: () => apiFetch('/admin/overview'),
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  const totalForBar = Object.values(data.jobs.by_status).reduce((a, b) => a + b, 0) || 1

  return (
    <div className="h-full overflow-y-auto bg-[#111111]">
      <div className="max-w-6xl mx-auto p-8 flex flex-col gap-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
          <p className="text-sm text-white/40 mt-0.5">Real-time system overview</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon="group"          label="Total Users"     value={data.users.total}      sub={`+${data.users.new_7d} this week`} />
          <StatCard icon="verified_user"  label="Verified"        value={data.users.verified}   sub={`${data.users.unverified} unverified`} />
          <StatCard icon="work"           label="Jobs Processed"  value={data.jobs.total}       sub={`${data.jobs.today} today`} />
          <StatCard icon="mail"           label="Emails Sent"     value={data.jobs.emailed}     sub={`${data.jobs.new_7d} this week`} />
          <StatCard icon="percent"        label="Avg Match Score" value={data.jobs.avg_score != null ? `${data.jobs.avg_score}%` : '—'} />
          <StatCard icon="error"          label="Errored Jobs"    value={data.jobs.errors}      sub={data.jobs.errors > 0 ? 'needs attention' : 'all clear'} />
          <StatCard icon="database"       label="DB Size"         value={fmt(data.db_size_bytes)} />
          <StatCard icon="monitoring"     label="Pipeline Today"  value={data.jobs.today} />
        </div>

        {/* Job status breakdown */}
        <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-5">Pipeline Breakdown</h2>
          <div className="space-y-3">
            {STATUS_ORDER.filter(s => data.jobs.by_status[s]).map(status => {
              const count = data.jobs.by_status[status] || 0
              const pct   = Math.round((count / totalForBar) * 100)
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-white/50 capitalize flex-shrink-0">{status.replace('_', ' ')}</span>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_COLOR[status] ?? 'bg-white/40'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/50 w-8 text-right flex-shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent errors */}
        {data.recent_errors.length > 0 && (
          <div className="bg-[#1a1a1a] border border-red-900/30 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-red-900/20 flex items-center gap-2">
              <span className="material-symbols-outlined text-red-400" style={{ fontSize: 16 }}>error</span>
              <h2 className="text-sm font-bold text-white">Recent Errors</h2>
              <span className="ml-auto text-[10px] text-white/30">last {data.recent_errors.length} errored jobs</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {data.recent_errors.map(e => (
                <div key={e.id} className="px-6 py-4 hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{e.title} — {e.company}</p>
                      <p className="text-xs text-white/40 mt-0.5">{e.user_email}</p>
                      <p className="text-xs text-red-400/80 mt-1 line-clamp-2">{e.error || 'No error message'}</p>
                    </div>
                    <span className="text-[10px] text-white/25 flex-shrink-0 mt-1">
                      {e.updated_at ? new Date(e.updated_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
