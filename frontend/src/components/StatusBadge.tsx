import type { JobStatus } from '../types'

const MAP: Record<JobStatus, { label: string; cls: string }> = {
  pending:         { label: 'Pending',         cls: 'bg-zinc-700 text-zinc-300' },
  queued:          { label: 'Queued',           cls: 'bg-zinc-700 text-zinc-300' },
  scoring:         { label: 'Scoring…',         cls: 'bg-blue-500/20 text-blue-300' },
  tailoring:       { label: 'Tailoring…',       cls: 'bg-purple-500/20 text-purple-300' },
  emailing:        { label: 'Sending…',         cls: 'bg-yellow-500/20 text-yellow-300' },
  emailed:         { label: 'Emailed',          cls: 'bg-green-500/20 text-green-400' },
  scored:          { label: 'Scored',           cls: 'bg-teal-500/20 text-teal-300' },
  error:           { label: 'Error',            cls: 'bg-red-500/20 text-red-400' },
  below_threshold: { label: 'Low Match',        cls: 'bg-orange-500/20 text-orange-400' },
}

export default function StatusBadge({ status }: { status: JobStatus }) {
  const { label, cls } = MAP[status] ?? MAP.pending
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  )
}
