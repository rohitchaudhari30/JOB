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
