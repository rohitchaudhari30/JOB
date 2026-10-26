import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Drawer } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Application } from '../../types';
import { api } from '../../services/api';
import { saveBlob, CHOICE_EDITABLE, cleanResumeFileName } from '../jobs/tailor/tailorLogic';
import { useHasSavedTailored } from '../jobs/tailor/savedTailoredStore';

export interface ApplicationDrawerView {
  title: string;
  company: string;
  platform: string;
  statusLabel: string;
  matchScore?: number;
  applyUrl?: string;
  needsVerification: boolean;
}

interface ApplicationDrawerProps {
  app: Application | null;
  view: ApplicationDrawerView | null;
  onClose: () => void;
  onRationale: (app: Application) => void;
  onScreenshot: (app: Application) => void;
  onReconcile: (app: Application) => void;
  /** Switch this application between the saved tailored copy and the master resume. */
  onResumeChoice?: (app: Application, useTailored: boolean) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onNavigate?: (tab: any) => void;
}

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-3 py-2 border-b border-slate-100 dark:border-slate-800 text-sm">
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="col-span-2 text-slate-900 dark:text-slate-100 break-words">{children}</dd>
  </div>
);

/**
 * Application detail panel (deep-linkable at /applications/:id). Every action
 * here reuses the page's existing handlers; the uncertain-outcome reconcile
 * flow is unchanged and still the only way to resolve it.
 */
export const ApplicationDrawer: React.FC<ApplicationDrawerProps> = ({
  app,
  view,
  onClose,
  onRationale,
  onScreenshot,
  onReconcile,
  onResumeChoice,
  onApprove,
  onReject,
  onNavigate,
}) => {
  const open = Boolean(app && view);
  const hasSaved = useHasSavedTailored(app?.job_id ?? '');
  const canChoose = Boolean(app && onResumeChoice && hasSaved && CHOICE_EDITABLE.has(String(app.workflow_state)));
  return (
    <Drawer open={open} onClose={onClose} title={view ? `${view.title} · ${view.company}` : 'Application'}>
      {app && view && (
        <div className="space-y-4">
          <dl>
            <Row label="Status">{view.statusLabel}</Row>
            <Row label="Workflow state">{app.workflow_state}</Row>
            <Row label="Outcome">{app.outcome_status || 'NOT_SUBMITTED'}</Row>
            <Row label="Portal">{view.platform}</Row>
            {app.location && <Row label="Location">{app.location}</Row>}
            {view.matchScore !== undefined && <Row label="Match score">{Math.round(view.matchScore)}%</Row>}
            <Row label="Created">{fmt(app.created_at)}</Row>
            <Row label="Resume sent">
              {app.tailored_resume_id ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  Optimized for this job
                  <button
                    type="button"
                    className="underline text-xs font-semibold"
                    onClick={async () => {
                      const blob = await api.downloadTailored(app.tailored_resume_id as string, 'docx');
                      const cleanName = cleanResumeFileName(null, view?.title, 'docx');
                      saveBlob(blob, cleanName);
                    }}
                  >
                    Download
                  </button>
                </span>
              ) : (
                'Your master resume'
              )}
            </Row>
            {app.applied_at && <Row label="Applied">{fmt(app.applied_at)}</Row>}
            {app.failure_reason && <Row label="Reason">{app.failure_reason}</Row>}
            {app.error_category && <Row label="Error category">{app.error_category}</Row>}
            {typeof app.retry_count === 'number' && app.retry_count > 0 && (
              <Row label="Retries">{app.retry_count}</Row>
            )}
            {app.next_retry_at && <Row label="Next retry">{fmt(app.next_retry_at)}</Row>}
          </dl>

          {canChoose && app && onResumeChoice && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span>
                {app.tailored_resume_id
                  ? 'This application will send your optimized resume.'
                  : 'This application will send your master resume. An optimized copy is saved for this job.'}
              </span>
              <Button size="sm" onClick={() => onResumeChoice(app, !app.tailored_resume_id)}>
                {app.tailored_resume_id ? 'Send master resume instead' : 'Use optimized resume'}
              </Button>
            </div>
          )}

          {view.needsVerification && (
            <div role="note" className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200">
              The submission outcome is uncertain. Confirm on the portal whether it was sent before retrying, to
              avoid a duplicate application.
            </div>
          )}

          {app.workflow_state === 'APPROVAL_REQUIRED' && (
            <div role="alert" className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-amber-900 dark:text-amber-200">
                This application requires your review before submission.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {onApprove && (
                  <Button variant="primary" size="sm" onClick={() => { onApprove(app.id); onClose(); }}>
                    Approve & Submit
                  </Button>
                )}
                {onReject && (
                  <Button size="sm" onClick={() => { onReject(app.id); onClose(); }}>
                    Dismiss
                  </Button>
                )}
              </div>
            </div>
          )}

          {(app.workflow_state === 'PAUSED_CAPTCHA' || app.workflow_state === 'PAUSED_OTP') && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-rose-900 dark:text-rose-200">
                {app.workflow_state === 'PAUSED_CAPTCHA'
                  ? 'Interactive CAPTCHA challenge is active.'
                  : 'OTP verification is required to resume.'}
              </span>
              {onNavigate && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onNavigate(`/live-console?app_id=${app.id}&action=${app.workflow_state === 'PAUSED_CAPTCHA' ? 'captcha' : 'otp'}`);
                  }}
                >
                  Solve in Live Console
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {view.needsVerification && (
              <Button variant="primary" size="sm" onClick={() => onReconcile(app)}>
                Verify submission
              </Button>
            )}
            <Button size="sm" onClick={() => onRationale(app)}>
              View match rationale
            </Button>
            {app.screenshot_file_path && (
              <Button size="sm" onClick={() => onScreenshot(app)}>
                View screenshot
              </Button>
            )}
            {view.applyUrl && (
              <a
                href={view.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                Open job posting
              </a>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
};
