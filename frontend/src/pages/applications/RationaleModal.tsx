import React from 'react';
import { AlertTriangle, CheckCircle2, Info, RotateCcw, Sparkles, X } from 'lucide-react';
import { Application } from '../../types';
import { DerivedStatus, isUuidString, resolvePlatformName } from '../../utils/applicationHelpers';

interface RationaleModalProps {
  app: Application;
  score: number | undefined;
  status: { label: DerivedStatus; className: string };
  experienceLabel: string;
  onClose: () => void;
  onApprove: (appId: string) => Promise<void> | void;
  onRetry: (app: Application) => Promise<void> | void;
}

export const RationaleModal: React.FC<RationaleModalProps> = ({
  app,
  score,
  status,
  experienceLabel,
  onClose,
  onApprove,
  onRetry,
}) => {
      const platformName = resolvePlatformName(app);
    const jobTitle = app.job_title || app.job?.title || 'Position';
    const companyRaw = app.company || app.job?.company;
    const companyName = companyRaw && !isUuidString(companyRaw) ? companyRaw : 'Company';
    const requiredSkills: string[] = ((app.job as any)?.required_skills || (app as any).required_skills || []);
    const isReviewQueue =
      app.workflow_state === 'APPROVAL_REQUIRED' ||
      (typeof score === 'number' && score >= 65 && score < 80 && app.workflow_state !== 'APPLIED');
    const isNeedsAttention =
      app.workflow_state === 'FAILED' ||
      (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_'));

    return (
      <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
        <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  AI Qualification &amp; Decision Rationale
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Why this position was qualified, held for review, or skipped
                </p>
              </div>
            </div>
            <button aria-label="Close"
              onClick={() => onClose()}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Job Summary Banner */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{jobTitle}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {companyName} • {platformName} • {app.location || app.job?.location || 'Location Unspecified'}
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${status.className}`}>
                {status.label}
              </span>
            </div>

            <div className="flex items-center space-x-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              <div>
                <span className="text-slate-400">Match Fit: </span>
                <strong className={
                  score && score >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
                  score && score >= 60 ? 'text-indigo-600 dark:text-indigo-400' :
                  'text-slate-600 dark:text-slate-400'
                }>
                  {score !== undefined && score > 0 ? `${Math.round(score)}% Match` : 'Unscored'}
                </strong>
              </div>
              <span>•</span>
              <div>
                <span className="text-slate-400">Experience: </span>
                <strong className="text-slate-700 dark:text-slate-300">{experienceLabel}</strong>
              </div>
            </div>
          </div>

          {/* Policy Decision Explanation */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-indigo-500" />
              <span>Decision Routing Policy</span>
            </div>
            <div className="p-3.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {score && score >= 80 ? (
                <div>
                  <strong className="text-emerald-700 dark:text-emerald-400">⚡ Auto-Apply Threshold Satisfied (≥ 80%): </strong>
                  This job satisfies your campaign threshold for high-confidence autonomous application. Browser automation initiates form-filling and submission without requiring manual intervention unless a CAPTCHA or OTP challenge arises.
                </div>
              ) : score && score >= 65 ? (
                <div>
                  <strong className="text-indigo-700 dark:text-indigo-400">🛡️ Review Queue Routing (65% – 79%): </strong>
                  This role scored between your review threshold (65%) and auto-apply threshold (80%). The system pre-selects the job and holds it in the candidate review queue for your 1-click approval.
                </div>
              ) : (
                <div>
                  <strong className="text-amber-700 dark:text-amber-400">🛑 Low Match Fit / Excluded (&lt; 65%): </strong>
                  This role fell below the minimum compatibility score or required criteria not reflected in your active profile. It was skipped to preserve daily application caps.
                </div>
              )}
            </div>
          </div>

          {/* Required Skills & Keywords */}
          {requiredSkills.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Required Skills from Job Description
              </div>
              <div className="flex flex-wrap gap-1.5">
                {requiredSkills.map((skill: string, idx: number) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Execution Diagnostics / Failure Reason if any */}
          {app.failure_reason && (
            <div className="space-y-1.5">
              <div className="text-xs font-bold text-rose-700 dark:text-rose-400 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Automation Diagnostics &amp; Status Note</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 font-mono">
                {app.failure_reason}
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onClose()}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close
            </button>
            {isReviewQueue && (
              <button
                type="button"
                onClick={async () => {
                  await onApprove(app.id);
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve &amp; Apply Now</span>
              </button>
            )}
            {isNeedsAttention && (
              <button
                type="button"
                onClick={async () => {
                  await onRetry(app);
                  onClose();
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/25 flex items-center space-x-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Application</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
};
