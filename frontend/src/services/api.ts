import axios from 'axios';
import {
  Application,
  ApplicationStats,
  AutomationRunStatus,
  CandidateProfile,
  Job,
  MatchResult,
  Resume,
  ScheduleJobConfig,
  User,
  FunnelOverview,
  ResumePerformanceMetric,
  SourcePerformanceMetric,
  SkillDemandInsight,
  WeightTuningRecommendation,
} from '../types';

const API_BASE = '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Set bearer token
export const setAuthToken = (token: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
  }
};

// Initialize token from storage
const savedToken = localStorage.getItem('auth_token');
if (savedToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ access_token: string }> => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (email: string, password: string, full_name: string): Promise<User & { access_token: string }> => {
    const res = await apiClient.post('/auth/register', { email, password, full_name });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  // Candidate Profile
  getProfile: async (): Promise<CandidateProfile> => {
    const res = await apiClient.get('/profile');
    return res.data;
  },
  updateProfile: async (profile: Partial<CandidateProfile>): Promise<CandidateProfile> => {
    const res = await apiClient.put('/profile', profile);
    return res.data;
  },
  listSavedAnswers: async (): Promise<any[]> => {
    const res = await apiClient.get('/profile/saved-answers');
    return res.data;
  },
  saveSavedAnswer: async (answer: { canonical_intent: string; question_pattern: string; answer_text: string }): Promise<any> => {
    const res = await apiClient.post('/profile/saved-answers', answer);
    return res.data;
  },

  // Resumes
  listResumes: async (): Promise<Resume[]> => {
    const res = await apiClient.get('/resumes');
    return res.data;
  },
  uploadResume: async (formData: FormData): Promise<Resume> => {
    const res = await apiClient.post('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  deleteResume: async (resumeId: string): Promise<void> => {
    await apiClient.delete(`/resumes/${resumeId}`);
  },
  setDefaultResume: async (resumeId: string): Promise<Resume> => {
    const res = await apiClient.post(`/resumes/${resumeId}/set-default`);
    return res.data;
  },

  // Jobs
  listJobs: async (params?: {
    search?: string;
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
    source_type: string;
    roles: string[];
    locations?: string[];
    experience?: number;
    min_experience?: number;
    max_experience?: number;
    min_salary?: number;
    max_days_posted?: number;
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
  evaluateMatch: async (jobId: string, customWeights?: any): Promise<MatchResult> => {
    const res = await apiClient.post(`/jobs/matches/${jobId}/evaluate`, customWeights || {});
    return res.data;
  },
  evaluateAllMatches: async (limit?: number): Promise<MatchResult[]> => {
    const res = await apiClient.post('/jobs/matches/evaluate-all', null, { params: { limit } });
    return res.data;
  },

  // Applications
  listApplications: async (state?: string): Promise<Application[]> => {
    const res = await apiClient.get('/applications', { params: { state } });
    return res.data;
  },
  getApplicationStats: async (): Promise<ApplicationStats> => {
    const res = await apiClient.get('/applications/stats');
    return res.data;
  },
  createApplication: async (job_id: string, resume_id?: string): Promise<Application> => {
    const res = await apiClient.post('/applications', { job_id, resume_id });
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

  // Automation & Schedules
  startAutomation: async (payload: any): Promise<AutomationRunStatus> => {
    const res = await apiClient.post('/automation/start', payload);
    return res.data;
  },
  getActiveRun: async (): Promise<AutomationRunStatus | null> => {
    const res = await apiClient.get('/automation/active');
    return res.data;
  },
  getRunStatus: async (runId: string): Promise<AutomationRunStatus> => {
    const res = await apiClient.get(`/automation/runs/${runId}`);
    return res.data;
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
  listSchedules: async (): Promise<ScheduleJobConfig[]> => {
    const res = await apiClient.get('/automation/schedules');
    return res.data;
  },
  createSchedule: async (payload: any): Promise<ScheduleJobConfig> => {
    const res = await apiClient.post('/automation/schedules', payload);
    return res.data;
  },
  deleteSchedule: async (scheduleId: string): Promise<void> => {
    await apiClient.delete(`/automation/schedules/${scheduleId}`);
  },

  // Phase 8: Advanced Analytics & Learning
  getFunnelOverview: async (): Promise<FunnelOverview> => {
    const res = await apiClient.get('/analytics/funnel');
    return res.data;
  },
  getResumePerformance: async (): Promise<ResumePerformanceMetric[]> => {
    const res = await apiClient.get('/analytics/resumes');
    return res.data;
  },
  getSourcePerformance: async (): Promise<SourcePerformanceMetric[]> => {
    const res = await apiClient.get('/analytics/sources');
    return res.data;
  },
  getSkillInsights: async (): Promise<SkillDemandInsight[]> => {
    const res = await apiClient.get('/analytics/skills');
    return res.data;
  },
  getWeightTuning: async (): Promise<WeightTuningRecommendation> => {
    const res = await apiClient.get('/analytics/weights-tuning');
    return res.data;
  },

  // Platform Connections & Sessions
  listConnections: async (): Promise<any[]> => {
    const res = await apiClient.get('/connections');
    return res.data;
  },
  connectPlatform: async (platform: string): Promise<any> => {
    const res = await apiClient.post(`/connections/${platform}/connect`);
    return res.data;
  },
  verifyPlatform: async (platform: string): Promise<{ is_valid: boolean; status: string }> => {
    const res = await apiClient.post(`/connections/${platform}/verify`);
    return res.data;
  },
  disconnectPlatform: async (platform: string): Promise<any> => {
    const res = await apiClient.post(`/connections/${platform}/disconnect`);
    return res.data;
  },
};

