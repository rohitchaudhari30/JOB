import type { Application, ApplicationStats } from '../../types';
import { DerivedStatus, parseSafeDate, getDayStartTimestamp, getDayEndTimestamp } from '../../utils/applicationHelpers';

/** Pure logic for the Applications page: status derivation, formatting, KPI stats, filtering and sorting. */

export const getDerivedStatus = (app: Application): { label: DerivedStatus; className: string } => {
  const reason = (app.failure_reason || '').toLowerCase();

  if (app.workflow_state === 'APPLIED') {
    return {
      label: 'Applied',
      className:
        'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40',
    };
  }

  if (reason.includes('already applied') || reason.includes('already_applied')) {
    return {
      label: 'Already applied',
      className:
        'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/40',
    };
  }

  if (
    reason.includes('company site') ||
    reason.includes('external') ||
    reason.includes('redirect') ||
    reason.includes('apply on company')
  ) {
    return {
      label: 'Company site',
      className:
        'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40',
    };
  }

  if (
    app.workflow_state === 'RECONCILIATION_REQUIRED' ||
    app.workflow_state === 'SUBMISSION_UNKNOWN' ||
    reason.includes('reconciliation_required') ||
    reason.includes('submission_uncertain')
  ) {
    return {
      label: 'Needs Verification',
      className:
        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800/40',
    };
  }

  if (app.workflow_state === 'FAILED' || app.workflow_state === 'REJECTED') {
    return {
      label: 'Failed',
      className:
        'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40',
    };
  }

  if (app.workflow_state === 'SKIPPED') {
    return {
      label: 'Skipped',
      className:
        'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40',
    };
  }

  return {
    label: 'Pending',
    className:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };
};

export const formatExperience = (app: Application): string => {
  const min = app.min_experience_years ?? app.job?.min_experience_years;
  const max = app.max_experience_years ?? app.job?.max_experience_years;
  if (min !== undefined && max !== undefined && (min > 0 || max > 0)) {
    return `${Math.round(min)}-${Math.round(max)} Yrs`;
  }
  if (min !== undefined && min > 0) return `${Math.round(min)}+ Yrs`;
  if (max !== undefined && max > 0) return `0-${Math.round(max)} Yrs`;
  return '-';
};

export const formatSalary = (app: Application): string => {
  const min = app.min_salary ?? app.job?.min_salary;
  const max = app.max_salary ?? app.job?.max_salary;
  if (!min && !max) return '-';

  const toLakhs = (val: number) => {
    if (val >= 100000) return `${Math.round(val / 100000)}L`;
    if (val >= 1000) return `${Math.round(val / 1000)}k`;
    return `${val}`;
  };

  if (min && max) return `${toLakhs(min)} - ${toLakhs(max)}`;
  if (min) return `${toLakhs(min)}+`;
  if (max) return `Up to ${toLakhs(max)}`;
  return '-';
};

export const formatDateDisplay = (dateString?: string | null) => {
  if (!dateString) return { main: '-', rel: '' };
  const d = parseSafeDate(dateString);
  if (!d) return { main: '-', rel: '' };

  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const main = `${day} ${month} · ${hours}:${minutes}`;

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  let rel = '';
  if (diffSec < 60) {
    rel = 'just now';
  } else if (diffSec < 3600) {
    rel = `${Math.floor(diffSec / 60)}m ago`;
  } else if (diffSec < 86400) {
    rel = `${Math.floor(diffSec / 3600)}h ago`;
  } else {
    rel = `${Math.floor(diffSec / 86400)}d ago`;
  }

  return { main, rel };
};


export type ScoreMap = Map<string, number>;

