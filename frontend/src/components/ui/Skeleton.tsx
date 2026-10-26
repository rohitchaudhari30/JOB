import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Base high-performance shimmer skeleton component.
 * Features content-aware geometry and subtle gradient shimmer.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => (
  <div
    className={`relative overflow-hidden rounded-lg bg-slate-200/80 dark:bg-slate-800/80 ${className}`}
    {...props}
  >
    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent animate-shimmer" />
  </div>
);

/**
 * Modern Linear-style indeterminate top progress runner.
 * Displays when background refreshing or fetching data without tearing down view.
 */
export const TopProgressBar: React.FC<{ active?: boolean; className?: string }> = ({
  active = true,
  className = '',
}) => {
  if (!active) return null;
  return (
    <div
      role="progressbar"
      aria-label="Updating data in background"
      aria-busy="true"
      className={`h-0.5 w-full overflow-hidden bg-slate-100 dark:bg-slate-800/60 relative ${className}`}
    >
      <div className="h-full w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 origin-left animate-shimmer" />
    </div>
  );
};

/**
 * Skeleton matching Dashboard KPI metric cards.
 */
export const MetricCardSkeleton: React.FC = () => (
  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 shadow-xs">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-6 w-6 rounded-lg" />
    </div>
    <Skeleton className="h-8 w-20 rounded-md" />
    <Skeleton className="h-3 w-32" />
  </div>
);

/**
 * Skeleton matching Job / Match cards in JobDiscovery and AIMatches.
 */
export const CardSkeleton: React.FC = () => (
  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start justify-between gap-4">
    <div className="flex items-start gap-3.5 min-w-0 flex-1 w-full">
      <Skeleton className="h-4 w-4 rounded shrink-0 mt-1" />
      <Skeleton className="h-11 w-11 rounded-2xl shrink-0" />
      <div className="space-y-2.5 flex-1 min-w-0">
        <Skeleton className="h-5 w-3/4 max-w-sm rounded" />
        <Skeleton className="h-3.5 w-1/2 max-w-xs rounded" />
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
      <Skeleton className="h-8 w-8 rounded-xl" />
      <Skeleton className="h-8 w-24 rounded-xl" />
    </div>
  </div>
);

/**
 * Skeleton matching data tables (Applications CRM).
 */
export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="divide-y divide-slate-100 dark:divide-slate-800/80" role="status" aria-label="Loading rows">
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="flex items-center justify-between px-4 py-3.5 gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Skeleton className="h-4 w-4 rounded shrink-0" />
          <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
          <div className="space-y-1.5 flex-1 min-w-0">
            <Skeleton className="h-4 w-1/3 min-w-[120px] rounded" />
            <Skeleton className="h-3 w-1/4 min-w-[90px] rounded" />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
        <Skeleton className="h-7 w-20 rounded-lg shrink-0" />
      </div>
    ))}
  </div>
);

/**
 * Full page skeleton for route transitions in Suspense.
 */
export const PageSkeleton: React.FC<{ titleWidth?: string }> = ({ titleWidth = 'w-48' }) => (
  <div className="space-y-6 animate-fadeIn pb-12" role="status" aria-live="polite">
    <TopProgressBar active />
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className={`h-8 ${titleWidth} rounded-lg`} />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>
    <div className="space-y-3 pt-2">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  </div>
);
