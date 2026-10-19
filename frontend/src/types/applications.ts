import type { WorkflowState } from './identity';
import type { Job } from './jobs';

export interface ApplicationQuestion {
  id: string;
  question_text: string;
  canonical_intent?: string;
  answer_provided?: string;
  answered_by: string;
  confidence_score: number;
}

export interface Application {
  id: string;
  user_id: string;
  job_id: string;
  resume_id?: string;
  idempotency_key: string;
  workflow_state: WorkflowState;
  outcome_status?: string;
  applied_at?: string;
  failure_reason?: string;
  trace_file_path?: string;
  screenshot_file_path?: string;
  created_at: string;
  updated_at?: string;
  questions: ApplicationQuestion[];
  job?: Job;
  job_title?: string;
  company?: string;
  location?: string;
  min_experience_years?: number;
  max_experience_years?: number;
  min_salary?: number;
  max_salary?: number;
  salary_currency?: string;
  apply_url?: string;
  platform?: string;
  match_score?: number;
  retry_count?: number;
  error_category?: string;
  next_retry_at?: string;
  /** Server-owned user-facing status (backend domain/applications/display_status.py). */
  display_status?: string;
  /** Server-owned: the user must act or look (failed, paused, or submission unverified). */
  needs_attention?: boolean;
}

export interface ApplicationStats {
  total: number;
  applied: number;
  applied_today?: number;
  paused: number;
  failed: number;
  skipped?: number;
  approval_required: number;
  reconciliation_required?: number;
  needs_attention?: number;
  success_rate?: number;
}

export interface PaginatedApplicationsResponse {
  items: Application[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
