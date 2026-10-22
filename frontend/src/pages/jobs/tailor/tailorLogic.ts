import type { TailoredResume, TailoringStatus } from '../../../types/tailoring';

export const WORKING: ReadonlySet<TailoringStatus> = new Set(['QUEUED', 'ANALYZING', 'GENERATE_QUEUED', 'GENERATING']);
export const DEAD_ENDS: ReadonlySet<TailoringStatus> = new Set(['FAILED', 'STALE', 'CANCELLED', 'DISCARDED']);

export function workingText(status: TailoringStatus): string {
  if (status === 'GENERATE_QUEUED' || status === 'GENERATING') return 'Creating your tailored copy and checking it against your original…';
  return 'Reading your resume and the job description…';
}

export interface TailorError {
  message: string;
  code?: string;
}

export function toTailorError(e: unknown): TailorError {
  const err = e as { response?: { data?: { detail?: string; details?: { code?: string } } }; message?: string };
  return { message: err?.response?.data?.detail || err?.message || 'Something went wrong.', code: err?.response?.data?.details?.code };
}

/** The most useful existing request to continue with, or null when the user should start fresh. */
export function pickResumable(items: TailoredResume[]): TailoredResume | null {
  return items.find((i) => !DEAD_ENDS.has(i.status)) ?? null;
}

export function saveBlob(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const CHECK_LABELS: Record<string, string> = {
  opens: 'File opens',
  structure: 'Styles and layout settings unchanged',
  wording: 'Only your approved changes differ',
  protected_facts: 'Name, contact, dates and numbers intact',
  layout: 'Page layout',
};

/** Application states in which the resume choice can still change (mirrors the server's rule). */
export const CHOICE_EDITABLE: ReadonlySet<string> = new Set([
  'DISCOVERED', 'MATCHING', 'MATCHED', 'SHORTLISTED', 'APPROVAL_REQUIRED', 'APPROVED',
  'PAUSED_OTP', 'PAUSED_CAPTCHA', 'PAUSED_USER_INPUT', 'PAUSED_AUTH_EXPIRED', 'PAUSED_SESSION', 'PAUSED_LIMIT',
  'RETRY_QUEUED', 'FAILED',
]);

/** Plain-text version of the suggested wording, for pasting into the user's own resume. */
export function suggestionsText(edits: { type: string; before: string; after: string; reason?: string }[]): string {
  return edits
    .filter((e) => e.type === 'REWORD')
    .map((e, i) => `${i + 1}. Replace:\n   ${e.before}\n   With:\n   ${e.after}${e.reason ? `\n   Why: ${e.reason}` : ''}`)
    .join('\n\n');
}
