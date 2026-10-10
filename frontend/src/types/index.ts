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
  | 'PAUSED_SESSION'
  | 'PAUSED_LIMIT'
  | 'RETRY_QUEUED'
  | 'SUBMISSION_UNKNOWN'
  | 'RECONCILIATION_REQUIRED'
  | 'FAILED'
  | 'SKIPPED'
  | 'REJECTED'
  | 'EXPIRED';

export type DecisionType = 'AUTO_APPLY' | 'REQUIRE_APPROVAL' | 'SAVE' | 'REJECT';

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
  canonical_job_key?: string | null;
  canonical_confidence?: number | null;
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

export interface MatchBreakdown {
  skill_score: number;
  experience_score: number;
  role_title_score: number;
  location_score: number;
  salary_score: number;
  semantic_score: number;
  freshness_score: number;
  ai_score: number;
}

export interface MatchResult {
  id: string;
  user_id: string;
  job_id: string;
  resume_id?: string;
  evaluation_key?: string;
  match_score?: number;
  recommendation_score?: number | null;
  overall_score: number;
  hard_filter_passed: boolean;
  skill_match_score: number;
  experience_score?: number;
  role_title_score?: number;
  location_score?: number;
  salary_score?: number;
  semantic_score: number;
  freshness_score?: number;
  ai_score?: number;
  breakdown?: MatchBreakdown | Record<string, number>;
  recommendation_reasons?: string[];
  blocking_reasons?: string[];
  resume_version?: number;
  matching_engine_version?: string;
  embedding_model?: string;
  embedding_version?: string;
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

export interface FunnelStageMetric {
  stage_name: string;
  count: number;
  conversion_rate_pct: number;
}

export interface FunnelOverview {
  total_discovered: number;
  total_matched: number;
  total_triggered: number;
  total_submitted: number;
  total_responded: number;
  total_interviewed: number;
  total_offered: number;
  total_rejected: number;
  match_rate_pct: number;
  trigger_rate_pct: number;
  submission_rate_pct: number;
  response_rate_pct: number;
  interview_rate_pct: number;
  offer_rate_pct: number;
  total_applied: number;
  stages: FunnelStageMetric[];
}

export interface ResumePerformanceMetric {
  resume_id: string;
  label: string;
  target_role: string;
  applications_count: number;
  response_count?: number;
  interview_count: number;
  offer_count: number;
  response_rate_pct?: number;
  interview_rate_pct?: number;
  offer_rate_pct?: number;
  conversion_rate_pct: number;
}

export interface SourcePerformanceMetric {
  source_id: string;
  source_type?: string;
  discovered_count: number;
  matched_count?: number;
  triggered_count?: number;
  submitted_count?: number;
  response_count?: number;
  interview_count?: number;
  offer_count?: number;
  response_rate_pct?: number;
  interview_rate_pct?: number;
  offer_rate_pct?: number;
  applied_count: number;
  success_rate_pct: number;
}

export interface CampaignPerformanceMetric {
  campaign_id: string;
  campaign_name: string;
  state: string;
  discovered_count: number;
  matched_count?: number;
  triggered_count?: number;
  submitted_count?: number;
  response_count?: number;
  interview_count?: number;
  offer_count?: number;
  response_rate_pct?: number;
  interview_rate_pct?: number;
  offer_rate_pct?: number;
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

export interface DashboardActiveRun {
  is_running: boolean;
  run_id?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  status: string;
  current_job_title?: string | null;
  current_platform?: string | null;
  progress_percentage: number;
}

export interface DashboardAttentionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  action_label: string;
  action_url: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | string;
}

export interface DashboardReadinessItem {
  key: string;
  title: string;
  is_ready: boolean;
  action_label: string;
  action_url: string;
}

export interface DashboardTopMatch {
  job_id: string;
  title: string;
  company: string;
  location: string;
  platform: string;
  match_score: number;
  apply_url?: string | null;
  decision: string;
}

export interface DashboardOverview {
  today_applied_count: number;
  effective_daily_limit: number;
  quota_remaining: number;
  quota_percentage: number;
  active_run: DashboardActiveRun;
  needs_attention: DashboardAttentionItem[];
  readiness: DashboardReadinessItem[];
  top_matches: DashboardTopMatch[];
}
