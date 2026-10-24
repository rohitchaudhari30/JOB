import React, { useEffect, useState, useRef } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';
import { api } from '../../../services/api';
import { refreshSavedTailored } from './savedTailoredStore';
import type { Job } from '../../../types';

interface Props {
  open: boolean;
  onClose: () => void;
  jobIds: string[];
  jobs: Job[];
  onInspectJob?: (jobId: string) => void;
}

interface ItemProgress {
  jobId: string;
  title: string;
  company: string;
  status: 'QUEUED' | 'ANALYZING' | 'GENERATING' | 'SAVED' | 'AWAITING_INPUT' | 'FAILED';
  detail: string;
  tailoredId?: string;
  matchedCount?: number;
  gapCount?: number;
}

export const BulkTailorModal: React.FC<Props> = ({ open, onClose, jobIds, jobs, onInspectJob }) => {
  const [inProgress, setInProgress] = useState(false);
  const [items, setItems] = useState<Record<string, ItemProgress>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const jobMap = useRef<Record<string, Job>>({});
  useEffect(() => {
    jobMap.current = jobs.reduce((acc, j) => ({ ...acc, [j.id]: j }), {});
  }, [jobs]);

  useEffect(() => {
    if (!open) {
      if (timerRef.current) clearInterval(timerRef.current);
      setInProgress(false);
      return;
    }

    const initMap: Record<string, ItemProgress> = {};
    for (const id of jobIds) {
      const j = jobMap.current[id];
      initMap[id] = {
        jobId: id,
        title: j?.title || 'Job Opening',
        company: j?.company || 'Employer',
        status: 'QUEUED',
        detail: 'Ready to tailor with verified profile facts',
      };
    }
    setItems(initMap);
  }, [open, jobIds]);

  const runBulk = async () => {
    setInProgress(true);
    try {
      const resp = await api.bulkTailor(jobIds, undefined, true);
      const updated = { ...items };

      for (const res of resp) {
        const id = res.job_id;
        if (!res.success) {
          updated[id] = {
            ...updated[id],
            status: 'FAILED',
            detail: res.error || 'Failed to start tailoring',
          };
        } else if (res.tailored) {
          const t = res.tailored;
          updated[id] = {
            ...updated[id],
            tailoredId: t.id,
            status: (t.status as any) || 'QUEUED',
            detail: t.status === 'SAVED' ? 'Tailored and saved ✓' : 'Processing...',
          };
          if (t.status === 'SAVED') {
            void refreshSavedTailored();
          }
        }
      }
      setItems(updated);

      // Start status poller for unfinished items
      const activeTailoredIds = resp
        .filter((r) => r.success && r.tailored && r.tailored.status !== 'SAVED' && r.tailored.status !== 'FAILED')
        .map((r) => ({ jobId: r.job_id, tailoredId: r.tailored!.id }));

      if (activeTailoredIds.length === 0) {
        setInProgress(false);
        return;
      }

      timerRef.current = setInterval(async () => {
        let allDone = true;
        for (const target of activeTailoredIds) {
          try {
            const current = await api.getTailored(target.tailoredId);
            setItems((prev) => {
              const prevItem = prev[target.jobId];
              if (!prevItem) return prev;

              let detail = prevItem.detail;
              if (current.status === 'SAVED') {
                detail = 'Tailored and saved ✓';
                void refreshSavedTailored();
              } else if (current.status === 'GENERATING' || current.status === 'GENERATE_QUEUED') {
                detail = 'Applying verified changes to resume...';
              } else if (current.status === 'ANALYZING' || current.status === 'QUEUED') {
                detail = 'Analyzing job description...';
              } else if (current.status === 'AWAITING_INPUT') {
                const qCount = current.analysis?.questions?.length || 0;
                detail = qCount > 0 ? `${qCount} optional skill question(s) available` : 'Ready for review';
              } else if (current.status === 'FAILED') {
                detail = current.error_message || 'Could not tailor resume';
              }

              const matched = current.analysis?.strengths?.length ?? prevItem.matchedCount;
              const gaps = current.analysis?.gaps?.length ?? prevItem.gapCount;

              return {
                ...prev,
                [target.jobId]: {
                  ...prevItem,
                  status: (current.status as any) || prevItem.status,
                  detail,
                  matchedCount: matched,
                  gapCount: gaps,
                },
              };
            });

            if (current.status !== 'SAVED' && current.status !== 'FAILED' && current.status !== 'AWAITING_INPUT') {
              allDone = false;
            }
          } catch {
            // keep polling others
          }
        }

        if (allDone && timerRef.current) {
          clearInterval(timerRef.current);
          setInProgress(false);
        }
      }, 2000);
    } catch {
      setInProgress(false);
    }
  };

  const list = Object.values(items);
  const savedCount = list.filter((i) => i.status === 'SAVED').length;
  const failedCount = list.filter((i) => i.status === 'FAILED').length;
  const total = list.length;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (timerRef.current) clearInterval(timerRef.current);
        onClose();
      }}
      title="Autonomous Bulk Resume Optimization"
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Optimize distinct, high-impact resumes for multiple jobs at once. AutoApply reuses your verified candidate profile and factual evidence—never fabricating missing skills.
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Selected: {total}</span>
            <span className="text-emerald-600 dark:text-emerald-400">Saved: {savedCount}</span>
            {failedCount > 0 && <span className="text-amber-600 dark:text-amber-400">Needs Check: {failedCount}</span>}
          </div>
        </div>

        {/* Progress list */}
        <div className="max-h-80 overflow-y-auto space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-900/30">
          {list.map((item) => (
            <div
              key={item.jobId}
              className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1 space-y-1 pr-3">
                <div className="flex items-center gap-2">
                  <h4 className="truncate text-xs font-bold text-slate-900 dark:text-white">{item.title}</h4>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">· {item.company}</span>
                </div>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.detail}</p>
                {item.matchedCount !== undefined && (
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {item.matchedCount} verified skill{item.matchedCount === 1 ? '' : 's'} aligned
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <StatusChip
                  tone={
                    item.status === 'SAVED'
                      ? 'success'
                      : item.status === 'FAILED'
                      ? 'warning'
                      : item.status === 'AWAITING_INPUT'
                      ? 'info'
                      : 'neutral'
                  }
                >
                  {item.status === 'SAVED'
                    ? 'Optimized ✓'
                    : item.status === 'AWAITING_INPUT'
                    ? 'Review Ready'
                    : item.status === 'FAILED'
                    ? 'Failed'
                    : inProgress
                    ? 'In Progress'
                    : 'Queued'}
                </StatusChip>

                {onInspectJob && (
                  <button
                    type="button"
                    onClick={() => onInspectJob(item.jobId)}
                    className="text-xs text-indigo-600 hover:text-indigo-500 hover:underline cursor-pointer dark:text-indigo-400"
                  >
                    Inspect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {inProgress ? 'Run in background' : 'Close'}
          </Button>
          {!inProgress && savedCount < total && (
            <Button variant="primary" size="sm" onClick={runBulk}>
              Start Optimizing ({total} Jobs)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
