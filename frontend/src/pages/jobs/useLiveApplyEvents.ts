import { useEffect, useRef, useState } from 'react';
import { wsClient } from '../../services/ws';
import type { Job } from '../../types';

/**
 * Tracks which job the engine is applying to right now and which were submitted, from live websocket events.
 * Refs keep the subscription (made once) reading the current jobs and applying id.
 */
export function useLiveApplyEvents(jobs: Job[], reloadApplied: () => void) {
  const [liveApplyingJobId, setLiveApplyingJobId] = useState<string | null>(null);
  const [liveQueueJobIds, setLiveQueueJobIds] = useState<Set<string>>(new Set());
  const [liveSubmittedJobIds, setLiveSubmittedJobIds] = useState<Set<string>>(new Set());

  const jobsRef = useRef(jobs);
  const applyingRef = useRef(liveApplyingJobId);
  const reloadRef = useRef(reloadApplied);
  jobsRef.current = jobs;
  applyingRef.current = liveApplyingJobId;
  reloadRef.current = reloadApplied;

  useEffect(() => {
    const unsubscribe = wsClient.onEvent((evt) => {
      if (evt.event_name === 'AUTO_APPLYING') {
        if (evt.payload?.job_id) {
          setLiveApplyingJobId(evt.payload.job_id);
        } else if (evt.message) {
          const matchJob = jobsRef.current.find(
            (j) => evt.message.includes(j.company) || evt.message.includes(j.title),
          );
          if (matchJob) setLiveApplyingJobId(matchJob.id);
        }
      } else if (evt.event_name === 'APPLICATION_SUBMITTED' || evt.state === 'APPLIED') {
        const submittedId = evt.payload?.job_id || applyingRef.current;
        if (submittedId) setLiveSubmittedJobIds((prev) => new Set(prev).add(submittedId));
        setLiveApplyingJobId(null);
        reloadRef.current();
      } else if (
        evt.event_name === 'RUN_COMPLETED' ||
        evt.event_name === 'RUN_ABORTED' ||
        evt.event_name === 'RUN_FAILED'
      ) {
        setLiveApplyingJobId(null);
        setLiveQueueJobIds(new Set());
        reloadRef.current();
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return { liveApplyingJobId, setLiveApplyingJobId, liveQueueJobIds, setLiveQueueJobIds, liveSubmittedJobIds };
}
