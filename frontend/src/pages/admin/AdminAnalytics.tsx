import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'

interface Analytics {
  platforms:    { platform: string; count: number; avg_score: number | null }[]
  job_daily:    { day: string; count: number }[]
  user_daily:   { day: string; count: number }[]
  search_daily: { day: string; count: number }[]
  top_keywords: { keyword: string; count: number }[]
  top_companies:{ company: string; count: number }[]
  top_titles:   { title: string; count: number }[]
  tiers:        Record<string, number>
}

interface ApiUsage {
  adzuna: { calls_today: number; limit: number; remaining: number; pct_used: number; cache_entries: number }
}

function BarRow({ label, value, max, sub }: { label: string; value: number; max: number; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-xs text-white/50 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-white/40 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/50 w-8 text-right flex-shrink-0">{value}</span>
      {sub && <span className="text-[10px] text-white/25 w-10 text-right flex-shrink-0">{sub}</span>}
    </div>
  )
}

function Sparkline({ data, color = 'white' }: { data: { day: string; count: number }[]; color?: string }) {
  if (!data.length) return <p className="text-white/20 text-xs">No data</p>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map(d => (
        <div
          key={d.day}
          title={`${d.day}: ${d.count}`}
          className={`flex-1 rounded-sm min-h-[2px] bg-${color}/40`}
          style={{ height: `${Math.max(2, (d.count / max) * 40)}px` }}
        />
      ))}
    </div>
  )
}

export default function AdminAnalytics() {
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ['admin-analytics'],
    queryFn: () => apiFetch('/admin/analytics'),
    refetchInterval: 60_000,
  })

  const { data: usage } = useQuery<ApiUsage>({
    queryKey: ['admin-api-usage'],
    queryFn: () => apiFetch('/admin/api-usage'),
    refetchInterval: 30_000,
  })

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  const maxPlatform  = Math.max(...data.platforms.map(p => p.count), 1)
  const maxKeyword   = Math.max(...data.top_keywords.map(k => k.count), 1)
  const maxCompany   = Math.max(...data.top_companies.map(c => c.count), 1)
  const totalUsers   = Object.values(data.tiers).reduce((a, b) => a + b, 0) || 1
  const adzuna       = usage?.adzuna

  return (
    <div className="h-full overflow-y-auto bg-[#111111]">
      <div className="max-w-6xl mx-auto p-4 md:p-8 flex flex-col gap-6 md:gap-8">

        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Analytics</h1>
          <p className="text-sm text-white/40 mt-0.5">Last 30 days unless noted</p>
        </div>

        {/* API Usage + Tier breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Adzuna API meter */}
          {adzuna && (
            <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-white/30" style={{ fontSize: 18 }}>api</span>
                  <span className="text-sm font-bold text-white">Job Boards API</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  adzuna.pct_used > 80 ? 'bg-red-900/40 text-red-400' :
                  adzuna.pct_used > 50 ? 'bg-amber-900/40 text-amber-400' :
                  'bg-emerald-900/40 text-emerald-400'
                }`}>
                  {adzuna.pct_used}% used
                </span>
              </div>
              <div className="flex items-end gap-2 mb-2">
                <span className="text-3xl font-extrabold text-white">{adzuna.calls_today}</span>
                <span className="text-white/30 text-sm mb-1">/ {adzuna.limit} calls today</span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${
                    adzuna.pct_used > 80 ? 'bg-red-500' :
                    adzuna.pct_used > 50 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${adzuna.pct_used}%` }}
                />
              </div>
              <p className="text-xs text-white/30">{adzuna.remaining} calls remaining · {adzuna.cache_entries} cached searches</p>
            </div>
          )}

          {/* Free vs Premium */}
          <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-white/30" style={{ fontSize: 18 }}>workspace_premium</span>
              <span className="text-sm font-bold text-white">User Tiers</span>
            </div>
            <div className="space-y-3">
              {Object.entries(data.tiers).map(([tier, count]) => (
                <BarRow
                  key={tier}
                  label={tier.charAt(0).toUpperCase() + tier.slice(1)}
                  value={count}
                  max={totalUsers}
                  sub={`${Math.round((count / totalUsers) * 100)}%`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Sparklines */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Jobs / day', data: data.job_daily },
            { label: 'Signups / day', data: data.user_daily },
            { label: 'Searches / day (7d)', data: data.search_daily },
          ].map(({ label, data: d }) => (
            <div key={label} className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-5">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">{label}</p>
              <Sparkline data={d} />
              <p className="text-xs text-white/20 mt-2">
                Total: {d.reduce((a, b) => a + b.count, 0)}
              </p>
            </div>
          ))}
        </div>

        {/* Platform performance */}
        <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-6">
          <h2 className="text-sm font-bold text-white mb-5">Platform Performance</h2>
          <div className="space-y-3">
            {data.platforms.map(p => (
              <div key={p.platform} className="flex items-center gap-3">
                <span className="w-28 text-xs text-white/50 capitalize flex-shrink-0">{p.platform}</span>
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-white/40 rounded-full" style={{ width: `${Math.round((p.count / maxPlatform) * 100)}%` }} />
                </div>
                <span className="text-xs text-white/50 w-12 text-right flex-shrink-0">{p.count} jobs</span>
                <span className="text-xs text-white/30 w-14 text-right flex-shrink-0">
                  {p.avg_score != null ? `avg ${p.avg_score}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top keywords + companies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-5">Top Search Keywords</h2>
            {data.top_keywords.length === 0
              ? <p className="text-white/20 text-xs">No search data yet</p>
              : <div className="space-y-3">
                  {data.top_keywords.map(k => (
                    <BarRow key={k.keyword} label={k.keyword} value={k.count} max={maxKeyword} />
                  ))}
                </div>
            }
          </div>

          <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl p-6">
            <h2 className="text-sm font-bold text-white mb-5">Top Companies</h2>
            {data.top_companies.length === 0
              ? <p className="text-white/20 text-xs">No job data yet</p>
              : <div className="space-y-3">
                  {data.top_companies.map(c => (
                    <BarRow key={c.company} label={c.company} value={c.count} max={maxCompany} />
                  ))}
                </div>
            }
          </div>
        </div>

      </div>
    </div>
  )
}
