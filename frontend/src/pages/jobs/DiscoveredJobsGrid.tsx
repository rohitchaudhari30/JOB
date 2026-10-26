import React from 'react';
import type { Job } from '../../types';
import { JobCard } from './JobCard';
import { CardSkeleton } from '../../components/ui/Skeleton';
type CardProps = React.ComponentProps<typeof JobCard>;

interface Props {
  loading: boolean;
  displayedJobs: Job[];
  filterMinFit: boolean;
  selectedJobIds: Set<string>;
  appliedJobMap: Map<string, NonNullable<CardProps['appInfo']>>;
  liveSubmittedJobIds: Set<string>;
  liveQueueJobIds: Set<string>;
  liveApplyingJobId: string | null;
  activeRun: CardProps['activeRun'];
  matchesMap: Map<string, NonNullable<CardProps['match']>>;
  evaluatingJobIds: Set<string>;
  deletingId: string | null;
  toggleJobSelection: (id: string) => void;
  record: { open: (id: string) => void };
  handleEvaluateSingle: (id: string) => void | Promise<void>;
  handleSingleJobApply: (job: Job) => void;
  handleDeleteJob: (id: string, title: string) => void;
  onNavigate: CardProps['onNavigate'];
}

export const DiscoveredJobsGrid: React.FC<Props> = ({
  loading,
  displayedJobs,
  filterMinFit,
  selectedJobIds,
  appliedJobMap,
  liveSubmittedJobIds,
  liveQueueJobIds,
  liveApplyingJobId,
  activeRun,
  matchesMap,
  evaluatingJobIds,
  deletingId,
  toggleJobSelection,
  record,
  handleEvaluateSingle,
  handleSingleJobApply,
  handleDeleteJob,
  onNavigate,
}) => (
  <>
    {loading ? (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-label="Loading fresh jobs">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    ) : displayedJobs.length === 0 ? (
      <div className="text-center py-16 bg-white dark:bg-slate-900/30 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-slate-500 text-xs shadow-sm">
        {filterMinFit
          ? 'No jobs found with >= 80% AI match fit. Try evaluating more jobs or resetting the filter.'
          : 'No jobs found matching the selected freshness or keyword criteria.'}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayedJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            isSelected={selectedJobIds.has(job.id)}
            appInfo={appliedJobMap.get(job.id)}
            isLiveSubmitted={liveSubmittedJobIds.has(job.id)}
            isLiveQueued={liveQueueJobIds.has(job.id)}
            liveApplyingJobId={liveApplyingJobId}
            activeRun={activeRun}
            match={matchesMap.get(job.id)}
            evaluating={evaluatingJobIds.has(job.id)}
            deleting={deletingId === job.id}
            onToggleSelect={toggleJobSelection}
            onOpen={record.open}
            onEvaluate={(id) => void handleEvaluateSingle(id)}
            onApply={handleSingleJobApply}
            onDelete={handleDeleteJob}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    )}
  </>
);
