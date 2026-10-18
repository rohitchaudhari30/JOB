import type { DecisionType } from './identity';

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
