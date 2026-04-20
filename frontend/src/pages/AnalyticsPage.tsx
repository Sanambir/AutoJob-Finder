import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'

interface AnalyticsData {
  total: number
  score_distribution: { range: string; count: number }[]
  stage_funnel: { stage: string; count: number }[]
  status_breakdown: Record<string, number>
  platform_breakdown: { platform: string; count: number }[]
  weekly_trend: { week: string; count: number }[]
}

const STAGE_COLORS: Record<string, string> = {
  discovered: '#6b7280',
  applied:    '#3b82f6',
  interview:  '#f59e0b',
  offer:      '#10b981',
  rejected:   '#ef4444',
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']

const TooltipStyle = {
  contentStyle: { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 12 },
  labelStyle: { color: 'rgba(255,255,255,0.5)' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.06] rounded-xl p-5">
      <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  )
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiFetch<AnalyticsData>('/analytics'),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#111111]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 bg-[#111111]">
        <span className="material-symbols-outlined text-white/20 text-5xl">bar_chart</span>
        <p className="text-white/30 text-sm">No data yet — run a search to get started</p>
      </div>
    )
  }

  const topStatus = Object.entries(data.status_breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }))

  return (
    <div className="h-full overflow-y-auto bg-[#111111] dot-grid">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-white font-black text-2xl">Analytics</h1>
          <span className="text-white/30 text-sm">{data.total} total jobs</span>
        </div>

        {/* Weekly trend */}
        <Card title="Jobs discovered per week">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data.weekly_trend}>
              <XAxis dataKey="week" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip {...TooltipStyle} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {/* Score distribution */}
          <Card title="Match score distribution">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.score_distribution} barSize={28}>
                <XAxis dataKey="range" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...TooltipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.score_distribution.map((entry, i) => {
                    const colors = ['#ef4444', '#f87171', '#fbbf24', '#34d399', '#10b981']
                    return <Cell key={i} fill={colors[i] ?? '#6b7280'} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Platform breakdown */}
          <Card title="Jobs by platform">
            {data.platform_breakdown.length === 0 ? (
              <p className="text-white/30 text-sm text-center py-8">No platform data</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.platform_breakdown}
                    dataKey="count"
                    nameKey="platform"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                    paddingAngle={3}
                    label={({ platform, percent }) => `${platform} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {data.platform_breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TooltipStyle} formatter={(v: number) => [v, 'jobs']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        {/* Application funnel */}
        <Card title="Application stage funnel">
          <div className="space-y-3">
            {data.stage_funnel.map(({ stage, count }) => {
              const max = Math.max(...data.stage_funnel.map(s => s.count), 1)
              const pct = (count / max) * 100
              return (
                <div key={stage} className="flex items-center gap-4">
                  <span className="text-white/50 text-xs capitalize w-20 flex-shrink-0">{stage}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: STAGE_COLORS[stage] ?? '#6b7280' }}
                    />
                  </div>
                  <span className="text-white/60 text-xs font-semibold w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Status breakdown */}
        <Card title="Status breakdown">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {topStatus.map(({ status, count }) => (
              <div key={status} className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.04]">
                <p className="text-white font-black text-xl">{count}</p>
                <p className="text-white/40 text-[11px] capitalize mt-0.5">{status.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
