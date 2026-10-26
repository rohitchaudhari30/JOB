import type { TailoredResume, TailoringStatus } from '../../../types/tailoring';

export const WORKING: ReadonlySet<TailoringStatus> = new Set(['QUEUED', 'ANALYZING', 'GENERATE_QUEUED', 'GENERATING']);
export const DEAD_ENDS: ReadonlySet<TailoringStatus> = new Set(['FAILED', 'STALE', 'CANCELLED', 'DISCARDED']);

export function workingText(status: TailoringStatus): string {
  if (status === 'GENERATE_QUEUED' || status === 'GENERATING') {
    return 'Generating tailored resume and validating integrity…';
  }
  return 'Reading your resume and analyzing role requirements…';
}

export interface TailorError {
  message: string;
  code?: string;
}

export function toTailorError(e: unknown): TailorError {
  const err = e as { response?: { data?: { detail?: string; details?: { code?: string } } }; message?: string };
  return { message: err?.response?.data?.detail || err?.message || 'An unexpected error occurred.', code: err?.response?.data?.details?.code };
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

/** Prints or generates high-definition vector PDF from the live resume DOM canvas. */
export function printResumeCanvas(elementId: string, title: string = 'Resume'): void {
  const element = document.getElementById(elementId);
  if (!element) {
    window.print();
    return;
  }

  const printFrame = document.createElement('iframe');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  document.body.appendChild(printFrame);

  const frameDoc = printFrame.contentWindow?.document;
  if (!frameDoc) {
    window.print();
    return;
  }

  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((s) => s.outerHTML)
    .join('\n');

  frameDoc.write(`<!DOCTYPE html><html><head><title>${title}</title>${styles}<style>@page { size: letter portrait; margin: 0.25in; } .resume-page-break { page-break-after: always !important; break-after: page !important; } .resume-page-block { page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box !important; } body { background: white !important; color: #0f172a !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }</style></head><body><div style="background: white; padding: 10px;">${element.innerHTML}</div></body></html>`);
  frameDoc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
    } catch {
      window.print();
    } finally {
      setTimeout(() => {
        printFrame.remove();
      }, 1000);
    }
  }, 300);
}

/** Produces a clean, professional HR-standard resume filename without internal tool tags or company names. */
export function cleanResumeFileName(rawName?: string | null, candidateName?: string, extension: 'pdf' | 'docx' = 'pdf'): string {
  let base = (rawName || '').replace(/\.(docx|pdf)$/i, '');
  base = base.replace(/[-_](tailored|optimized|customized|customize).*$/i, '');
  base = base.replace(/[-_](for|to)[-_].*$/i, '');
  base = base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!base || base.length < 3 || base.toLowerCase() === 'resume') {
    base = candidateName ? candidateName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') : 'Resume';
  }
  if (!base.toLowerCase().includes('resume')) {
    base = `${base}_Resume`;
  }
  return `${base}.${extension}`;
}

export const CHECK_LABELS: Record<string, string> = {
  opens: 'Document validity',
  structure: 'Layout & styling preserved',
  wording: 'Only approved modifications applied',
  protected_facts: 'Core credentials intact',
  layout: 'Page layout fidelity',
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
