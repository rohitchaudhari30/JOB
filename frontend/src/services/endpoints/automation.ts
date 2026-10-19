import { apiClient } from '../http';
import type { AutomationRunStatus, TimelineEvent } from '../../types';

export const automationApi = {
  // Automation & Schedules
  startAutomation: async (payload: any): Promise<AutomationRunStatus> => {
    const res = await apiClient.post('/automation/start', payload);
    return res.data;
  },
  getActiveRun: async (): Promise<AutomationRunStatus | null> => {
    const res = await apiClient.get('/automation/active');
    return res.data;
  },
  // The server returns events in pages (oldest first); keep asking until a page is not full.
  getRunEvents: async (runId: string, afterSeq?: number): Promise<TimelineEvent[]> => {
    const pageSize = 1000;
    const maxPages = 50;
    const all: TimelineEvent[] = [];
    let cursor = afterSeq;
    for (let page = 0; page < maxPages; page++) {
      const params: Record<string, any> = { limit: pageSize };
      if (cursor !== undefined && cursor !== null) {
        params.after_seq = cursor;
      }
      const res = await apiClient.get(`/automation/runs/${runId}/events`, { params });
      const batch: TimelineEvent[] = res.data;
      all.push(...batch);
      if (batch.length < pageSize) break;
      const lastSeq = batch[batch.length - 1]?.seq;
      if (lastSeq === undefined || lastSeq === null) break;
      cursor = lastSeq;
    }
    return all;
  },
  pauseRun: async (runId: string): Promise<AutomationRunStatus> => {
    const res = await apiClient.post(`/automation/runs/${runId}/pause`);
    return res.data;
  },
  resumeRun: async (runId: string, userInput?: string): Promise<AutomationRunStatus> => {
    const res = await apiClient.post(`/automation/runs/${runId}/resume`, { user_input: userInput });
    return res.data;
  },
  stopRun: async (runId: string, reason?: string): Promise<AutomationRunStatus> => {
    const res = await apiClient.post(`/automation/runs/${runId}/stop`, { reason });
    return res.data;
  },
};
