import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { apiFetch } from '../api/client'
import type { Job, KanbanStage, JobsPage } from '../types'
import StatusBadge from '../components/StatusBadge'
import JobDrawer from '../components/JobDrawer'
import { useToast } from '../components/Toast'

const STAGES: { id: KanbanStage; label: string; color: string }[] = [
  { id: 'discovered', label: 'Discovered', color: '#a78bfa' },
  { id: 'applied',    label: 'Applied',    color: '#60a5fa' },
  { id: 'interview',  label: 'Interview',  color: '#fbbf24' },
  { id: 'offer',      label: 'Offer',      color: '#34d399' },
  { id: 'rejected',   label: 'Rejected',   color: '#f87171' },
]

function KanbanCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: job.id })
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: isDragging ? 0.4 : 1 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className="bg-[#1e1e1e] border border-white/[0.06] rounded-xl p-3 cursor-pointer hover:border-white/20 transition-all touch-none select-none"
    >
      <p className="text-white text-xs font-semibold truncate">{job.title}</p>
      <p className="text-white/40 text-[10px] mt-0.5 truncate">{job.company}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <StatusBadge status={job.status} />
        {job.match_score != null && (
          <span className="text-[10px] font-bold" style={{
            color: job.match_score >= 80 ? '#34d399' : job.match_score >= 60 ? '#fbbf24' : '#f87171'
          }}>
            {job.match_score}%
          </span>
        )}
      </div>
      {job.salary_min && (
        <p className="text-[10px] text-green-400/70 mt-1">${job.salary_min}{job.salary_max ? `–$${job.salary_max}` : '+'}</p>
      )}
      {job.notes && (
        <p className="text-[10px] text-white/30 mt-1 truncate flex items-center gap-1">
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>edit_note</span>
          {job.notes.slice(0, 40)}
        </p>
      )}
    </div>
  )
}

function KanbanColumn({ stage, jobs, onClick }: { stage: typeof STAGES[0]; jobs: Job[]; onClick: (j: Job) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  return (
    <div className="flex flex-col min-w-[220px] flex-1">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
          <span className="text-white/70 text-xs font-semibold">{stage.label}</span>
        </div>
        <span className="text-white/30 text-[10px] font-bold">{jobs.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-2 min-h-[200px] rounded-xl p-2 transition-colors
          ${isOver ? 'bg-white/5 border border-dashed border-white/20' : 'bg-white/[0.01] border border-transparent'}`}
      >
        {jobs.map(job => (
          <KanbanCard key={job.id} job={job} onClick={() => onClick(job)} />
        ))}
        {jobs.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-white/15 text-xs">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

export default function BoardPage() {
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const [savedOnly, setSavedOnly] = useState(false)
  const toast = useToast()
  const qc = useQueryClient()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const { data } = useQuery({
    queryKey: ['jobs-board'],
    queryFn: () => apiFetch<JobsPage>('/jobs?page_size=500'),
    refetchInterval: 20_000,
  })

  const { data: savedIds = [] } = useQuery({
    queryKey: ['saved'],
    queryFn: () => apiFetch<{ job_id: string }[]>('/saved'),
  })

  const savedSet = new Set(savedIds.map(s => s.job_id))
  const allJobs = data?.jobs ?? []
  const jobs = savedOnly ? allJobs.filter(j => savedSet.has(j.id)) : allJobs

  function getStageJobs(stage: KanbanStage) {
    return jobs.filter(j => (j.kanban_stage ?? 'discovered') === stage)
  }

  function handleDragStart(event: DragStartEvent) {
    const job = allJobs.find(j => j.id === event.active.id)
    setActiveJob(job ?? null)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveJob(null)
    if (!over || active.id === over.id) return

    const jobId = active.id as string
    const newStage = over.id as KanbanStage

    const job = allJobs.find(j => j.id === jobId)
    if (!job || job.kanban_stage === newStage) return

    // Optimistic update
    qc.setQueryData<JobsPage>(['jobs-board'], old => {
      if (!old) return old
      return {
        ...old,
        jobs: old.jobs.map(j => j.id === jobId ? { ...j, kanban_stage: newStage } : j),
      }
    })

    try {
      await apiFetch(`/jobs/${jobId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      })
    } catch (e) {
      toast((e as Error).message, false)
      qc.invalidateQueries({ queryKey: ['jobs-board'] })
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#111111] dot-grid overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-8 py-5 border-b border-white/[0.03] bg-[#111111] flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-2xl tracking-tight">Board</h1>
          <p className="text-white/40 text-sm mt-1">{jobs.length} jobs</p>
        </div>
        <button
          onClick={() => setSavedOnly(s => !s)}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all
            ${savedOnly ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
        >
          {savedOnly ? 'Saved Only' : 'All Jobs'}
        </button>
      </header>

      {/* Kanban grid */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-w-max">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                jobs={getStageJobs(stage.id)}
                onClick={setSelectedJob}
              />
            ))}
          </div>

          <DragOverlay>
            {activeJob && (
              <div className="bg-[#1e1e1e] border border-white/20 rounded-xl p-3 shadow-2xl w-52 opacity-90 rotate-2">
                <p className="text-white text-xs font-semibold truncate">{activeJob.title}</p>
                <p className="text-white/40 text-[10px] mt-0.5 truncate">{activeJob.company}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <JobDrawer
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onStageChange={() => {
          qc.invalidateQueries({ queryKey: ['jobs-board'] })
          setSelectedJob(null)
        }}
      />
    </div>
  )
}
