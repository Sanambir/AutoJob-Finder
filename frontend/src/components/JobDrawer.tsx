import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Job } from '../types'
import StatusBadge from './StatusBadge'
import { apiFetch } from '../api/client'
import { useToast } from './Toast'

interface Props {
  job: Job | null
  onClose: () => void
  onStageChange?: (job: Job, stage: string) => void
}

const KANBAN_STAGES = ['discovered', 'applied', 'interview', 'offer', 'rejected'] as const

export default function JobDrawer({ job, onClose, onStageChange }: Props) {
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [descOpen, setDescOpen] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  useEffect(() => {
    setNotes(job?.notes ?? '')
    setDescOpen(false)
  }, [job?.id])

  async function saveNotes() {
    if (!job) return
    setSavingNotes(true)
    try {
      await apiFetch(`/jobs/${job.id}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      })
      toast('Notes saved!')
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } catch (e) {
      toast((e as Error).message, false)
    } finally {
      setSavingNotes(false)
    }
  }

  async function changeStage(stage: string) {
    if (!job) return
    await apiFetch(`/jobs/${job.id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify({ stage }),
    })
    qc.invalidateQueries({ queryKey: ['jobs'] })
    onStageChange?.(job, stage)
  }

  async function retryJob() {
    if (!job) return
    try {
      await apiFetch(`/jobs/${job.id}/retry`, { method: 'POST' })
      toast('Job re-queued!')
      qc.invalidateQueries({ queryKey: ['jobs'] })
      onClose()
    } catch (e) {
      toast((e as Error).message, false)
    }
  }

  if (!job) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-full max-w-lg bg-[#161616] border-l border-white/[0.06] z-50 flex flex-col drawer-enter overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/[0.04]">
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-bold text-lg truncate">{job.title}</h2>
            <p className="text-white/50 text-sm mt-0.5">{job.company}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge status={job.status} />
              {job.platform && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/40 uppercase">
                  {job.platform}
                </span>
              )}
              {job.date_posted && (
                <span className="text-[10px] text-white/30">{job.date_posted}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors ml-4 flex-shrink-0">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Score */}
          {job.match_score != null && (
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/60 text-xs font-semibold uppercase tracking-wider">Match Score</span>
                <span className="text-white text-2xl font-black">{job.match_score}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${job.match_score}%`,
                    background: job.match_score >= 80 ? '#34d399' : job.match_score >= 60 ? '#fbbf24' : '#f87171',
                  }}
                />
              </div>
              {job.reasoning && (
                <p className="text-white/50 text-xs mt-3 leading-relaxed">{job.reasoning}</p>
              )}
            </div>
          )}

          {/* Missing skills */}
          {job.missing_skills?.length > 0 && (
            <div>
              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Missing Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.missing_skills.map(s => (
                  <span key={s} className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Salary + meta */}
          {(job.salary_min || job.location || job.job_type) && (
            <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/[0.06] grid grid-cols-2 gap-3">
              {job.salary_min && (
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Salary</p>
                  <p className="text-green-400 text-sm font-semibold">
                    ${job.salary_min}{job.salary_max ? `–$${job.salary_max}` : '+'}
                  </p>
                </div>
              )}
              {job.location && (
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Location</p>
                  <p className="text-white/80 text-sm">{job.location}</p>
                </div>
              )}
              {job.job_type && (
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Type</p>
                  <p className="text-white/80 text-sm">{job.job_type}</p>
                </div>
              )}
            </div>
          )}

          {/* Kanban stage */}
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Application Stage</p>
            <div className="flex flex-wrap gap-2">
              {KANBAN_STAGES.map(stage => (
                <button
                  key={stage}
                  onClick={() => changeStage(stage)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all
                    ${job.kanban_stage === stage
                      ? 'bg-white text-black'
                      : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {/* Resume suggestions */}
          {job.resume_suggestions && (
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Resume Suggestions</p>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{job.resume_suggestions}</p>
            </div>
          )}

          {/* Cover letter */}
          {job.cover_letter && (
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Cover Letter</p>
                <a
                  href={`/api/jobs/${job.id}/cover-letter.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                  PDF
                </a>
              </div>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{job.cover_letter}</p>
            </div>
          )}

          {/* Job description (collapsible) */}
          {job.job_description && (
            <div>
              <button
                onClick={() => setDescOpen(o => !o)}
                className="flex items-center gap-2 text-white/40 text-xs font-semibold uppercase tracking-wider hover:text-white/60 transition-colors w-full"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {descOpen ? 'expand_less' : 'expand_more'}
                </span>
                Job Description
              </button>
              {descOpen && (
                <p className="mt-3 text-white/50 text-sm leading-relaxed whitespace-pre-wrap">{job.job_description}</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add private notes about this job…"
              rows={3}
              className="w-full bg-[#1a1a1a] border border-white/[0.06] rounded-xl px-4 py-3 text-white/80 text-sm resize-none focus:outline-none focus:border-white/20 placeholder:text-white/20"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {savingNotes ? 'Saving…' : 'Save Notes'}
            </button>
          </div>

          {/* Error + retry */}
          {job.status === 'error' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-1">Error</p>
              <p className="text-red-300/80 text-sm">{job.error}</p>
              <button
                onClick={retryJob}
                className="mt-3 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-400 transition-colors"
              >
                Retry Job
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.04] flex items-center gap-3">
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 bg-white text-black text-sm font-semibold rounded-xl text-center hover:bg-white/90 transition-colors"
            >
              View Posting
            </a>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-white/5 text-white/60 text-sm font-semibold rounded-xl hover:bg-white/10 transition-colors"
          >
            Close
          </button>
        </div>
      </aside>
    </>
  )
}
