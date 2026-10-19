import { apiClient } from '../http';
import type { Application, ApplicationStats } from '../../types';

export const applicationsApi = {
  // Applications
  listApplications: async (state?: string, skip?: number, limit: number = 1000): Promise<Application[]> => {
    const res = await apiClient.get('/applications', { params: { state, skip, limit } });
    if (res.data && Array.isArray(res.data.items)) {
      return res.data.items;
    }
    return Array.isArray(res.data) ? res.data : [];
  },
  getApplicationScreenshot: async (appId: string): Promise<Blob> => {
    const res = await apiClient.get(`/applications/${appId}/screenshot`, {
      responseType: 'blob',
    });
    return res.data;
  },
  getApplicationStats: async (): Promise<ApplicationStats> => {
    const res = await apiClient.get('/applications/stats');
    return res.data;
  },
  getAppliedJobMap: async (): Promise<Record<string, { status: string; applied_at?: string }>> => {
    const res = await apiClient.get('/applications/applied-map');
    return res.data;
  },
  createApplication: async (
    job_id: string,
    resume_id?: string,
    campaign_id?: string,
    source?: string,
    auto_execute?: boolean,
  ): Promise<Application> => {
    const res = await apiClient.post('/applications', {
      job_id,
      resume_id,
      campaign_id,
      source: source || 'DIRECT_APPLY',
      auto_execute: auto_execute || false,
    });
    return res.data;
  },
  batchQueueApplications: async (payload: {
    job_ids: string[];
    resume_id?: string;
    campaign_id?: string;
    source?: string;
    auto_execute?: boolean;
  }): Promise<{
    total_requested: number;
    queued_count: number;
    skipped_count: number;
    results: any[];
  }> => {
    const res = await apiClient.post('/applications/batch-queue', payload);
    return res.data;
  },
  approveApplication: async (appId: string, autoExecute: boolean = true): Promise<Application> => {
    const res = await apiClient.post(`/applications/${appId}/approve`, { auto_execute: autoExecute });
    return res.data;
  },
  resumeApplication: async (appId: string, userInput?: string): Promise<Application> => {
    const res = await apiClient.post(`/applications/${appId}/resume`, { user_input: userInput });
    return res.data;
  },
  stopApplication: async (appId: string, reason?: string): Promise<Application> => {
    const res = await apiClient.post(`/applications/${appId}/stop`, { reason });
    return res.data;
  },
  reconcileApplication: async (
    appId: string,
    action: 'CONFIRM_SUBMITTED' | 'MARK_NOT_SUBMITTED_AND_RETRY' | 'DISMISS',
    notes?: string
  ): Promise<Application> => {
    const res = await apiClient.post(`/applications/${appId}/reconcile`, { action, notes });
    return res.data;
  },
  retryApplication: async (appId: string): Promise<Application> => {
    const res = await apiClient.post(`/applications/${appId}/retry`);
    return res.data;
  },
};
