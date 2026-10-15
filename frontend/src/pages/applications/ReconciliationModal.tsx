import React from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, RotateCcw, X } from 'lucide-react';
import { Application } from '../../types';
import { resolvePlatformName } from '../../utils/applicationHelpers';

export type ReconcileAction = 'CONFIRM_SUBMITTED' | 'MARK_NOT_SUBMITTED_AND_RETRY' | 'DISMISS';

interface ReconciliationModalProps {
  app: Application;
  notes: string;
  busy: boolean;
  onNotesChange: (value: string) => void;
  onAction: (action: ReconcileAction) => void;
  onClose: () => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
  app,
  notes,
  busy,
  onNotesChange,
  onAction,
  onClose,
}) => {
    const jobTitle = app.job_title || app.job?.title || 'Unknown Position';
    const companyName = app.company || app.job?.company || 'Unknown Company';
    const platformName = resolvePlatformName(app);
    const externalUrl = app.apply_url || app.job?.apply_url;

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-scaleUp">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Submission Outcome Verification
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Prevent accidental duplicate submission by verifying portal status
                </p>
              </div>
            </div>
            <button aria-label="Close"
              onClick={() => onClose()}
              disabled={busy}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Target Job Info Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{jobTitle}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {companyName} • {platformName}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60">
                Needs Verification
              </span>
            </div>
            {externalUrl && (
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1.5 text-xs text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 font-medium"
                >
                  <span>Inspect portal job page</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Uncertainty Reason / Diagnostics */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-amber-500" />
              <span>Recorded Uncertainty Diagnostics</span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200 font-mono break-words">
              {app.failure_reason || 'Playwright submit action timed out or post-submit confirmation was indeterminate.'}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
              The automation filled the application form, but browser automation encountered a timeout or unconfirmed status while submitting. Please check your applied jobs on {platformName} to see if it went through.
            </p>
          </div>

          {/* Notes Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Verification Note (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="e.g. Checked portal, application is recorded under Submitted Applications..."
              rows={2}
              disabled={busy}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Resolution Actions */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Select Verified Resolution:
            </div>

            <div className="grid grid-cols-1 gap-2">
              {/* Action 1: Confirm Submitted */}
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction('CONFIRM_SUBMITTED')}
                className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-left transition-colors cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Portal Confirmed: Application was Submitted
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Mark as APPLIED in CRM. Will not submit again.
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                  Confirm &rarr;
                </span>
              </button>

              {/* Action 2: Verify Not Submitted and Retry */}
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction('MARK_NOT_SUBMITTED_AND_RETRY')}
                className="flex items-center justify-between p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-left transition-colors cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <RotateCcw className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                      Verified Not Submitted: Retry Safely
                    </div>
                    <div className="text-[11px] text-indigo-700 dark:text-indigo-400">
                      Re-execute through canonical orchestrator with safety gates.
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                  Retry &rarr;
                </span>
              </button>

              {/* Action 3: Dismiss */}
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction('DISMISS')}
                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-400 text-white flex items-center justify-center shrink-0">
                    <X className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Dismiss / Skip this Application
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mark as SKIPPED. No further attempts will be made.
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-500 group-hover:translate-x-0.5 transition-transform">
                  Dismiss &rarr;
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
};
