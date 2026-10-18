import { CheckCircle2, Clock, Bookmark, XCircle } from 'lucide-react';

export const getDecisionBadge = (decision: string) => {
  switch (decision) {
    case 'AUTO_APPLY':
      return {
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
        label: 'AUTO-APPLY READY',
        classes:
          'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30',
      };
    case 'REQUIRE_APPROVAL':
      return {
        icon: <Clock className="w-3.5 h-3.5 text-indigo-500" />,
        label: 'NEEDS REVIEW',
        classes:
          'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30',
      };
    case 'SAVE':
      return {
        icon: <Bookmark className="w-3.5 h-3.5 text-amber-500" />,
        label: 'SAVED MATCH',
        classes:
          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
      };
    case 'REJECT':
    default:
      return {
        icon: <XCircle className="w-3.5 h-3.5 text-rose-500" />,
        label: 'BELOW THRESHOLD',
        classes:
          'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30',
      };
  }
};

export const getScoreColor = (score: number) => {
  if (score >= 75)
    return 'text-emerald-600 dark:text-emerald-400 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800/40';
  if (score >= 60)
    return 'text-indigo-600 dark:text-indigo-400 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800/40';
  if (score >= 45)
    return 'text-amber-600 dark:text-amber-400 border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/40';
  return 'text-rose-700 dark:text-rose-400 border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/40';
};
