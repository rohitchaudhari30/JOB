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
