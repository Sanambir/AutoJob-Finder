import { useState, useMemo } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
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

export default function FeedPage() {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const toast = useToast()
  const qc = useQueryClient()

  // Main jobs query — auto-polls when jobs are in progress
  const { data, isLoading } = useQuery({
    queryKey: ['jobs', filter, page],
    queryFn: () => apiFetch<JobsPage>(`/jobs?page=${page}&page_size=${PAGE_SIZE}${filter ? `&status=${filter}` : ''}`),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? []
      return jobs.some(j => IN_PROGRESS.includes(j.status)) ? 3000 : 15_000
    },
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<Stats>('/stats'),
    refetchInterval: 15_000,
  })

  // /saved returns Job[] directly — use job.id as the bookmark key
  const { data: savedData = [] } = useQuery({
    queryKey: ['saved'],
    queryFn: () => apiFetch<Job[]>('/saved'),
  })

  const bookmarkedIds = useMemo(
    () => new Set(savedData.map(j => j.id)),
    [savedData],
  )

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const hasInProgress = jobs.some(j => IN_PROGRESS.includes(j.status))

  // Mutations
  const bulkRetry = useMutation({
    mutationFn: () => apiFetch('/jobs/bulk-retry', { method: 'POST' }),
    onSuccess: () => { toast('All error jobs re-queued!'); qc.invalidateQueries({ queryKey: ['jobs'] }) },
    onError: (e: Error) => toast(e.message, false),
  })

  const bulkDeleteLow = useMutation({
    mutationFn: () => apiFetch('/jobs/bulk-delete-below-threshold', { method: 'POST' }),
    onSuccess: (d: unknown) => {
      const result = d as { deleted: number }
      toast(`Deleted ${result.deleted} low-match jobs`)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error) => toast(e.message, false),
  })

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
      <header className="flex-shrink-0 px-8 py-5 border-b border-white/[0.03] bg-[#111111]">
        {/* Stats row */}
        {stats && (
          <div className="flex items-center gap-6 mb-5">
            {[
              { label: 'Total', value: stats.total_jobs },
              { label: 'Emailed', value: stats.emailed },
              { label: 'Avg Score', value: stats.avg_score != null ? `${stats.avg_score}%` : '—' },
              { label: 'This Week', value: stats.recent_7d },
              { label: 'Errors', value: stats.errors },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-white font-black text-xl">{value}</div>
                <div className="text-white/30 text-[10px] uppercase tracking-wider">{label}</div>
              </div>
            ))}

            {hasInProgress && (
              <div className="ml-auto flex items-center gap-2 text-blue-400 text-xs font-medium">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                Pipeline running…
              </div>
            )}
          </div>
        )}

        {/* Filter + actions row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => { setFilter(f.value); setPage(1) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all
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
          <div className="ml-auto flex gap-2">
            {(stats?.errors ?? 0) > 0 && (
              <button
                onClick={() => bulkRetry.mutate()}
                disabled={bulkRetry.isPending}
                className="px-3 py-1.5 bg-white/5 text-white/50 text-xs font-semibold rounded-full hover:bg-white/10 hover:text-white transition-all"
              >
                Retry Errors
              </button>
            )}
            {(stats?.by_status['below_threshold'] ?? 0) > 0 && (
              <button
                onClick={() => bulkDeleteLow.mutate()}
                disabled={bulkDeleteLow.isPending}
                className="px-3 py-1.5 bg-white/5 text-white/50 text-xs font-semibold rounded-full hover:bg-white/10 hover:text-white transition-all"
              >
                Clear Low Matches
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Jobs grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-white/30 text-sm">Loading…</div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <span className="material-symbols-outlined text-white/20 text-5xl">work_off</span>
            <p className="text-white/30 text-sm">
              {filter ? 'No jobs with this filter' : 'No jobs yet — run a search to get started'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  bookmarked={bookmarkedIds.has(job.id)}
                  onClick={() => setSelectedJob(job)}
                  onBookmark={() => toggleBookmark(job)}
                />
              ))}
            </div>

            {/* Pagination */}
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

      {/* Drawer */}
      <JobDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onStageChange={() => qc.invalidateQueries({ queryKey: ['jobs'] })}
      />
    </div>
  )
}
