import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useToast } from '../components/Toast'
import type { AppConfig, Resume, Schedule } from '../types'

const PRESETS = [60, 70, 75, 80, 85, 90]

const TIMES = [
  '06:00', '07:00', '08:00', '09:00', '10:00',
  '12:00', '14:00', '16:00', '18:00', '20:00', '21:00',
]
const TIME_LABELS: Record<string, string> = {
  '06:00': '06:00 AM', '07:00': '07:00 AM', '08:00': '08:00 AM',
  '09:00': '09:00 AM', '10:00': '10:00 AM', '12:00': '12:00 PM',
  '14:00': '02:00 PM', '16:00': '04:00 PM', '18:00': '06:00 PM',
  '20:00': '08:00 PM', '21:00': '09:00 PM',
}

export default function ConfigPage() {
  const [threshold, setThreshold]         = useState(75)
  const [schedEnabled, setSchedEnabled]   = useState(false)
  const [schedTime, setSchedTime]         = useState('09:00')
  const [apiOk, setApiOk]                 = useState<boolean | null>(null)
  const [savedAt, setSavedAt]             = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiFetch<AppConfig>('/config'),
  })

  const { data: sched } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => apiFetch<Schedule>('/schedule'),
  })

  const { data: resumes = [], refetch: refetchResumes } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => apiFetch<Resume[]>('/user/resumes'),
  })

  // Sync from API
  useEffect(() => { if (config) setThreshold(config.match_threshold) }, [config])
  useEffect(() => {
    if (sched) {
      setSchedEnabled(!!sched.enabled)
      setSchedTime(sched.run_time || '09:00')
    }
  }, [sched])

  // Check API status
  useEffect(() => {
    fetch('/health')
      .then(r => setApiOk(r.ok))
      .catch(() => setApiOk(false))
  }, [])

  async function activateResume(id: string) {
    try {
      await apiFetch('/user/resume/active', { method: 'PATCH', body: JSON.stringify({ resume_id: id }) })
      toast('Resume activated!')
      refetchResumes()
      qc.invalidateQueries({ queryKey: ['resumes'] })
    } catch (e) { toast((e as Error).message, false) }
  }

  async function deleteResume(id: string) {
    try {
      await apiFetch(`/user/resume/${id}`, { method: 'DELETE' })
      toast('Resume deleted')
      refetchResumes()
      qc.invalidateQueries({ queryKey: ['resumes'] })
    } catch (e) { toast((e as Error).message, false) }
  }

  async function save() {
    setSaving(true)
    try {
      const cfg = await apiFetch<AppConfig>('/config', {
        method: 'PATCH',
        body: JSON.stringify({ match_threshold: threshold }),
      })
      setThreshold(cfg.match_threshold)

      const existingSched = sched
      await apiFetch('/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          keywords:         existingSched?.keywords         ?? '',
          location:         existingSched?.location         ?? 'Remote',
          platforms:        existingSched?.platforms        ?? ['linkedin', 'indeed'],
          results_per_site: existingSched?.results_per_site ?? 10,
          hours_old:        existingSched?.hours_old        ?? 168,
          auto_pipeline:    existingSched?.auto_pipeline    ?? true,
          run_time: schedTime,
          enabled:  schedEnabled,
        }),
      })
      qc.invalidateQueries({ queryKey: ['config', 'schedule'] })
      setSavedAt(new Date().toLocaleTimeString())
      toast('Settings saved!')
    } catch (e) {
      toast((e as Error).message, false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111] dot-grid overflow-hidden">
      {/* Header */}
      <header className="h-20 flex items-center justify-between px-8 md:px-12 border-b border-white/[0.03] bg-[#111111] flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Configurations</h1>
          <p className="text-sm font-medium tracking-tight text-white/45">Adjust the match threshold in real-time</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-white text-black text-sm font-semibold rounded-lg hover:bg-white/90 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-8 md:p-12 flex flex-col gap-8 w-full">

          {/* Match Threshold */}
          <section className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-8 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-[0.05em] text-white/60 mb-1">Precision Control</h2>
                  <p className="text-lg font-medium text-white">System Match Threshold</p>
                </div>
                <div className="md:hidden text-5xl font-extrabold text-white">{threshold}%</div>
              </div>
              <div className="space-y-6 w-full">
                <input
                  type="range" min={50} max={100} value={threshold}
                  onChange={e => setThreshold(+e.target.value)}
                  className="w-full"
                />
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p}
                      onClick={() => setThreshold(p)}
                      className={`px-4 py-2 text-xs rounded-lg transition-colors font-medium
                        ${threshold === p
                          ? 'bg-white text-black font-bold shadow-lg'
                          : 'bg-[#242424] text-white/60 hover:bg-white/5'
                        }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="hidden md:block flex-shrink-0">
              <div className="text-7xl font-extrabold text-white tracking-tighter">{threshold}%</div>
            </div>
          </section>

          {/* 2-column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left: Intelligence Infrastructure */}
            <div className="flex flex-col gap-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-white/40 px-2">Intelligence Infrastructure</h3>

              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-center justify-between hover:border-white/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white/80">psychology</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Scoring AI</h4>
                    <p className="text-xs text-white/40">Gemini 3 Flash Preview</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold text-white/60 uppercase">Active</span>
              </div>

              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-center justify-between hover:border-white/20 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                    <span className="material-symbols-outlined text-white/80">auto_awesome</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">Tailoring AI</h4>
                    <p className="text-xs text-white/40">Gemini 3 Flash Preview</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold text-white/60 uppercase">Active</span>
              </div>

              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 hover:border-white/20 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                      <span className="material-symbols-outlined text-white/80">mail</span>
                    </div>
                    <h4 className="text-sm font-semibold text-white">Email Delivery</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                    ${config?.smtp_configured
                      ? 'bg-white/10 text-white'
                      : 'bg-red-500/20 text-red-400'
                    }`}>
                    {config?.smtp_configured ? 'SMTP Active' : 'Not Set'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/40 mb-2">
                  <span>Cover Letter PDF</span>
                  <span className="text-white/80 font-medium">Enabled</span>
                </div>
                <div className="flex items-center justify-between text-xs text-white/40">
                  <span>Provider</span>
                  <span className="text-white/80 font-medium">Resend SMTP</span>
                </div>
              </div>
            </div>

            {/* Right: Library & Tasks */}
            <div className="flex flex-col gap-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-white/40 px-2">Library &amp; Tasks</h3>

              {/* Resume Library */}
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Resume Library</span>
                  <a href="/search" className="text-xs text-white/60 hover:text-white transition-colors">Manage All</a>
                </div>
                <div className="flex flex-col">
                  {resumes.length === 0 ? (
                    <div className="p-4 text-xs text-white/30 text-center">No resumes — upload via Search</div>
                  ) : resumes.map((r, i) => (
                    <div
                      key={r.id}
                      className={`${i > 0 ? 'border-t border-white/[0.04]' : ''} p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="material-symbols-outlined text-white/30" style={{ fontSize: 20 }}>description</span>
                        <span className="text-xs font-medium text-white/80 truncate max-w-[160px]" title={r.name}>{r.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {r.is_active
                          ? <span className="px-2 py-0.5 bg-white/10 text-white text-[9px] font-black uppercase rounded">Active</span>
                          : (
                            <button
                              onClick={() => activateResume(r.id)}
                              className="px-2 py-0.5 border border-white/10 text-white/40 text-[9px] font-black uppercase rounded hover:border-white/30 hover:text-white/60 transition-colors"
                            >
                              Use
                            </button>
                          )
                        }
                        <button
                          onClick={() => deleteResume(r.id)}
                          title="Delete resume"
                          className="p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-950/20 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Daily Auto-Search */}
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h4 className="text-sm font-semibold text-white">Daily Auto-Search</h4>
                    <p className="text-xs text-white/40">
                      {schedEnabled ? `Runs daily at ${schedTime} UTC` : 'Recurrence Interval'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSchedEnabled(e => !e)}
                    className="w-10 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0"
                    style={{ backgroundColor: schedEnabled ? '#ffffff' : '#333' }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                      style={{
                        left: schedEnabled ? '22px' : '2px',
                        backgroundColor: schedEnabled ? '#111111' : 'rgba(255,255,255,0.3)',
                      }}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-3 bg-[#0a0a0a] rounded-lg p-3 border border-white/5">
                  <span className="material-symbols-outlined text-white/40" style={{ fontSize: 18 }}>schedule</span>
                  <select
                    value={schedTime}
                    onChange={e => setSchedTime(e.target.value)}
                    className="bg-transparent text-sm font-bold text-white flex-1 focus:outline-none cursor-pointer"
                  >
                    {TIMES.map(t => <option key={t} value={t}>{TIME_LABELS[t]}</option>)}
                  </select>
                  <span className="text-xs text-white/20 uppercase font-bold tracking-widest">UTC</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col md:flex-row items-center justify-between border-t border-white/5 pt-8 text-white/30 text-[11px] font-medium gap-4">
            <div className="flex items-center gap-8">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  apiOk === null ? 'bg-yellow-500 animate-pulse' :
                  apiOk ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span>
                  {apiOk === null ? 'API Status: Checking…' :
                   apiOk ? 'API Status: Operational' : 'API Status: Offline'}
                </span>
              </span>
              <span>{savedAt ? `Saved at ${savedAt}` : 'Not saved yet'}</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="/api/docs" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Documentation</a>
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <span>v3.0.0</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
