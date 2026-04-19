import { useState, useRef, FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, apiUpload } from '../api/client'
import { useAuthStore } from '../store/auth'
import { useToast } from '../components/Toast'
import type { Resume } from '../types'

const PLATFORMS = [
  { id: 'linkedin',     label: 'LinkedIn',     stable: true },
  { id: 'indeed',       label: 'Indeed',       stable: true },
  { id: 'glassdoor',    label: 'Glassdoor',    stable: false },
  { id: 'zip_recruiter', label: 'ZipRecruiter', stable: false },
] as const

const HOURS_OPTIONS = [
  { value: 24,  label: '24 hrs' },
  { value: 48,  label: '48 hrs' },
  { value: 72,  label: '3 days' },
  { value: 168, label: '7 days' },
  { value: 336, label: '2 weeks' },
]

export default function SearchPage() {
  const user = useAuthStore(s => s.user)
  const toast = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [keywords, setKeywords]         = useState('')
  const [location, setLocation]         = useState('Remote')
  const [platforms, setPlatforms]       = useState<string[]>(['linkedin', 'indeed'])
  const [resultsPerSite, setResults]    = useState(10)
  const [hoursOld, setHoursOld]         = useState(168)
  const [autoPipeline, setAutoPipeline] = useState(true)
  const [searching, setSearching]       = useState(false)
  const [uploading, setUploading]       = useState(false)

  const { data: resumes = [] } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => apiFetch<Resume[]>('/user/resumes'),
    staleTime: 0,
  })

  const activeResume = resumes.find(r => r.is_active)

  function togglePlatform(id: string) {
    setPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  async function handleUpload(file: File) {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      await apiUpload('/user/resume', fd)
      toast('Resume uploaded and activated!')
      qc.invalidateQueries({ queryKey: ['resumes'] })
    } catch (e) {
      toast((e as Error).message, false)
    } finally {
      setUploading(false)
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!keywords.trim() && !activeResume) {
      toast('Enter keywords or upload a resume first', false)
      return
    }
    if (platforms.length === 0) {
      toast('Select at least one platform', false)
      return
    }
    setSearching(true)
    try {
      const res = await apiFetch<{ message: string }>('/search', {
        method: 'POST',
        body: JSON.stringify({
          recipient_email: user?.email ?? '',
          applicant_name: user?.name ?? 'Applicant',
          keywords: keywords.trim(),
          location: location.trim() || 'Remote',
          platforms,
          results_per_site: resultsPerSite,
          hours_old: hoursOld,
          auto_pipeline: autoPipeline,
        }),
      })
      toast(res.message)
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } catch (e) {
      toast((e as Error).message, false)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#111111] dot-grid">
      <div className="max-w-2xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-white font-bold text-2xl tracking-tight">Job Search</h1>
          <p className="text-white/40 text-sm mt-1">Scrape → score → tailor → email, automatically</p>
        </div>

        {/* Resume section */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl overflow-hidden mb-6">
          <div className="p-4 border-b border-white/[0.04] flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Active Resume</span>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs text-white/60 hover:text-white transition-colors disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : '+ Upload New'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.docx,.md"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </div>
          {resumes.length === 0 ? (
            <div
              onClick={() => fileRef.current?.click()}
              className="p-8 text-center cursor-pointer hover:bg-white/[0.02] transition-colors"
            >
              <span className="material-symbols-outlined text-white/20 text-4xl block mb-2">upload_file</span>
              <p className="text-white/40 text-sm">Drop or click to upload a resume (PDF, DOCX, TXT)</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {resumes.map((r, i) => (
                <div
                  key={r.id}
                  className={`${i > 0 ? 'border-t border-white/[0.04]' : ''} p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="material-symbols-outlined text-white/30" style={{ fontSize: 20 }}>description</span>
                    <span className="text-xs font-medium text-white/80 truncate">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.is_active
                      ? <span className="px-2 py-0.5 bg-white/10 text-white text-[9px] font-black uppercase rounded">Active</span>
                      : (
                        <button
                          onClick={() => apiFetch('/user/resume/active', { method: 'PATCH', body: JSON.stringify({ resume_id: r.id }) }).then(() => qc.invalidateQueries({ queryKey: ['resumes'] }))}
                          className="px-2 py-0.5 border border-white/10 text-white/40 text-[9px] font-black uppercase rounded hover:border-white/30 hover:text-white/60 transition-colors"
                        >
                          Stored
                        </button>
                      )
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="space-y-5">
          {/* Keywords */}
          <div>
            <label className="text-white/60 text-xs font-semibold uppercase tracking-wider block mb-2">Job Keywords</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="e.g. Senior React Developer, Product Manager…"
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25"
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-white/60 text-xs font-semibold uppercase tracking-wider block mb-2">Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="Remote, New York, London…"
              className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-white/25"
            />
          </div>

          {/* Platforms */}
          <div>
            <label className="text-white/60 text-xs font-semibold uppercase tracking-wider block mb-2">Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  title={!p.stable ? 'Limited availability — may return 0 results without proxies' : undefined}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all
                    ${platforms.includes(p.id)
                      ? 'bg-white text-black'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                    } ${!p.stable ? 'opacity-70' : ''}`}
                >
                  {p.label}
                  {!p.stable && ' ⚠'}
                </button>
              ))}
            </div>
          </div>

          {/* Results + Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-xs font-semibold uppercase tracking-wider block mb-2">
                Results / site: <span className="text-white">{resultsPerSite}</span>
              </label>
              <input
                type="range"
                min={5} max={50} step={5}
                value={resultsPerSite}
                onChange={e => setResults(+e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-white/60 text-xs font-semibold uppercase tracking-wider block mb-2">Posted within</label>
              <select
                value={hoursOld}
                onChange={e => setHoursOld(+e.target.value)}
                className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
              >
                {HOURS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Auto pipeline toggle */}
          <div className="flex items-center justify-between bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-5 py-4">
            <div>
              <p className="text-white text-sm font-semibold">Auto Pipeline</p>
              <p className="text-white/40 text-xs mt-0.5">Score → tailor → email matches automatically</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoPipeline(p => !p)}
              className="w-10 h-5 rounded-full relative transition-colors duration-200 flex-shrink-0"
              style={{ backgroundColor: autoPipeline ? '#ffffff' : '#333' }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                style={{
                  left: autoPipeline ? '22px' : '2px',
                  backgroundColor: autoPipeline ? '#111' : 'rgba(255,255,255,0.3)',
                }}
              />
            </button>
          </div>

          <button
            type="submit"
            disabled={searching}
            className="w-full py-4 bg-white text-black font-bold text-sm rounded-xl hover:bg-white/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {searching
              ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Searching…</>
              : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>search</span>Start Search</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
