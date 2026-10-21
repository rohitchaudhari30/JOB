import { TailorButton } from './tailor/TailorButton';
import React from 'react';
import {
  Building,
  MapPin,
  DollarSign,
  ExternalLink,
  Clock,
  Sparkles,
  Trash2,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type { Job, MatchResult, AutomationRunStatus } from '../../types';
import { formatRelativeTime } from './jobFreshness';

interface JobCardProps {
  job: Job;
  isSelected: boolean;
  appInfo?: { appliedAt?: string; status: string };
  isLiveSubmitted: boolean;
  isLiveQueued: boolean;
  liveApplyingJobId: string | null;
  activeRun: AutomationRunStatus | null;
  match?: MatchResult;
  evaluating: boolean;
  deleting: boolean;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onEvaluate: (id: string) => void;
  onApply: (job: Job) => void;
  onDelete: (id: string, title: string) => void;
  onNavigate?: (tab: any) => void;
}

/** One discovered job: selection, status ring, AI fit, and per-job actions. */
export const JobCard: React.FC<JobCardProps> = ({
  job,
  isSelected,
  appInfo,
  isLiveSubmitted,
  isLiveQueued,
  liveApplyingJobId,
  activeRun,
  match,
  evaluating,
  deleting,
  onToggleSelect,
  onOpen,
  onEvaluate,
  onApply,
  onDelete,
  onNavigate,
}) => {
  const freshness = formatRelativeTime(job);
  const isSubmissionUncertain =
    appInfo?.status === 'RECONCILIATION_REQUIRED' || appInfo?.status === 'SUBMISSION_UNKNOWN';
  const isApplied = (Boolean(appInfo) && appInfo?.status === 'APPLIED') || isLiveSubmitted;
  const isCurrentlyApplying =
    liveApplyingJobId === job.id ||
    (activeRun?.status === 'RUNNING' &&
      Boolean(activeRun?.current_job_title) &&
      (job.title.toLowerCase().includes(activeRun.current_job_title!.toLowerCase()) ||
        activeRun.current_job_title!.toLowerCase().includes(job.title.toLowerCase())));
  const isQueued =
    !isCurrentlyApplying &&
    !isApplied &&
    !isSubmissionUncertain &&
    (isLiveQueued ||
      (Boolean(appInfo) &&
        ['APPROVAL_REQUIRED', 'APPROVED', 'SUBMITTING', 'READY_TO_SUBMIT'].includes(appInfo!.status)));

  return (
    <div
      className={`p-5 rounded-2xl bg-white border transition-all flex flex-col justify-between space-y-3 shadow-xs hover:shadow-md relative ${
        isCurrentlyApplying
          ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/20 dark:bg-amber-950/25 dark:border-amber-500'
          : isSubmissionUncertain
            ? 'border-orange-400 ring-2 ring-orange-400/20 bg-orange-50/20 dark:bg-orange-950/25 dark:border-orange-500'
            : isApplied
              ? 'border-emerald-400/80 bg-emerald-50/15 dark:bg-emerald-950/20 dark:border-emerald-800'
              : isQueued
                ? 'border-indigo-400/80 ring-1 ring-indigo-400/20 bg-indigo-50/10 dark:bg-indigo-950/20 dark:border-indigo-800'
                : isSelected
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:bg-slate-900/90 dark:border-indigo-500'
                  : 'border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/70 dark:border-slate-800 dark:hover:border-slate-700'
      }`}
    >
      <div className="space-y-2.5">
        {/* Header: Selection Checkbox + Platform tag + AI Fit Badge + Freshness / Applied badge + Delete button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            {/* Checkbox */}
            {isCurrentlyApplying ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-amber-500 text-white shadow-xs animate-pulse"
                title="Automation engine currently applying to this job"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            ) : isSubmissionUncertain ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/40"
                title="Submission uncertain on portal. Resolve in Application CRM before re-attempting."
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            ) : isApplied ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                title="Application already submitted"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            ) : isQueued ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700"
                title="Waiting in automation queue"
              >
                <Clock className="w-3 h-3" />
              </div>
            ) : (
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`Select ${job.title || 'job'} at ${job.company || 'company'}`}
                onClick={() => onToggleSelect(job.id)}
                className={`hit-area w-5 h-5 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-300 dark:bg-slate-800 dark:border-slate-600 text-transparent hover:border-indigo-400'
                }`}
                title={isSelected ? 'Deselect job' : 'Select job to queue'}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}

            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80">
              {job.source_type ? job.source_type.toUpperCase() : 'NAUKRI'}
            </span>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* AI Match Fit Badge / Evaluation Trigger */}
            {(() => {
              const isEvaluating = evaluating;

              if (match) {
                const score = Math.round(match.match_score ?? match.overall_score);
                const scoreColor =
                  score >= 80
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                    : score >= 60
                      ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';

                return (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center space-x-1 ${scoreColor}`}
                    title={`Fit: ${score}% (Decision: ${match.decision})\n${match.reasoning_summary || match.matched_skills?.slice(0, 3).join(', ') || ''}`}
                  >
                    <Zap className="w-2.5 h-2.5" />
                    <span>{score}% Fit</span>
                  </span>
                );
              }

              return (
                <button type="button"
                  onClick={() => onEvaluate(job.id)}
                  disabled={isEvaluating}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1 transition-all cursor-pointer disabled:opacity-50"
                  title="Calculate candidate-job fit score with AI"
                >
                  <Sparkles className={`w-2.5 h-2.5 ${isEvaluating ? 'animate-spin' : 'text-amber-500'}`} />
                  <span>{isEvaluating ? 'Scoring...' : '⚡ AI Fit'}</span>
                </button>
              );
            })()}

            {/* Real-time Status Badges */}
            {isCurrentlyApplying ? (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500 text-white flex items-center space-x-1 shadow-xs animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                <span>APPLYING NOW</span>
              </span>
            ) : isSubmissionUncertain ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950/80 dark:text-orange-300 dark:border-orange-800 flex items-center space-x-1">
                <AlertTriangle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                <span>Needs Verification ⚠️</span>
              </span>
            ) : isQueued ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1">
                <Clock className="w-2.5 h-2.5" />
                <span>In Queue</span>
              </span>
            ) : isApplied ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Applied ✅</span>
              </span>
            ) : (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] border flex items-center space-x-1.5 ${freshness.badgeStyle}`}
              >
                {freshness.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                <span>{freshness.label}</span>
              </span>
            )}

            {/* Dismiss / Delete Button */}
            <button type="button"
              aria-label="Delete"
              onClick={() => onDelete(job.id, job.title)}
              disabled={deleting}
              title="Remove job from repository"
              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className={`w-3.5 h-3.5 ${deleting ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <h3 className="font-bold text-sm line-clamp-1">
          <button
            type="button"
            onClick={() => onOpen(job.id)}
            className="text-left text-slate-900 dark:text-white hover:text-brand-600 focus-visible:underline"
          >
            {job.title}
          </button>
        </h3>

        <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center space-x-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <span className="line-clamp-1">{job.company}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span className="line-clamp-1">{job.location}</span>
          </div>
        </div>

        {job.max_salary && (
          <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center">
            <DollarSign className="w-3.5 h-3.5 inline" />
            <span>{(job.max_salary / 100000).toFixed(1)} LPA</span>
          </div>
        )}

        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed pt-1">
          {job.raw_description}
        </p>
      </div>

      {/* Card Footer with 1-Click Live Bot Apply & Real-Time Status Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-600 dark:text-slate-300 font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded truncate">
          {job.max_experience_years && job.max_experience_years > (job.min_experience_years || 0)
            ? `Exp: ${job.min_experience_years}-${job.max_experience_years} yrs`
            : `Exp: ${job.min_experience_years || 0}+ yrs`}
        </span>

        <div className="flex items-center space-x-2">
          <a
            href={job.apply_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            title="View original job posting (opens in a new tab)"
            aria-label="View original job posting (opens in a new tab)"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>

          <TailorButton jobId={job.id} jobTitle={job.title} />

          {isCurrentlyApplying ? (
            <button type="button"
              onClick={() => onNavigate && onNavigate('live_console')}
              className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer transition-all animate-pulse active:scale-95"
              title="Automation actively interacting with browser for this job. Click to watch live stream."
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Watch Live ⚡</span>
            </button>
          ) : isSubmissionUncertain ? (
            <button type="button"
              onClick={() => onNavigate && onNavigate('applications')}
              className="px-3 py-1 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:hover:bg-orange-900/80 dark:text-orange-400 text-xs font-bold border border-orange-200 dark:border-orange-800 flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
              title="Submission uncertain on portal. Click to verify in Application CRM."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
              <span>Verify (CRM)</span>
            </button>
          ) : isQueued ? (
            <button type="button"
              onClick={() => onNavigate && onNavigate('live_console')}
              className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-all"
              title="Waiting in automation batch. Click to view mission control."
            >
              <Clock className="w-3 h-3" />
              <span>Queued (View)</span>
            </button>
          ) : isApplied ? (
            <button type="button"
              onClick={() => onNavigate && onNavigate('applications')}
              className="px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1 transition-all cursor-pointer active:scale-95"
              title="See this application"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Applied (view)</span>
            </button>
          ) : (
            <button type="button"
              onClick={() => onApply(job)}
              className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1 transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>Queue to apply</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
