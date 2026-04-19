export type JobStatus =
  | 'pending' | 'queued' | 'scoring' | 'tailoring'
  | 'emailing' | 'emailed' | 'scored' | 'error' | 'below_threshold';

export type KanbanStage = 'discovered' | 'applied' | 'interview' | 'offer' | 'rejected';

export interface Job {
  id: string;
  title: string;
  company: string;
  url: string;
  resume: string;
  job_description: string;
  applicant_name: string;
  recipient_email: string;
  status: JobStatus;
  match_score: number | null;
  reasoning: string | null;
  missing_skills: string[];
  resume_suggestions: string | null;
  cover_letter: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
  platform: string;
  location: string;
  date_posted: string;
  kanban_stage: KanbanStage;
  notes: string | null;
  salary_min: string | null;
  salary_max: string | null;
  job_type: string | null;
}

export interface JobsPage {
  jobs: Job[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  match_threshold: number;
  has_resume: boolean;
  is_verified: boolean;
  is_admin: boolean;
}

export interface Resume {
  id: string;
  name: string;
  created_at: string | null;
  preview: string;
  is_active: boolean;
}

export interface ActivityLog {
  id: number;
  event_type: string;
  message: string;
  created_at: string;
}

export interface Schedule {
  keywords: string;
  location: string;
  platforms: string[];
  results_per_site: number;
  hours_old: number;
  auto_pipeline: boolean;
  run_time: string;
  enabled: boolean;
}

export interface AppConfig {
  match_threshold: number;
  smtp_configured: boolean;
}

export interface Stats {
  total_jobs: number;
  emailed: number;
  avg_score: number | null;
  by_status: Record<string, number>;
  recent_7d: number;
  errors: number;
}

export interface SavedJob {
  id: number;
  job: Job;
}
