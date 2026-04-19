import type { Job } from '../types'
import StatusBadge from './StatusBadge'

const IN_PROGRESS: Job['status'][] = ['queued', 'scoring', 'tailoring', 'emailing']

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171'
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
      style={{ background: `conic-gradient(${color} ${score}%, #333 0)`, padding: 3 }}
    >
      <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center text-xs font-black text-white">
        {score}
      </div>
    </div>
  )
}

interface Props {
  job: Job
  bookmarked?: boolean
  onClick: () => void
  onBookmark?: () => void
}

export default function JobCard({ job, bookmarked, onClick, onBookmark }: Props) {
  const isLive = IN_PROGRESS.includes(job.status)

  return (
    <div
      onClick={onClick}
      className="bg-[#1a1a1a] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:border-white/20 hover:bg-[#1e1e1e] transition-all group relative"
    >
      {/* Live pulse */}
      {isLive && (
        <span className="absolute top-3 right-3 w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
      )}

      <div className="flex items-start gap-4">
        {/* Score ring or placeholder */}
        <div className="flex-shrink-0">
          {job.match_score != null
            ? <ScoreRing score={job.match_score} />
            : (
              <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                <span className="material-symbols-outlined text-white/20" style={{ fontSize: 20 }}>work</span>
              </div>
            )
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">{job.title}</h3>
              <p className="text-white/50 text-xs mt-0.5 truncate">{job.company}</p>
            </div>
            {onBookmark && (
              <button
                onClick={e => { e.stopPropagation(); onBookmark() }}
                className="flex-shrink-0 text-white/20 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                title={bookmarked ? 'Unbookmark' : 'Bookmark'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: `'FILL' ${bookmarked ? 1 : 0}` }}>
                  bookmark
                </span>
              </button>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={job.status} />
            {job.platform && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/40 uppercase">
                {job.platform}
              </span>
            )}
            {job.location && (
              <span className="text-[10px] text-white/30 truncate max-w-[120px]">{job.location}</span>
            )}
          </div>

          {/* Salary + job type */}
          {(job.salary_min || job.job_type) && (
            <div className="flex items-center gap-2 mt-2">
              {job.salary_min && (
                <span className="text-[10px] text-green-400/70 font-medium">
                  ${job.salary_min}{job.salary_max ? `–$${job.salary_max}` : '+'}
                </span>
              )}
              {job.job_type && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 text-white/40">
                  {job.job_type}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notes indicator */}
      {job.notes && (
        <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center gap-1.5 text-[10px] text-white/30">
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>edit_note</span>
          <span className="truncate">{job.notes.slice(0, 60)}</span>
        </div>
      )}
    </div>
  )
}
