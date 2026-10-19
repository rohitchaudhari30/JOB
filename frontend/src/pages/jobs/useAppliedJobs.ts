import { useState } from 'react';
import { api } from '../../services/api';
import type { Application } from '../../types';

/** Which jobs already have an application, and how many were applied today. */
export function useAppliedJobs() {
  const [appliedJobMap, setAppliedJobMap] = useState<Map<string, { appliedAt?: string; status: string }>>(new Map());
  const [appliedTodayCount, setAppliedTodayCount] = useState(0);

  const loadAppliedJobs = async () => {
    try {
      const mapData = await api.getAppliedJobMap().catch(async () => {
        // Fallback to listApplications if endpoint unavailable
        const apps = await api.listApplications();
        const fallback: Record<string, { status: string; applied_at?: string }> = {};
        (apps || []).forEach((app: Application) => {
          if (app.job_id) {
            fallback[app.job_id] = {
              status: app.workflow_state,
              applied_at: app.applied_at || app.created_at,
            };
          }
        });
        return fallback;
      });

      const map = new Map<string, { appliedAt?: string; status: string }>();
      let countToday = 0;
      const todayStr = new Date().toDateString();

      Object.entries(mapData || {}).forEach(([jobId, info]) => {
        map.set(jobId, {
          appliedAt: info.applied_at,
          status: info.status,
        });
        if (info.applied_at && new Date(info.applied_at).toDateString() === todayStr && info.status === 'APPLIED') {
          countToday++;
        }
      });

      setAppliedJobMap(map);
      setAppliedTodayCount(countToday);
    } catch {
      // Ignore if list fails
    }
  };

  return { appliedJobMap, appliedTodayCount, loadAppliedJobs };
}
