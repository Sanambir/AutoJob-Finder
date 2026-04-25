import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'
import { useToast } from '../../components/Toast'

interface SystemInfo {
  smtp: { configured: boolean; host: string; port: number; from_email: string }
  gemini: { configured: boolean; model: string }
  scheduler: { running: boolean; jobs: { id: string; next_run: string | null }[] }
  security: { cookie_secure: boolean; secret_key_set: boolean; admin_email: string }
  database: {
    size_bytes: number
    wal_size_bytes: number
    page_size: number
    page_count: number
    free_pages: number
    fragmentation_pct: number
    users: number
    jobs: number
    resumes: number
    activity_logs: number
    saved_jobs: number
    stuck_jobs: number
    jobs_by_status: Record<string, number>
  }
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-500'}`} />
  )
}

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.05]">
        <span className="material-symbols-outlined text-white/40" style={{ fontSize: 18 }}>{icon}</span>
        <h2 className="text-sm font-bold text-white">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-white/40 text-xs">{label}</span>
      <div className="flex items-center gap-2">
        {ok !== undefined && <StatusDot ok={ok} />}
        <span className="text-white/80 text-xs font-mono">{value}</span>
      </div>
    </div>
  )
}

export default function AdminSystem() {
  const toast = useToast()
  const qc    = useQueryClient()
  const { data, isLoading, refetch } = useQuery<SystemInfo>({
    queryKey: ['admin-system'],
    queryFn: () => apiFetch('/admin/system'),
    refetchInterval: 15_000,
  })

  const [vacuuming, setVacuuming]   = useState(false)
  const [cleaning, setCleaning]     = useState(false)
  const [cleanDays, setCleanDays]   = useState(30)
  const [bannerMsg, setBannerMsg]   = useState('')
  const [bannerColor, setBannerColor] = useState<'info'|'warning'|'success'|'error'>('info')
  const [savingBanner, setSavingBanner] = useState(false)
  const [clearingBanner, setClearingBanner] = useState(false)
  const [activeBanner, setActiveBanner] = useState<{ message: string; color: string } | null>(null)

  async function runVacuum() {
    setVacuuming(true)
    try {
      const res = await apiFetch<{ freed_bytes: number; message: string }>('/admin/maintenance/vacuum', { method: 'POST' })
      toast(res.message || 'VACUUM complete')
      qc.invalidateQueries({ queryKey: ['admin-system'] })
    } catch (e) { toast((e as Error).message, false) }
    finally { setVacuuming(false) }
  }

  async function runCleanup() {
    setCleaning(true)
    try {
      const res = await apiFetch<{ deleted: number; message: string }>(`/admin/maintenance/old-logs?days=${cleanDays}`, { method: 'DELETE' })
      toast(res.message || `Deleted ${res.deleted} old logs`)
      qc.invalidateQueries({ queryKey: ['admin-system'] })
    } catch (e) { toast((e as Error).message, false) }
    finally { setCleaning(false) }
  }

  // Load current active banner on mount
  useEffect(() => {
    apiFetch<{ message: string | null; color: string }>('/banner')
      .then(b => { if (b?.message) setActiveBanner(b as { message: string; color: string }) })
      .catch(() => {})
  }, [])

  async function saveBanner() {
    if (!bannerMsg.trim()) return
    setSavingBanner(true)
    try {
      const res = await apiFetch<{ message: string; color: string }>('/admin/banner', {
        method: 'PUT',
        body: JSON.stringify({ message: bannerMsg.trim(), color: bannerColor }),
      })
      toast('Banner set')
      setActiveBanner(res)
      setBannerMsg('')
    } catch (e) { toast((e as Error).message, false) }
    finally { setSavingBanner(false) }
  }

  async function clearBanner() {
    setClearingBanner(true)
    try {
      await apiFetch('/admin/banner', { method: 'DELETE' })
      toast('Banner cleared')
      setActiveBanner(null)
    } catch (e) { toast((e as Error).message, false) }
    finally { setClearingBanner(false) }
  }

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center bg-[#111111]">
        <div className="w-7 h-7 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  const { smtp, gemini, scheduler, security, database } = data

  return (
    <div className="h-full overflow-y-auto bg-[#111111]">
      <div className="max-w-4xl mx-auto p-4 md:p-8 flex flex-col gap-4 md:gap-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">System</h1>
            <p className="text-sm text-white/40 mt-0.5">Service health &amp; configuration</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/[0.08] rounded-lg text-xs text-white/50 hover:text-white transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
            Refresh
          </button>
        </div>

        {/* Top status bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'SMTP',      ok: smtp.configured },
            { label: 'Gemini AI', ok: gemini.configured },
            { label: 'Scheduler', ok: scheduler.running },
            { label: 'Secure Cookies', ok: security.cookie_secure },
          ].map(({ label, ok }) => (
            <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${ok ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-red-950/20 border-red-900/30'}`}>
              <StatusDot ok={ok} />
              <span className="text-xs font-semibold text-white/70">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* SMTP */}
          <Card title="Email / SMTP" icon="mail">
            <Row label="Status"      value={smtp.configured ? 'Configured' : 'Not configured'} ok={smtp.configured} />
            <Row label="Host"        value={smtp.host || '—'} />
            <Row label="Port"        value={smtp.port || '—'} />
            <Row label="From"        value={smtp.from_email || '—'} />
          </Card>

          {/* Gemini */}
          <Card title="Gemini AI" icon="auto_awesome">
            <Row label="Status" value={gemini.configured ? 'API key set' : 'No API key'} ok={gemini.configured} />
            <Row label="Model"  value={gemini.model || '—'} />
          </Card>

          {/* Scheduler */}
          <Card title="Scheduler" icon="schedule">
            <Row label="Status" value={scheduler.running ? 'Running' : 'Stopped'} ok={scheduler.running} />
            <Row label="Jobs"   value={scheduler.jobs.length} />
            <div className="mt-3 space-y-2">
              {scheduler.jobs.length === 0 ? (
                <p className="text-xs text-white/25">No scheduled jobs</p>
              ) : scheduler.jobs.map(j => (
                <div key={j.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                  <span className="text-xs text-white/60 truncate max-w-[160px]">{j.id}</span>
                  <span className="text-[10px] text-white/30 font-mono flex-shrink-0 ml-2">
                    {j.next_run ? new Date(j.next_run).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Security */}
          <Card title="Security" icon="shield">
            <Row label="Secret key"     value={security.secret_key_set ? 'Set' : 'MISSING'}  ok={security.secret_key_set} />
            <Row label="Secure cookies" value={security.cookie_secure ? 'Enabled' : 'Disabled (HTTP)'}  ok={security.cookie_secure} />
            <Row label="Admin email"    value={security.admin_email || 'Not set'} ok={!!security.admin_email} />
            {!security.cookie_secure && (
              <p className="text-[10px] text-amber-400/70 mt-3 leading-relaxed">
                Set <code className="bg-white/5 px-1 rounded">COOKIE_SECURE=true</code> in production (requires HTTPS).
              </p>
            )}
          </Card>
        </div>

        {/* Database */}
        <Card title="Database" icon="database">
          {/* Size + fragmentation */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/[0.03] rounded-lg px-4 py-3">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">File size</p>
              <p className="text-lg font-bold text-white">{fmt(database.size_bytes)}</p>
              {database.wal_size_bytes > 0 && (
                <p className="text-[10px] text-white/30 mt-0.5">WAL: {fmt(database.wal_size_bytes)}</p>
              )}
            </div>
            <div className="bg-white/[0.03] rounded-lg px-4 py-3">
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Fragmentation</p>
              <p className={`text-lg font-bold ${database.fragmentation_pct > 20 ? 'text-amber-400' : 'text-white'}`}>
                {database.fragmentation_pct}%
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">{database.free_pages} free / {database.page_count} pages</p>
            </div>
          </div>

          {/* Fragmentation bar */}
          <div className="mb-4">
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  database.fragmentation_pct > 20 ? 'bg-amber-400' :
                  database.fragmentation_pct > 10 ? 'bg-yellow-500' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(database.fragmentation_pct, 100)}%` }}
              />
            </div>
            {database.fragmentation_pct > 20 && (
              <p className="text-[10px] text-amber-400/70 mt-1">VACUUM recommended — high fragmentation</p>
            )}
          </div>

          {/* Row counts */}
          <div className="grid md:grid-cols-2 gap-x-8 mb-4">
            <div>
              <Row label="Users"         value={database.users.toLocaleString()} />
              <Row label="Jobs"          value={database.jobs.toLocaleString()} />
              <Row label="Resumes"       value={database.resumes.toLocaleString()} />
            </div>
            <div>
              <Row label="Activity logs" value={database.activity_logs.toLocaleString()} />
              <Row label="Saved jobs"    value={database.saved_jobs.toLocaleString()} />
              <Row label="Stuck jobs"    value={database.stuck_jobs} ok={database.stuck_jobs === 0} />
            </div>
          </div>

          {/* Jobs by status */}
          {Object.keys(database.jobs_by_status).length > 0 && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Jobs by status</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(database.jobs_by_status)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <span key={status} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      status === 'emailed'         ? 'bg-emerald-950/50 text-emerald-400' :
                      status === 'error'           ? 'bg-red-950/50 text-red-400' :
                      status === 'below_threshold' ? 'bg-zinc-800 text-white/40' :
                      status === 'scored'          ? 'bg-blue-950/50 text-blue-400' :
                      'bg-white/5 text-white/50'
                    }`}>
                      {status} · {count.toLocaleString()}
                    </span>
                  ))}
              </div>
            </div>
          )}

          {database.stuck_jobs > 0 && (
            <div className="mt-4 flex items-center gap-2 bg-amber-950/20 border border-amber-900/30 rounded-lg px-4 py-3">
              <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 16 }}>warning</span>
              <p className="text-xs text-amber-300/80">
                {database.stuck_jobs} job{database.stuck_jobs !== 1 ? 's' : ''} stuck in an in-progress state — will reset to &lsquo;error&rsquo; on next restart.
              </p>
            </div>
          )}
        </Card>

        {/* Maintenance */}
        <Card title="Maintenance" icon="build">
          <div className="space-y-5">
            {/* VACUUM */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-white/70">VACUUM Database</p>
                <p className="text-[11px] text-white/30 mt-0.5">Reclaim space from deleted rows and defragment the SQLite file.</p>
              </div>
              <button
                onClick={runVacuum}
                disabled={vacuuming}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/[0.08] rounded-lg text-xs text-white/60 hover:text-white disabled:opacity-40 transition-all"
              >
                {vacuuming
                  ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>compress</span>
                }
                VACUUM
              </button>
            </div>

            {/* Clean old logs */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/70">Delete Old Activity Logs</p>
                <p className="text-[11px] text-white/30 mt-0.5">Remove notification log entries older than N days.</p>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={cleanDays}
                    onChange={e => setCleanDays(Number(e.target.value))}
                    className="w-16 bg-white/5 border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-white/20"
                  />
                  <span className="text-xs text-white/30">days</span>
                </div>
              </div>
              <button
                onClick={runCleanup}
                disabled={cleaning}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-950/30 hover:bg-red-950/50 border border-red-900/30 rounded-lg text-xs text-red-400/70 hover:text-red-400 disabled:opacity-40 transition-all"
              >
                {cleaning
                  ? <span className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete_sweep</span>
                }
                Clean
              </button>
            </div>
          </div>
        </Card>

        {/* Site Banner */}
        <Card title="Site-Wide Banner" icon="campaign">
          <p className="text-[11px] text-white/30 mb-4">
            Display a dismissible banner at the top of the app for all users.
          </p>

          {/* Active banner preview */}
          {activeBanner && (
            <div className={`flex items-center gap-3 rounded-lg px-4 py-2.5 mb-4 text-xs border ${
              activeBanner.color === 'warning' ? 'bg-amber-950/60 border-amber-700/30 text-amber-300' :
              activeBanner.color === 'success' ? 'bg-emerald-950/60 border-emerald-700/30 text-emerald-300' :
              activeBanner.color === 'error'   ? 'bg-red-950/60 border-red-700/30 text-red-300' :
              'bg-blue-950/60 border-blue-700/30 text-blue-300'
            }`}>
              <span className="material-symbols-outlined text-base flex-shrink-0">
                {activeBanner.color === 'warning' ? 'warning' : activeBanner.color === 'success' ? 'check_circle' : activeBanner.color === 'error' ? 'error' : 'info'}
              </span>
              <span className="flex-1">{activeBanner.message}</span>
              <span className="text-[10px] opacity-50 uppercase tracking-wider flex-shrink-0">Live</span>
            </div>
          )}

          {/* Color selector */}
          <div className="flex gap-2 mb-3">
            {(['info','warning','success','error'] as const).map(c => (
              <button
                key={c}
                onClick={() => setBannerColor(c)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                  bannerColor === c ? 'opacity-100 scale-[1.02]' : 'opacity-40 hover:opacity-70'
                } ${
                  c === 'info'    ? 'bg-blue-950/60 border-blue-700/30 text-blue-300' :
                  c === 'warning' ? 'bg-amber-950/60 border-amber-700/30 text-amber-300' :
                  c === 'success' ? 'bg-emerald-950/60 border-emerald-700/30 text-emerald-300' :
                  'bg-red-950/60 border-red-700/30 text-red-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={bannerMsg}
              onChange={e => setBannerMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveBanner()}
              placeholder="Banner message…"
              maxLength={300}
              className="flex-1 bg-white/5 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={saveBanner}
              disabled={savingBanner || !bannerMsg.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/[0.1] rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-all"
            >
              {savingBanner
                ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>publish</span>
              }
              Set
            </button>
            {activeBanner && (
              <button
                onClick={clearBanner}
                disabled={clearingBanner}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-950/30 hover:bg-red-950/50 border border-red-900/30 rounded-lg text-xs text-red-400/70 hover:text-red-400 disabled:opacity-40 transition-all"
              >
                {clearingBanner
                  ? <span className="w-3 h-3 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                  : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                }
                Clear
              </button>
            )}
          </div>
          {bannerMsg.length > 0 && (
            <p className="text-[10px] text-white/20 mt-1.5 text-right">{bannerMsg.length}/300</p>
          )}
        </Card>

      </div>
    </div>
  )
}
