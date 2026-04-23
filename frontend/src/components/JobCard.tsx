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

function deadlineBadge(dateStr: string | null) {
  if (!dateStr) return null
  const days = Math.ceil((new Date(dateStr).getTime() - new Date().setHours(0,0,0,0)) / 86_400_000)
  if (days < 0)  return { label: `${Math.abs(days)}d overdue`, color: 'text-red-400' }
  if (days === 0) return { label: 'Due today!',  color: 'text-orange-400' }
  if (days <= 3)  return { label: `${days}d left`, color: 'text-orange-400' }
  return { label: `${days}d left`, color: 'text-white/30' }
}

interface Props {
  job: Job
  bookmarked?: boolean
  onClick: () => void
  onBookmark?: () => void
  // Bulk selection
  selectable?: boolean
  selected?: boolean
  onSelect?: (id: string, checked: boolean) => void
  // Per-card: clicking the hover checkbox when NOT in selection mode
  onStartSelect?: (id: string) => void
}

export default function JobCard({ job, bookmarked, onClick, onBookmark, selectable, selected, onSelect, onStartSelect }: Props) {
  const isLive = IN_PROGRESS.includes(job.status)
  const dl = deadlineBadge(job.deadline)

  return (
    <div
      onClick={selectable ? undefined : onClick}
      className={`bg-[#1a1a1a] border rounded-xl p-5 transition-all group relative
        ${selectable ? 'cursor-default' : 'cursor-pointer hover:border-white/20 hover:bg-[#1e1e1e]'}
        ${selected ? 'border-white/30 bg-[#1e1e1e]' : 'border-white/[0.06]'}
      `}
    >
      {/* Top-right: live pulse (hidden on hover if selectable), bulk checkbox, or hover-to-select checkbox */}
      {isLive && !selectable && (
        <span className={`absolute top-3 right-3 w-2 h-2 bg-blue-400 rounded-full animate-pulse ${onStartSelect ? 'group-hover:opacity-0' : ''}`} />
      )}

      {/* Bulk selection checkbox (always visible in selection mode) */}
      {selectable && (
        <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={e => onSelect?.(job.id, e.target.checked)}
            className="w-4 h-4 accent-white cursor-pointer"
          />
        </div>
      )}

      {/* Hover checkbox — appears on hover outside selection mode to start per-card selection */}
      {!selectable && onStartSelect && (
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={false}
            onChange={e => { if (e.target.checked) onStartSelect(job.id) }}
            className="w-4 h-4 accent-white cursor-pointer"
            title="Select job"
          />
        </div>
      )}

      <div
        className="flex items-start gap-4"
        onClick={selectable ? () => onClick() : undefined}
        style={selectable ? { cursor: 'pointer' } : undefined}
      >
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
            {onBookmark && !selectable && (
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
            {job.is_expired && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                Expired
              </span>
            )}
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

          {/* Deadline countdown */}
          {dl && (
            <p className={`text-[10px] font-semibold mt-1.5 ${dl.color}`}>
              <span className="material-symbols-outlined align-middle" style={{ fontSize: 10 }}>schedule</span>
              {' '}{dl.label}
            </p>
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
