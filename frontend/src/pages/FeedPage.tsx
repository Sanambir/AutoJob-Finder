import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../api/client'
import type { Job, JobsPage, Stats } from '../types'
import JobCard from '../components/JobCard'
import JobDrawer from '../components/JobDrawer'
import { useToast } from '../components/Toast'

const IN_PROGRESS: Job['status'][] = ['queued', 'scoring', 'tailoring', 'emailing']
const PAGE_SIZE = 30

const FILTERS = [
  { label: 'All',       value: '' },
  { label: 'Emailed',   value: 'emailed' },
  { label: 'Scored',    value: 'scored' },
  { label: 'Low Match', value: 'below_threshold' },
  { label: 'Error',     value: 'error' },
] as const

const KANBAN_STAGES = ['discovered', 'applied', 'interview', 'offer', 'rejected'] as const

export default function FeedPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState(false)
  const [bulkStage, setBulkStage] = useState('')
  const toast = useToast()
  const qc = useQueryClient()

  function exitSelection() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  // Main jobs query
  const { data, isLoading } = useQuery({
    queryKey: ['jobs', filter, page],
    queryFn: () => apiFetch<JobsPage>(`/jobs?page=${page}&page_size=${PAGE_SIZE}${filter ? `&status=${filter}` : ''}`),
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? []
      return jobs.some(j => IN_PROGRESS.includes(j.status)) ? 3000 : 5_000
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<Stats>('/stats'),
    refetchInterval: 15_000,
  })

  const { data: savedData = [] } = useQuery({
    queryKey: ['saved'],
    queryFn: () => apiFetch<Job[]>('/saved'),
  })

  const bookmarkedIds = useMemo(() => new Set(savedData.map(j => j.id)), [savedData])

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const hasInProgress = jobs.some(j => IN_PROGRESS.includes(j.status))

  // ── Mutations ──────────────────────────────────────────────────────────────
  const bulkRetry = useMutation({
    mutationFn: () => apiFetch('/jobs/bulk-retry', { method: 'POST' }),
    onSuccess: () => { toast('All error jobs re-queued!'); qc.invalidateQueries({ queryKey: ['jobs'] }) },
    onError: (e: Error) => toast(e.message, false),
  })

  const bulkDeleteLow = useMutation({
    mutationFn: () => apiFetch('/jobs/bulk-delete-below-threshold', { method: 'POST' }),
    onSuccess: (d: unknown) => {
      toast(`Deleted ${(d as { deleted: number }).deleted} low-match jobs`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast(e.message, false),
  })

  const bulkTailor = useMutation({
    mutationFn: () => apiFetch('/jobs/bulk-tailor', {
      method: 'POST',
      body: JSON.stringify({ job_ids: [...selectedIds] }),
    }),
    onSuccess: (d: unknown) => {
      toast(`Queued ${(d as { queued: number }).queued} jobs for cover letter generation`)
      exitSelection()
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (e: Error) => toast(e.message, false),
  })

  const bulkStageUpdate = useMutation({
    mutationFn: (stage: string) => apiFetch('/jobs/bulk-stage', {
      method: 'PATCH',
      body: JSON.stringify({ job_ids: [...selectedIds], stage }),
    }),
    onSuccess: (d: unknown) => {
      toast(`Moved ${(d as { updated: number }).updated} jobs`)
      exitSelection()
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (e: Error) => toast(e.message, false),
  })

  const deleteJob = useMutation({
    mutationFn: (jobId: string) => apiFetch(`/jobs/${jobId}`, { method: 'DELETE' }),
    onMutate: async (jobId) => {
      // Cancel any in-flight refetches — a polling tick that started just before
      // this mutation could complete after setQueriesData and overwrite the cache,
      // making the deleted job reappear.
      await qc.cancelQueries({ queryKey: ['jobs'] })
      // Snapshot for rollback if the request fails
      const snapshot = qc.getQueriesData<JobsPage>({ queryKey: ['jobs'] })
      // Optimistically remove from every cached page immediately
      qc.setQueriesData<JobsPage>({ queryKey: ['jobs'] }, old =>
        old ? { ...old, jobs: old.jobs.filter(j => j.id !== jobId), total: Math.max(0, old.total - 1) } : old
      )
      return { snapshot }
    },
    onSuccess: () => {
      toast('Job deleted')
      setSelectedJob(null)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error, _jobId, ctx) => {
      // Restore previous cache state on failure
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      toast(e.message, false)
    },
  })

  const bulkDeleteSelected = useMutation({
    mutationFn: (ids: string[]) => apiFetch('/jobs/bulk-delete', {
      method: 'DELETE',
      body: JSON.stringify({ job_ids: ids }),
    }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['jobs'] })
      const snapshot = qc.getQueriesData<JobsPage>({ queryKey: ['jobs'] })
      const idSet = new Set(ids)
      qc.setQueriesData<JobsPage>({ queryKey: ['jobs'] }, old =>
        old ? { ...old, jobs: old.jobs.filter(j => !idSet.has(j.id)), total: Math.max(0, old.total - ids.length) } : old
      )
      return { snapshot }
    },
    onSuccess: (d: unknown) => {
      const count = (d as { deleted: number }).deleted
      toast(count === 1 ? '1 job deleted' : `${count} jobs deleted`)
      exitSelection()
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error, _ids, ctx) => {
      ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      toast(e.message, false)
    },
  })

  // ── Helpers ────────────────────────────────────────────────────────────────
  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      checked ? next.add(id) : next.delete(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(jobs.map(j => j.id)))
  }

  async function toggleBookmark(job: Job) {
    const isBookmarked = bookmarkedIds.has(job.id)
    try {
      if (isBookmarked) {
        await apiFetch(`/saved/${job.id}`, { method: 'DELETE' })
      } else {
        await apiFetch(`/saved/${job.id}`, { method: 'POST' })
      }
      qc.invalidateQueries({ queryKey: ['saved'] })
    } catch (e) {
      toast((e as Error).message, false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111] dot-grid overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-4 md:px-8 md:py-5 border-b border-white/[0.03] bg-[#111111]">
        {/* Stats row — horizontal scroll on mobile */}
        {stats && (
          <div className="flex items-center gap-4 md:gap-6 mb-4 md:mb-5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { label: 'Total',     value: stats.total_jobs },
              { label: 'Emailed',   value: stats.emailed },
              { label: 'Avg Score', value: stats.avg_score != null ? `${stats.avg_score}%` : '—' },
              { label: 'This Week', value: stats.recent_7d },
              { label: 'Errors',    value: stats.errors },
            ].map(({ label, value }) => (
              <div key={label} className="text-center flex-shrink-0">
                <div className="text-white font-black text-lg md:text-xl">{value}</div>
                <div className="text-white/30 text-[9px] md:text-[10px] uppercase tracking-wider">{label}</div>
              </div>
            ))}
            {hasInProgress && (
              <div className="ml-auto flex items-center gap-2 text-blue-400 text-xs font-medium flex-shrink-0">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                <span className="hidden sm:inline">Pipeline running…</span>
              </div>
            )}
          </div>
        )}

        {/* Filter + actions row */}
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-0.5 scrollbar-none flex-nowrap">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setPage(1); exitSelection() }}
                className={`px-2.5 md:px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0
                  ${filter === f.value
                    ? 'bg-white text-black'
                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                  }`}
              >
                {f.label}
                {f.value && stats?.by_status[f.value] ? ` (${stats.by_status[f.value]})` : ''}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1.5 md:gap-2 flex-shrink-0">
            {(stats?.errors ?? 0) > 0 && !selectionMode && (
              <button
                onClick={() => bulkRetry.mutate()}
                disabled={bulkRetry.isPending}
                className="px-2.5 md:px-3 py-1.5 bg-white/5 text-white/50 text-xs font-semibold rounded-full hover:bg-white/10 hover:text-white transition-all"
              >
                Retry
              </button>
            )}
            {(stats?.by_status['below_threshold'] ?? 0) > 0 && !selectionMode && (
              <button
                onClick={() => bulkDeleteLow.mutate()}
                disabled={bulkDeleteLow.isPending}
                className="hidden sm:block px-2.5 md:px-3 py-1.5 bg-white/5 text-white/50 text-xs font-semibold rounded-full hover:bg-white/10 hover:text-white transition-all"
              >
                Clear Low
              </button>
            )}
            {/* Select button — only shown when NOT in selection mode */}
            {jobs.length > 0 && !selectionMode && (
              <button
                onClick={() => setSelectionMode(true)}
                className="px-2.5 md:px-3 py-1.5 bg-white/5 text-white/50 text-xs font-semibold rounded-full hover:bg-white/10 hover:text-white transition-all whitespace-nowrap"
              >
                Select
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Bulk action bar */}
      {selectionMode && (
        <div className="flex-shrink-0 px-4 md:px-8 py-3 bg-white/[0.03] border-b border-white/[0.04] flex items-center gap-2 md:gap-3 flex-wrap">
          {/* Selection controls */}
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs font-semibold">
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'None selected'}
            </span>
            <button
              onClick={selectAll}
              className="text-white/40 hover:text-white text-xs underline underline-offset-2 transition-colors"
            >
              All
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-white/40 hover:text-white text-xs underline underline-offset-2 transition-colors"
              >
                None
              </button>
            )}
          </div>

          {selectedIds.size > 0 && (
            <>
              <button
                onClick={() => bulkTailor.mutate()}
                disabled={bulkTailor.isPending}
                className="px-3 py-1.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: 13 }}>auto_awesome</span>
                Cover Letters
              </button>

              <div className="flex items-center gap-1">
                <select
                  value={bulkStage}
                  onChange={e => setBulkStage(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white/60 text-xs focus:outline-none"
                >
                  <option value="">Move to stage…</option>
                  {KANBAN_STAGES.map(s => <option key={s} value={s} className="bg-[#1a1a1a] capitalize">{s}</option>)}
                </select>
                {bulkStage && (
                  <button
                    onClick={() => { bulkStageUpdate.mutate(bulkStage); setBulkStage('') }}
                    disabled={bulkStageUpdate.isPending}
                    className="px-3 py-1.5 bg-white/10 text-white text-xs font-semibold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                  >
                    Apply
                  </button>
                )}
              </div>

              <button
                onClick={() => { if (confirm(`Delete ${selectedIds.size} job${selectedIds.size > 1 ? 's' : ''}? This cannot be undone.`)) bulkDeleteSelected.mutate([...selectedIds]) }}
                disabled={bulkDeleteSelected.isPending}
                className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 border border-red-500/20"
              >
                Delete
              </button>
            </>
          )}

          <button onClick={exitSelection} className="ml-auto text-white/30 hover:text-white text-xs transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Jobs grid */}
      <div className="flex-1 overflow-y-auto p-3 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-white/30 text-sm">Loading…</div>
          </div>
        ) : jobs.length === 0 && filter ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <span className="material-symbols-outlined text-white/20 text-5xl">filter_list_off</span>
            <p className="text-white/30 text-sm">No jobs with this filter</p>
          </div>
        ) : jobs.length === 0 ? (
          /* ── Onboarding empty state ── */
          <div className="max-w-2xl mx-auto py-8 px-2">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/[0.08] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-white/40" style={{ fontSize: 28 }}>rocket_launch</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Welcome to WorkfinderX</h2>
              <p className="text-white/40 text-sm max-w-sm mx-auto">
                Three steps to your first AI-scored job matches. Takes about 5 minutes.
              </p>
            </div>

            <div className="space-y-3">
              {/* Step 1 */}
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white text-black text-sm font-black flex items-center justify-center flex-shrink-0">1</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm mb-0.5">Upload your resume</p>
                  <p className="text-white/40 text-xs">PDF, DOCX, or TXT — Gemini AI will read it to score job matches against your actual experience.</p>
                </div>
                <button
                  onClick={() => navigate('/search')}
                  className="flex-shrink-0 px-3 py-1.5 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-all"
                >
                  Upload
                </button>
              </div>

              {/* Step 2 */}
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-white/10 text-white/40 text-sm font-black flex items-center justify-center flex-shrink-0">2</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm mb-0.5">Run your first search</p>
                  <p className="text-white/40 text-xs">Enter keywords like "Senior React Developer" and pick your platforms. WorkfinderX scrapes LinkedIn, Indeed, and more simultaneously.</p>
                </div>
                <button
                  onClick={() => navigate('/search')}
                  className="flex-shrink-0 px-3 py-1.5 bg-white/5 border border-white/10 text-white/60 text-xs font-bold rounded-lg hover:bg-white/10 hover:text-white transition-all"
                >
                  Search
                </button>
              </div>

              {/* Step 3 */}
              <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-5 flex items-start gap-4 opacity-50">
                <div className="w-8 h-8 rounded-full bg-white/10 text-white/40 text-sm font-black flex items-center justify-center flex-shrink-0">3</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm mb-0.5">Review your matches</p>
                  <p className="text-white/40 text-xs">Jobs appear here as they're scored. Each card shows a match %, missing skills, and a tailored cover letter for high matches.</p>
                </div>
                <div className="flex-shrink-0 px-3 py-1.5 text-white/20 text-xs font-bold">
                  Waiting…
                </div>
              </div>
            </div>

            {/* Tips row */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: 'psychology', text: 'AI scores every job 0–100% against your resume' },
                { icon: 'description', text: 'Cover letters and resume tips generated for top matches' },
                { icon: 'mail', text: 'Optionally emails applications to you automatically' },
              ].map(({ icon, text }) => (
                <div key={icon} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.04]">
                  <span className="material-symbols-outlined text-white/25 flex-shrink-0" style={{ fontSize: 18 }}>{icon}</span>
                  <p className="text-white/35 text-xs leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  bookmarked={bookmarkedIds.has(job.id)}
                  onClick={() => setSelectedJob(job)}
                  onBookmark={() => toggleBookmark(job)}
                  selectable={selectionMode}
                  selected={selectedIds.has(job.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-8">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-4 py-2 bg-white/5 text-white/50 text-sm rounded-xl hover:bg-white/10 hover:text-white transition-all disabled:opacity-30"
                >
                  Previous
                </button>
                <span className="text-white/40 text-sm">{page} / {pages} · {total} jobs</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-4 py-2 bg-white/5 text-white/50 text-sm rounded-xl hover:bg-white/10 hover:text-white transition-all disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <JobDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onStageChange={() => qc.invalidateQueries({ queryKey: ['jobs'] })}
        onDelete={jobId => { deleteJob.mutate(jobId) }}
      />
    </div>
  )
}
