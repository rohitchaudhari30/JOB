export type WorkflowState =
  | 'DISCOVERED'
  | 'MATCHING'
  | 'MATCHED'
  | 'SHORTLISTED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'APPLYING'
  | 'FORM_DETECTED'
  | 'FORM_FILLED'
  | 'QUESTIONS_PENDING'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTING'
  | 'APPLIED'
  | 'PAUSED_OTP'
  | 'PAUSED_CAPTCHA'
  | 'PAUSED_USER_INPUT'
  | 'PAUSED_AUTH_EXPIRED'
  | 'RETRY_QUEUED'
  | 'FAILED'
  | 'SKIPPED'
  | 'REJECTED'
  | 'EXPIRED';

export type DecisionType = 'AUTO_APPLY' | 'REQUIRE_APPROVAL' | 'SAVE' | 'SKIP' | 'REJECT';

export interface User {
  id: string;
  email: string;
  full_name?: string;
  is_active: boolean;
}

export interface CandidateSkill {
  id?: string;
  skill_name: string;
  years_experience: number;
  is_primary: boolean;
}

export interface Experience {
  id?: string;
  company_name: string;
  title: string;
  location?: string;
  is_current?: boolean;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface CandidateProfile {
  id?: string;
  user_id?: string;
  headline?: string;
  summary?: string;
  phone?: string;
  location?: string;
  current_ctc?: number;
  expected_ctc?: number;
  currency?: string;
  notice_period_days?: number;
  total_experience_months?: number;
  work_authorization?: string;
  relocation_preference?: boolean;
  remote_preference?: string;
  skills: CandidateSkill[];
  experiences: Experience[];
}

export interface Resume {
  id: string;
  label: string;
  target_role: string;
  file_name: string;
  is_default: boolean;
  created_at: string;
}

export interface Job {
  id: string;
  source_id: string;
  source_type?: string;
  external_job_id: string;
  title: string;
  company: string;
  location: string;
  min_experience_years?: number;
  max_experience_years?: number;
  min_salary?: number;
  max_salary?: number;
  salary_currency?: string;
  apply_url: string;
  raw_description?: string;
  is_active: boolean;
  posted_at?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  raw_posted_text?: string | null;
  posted_at_precision?: string;
  posted_at_source?: string;
  freshness_bucket?: string;
  freshness_score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MatchResult {
  id: string;
  user_id: string;
  job_id: string;
  resume_id?: string;
  overall_score: number;
  hard_filter_passed: boolean;
  skill_match_score: number;
  semantic_score: number;
  freshness_score?: number;
  reasoning_summary: string;
  matched_skills: string[];
  missing_skills: string[];
  decision: DecisionType;
  ai_provider_used: string;
  created_at?: string;
  job?: Job;
  job_title?: string;
  company?: string;
  location?: string;
  apply_url?: string;
  raw_posted_text?: string | null;
}

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
  applied_at?: string;
  failure_reason?: string;
  trace_file_path?: string;
  screenshot_file_path?: string;
  created_at: string;
  updated_at?: string;
  questions: ApplicationQuestion[];
  job?: Job;
}

export interface ApplicationStats {
  total: number;
  applied: number;
  paused: number;
  failed: number;
  approval_required: number;
}

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

export interface FunnelStageMetric {
  stage_name: string;
  count: number;
  conversion_rate_pct: number;
}

export interface FunnelOverview {
  total_discovered: number;
  total_matched: number;
  total_applied: number;
  total_interviewed: number;
  total_offered: number;
  total_rejected: number;
  stages: FunnelStageMetric[];
}

export interface ResumePerformanceMetric {
  resume_id: string;
  label: string;
  target_role: string;
  applications_count: number;
  interview_count: number;
  offer_count: number;
  conversion_rate_pct: number;
}

export interface SourcePerformanceMetric {
  source_id: string;
  source_type?: string;
  discovered_count: number;
  applied_count: number;
  success_rate_pct: number;
}

export interface SkillDemandInsight {
  skill_name: string;
  matched_frequency: number;
  missing_frequency: number;
  market_demand_score: number;
}

export interface WeightTuningRecommendation {
  current_skill_weight: number;
  current_semantic_weight: number;
  current_experience_weight: number;
  recommended_skill_weight: number;
  recommended_semantic_weight: number;
  recommended_experience_weight: number;
  confidence_score: number;
  rationale: string;
}

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