export function computeStats(applications: Application[], matchScores: ScoreMap, backendStats: ApplicationStats | null) {
  let localAppliedCount = 0;
  let localAppliedTodayCount = 0;
  let localSkippedCount = 0;
  let localFailedCount = 0;
  let localCompanySiteCount = 0;
  let localAlreadyAppliedCount = 0;
  let localNeedsVerificationCount = 0;
  let localPendingCount = 0;
  let localReviewQueueCount = 0;
  let localNeedsAttentionCount = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = todayStart.getTime();

  const validScores: number[] = [];

  applications.forEach((app) => {
    const derived = getDerivedStatus(app).label;
    if (derived === 'Applied') {
      localAppliedCount++;
      const d = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
      if (d && d.getTime() >= todayTimestamp) {
        localAppliedTodayCount++;
      }
    } else if (derived === 'Skipped') {
      localSkippedCount++;
    } else if (derived === 'Failed') {
      localFailedCount++;
    } else if (derived === 'Company site') {
      localCompanySiteCount++;
    } else if (derived === 'Already applied') {
      localAlreadyAppliedCount++;
    } else if (derived === 'Needs Verification') {
      localNeedsVerificationCount++;
    } else {
      localPendingCount++;
    }

    const score = app.match_score ?? matchScores.get(app.job_id);
    if (typeof score === 'number' && score > 0) {
      validScores.push(score);
    }

    // Review Queue: Approval Required or match score 65-79%
    const isReview =
      app.workflow_state === 'APPROVAL_REQUIRED' ||
      (typeof score === 'number' && score >= 65 && score < 80 && app.workflow_state !== 'APPLIED');
    if (isReview) localReviewQueueCount++;

    // Needs Attention: Failed, paused on challenge/rate limit, or uncertain submission requiring verification
    const isAttention =
      app.workflow_state === 'FAILED' ||
      app.workflow_state === 'RECONCILIATION_REQUIRED' ||
      app.workflow_state === 'SUBMISSION_UNKNOWN' ||
      (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_'));
    if (isAttention) localNeedsAttentionCount++;
  });

  const total = backendStats?.total ?? applications.length;
  const appliedCount = backendStats?.applied ?? localAppliedCount;
  const appliedTodayCount = backendStats?.applied_today ?? localAppliedTodayCount;
  const successRate = backendStats?.success_rate ?? (total > 0 ? Math.round((appliedCount / total) * 100) : 0);
  const avgMatch =
    validScores.length > 0
      ? Math.round(validScores.reduce((acc, curr) => acc + curr, 0) / validScores.length)
      : 0;

  const failedCount = backendStats?.failed ?? localFailedCount;
  const skippedCount = backendStats?.skipped ?? localSkippedCount;
  const reviewQueueCount = backendStats?.approval_required ?? localReviewQueueCount;
  const needsAttentionCount = backendStats?.needs_attention ?? localNeedsAttentionCount;
  const needsVerificationCount = backendStats?.reconciliation_required ?? localNeedsVerificationCount;
  const companySiteCount = localCompanySiteCount;
  const alreadyAppliedCount = localAlreadyAppliedCount;
  const pendingCount = localPendingCount;

  return {
    total,
    appliedCount,
    appliedTodayCount,
    successRate,
    avgMatch,
    scoredJobsCount: validScores.length,
    companySiteCount,
    issuesCount: failedCount + skippedCount,
    failedCount,
    skippedCount,
    alreadyAppliedCount,
    needsVerificationCount,
    pendingCount,
    reviewQueueCount,
    needsAttentionCount,
  };
}

export interface ListFilters {
  selectedFilter: string;
  searchQuery: string;
  companyFilter: string;
  minMatchFilter: number;
  fromDate: string;
  toDate: string;
  sortColumn: 'date' | 'match' | 'status';
  sortDirection: 'asc' | 'desc';
}

export function filterAndSortApplications(applications: Application[], matchScores: ScoreMap, f: ListFilters): Application[] {
  const { selectedFilter, searchQuery, companyFilter, minMatchFilter, fromDate, toDate, sortColumn, sortDirection } = f;
  let result = [...applications];

  // Status chip filter
  if (selectedFilter === 'Review Queue') {
    result = result.filter((app) => {
      const score = app.match_score ?? matchScores.get(app.job_id);
      return (
        app.workflow_state === 'APPROVAL_REQUIRED' ||
        (typeof score === 'number' && score >= 65 && score < 80 && app.workflow_state !== 'APPLIED')
      );
    });
  } else if (selectedFilter === 'Needs Attention') {
    result = result.filter((app) => {
      return (
        app.workflow_state === 'FAILED' ||
        app.workflow_state === 'RECONCILIATION_REQUIRED' ||
        app.workflow_state === 'SUBMISSION_UNKNOWN' ||
        (typeof app.workflow_state === 'string' && app.workflow_state.startsWith('PAUSED_'))
      );
    });
  } else if (selectedFilter !== 'All') {
    result = result.filter((app) => getDerivedStatus(app).label === selectedFilter);
  }

  // Title / Company / Location general search input
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    result = result.filter((app) => {
      const title = (app.job_title || app.job?.title || '').toLowerCase();
      const company = (app.company || app.job?.company || '').toLowerCase();
      const location = (app.location || app.job?.location || '').toLowerCase();
      return title.includes(q) || company.includes(q) || location.includes(q);
    });
  }

  // Dedicated Company filter (Image 1)
  if (companyFilter.trim()) {
    const c = companyFilter.toLowerCase().trim();
    result = result.filter((app) => {
      const company = (app.company || app.job?.company || '').toLowerCase();
      return company.includes(c);
    });
  }

  // Min match % filter (Image 1)
  if (minMatchFilter > 0) {
    result = result.filter((app) => {
      const score = app.match_score ?? matchScores.get(app.job_id) ?? 0;
      return score >= minMatchFilter;
    });
  }

  // Date From filter (Image 1)
  if (fromDate) {
    const startT = getDayStartTimestamp(fromDate);
    if (startT !== null) {
      result = result.filter((app) => {
        const appD = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
        return appD !== null && appD.getTime() >= startT;
      });
    }
  }

  // Date To filter (Image 1)
  if (toDate) {
    const endT = getDayEndTimestamp(toDate);
    if (endT !== null) {
      result = result.filter((app) => {
        const appD = parseSafeDate(app.applied_at) || parseSafeDate(app.created_at);
        return appD !== null && appD.getTime() <= endT;
      });
    }
  }

  // Interactive Sorting
  result.sort((a, b) => {
    if (sortColumn === 'match') {
      const scoreA = a.match_score ?? matchScores.get(a.job_id) ?? 0;
      const scoreB = b.match_score ?? matchScores.get(b.job_id) ?? 0;
      return sortDirection === 'desc' ? scoreB - scoreA : scoreA - scoreB;
    }
    if (sortColumn === 'status') {
      const statusA = getDerivedStatus(a).label;
      const statusB = getDerivedStatus(b).label;
      return sortDirection === 'desc' ? statusB.localeCompare(statusA) : statusA.localeCompare(statusB);
    }
    // Date sort (default)
    const timeA = (parseSafeDate(a.applied_at) || parseSafeDate(a.created_at))?.getTime() || 0;
    const timeB = (parseSafeDate(b.applied_at) || parseSafeDate(b.created_at))?.getTime() || 0;
    return sortDirection === 'desc' ? timeB - timeA : timeA - timeB;
  });

  return result;
}
