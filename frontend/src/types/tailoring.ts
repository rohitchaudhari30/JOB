export type TailoringStatus =
  | 'QUEUED' | 'ANALYZING' | 'AWAITING_INPUT' | 'GENERATE_QUEUED' | 'GENERATING'
  | 'READY_FOR_REVIEW' | 'SAVED' | 'DISCARDED' | 'FAILED' | 'CANCELLED' | 'STALE';

export interface TailoringRequirement {
  id: string;
  text: string;
  kind: 'required' | 'preferred';
  status: 'SUPPORTED' | 'NEEDS_CONFIRMATION' | 'GAP';
  source?: 'RESUME' | 'CONFIRMED_FACT';
  snippet?: string;
  note?: string;
}

export interface TailoringEvidence {
  quote?: string | null;
  block_id?: string | null;
  fact_id?: string | null;
}

export interface TailoringEdit {
  id: string;
  type: 'REWORD' | 'REORDER';
  block_id: string;
  before: string;
  after: string;
  target_block_id?: string | null;
  evidence: TailoringEvidence[];
  requirement?: string | null;
  reason: string;
  category: 'A' | 'B';
}

export interface TailoringQuestion {
  id: string;
  requirement: string;
  ask: string;
}

export interface TailoringCheck {
  name: string;
  status: 'pass' | 'fail' | 'unavailable';
  detail: string;
}

export interface TailoringAnalysis {
  mode: 'EDIT' | 'SUGGESTIONS_ONLY';
  requirements: TailoringRequirement[];
  questions: TailoringQuestion[];
  gaps: { requirement: string; kind: string; note: string }[];
  strengths: TailoringRequirement[];
  match_note: string;
  editable_lines: number;
  locked_lines: number;
  layout_check_available: boolean;
}

export interface TailoredResume {
  id: string;
  status: TailoringStatus;
  mode: 'EDIT' | 'SUGGESTIONS_ONLY';
  job_id: string;
  job_title?: string | null;
  company?: string | null;
  master_resume_id?: string | null;
  master_label?: string | null;
  version: number;
  analysis?: TailoringAnalysis | null;
  edit_plan?: {
    edits: TailoringEdit[];
    suggestions: TailoringEdit[];
    rejected: { id: string; reasons: string[]; edit?: TailoringEdit | null }[];
  } | null;
  approved_edit_ids: string[];
  validation?: {
    passed: boolean;
    checks: TailoringCheck[];
    applied?: string[];
    skipped?: { id: string; reason: string }[];
  } | null;
  file_name?: string | null;
  has_file: boolean;
  has_pdf: boolean;
  error_code?: string | null;
  error_message?: string | null;
  created_at?: string;
  approved_at?: string | null;
  expires_at?: string | null;
}

export interface TailoringAnswer {
  question_id: string;
  has_it: boolean;
  details?: string;
}
