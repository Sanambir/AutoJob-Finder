import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../api/client'

interface SystemInfo {
  smtp: { configured: boolean; host: string; port: number; from_email: string }
  gemini: { configured: boolean; model: string }
  scheduler: { running: boolean; jobs: { id: string; name: string; next_run: string | null }[] }
  security: { cookie_secure: boolean; secret_key_set: boolean; admin_email: string }
  database: {
    size_bytes: number
    users: number
    jobs: number
    resumes: number
    activity_logs: number
    saved_jobs: number
    stuck_jobs: number
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
  const { data, isLoading, refetch } = useQuery<SystemInfo>({
    queryKey: ['admin-system'],
    queryFn: () => apiFetch('/admin/system'),
    refetchInterval: 15_000,
  })

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
      <div className="max-w-4xl mx-auto p-8 flex flex-col gap-6">

        {/* Header */}
        <div className="flex items-center justify-between">
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
                  <span className="text-xs text-white/60 truncate max-w-[160px]">{j.name}</span>
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
          <div className="grid md:grid-cols-2 gap-x-10">
            <div>
              <Row label="File size"    value={fmt(database.size_bytes)} />
              <Row label="Stuck jobs"   value={database.stuck_jobs} ok={database.stuck_jobs === 0} />
            </div>
            <div>
              <Row label="Users"        value={database.users} />
              <Row label="Jobs"         value={database.jobs} />
              <Row label="Resumes"      value={database.resumes} />
              <Row label="Activity logs" value={database.activity_logs} />
              <Row label="Saved jobs"   value={database.saved_jobs} />
            </div>
          </div>
          {database.stuck_jobs > 0 && (
            <div className="mt-4 flex items-center gap-2 bg-amber-950/20 border border-amber-900/30 rounded-lg px-4 py-3">
              <span className="material-symbols-outlined text-amber-400" style={{ fontSize: 16 }}>warning</span>
              <p className="text-xs text-amber-300/80">
                {database.stuck_jobs} job{database.stuck_jobs !== 1 ? 's' : ''} appear stuck in an in-progress state. They will be reset to &lsquo;error&rsquo; on next server restart.
              </p>
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}
