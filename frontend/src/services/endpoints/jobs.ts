import { apiClient } from '../http';
import type { Job, MatchResult } from '../../types';

export const jobsApi = {
  // Jobs
  listJobs: async (params?: {
    search?: string;
    role?: string;
    min_experience?: number;
    max_experience?: number;
    location?: string;
    source_id?: string;
    posted_within?: string;
    freshness_bucket?: string;
    sort_by?: string;
    skip?: number;
    limit?: number;
  }): Promise<{ items: Job[]; total: number }> => {
    const res = await apiClient.get('/jobs', { params });
    return res.data;
  },
  discoverJobs: async (payload: {
    source_type?: string;
    source_types?: string[];
    roles: string[];
    locations?: string[];
    experience?: number;
    min_experience?: number;
    max_experience?: number;
    skills?: string[];
    resume_id?: string;
    min_salary?: number;
    max_days_posted?: number;
    auto_evaluate?: boolean;
  }): Promise<any> => {
    const res = await apiClient.post('/jobs/discover', payload);
    return res.data;
  },
  deleteJob: async (jobId: string): Promise<{ status: string; job_id: string }> => {
    const res = await apiClient.delete(`/jobs/${jobId}`);
    return res.data;
  },
  clearJobs: async (source_type?: string): Promise<{ status: string; deleted_count: number }> => {
    const res = await apiClient.delete('/jobs', { params: { source_type } });
    return res.data;
  },

  // Matching
  listMatches: async (params?: { min_score?: number; decision?: string }): Promise<MatchResult[]> => {
    const res = await apiClient.get('/jobs/matches', { params });
    return res.data;
  },
  // One page of matches plus the total for the same filters (X-Total-Count), so callers can page (Q-03).
  listMatchesPage: async (params: { min_score?: number; decision?: string; skip?: number; limit?: number }): Promise<{ items: MatchResult[]; total: number }> => {
    const res = await apiClient.get('/jobs/matches', { params });
    const header = Number(res.headers?.['x-total-count']);
    return { items: res.data, total: Number.isFinite(header) ? header : res.data.length };
  },
  evaluateMatch: async (jobId: string, customWeights?: any): Promise<MatchResult> => {
    const res = await apiClient.post(`/jobs/matches/${jobId}/evaluate`, customWeights || {});
    return res.data;
  },
  evaluateAllMatches: async (limit?: number): Promise<MatchResult[]> => {
    const res = await apiClient.post('/jobs/matches/evaluate-all', null, { params: { limit } });
    return res.data;
  },
};
