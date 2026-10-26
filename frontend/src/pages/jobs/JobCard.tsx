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
import { TailorButton } from './tailor/TailorButton';

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

const getPlatformBadge = (platform?: string) => {
  const p = (platform || 'naukri').toLowerCase();
  switch (p) {
    case 'linkedin':
      return 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/80';
    case 'naukri':
      return 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/80';
    case 'indeed':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/80';
    case 'foundit':
      return 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/80';
    case 'internshala':
      return 'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800/80';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  }
};

/** One discovered job: selection, status ring, AI fit, metadata, and per-job actions. */
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

  const score = match ? Math.round(match.match_score ?? match.overall_score) : null;
  const scoreColor =
    score !== null
      ? score >= 80
        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
        : score >= 60
        ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
        : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
      : '';

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/90 border transition-all flex flex-col justify-between space-y-3.5 shadow-xs hover:shadow-md relative ${
        isCurrentlyApplying
          ? 'border-amber-400 ring-2 ring-amber-400/30 bg-amber-50/20 dark:bg-amber-950/25 dark:border-amber-500'
          : isSubmissionUncertain
          ? 'border-orange-400 ring-2 ring-orange-400/20 bg-orange-50/20 dark:bg-orange-950/25 dark:border-orange-500'
          : isApplied
          ? 'border-emerald-400/80 bg-emerald-50/15 dark:bg-emerald-950/20 dark:border-emerald-800'
          : isQueued
          ? 'border-indigo-400/80 ring-1 ring-indigo-400/20 bg-indigo-50/10 dark:bg-indigo-950/20 dark:border-indigo-800'
          : isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 dark:bg-slate-900/95 dark:border-indigo-500'
          : 'border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
      }`}
    >
      <div className="space-y-2.5">
        {/* Top Header: Checkbox + Portal Badge (Left) | AI Match Fit + Delete (Right) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isCurrentlyApplying ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-amber-500 text-white shadow-xs animate-pulse shrink-0"
                title="Automation engine currently applying to this job"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            ) : isSubmissionUncertain ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/40 shrink-0"
                title="Submission uncertain on portal. Resolve in Application CRM before re-attempting."
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
            ) : isApplied ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 shrink-0"
                title="Application already submitted"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            ) : isQueued ? (
              <div
                className="w-5 h-5 rounded-lg flex items-center justify-center bg-indigo-100 text-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shrink-0"
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
                className={`hit-area w-5 h-5 rounded-lg flex items-center justify-center transition-all cursor-pointer border shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-300 dark:bg-slate-800 dark:border-slate-600 text-transparent hover:border-indigo-400'
                }`}
                title={isSelected ? 'Deselect job' : 'Select job to queue'}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            )}

            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border whitespace-nowrap shrink-0 ${getPlatformBadge(
                job.source_type
              )}`}
            >
              {job.source_type ? job.source_type.toUpperCase() : 'PORTAL'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {match && score !== null ? (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 whitespace-nowrap shrink-0 ${scoreColor}`}
                title={`Fit: ${score}% (Decision: ${match.decision})\n${
                  match.reasoning_summary || match.matched_skills?.slice(0, 3).join(', ') || ''
                }`}
              >
                <Zap className="w-2.5 h-2.5" />
                <span>{score}% Fit</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onEvaluate(job.id)}
                disabled={evaluating}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                title="Calculate candidate-job fit score with AI"
              >
                <Sparkles className={`w-2.5 h-2.5 ${evaluating ? 'animate-spin' : 'text-amber-500'}`} />
                <span>{evaluating ? 'Scoring...' : '⚡ AI Fit'}</span>
              </button>
            )}

            <button
              type="button"
              aria-label="Delete"
              onClick={() => onDelete(job.id, job.title)}
              disabled={deleting}
              title="Remove job from repository"
              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className={`w-3.5 h-3.5 ${deleting ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Job Title & Company/Location Information */}
        <div className="space-y-1.5">
          <h3 className="font-bold text-sm leading-snug line-clamp-1">
            <button
              type="button"
              onClick={() => onOpen(job.id)}
              className="text-left text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 focus-visible:underline transition-colors"
            >
              {job.title}
            </button>
          </h3>

          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
            <div className="flex items-center gap-1 truncate min-w-0 font-medium">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{job.company || 'Confidential Company'}</span>
            </div>
            <span className="text-slate-300 dark:text-slate-600 shrink-0">•</span>
            <div className="flex items-center gap-1 truncate min-w-0">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">{job.location || 'Any Location'}</span>
            </div>
          </div>
        </div>

        {/* Clean Metadata Tags: Experience, Freshness, and Optional Salary */}
        <div className="flex items-center flex-wrap gap-1.5 pt-0.5">
          <span className="inline-flex items-center text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-slate-700/80 whitespace-nowrap">
            {job.max_experience_years && job.max_experience_years > (job.min_experience_years || 0)
              ? `Exp: ${job.min_experience_years}-${job.max_experience_years} yrs`
              : `Exp: ${job.min_experience_years || 0}+ yrs`}
          </span>

          <span
            className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md border whitespace-nowrap ${freshness.badgeStyle}`}
          >
            {freshness.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
            <Clock className="w-2.5 h-2.5 opacity-70 shrink-0" />
            <span>{freshness.label}</span>
          </span>

          {job.max_salary ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
              <DollarSign className="w-2.5 h-2.5 shrink-0" />
              <span>{(job.max_salary / 100000).toFixed(1)} LPA</span>
            </span>
          ) : null}
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed pt-0.5 min-h-[2rem]">
          {job.raw_description?.trim() || 'Role overview available. Click card to review full job requirements and insights.'}
        </p>
      </div>

      {/* Card Footer: Balanced 2-CTA Grid + Original Job Link */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
        {job.apply_url && (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors shadow-2xs"
            title="View original job posting (opens in a new tab)"
            aria-label="View original job posting (opens in a new tab)"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
          </a>
        )}

        <div className="flex-1 min-w-0">
          <TailorButton
            jobId={job.id}
            jobTitle={job.title}
            applyUrl={job.apply_url}
            className="w-full h-9 justify-center py-2 px-2.5 rounded-xl text-xs font-semibold whitespace-nowrap bg-violet-50 hover:bg-violet-100 text-violet-800 border border-violet-200 dark:bg-violet-950/60 dark:text-violet-200 dark:border-violet-800 transition-all shadow-2xs cursor-pointer active:scale-95"
            label="Optimize Resume"
          />
        </div>

        <div className="flex-1 min-w-0">
          {isCurrentlyApplying ? (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('live_console')}
              className="w-full h-9 justify-center py-2 px-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all animate-pulse active:scale-95 whitespace-nowrap"
              title="Automation actively interacting with browser for this job. Click to watch live stream."
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Watch Live</span>
            </button>
          ) : isSubmissionUncertain ? (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('applications')}
              className="w-full h-9 justify-center py-2 px-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:hover:bg-orange-900/80 dark:text-orange-400 text-xs font-bold border border-orange-200 dark:border-orange-800 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              title="Submission uncertain on portal. Click to verify in Application CRM."
            >
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
              <span>Verify (CRM)</span>
            </button>
          ) : isQueued ? (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('live_console')}
              className="w-full h-9 justify-center py-2 px-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/80 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap shadow-2xs"
              title="Waiting in automation batch. Click to view live mission control."
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Queued (View)</span>
            </button>
          ) : isApplied ? (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('applications')}
              className="w-full h-9 justify-center py-2 px-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/80 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 whitespace-nowrap shadow-2xs"
              title="See this application in CRM"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Applied ✓</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onApply(job)}
              className="w-full h-9 justify-center py-2 px-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap"
              title="Queue this job for automated 1-click application"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300 shrink-0" />
              <span>Queue to apply</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
