import type { Job } from '../../types';

/** Posted-time label and badge style for a discovered job. */
export const formatRelativeTime = (job: Job): { label: string; badgeStyle: string; isLive: boolean } => {
  if (!job.posted_at) {
    return {
      label: job.raw_posted_text || 'Recently posted',
      badgeStyle: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      isLive: false,
    };
  }

  const postedDt = new Date(job.posted_at);
  const diffMs = Math.max(0, Date.now() - postedDt.getTime());
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    const minText = diffMins <= 1 ? 'Just now' : `${diffMins} min ago`;
    return {
      label: `Posted ${minText}`,
      badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80 font-bold',
      isLive: true,
    };
  }
  if (diffHours < 24) {
    const hrText = diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    return {
      label: `Posted ${hrText}`,
      badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80 font-semibold',
      isLive: false,
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Posted 1 day ago',
      badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/80',
      isLive: false,
    };
  }
  if (diffDays <= 3) {
    return {
      label: `Posted ${diffDays} days ago`,
      badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/80',
      isLive: false,
    };
  }
  if (diffDays <= 7) {
    return {
      label: `Posted ${diffDays} days ago`,
      badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      isLive: false,
    };
  }
  const weeks = Math.floor(diffDays / 7);
  return {
    label: `Posted ${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`,
    badgeStyle: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/80 dark:text-slate-500 dark:border-slate-800',
    isLive: false,
  };
};

/** Number of days to ask the server for, given the "posted within" choice (anything longer than a day maps to whole days). */
export const parseDaysFromFreshness = (val: string): number => {
  if (val === '1h' || val === '3h' || val === '6h' || val === '12h' || val === '24h') return 1;
  if (val === '3d') return 3;
  if (val === '7d') return 7;
  if (val === '14d') return 14;
  if (val === '30d' || val === 'all') return 30;
  return 1;
};
