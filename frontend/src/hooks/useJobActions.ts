import { useCallback, useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useApplyReadiness } from './useApplyReadiness';
import type { ReadinessGap } from '../components/ReadinessBanner';
import type { MatchResult } from '../types';
import { getMatchScore } from '../utils/matchScores';

export type QueueSource = 'JOB_DISCOVERY' | 'AI_MATCHES';

interface Options {
  onNavigate?: (tab: any) => void;
  /** Caller already knows what is missing (e.g. Discover is platform-specific): skips the internal lookup. */
  readinessMissing?: ReadinessGap[];
}

/**
 * The single place that evaluates jobs and queues applications for the Jobs
 * workspace (Discover and AI matches views). Queueing always goes through the
 * batch-queue endpoint (one canonical backend command, `auto_execute=false`,
 * duplicates reported as skipped) behind the same readiness guard.
 */
export function useJobActions({ onNavigate, readinessMissing }: Options = {}) {
  const { showSuccess, showError, showWarning } = useToast();
  const own = useApplyReadiness(readinessMissing === undefined);
  const readiness = { ...own, missing: readinessMissing ?? own.missing };
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(new Set());
  const [queueingIds, setQueueingIds] = useState<Set<string>>(new Set());
  const [isEvaluatingAll, setIsEvaluatingAll] = useState(false);

  const evaluateJob = useCallback(
    async (jobId: string): Promise<MatchResult | null> => {
      setEvaluatingIds((s) => new Set(s).add(jobId));
      try {
        const res = await api.evaluateMatch(jobId);
        showSuccess(`Fit calculated: ${Math.round(getMatchScore(res))}% match`, 'AI Evaluation Complete');
        return res;
      } catch (e: any) {
        showError(`Match evaluation failed: ${e.response?.data?.detail || e.message}`);
        return null;
      } finally {
        setEvaluatingIds((s) => {
          const n = new Set(s);
          n.delete(jobId);
          return n;
        });
      }
    },
    [showError, showSuccess]
  );

  const evaluateAll = useCallback(
    async (limit = 50): Promise<MatchResult[] | null> => {
      setIsEvaluatingAll(true);
      try {
        const results = await api.evaluateAllMatches(limit);
        showSuccess(`Evaluated ${results.length} discovered jobs with 5-stage AI cascade!`);
        return results;
      } catch (e: any) {
        showError(`AI Evaluation failed: ${e.response?.data?.detail || e.message}`);
        return null;
      } finally {
        setIsEvaluatingAll(false);
      }
    },
    [showError, showSuccess]
  );

  /** Returns the queue result, or null when blocked by the readiness guard or on error. */
  const queueJobs = useCallback(
    async (jobIds: string[], source: QueueSource) => {
      if (jobIds.length === 0) {
        showWarning('Select at least 1 job to queue.');
        return null;
      }
      if (readiness.missing.includes('connection')) {
        showWarning('Connect a job platform in Settings before applying.');
        onNavigate?.('connections');
        return null;
      }
      if (readiness.missing.includes('resume')) {
        showWarning('Upload a resume in Settings › Profile before applying.');
        onNavigate?.('profile');
        return null;
      }
      setQueueingIds((s) => new Set([...s, ...jobIds]));
      try {
        const result = await api.batchQueueApplications({ job_ids: jobIds, source, auto_execute: false });
        if (result.queued_count > 0) {
          showSuccess(
            `Queued ${result.queued_count} for review/execution (${result.skipped_count} skipped as duplicates or already applied).`,
            'Added to Applications'
          );
        } else {
          showWarning('Selected jobs were already applied or are duplicates.');
        }
        return result;
      } catch (e: any) {
        showError(`Failed to queue applications: ${e.response?.data?.detail || e.message}`);
        return null;
      } finally {
        setQueueingIds((s) => {
          const n = new Set(s);
          jobIds.forEach((id) => n.delete(id));
          return n;
        });
      }
    },
    [onNavigate, readiness.missing, showError, showSuccess, showWarning]
  );

  return { readiness, evaluatingIds, queueingIds, isEvaluatingAll, evaluateJob, evaluateAll, queueJobs };
}
