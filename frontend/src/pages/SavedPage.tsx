import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import type { Job } from '../types'
import JobCard from '../components/JobCard'
import JobDrawer from '../components/JobDrawer'
import { useToast } from '../components/Toast'

export default function SavedPage() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const toast = useToast()
  const qc = useQueryClient()

  // /saved returns Job[] directly
  const { data: saved = [], isLoading } = useQuery({
    queryKey: ['saved-full'],
    queryFn: () => apiFetch<Job[]>('/saved'),
  })

  async function unbookmark(jobId: string) {
    try {
      await apiFetch(`/saved/${jobId}`, { method: 'DELETE' })
      toast('Removed from saved')
      qc.invalidateQueries({ queryKey: ['saved-full'] })
      qc.invalidateQueries({ queryKey: ['saved'] })
      if (selectedJob?.id === jobId) setSelectedJob(null)
    } catch (e) {
      toast((e as Error).message, false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111] dot-grid overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6 border-b border-white/[0.03] bg-[#111111]">
        <h1 className="text-white font-bold text-2xl tracking-tight">Saved Jobs</h1>
        <p className="text-white/40 text-sm mt-1">{saved.length} bookmarked</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-white/30 text-sm">Loading…</div>
          </div>
        ) : saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <span className="material-symbols-outlined text-white/20 text-5xl">bookmark_border</span>
            <p className="text-white/30 text-sm">No saved jobs yet — bookmark from the Feed</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {saved.map(job => (
              <JobCard
                key={job.id}
                job={job}
                bookmarked
                onClick={() => setSelectedJob(job)}
                onBookmark={() => unbookmark(job.id)}
              />
            ))}
          </div>
        )}
      </div>

      <JobDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onStageChange={() => qc.invalidateQueries({ queryKey: ['saved-full'] })}
      />
    </div>
  )
}
