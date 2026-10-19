export interface PlatformConnectionInfo {
  platform: string;
  display_name: string;
  category: 'PORTAL_DISCOVERY' | 'ATS_APPLICATION';
  connection_type: 'BROWSER_SESSION' | 'API_TOKEN' | 'OAUTH' | 'PUBLIC_ACCESS';
  is_auth_required: boolean;
  status: 'NOT_CONNECTED' | 'CONNECTING' | 'CONNECTED' | 'SESSION_EXPIRED' | 'REAUTH_REQUIRED' | 'PAUSED' | 'ERROR' | 'DISCONNECTED';
  session_active: boolean;
  external_account_reference?: string | null;
  last_verified_at?: string | null;
  capabilities: string[];
  description: string;
}

export interface CampaignRule {
  auto_apply_threshold: number;
  review_threshold: number;
  min_experience_years: number;
  max_experience_years: number;
  target_roles: string[];
  target_locations: string[];
  mandatory_skills: string[];
  excluded_keywords: string[];
  target_platforms: string[];
}

export interface CampaignSafetyPolicy {
  daily_application_limit: number;
  hourly_application_limit: number;
  cooldown_seconds: number;
  operating_start_time: string;
  operating_end_time: string;
  max_concurrent_applications: number;
}

export interface CampaignSchedule {
  is_active: boolean;
  cron_expression?: string | null;
  interval_minutes?: number | null;
  last_run_at?: string | null;
  next_run_at?: string | null;
}

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  state: 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  target_resume_id?: string | null;
  rule: CampaignRule;
  safety_policy: CampaignSafetyPolicy;
  schedule: CampaignSchedule;
  created_at: string;
  updated_at: string;
}

export interface CampaignExecution {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  discovered_count: number;
  qualified_count: number;
  queued_count: number;
  submitted_count: number;
  failed_count: number;
  error_message?: string | null;
  worker_id?: string | null;
  heartbeat_at?: string | null;
  lease_expires_at?: string | null;
}

export interface CampaignActivityLog {
  id: string;
  execution_id: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CHALLENGE';
  event_type: string;
  message: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface CampaignPacingStatus {
  campaign_id: string;
  today_count: number;
  daily_limit: number;
  hourly_count: number;
  hourly_limit: number;
  cooldown_seconds: number;
  is_within_window: boolean;
  can_apply_now: boolean;
  status_reason: string;
  active_execution_id?: string | null;
  active_execution_status?: string | null;
  active_job_title?: string | null;
  active_job_company?: string | null;
  next_action_label?: string | null;
  attention_required?: string | null;
  cooldown_remaining_seconds?: number;
}
