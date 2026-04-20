import { useState, useEffect } from 'react'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import type { Job, Resume } from '../types'
import StatusBadge from './StatusBadge'
import { apiFetch } from '../api/client'
import { useToast } from './Toast'

interface Props {
  job: Job | null
  onClose: () => void
  onStageChange?: (job: Job, stage: string) => void
}

const KANBAN_STAGES = ['discovered', 'applied', 'interview', 'offer', 'rejected'] as const

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86_400_000)
}

export default function JobDrawer({ job, onClose, onStageChange }: Props) {
  const [notes, setNotes]               = useState('')
  const [savingNotes, setSavingNotes]   = useState(false)
  const [descOpen, setDescOpen]         = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [generatingPrep, setGeneratingPrep] = useState(false)
  const [coverLetter, setCoverLetter]           = useState<string | null>(null)
  const [resumeSuggestions, setResumeSuggestions] = useState<string | null>(null)
  const [interviewPrep, setInterviewPrep]         = useState<string | null>(null)
  // Resume A/B
  const [selectedResumeId, setSelectedResumeId] = useState<string>('')
  const [deadline, setDeadline] = useState<string>('')
  const [savingDeadline, setSavingDeadline] = useState(false)

  const toast = useToast()
  const qc = useQueryClient()

  // Fetch user resumes for A/B picker
  const { data: resumes = [] } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => apiFetch<Resume[]>('/user/resumes'),
    staleTime: 60_000,
  })

  // Reset local state whenever a different job is opened
  useEffect(() => {
    setNotes(job?.notes ?? '')
    setDescOpen(false)
    setGenerating(false)
    setGeneratingPrep(false)
    setCoverLetter(job?.cover_letter ?? null)
    setResumeSuggestions(job?.resume_suggestions ?? null)
    setInterviewPrep(job?.interview_prep ?? null)
    setDeadline(job?.deadline ?? '')
    // Pre-select the resume that was used for this job
    setSelectedResumeId(job?.resume_id ?? '')
  }, [job?.id])

  // Poll for cover letter completion
  const { data: freshJob } = useQuery({
    queryKey: ['job-detail', job?.id],
    queryFn:  () => apiFetch<Job>(`/jobs/${job!.id}`),
    enabled:  (generating || generatingPrep) && !!job?.id,
    refetchInterval: 2000,
  })

  useEffect(() => {
    if (!freshJob) return
    if (generating && freshJob.cover_letter) {
      setCoverLetter(freshJob.cover_letter)
      setResumeSuggestions(freshJob.resume_suggestions)
      setGenerating(false)
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['jobs-board'] })
      qc.invalidateQueries({ queryKey: ['saved-full'] })
      toast('Cover letter generated!')
    }
    if (generatingPrep && freshJob.interview_prep) {
      setInterviewPrep(freshJob.interview_prep)
      setGeneratingPrep(false)
      toast('Interview prep ready!')
    }
  }, [freshJob?.cover_letter, freshJob?.interview_prep, generating, generatingPrep]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function saveDeadline(value: string) {
    if (!job) return
    setSavingDeadline(true)
    try {
      await apiFetch(`/jobs/${job.id}/deadline`, {
        method: 'PATCH',
        body: JSON.stringify({ deadline: value || null }),
      })
      setDeadline(value)
      toast(value ? 'Deadline saved!' : 'Deadline cleared.')
      qc.invalidateQueries({ queryKey: ['jobs'] })
    } catch (e) {
      toast((e as Error).message, false)
    } finally {
      setSavingDeadline(false)
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

  async function generateCoverLetter() {
    if (!job) return
    setGenerating(true)
    try {
      const body = selectedResumeId ? JSON.stringify({ resume_id: selectedResumeId }) : undefined
      await apiFetch(`/jobs/${job.id}/tailor`, { method: 'POST', body })
    } catch (e) {
      toast((e as Error).message, false)
      setGenerating(false)
    }
  }

  async function generateInterviewPrep() {
    if (!job) return
    setGeneratingPrep(true)
    try {
      await apiFetch(`/jobs/${job.id}/interview-prep`, { method: 'POST' })
    } catch (e) {
      toast((e as Error).message, false)
      setGeneratingPrep(false)
    }
  }

  if (!job) return null

  const days = daysUntil(deadline)
  const deadlineColor = days === null ? '' : days < 0 ? 'text-red-400' : days <= 2 ? 'text-orange-400' : 'text-green-400'

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
              {job.is_expired && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                  EXPIRED
                </span>
              )}
              {job.platform && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/40 uppercase">
                  {job.platform}
                </span>
              )}
              {job.date_posted && (
                <span className="text-[10px] text-white/30">{job.date_posted}</span>
              )}
              {days !== null && (
                <span className={`text-[10px] font-semibold ${deadlineColor}`}>
                  {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today!' : `${days}d left`}
                </span>
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

          {/* Deadline */}
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Application Deadline</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="flex-1 bg-[#1a1a1a] border border-white/[0.06] rounded-xl px-4 py-2.5 text-white/80 text-sm focus:outline-none focus:border-white/20 [color-scheme:dark]"
              />
              <button
                onClick={() => saveDeadline(deadline)}
                disabled={savingDeadline}
                className="px-3 py-2.5 bg-white/5 text-white/60 text-xs font-semibold rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {savingDeadline ? '…' : 'Save'}
              </button>
              {deadline && (
                <button
                  onClick={() => saveDeadline('')}
                  className="text-white/30 hover:text-white/60 transition-colors"
                  title="Clear deadline"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
              )}
            </div>
            {days !== null && (
              <p className={`text-xs mt-1.5 font-medium ${deadlineColor}`}>
                {days < 0 ? `${Math.abs(days)} day(s) overdue` : days === 0 ? 'Due today!' : `${days} day(s) remaining`}
              </p>
            )}
          </div>

          {/* Resume suggestions */}
          {resumeSuggestions && (
            <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider mb-3">Resume Suggestions</p>
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{resumeSuggestions}</p>
            </div>
          )}

          {/* Cover letter */}
          <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Cover Letter</p>
              <div className="flex items-center gap-2">
                {coverLetter && (
                  <>
                    <a
                      href={`/api/jobs/${job.id}/cover-letter.pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                      PDF
                    </a>
                    <button
                      onClick={generateCoverLetter}
                      disabled={generating}
                      title="Regenerate cover letter"
                      className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Resume A/B picker */}
            {resumes.length > 1 && (
              <div className="mb-3">
                <p className="text-white/30 text-[10px] uppercase tracking-wider mb-1">Use resume</p>
                <select
                  value={selectedResumeId}
                  onChange={e => setSelectedResumeId(e.target.value)}
                  className="w-full bg-[#111] border border-white/[0.06] rounded-lg px-3 py-2 text-white/70 text-xs focus:outline-none focus:border-white/20"
                >
                  <option value="">Default (last used)</option>
                  {resumes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                {job.resume_id && (
                  <p className="text-white/25 text-[10px] mt-1">
                    Last tailored with: {resumes.find(r => r.id === job.resume_id)?.name ?? 'unknown resume'}
                  </p>
                )}
              </div>
            )}

            {coverLetter ? (
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{coverLetter}</p>
            ) : generating ? (
              <div className="flex items-center gap-3 py-4">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin flex-shrink-0" />
                <span className="text-white/40 text-sm">Generating cover letter… this takes 15–30 seconds</span>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-white/30 text-sm">No cover letter yet.</p>
                <button
                  onClick={generateCoverLetter}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold rounded-lg hover:bg-white/90 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_awesome</span>
                  Generate Cover Letter
                </button>
                {job.status === 'below_threshold' && (
                  <p className="text-white/25 text-[11px]">
                    This job scored below your threshold but you can still generate a cover letter.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Interview Prep */}
          <div className="bg-[#1a1a1a] rounded-xl p-5 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">Interview Prep</p>
              {interviewPrep && (
                <button
                  onClick={generateInterviewPrep}
                  disabled={generatingPrep}
                  title="Regenerate"
                  className="text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                </button>
              )}
            </div>

            {interviewPrep ? (
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{interviewPrep}</p>
            ) : generatingPrep ? (
              <div className="flex items-center gap-3 py-4">
                <span className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin flex-shrink-0" />
                <span className="text-white/40 text-sm">Generating interview prep… 15–30 seconds</span>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="text-white/30 text-sm">No interview prep yet.</p>
                <button
                  onClick={generateInterviewPrep}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/20 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>quiz</span>
                  Generate Interview Prep
                </button>
                {job.kanban_stage === 'interview' && (
                  <p className="text-blue-400/60 text-[11px]">You're in the interview stage — prep now!</p>
                )}
              </div>
            )}
          </div>

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
