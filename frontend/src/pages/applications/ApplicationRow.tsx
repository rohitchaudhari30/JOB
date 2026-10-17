import React from 'react';
import { AlertCircle, Camera, ChevronDown, ChevronUp, ExternalLink, RotateCcw, X } from 'lucide-react';
import type { Application } from '../../types';
import { isUuidString, resolvePlatformName } from '../../utils/applicationHelpers';
import { getDerivedStatus, formatExperience, formatSalary, formatDateDisplay } from './applicationLogic';

interface Props {
  app: Application;
  fallbackScore?: number;
  isExpanded: boolean;
  onToggleReason: (id: string | null) => void;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRetry: (app: Application) => void;
  onRationale: (app: Application) => void;
  onReconcile: (app: Application) => void;
  onScreenshot: (id: string, path: string) => void;
}

/** One pipeline row plus its expandable failure/diagnostics row. */
export const ApplicationRow: React.FC<Props> = ({
  app, fallbackScore, isExpanded, onToggleReason, onOpen, onApprove, onReject, onRetry, onRationale, onReconcile, onScreenshot,
}) => {
    const statusObj = getDerivedStatus(app);
  const matchScore = app.match_score ?? fallbackScore;
  const dateDisplay = formatDateDisplay(app.applied_at || app.created_at);
  const applyUrl = app.apply_url || app.job?.apply_url;

  // Clean portal name: NEVER show a UUID!
  const platformName = resolvePlatformName(app);

  const jobTitle =
    app.job_title || app.job?.title || (app.job_id ? `Position #${app.job_id.slice(-6)}` : 'Role');

  // Clean company name: NEVER show a UUID!
  const companyRaw = app.company || app.job?.company;
  const companyName =
    companyRaw && !isUuidString(companyRaw) ? companyRaw : 'Company';

  return (
    <React.Fragment key={app.id}>
      <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors group">
        {/* Position (Job title + Company & portal subtitle) */}
        <td className="py-3.5 px-4 align-top max-w-[280px]">
          <button
            type="button"
            onClick={() => onOpen(app.id)}
            className="font-semibold text-xs text-slate-900 dark:text-white leading-tight text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer"
            aria-label={`Open details for ${jobTitle} at ${companyName}`}
          >
            {jobTitle}
          </button>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-1">
            <span className="font-medium text-slate-600 dark:text-slate-300">{companyName}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-400">{platformName}</span>
          </div>
        </td>

        {/* Location */}
        <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
          {app.location || app.job?.location || '-'}
        </td>

        {/* Exp */}
        <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
          {formatExperience(app)}
        </td>

        {/* Salary */}
        <td className="py-3.5 px-4 align-top text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
          {formatSalary(app)}
        </td>

        {/* Status Pill Badge */}
        <td className="py-3.5 px-4 align-top">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusObj.className}`}
          >
            {statusObj.label}
          </span>
        </td>

        {/* Match Score */}
        <td className="py-3.5 px-4 align-top font-semibold text-xs text-slate-800 dark:text-slate-200">
          <div className="flex items-center space-x-1.5">
            {matchScore !== undefined && matchScore > 0 ? (
              <span
                className={
                  matchScore >= 75
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : matchScore >= 60
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-600 dark:text-slate-400'
                }
              >
                {Math.round(matchScore)}%
              </span>
            ) : (
              <span className="text-slate-400">-</span>
            )}
            <button
              type="button"
              onClick={() => onRationale(app)}
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
              title="Why Selected or Skipped?"
            >
              Why?
            </button>
          </div>
        </td>

        {/* Date (Main + relative) */}
        <td className="py-3.5 px-4 align-top whitespace-nowrap">
          <div className="font-medium text-slate-700 dark:text-slate-200 text-xs leading-tight">
            {dateDisplay.main}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {dateDisplay.rel}
          </div>
        </td>

        {/* Action Column */}
        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
          {app.workflow_state === 'APPROVAL_REQUIRED' ||
          (typeof matchScore === 'number' && matchScore >= 65 && matchScore < 80 && app.workflow_state !== 'APPLIED') ? (
            <div className="inline-flex items-center justify-end space-x-2">
              <button
                onClick={() => onApprove(app.id)}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer"
                title="Approve and execute application"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(app.id)}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-semibold transition-colors cursor-pointer"
                title="Dismiss from review queue"
              >
                Dismiss
              </button>
            </div>
          ) : statusObj.label === 'Needs Verification' ? (
            <div className="inline-flex items-center justify-end space-x-2">
              <button
                onClick={() => onReconcile(app)}
                className="px-2.5 py-1 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer flex items-center space-x-1"
                title="Inspect submission and verify outcome"
              >
                <AlertCircle className="w-3 h-3" />
                <span>Verify Outcome</span>
              </button>
              <button
                onClick={() => onToggleReason(app.id)}
                aria-expanded={isExpanded}
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
              >
                <span>Reason</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : statusObj.label === 'Failed' || (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_')) ? (
            <div className="inline-flex items-center justify-end space-x-2">
              <button
                onClick={() => onRetry(app)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] shadow-2xs transition-transform active:scale-95 cursor-pointer flex items-center space-x-1"
                title="Retry application submission"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
              <button
                onClick={() => onToggleReason(app.id)}
                aria-expanded={isExpanded}
                className="text-xs font-semibold text-rose-700 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
              >
                <span>Reason</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : statusObj.label === 'Skipped' ? (
            <div className="inline-flex items-center justify-end space-x-2">
              <button
                onClick={() => onToggleReason(app.id)}
                aria-expanded={isExpanded}
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center space-x-0.5 cursor-pointer transition-colors"
              >
                <span>Reason</span>
                {isExpanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : applyUrl ? (
            <div className="inline-flex items-center justify-end space-x-2.5">
              {Array.isArray(app.questions) && app.questions.length > 0 && (
                <button
                  onClick={() => onToggleReason(app.id)}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center space-x-0.5 cursor-pointer"
                  title="View answered screening questions"
                >
                  <span>Q&amp;A · {app.questions.length}</span>
                </button>
              )}
              <a
                href={applyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 inline-flex items-center space-x-1 transition-colors"
              >
                <span>Open</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : Array.isArray(app.questions) && app.questions.length > 0 ? (
            <button
              onClick={() => onToggleReason(app.id)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center space-x-0.5 cursor-pointer"
              title="View answered screening questions"
            >
              <span>Q&amp;A · {app.questions.length}</span>
            </button>
          ) : (
            <span className="text-slate-400 text-xs">-</span>
          )}
        </td>
      </tr>

      {/* Collapsible Diagnostics Row */}
      {isExpanded && (
        <tr className="bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
          <td colSpan={8} className="p-4">
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 space-y-3 shadow-2xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2 text-rose-700 dark:text-rose-400 font-semibold text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Error Diagnostics &amp; Audit Trace</span>
                </div>
                <button aria-label="Close"
                  onClick={() => onToggleReason(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Reason text */}
              <div className="text-xs text-slate-700 dark:text-slate-300 bg-rose-50/60 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-100 dark:border-rose-900/40 font-mono leading-relaxed break-words">
                {app.failure_reason
                  ? app.failure_reason
                      .replace(/^Page\.goto:\s*/i, '')
                      .replace(/^Page\.evaluate:\s*/i, '')
                  : 'Execution encountered an unexpected stop or manual skip.'}
              </div>

              {/* Screening Q&A answered */}
              {Array.isArray(app.questions) && app.questions.length > 0 && (
                <div className="text-xs text-indigo-700 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                  <span className="font-semibold">
                    ✓ {app.questions.length} Screening Questions Automatically Answered
                  </span>
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center space-x-3">
                  {app.screenshot_file_path && (
                    <button
                      onClick={() => onScreenshot(app.id, app.screenshot_file_path!)}
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-indigo-500" />
                      <span>View Screenshot Artifact</span>
                    </button>
                  )}

                  {app.trace_file_path && (
                    <span
                      className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700"
                      title={app.trace_file_path}
                    >
                      trace.zip recorded
                    </span>
                  )}
                </div>

                {applyUrl && (
                  <a
                    href={applyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-2xs cursor-pointer"
                  >
                    <span>Apply Manually on Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
};
