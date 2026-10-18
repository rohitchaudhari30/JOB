export interface AutomationRunStatus {
  run_id: string;
  user_id: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'ABORTED';
  active_state: string;
  is_paused: boolean;
  discovered_jobs_count: number;
  matched_jobs_count: number;
  applications_submitted_count: number;
  current_job_title?: string;
  current_application_id?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface TimelineEvent {
  id?: string;
  seq?: number;
  run_id: string;
  event_name: string;
  state: string;
  message: string;
  stats?: {
    discovered: number;
    matched: number;
    applied: number;
  };
  payload?: any;
  timestamp: string;
}

export interface ScheduleJobConfig {
  schedule_id: string;
  user_id: string;
  source_type: string;
  roles: string[];
  locations: string[];
  cron_expression?: string;
  interval_minutes?: number;
  auto_apply: boolean;
  max_applications_per_run: number;
  is_active: boolean;
  created_at?: string;
}
