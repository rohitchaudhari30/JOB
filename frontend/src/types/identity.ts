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
