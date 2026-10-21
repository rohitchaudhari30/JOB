import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Drawer } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Application } from '../../types';
import { api } from '../../services/api';
import { saveBlob } from '../jobs/tailor/tailorLogic';

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
}) => {
  const open = Boolean(app && view);
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
                  Tailored for this job
                  <button
                    type="button"
                    className="underline text-xs font-semibold"
                    onClick={async () => saveBlob(await api.downloadTailored(app.tailored_resume_id as string, 'docx'), 'tailored-resume.docx')}
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

          {view.needsVerification && (
            <div role="note" className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900 dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-200">
              The submission outcome is uncertain. Confirm on the portal whether it was sent before retrying, to
              avoid a duplicate application.
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
