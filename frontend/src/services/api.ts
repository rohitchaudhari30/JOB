import axios from 'axios';
import {
  Application,
  ApplicationStats,
  AutomationRunStatus,
  CandidateProfile,
  Job,
  MatchResult,
  PaginatedApplicationsResponse,
  Resume,
  ScheduleJobConfig,
  User,
  FunnelOverview,
  ResumePerformanceMetric,
  SourcePerformanceMetric,
  SkillDemandInsight,
  WeightTuningRecommendation,
  Campaign,
  CampaignExecution,
  CampaignActivityLog,
  CampaignPacingStatus,
  CampaignPerformanceMetric,
  DashboardOverview,
  TimelineEvent,
} from '../types';

const API_BASE = '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Set bearer and refresh tokens
export const setAuthToken = (token: string | null, refreshToken?: string | null) => {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('auth_token', token);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
  }
};

// Initialize token from storage
const savedToken = localStorage.getItem('auth_token');
if (savedToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// Queue for handling concurrent requests during active refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Industry Standard: Silent Token Refresh Interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/register') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        setAuthToken(null);
        window.dispatchEvent(new Event('auth:expired'));
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(`${API_BASE}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token: newRefreshToken } = refreshResponse.data;
        setAuthToken(access_token, newRefreshToken || refreshToken);
        processQueue(null, access_token);
        originalRequest.headers['Authorization'] = `Bearer ${access_token}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setAuthToken(null);
        window.dispatchEvent(new Event('auth:expired'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ access_token: string; refresh_token?: string }> => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (email: string, password: string, full_name: string): Promise<User & { access_token: string; refresh_token?: string }> => {
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
  downloadResume: async (resumeId: string): Promise<Blob> => {
    const res = await apiClient.get(`/resumes/${resumeId}/download`, {
      responseType: 'blob',
    });
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
  evaluateMatch: async (jobId: string, customWeights?: any): Promise<MatchResult> => {
    const res = await apiClient.post(`/jobs/matches/${jobId}/evaluate`, customWeights || {});
    return res.data;
  },
  evaluateAllMatches: async (limit?: number): Promise<MatchResult[]> => {
    const res = await apiClient.post('/jobs/matches/evaluate-all', null, { params: { limit } });
    return res.data;
  },
  enqueueMatchingBatch: async (limit?: number): Promise<{ status: string; enqueued_count: number; message: string }> => {
    const res = await apiClient.post('/jobs/matches/batch-enqueue', null, { params: { limit } });
    return res.data;
  },
  getPendingMatchingTasksCount: async (): Promise<{ pending_tasks: number }> => {
    const res = await apiClient.get('/jobs/matches/tasks/count');
    return res.data;
  },
  updateMatchingWeights: async (weights: {
    skills_weight: number;
    semantic_weight: number;
    experience_weight: number;
    role_title_weight?: number;
    location_weight?: number;
    auto_apply_threshold?: number;
    approval_threshold?: number;
  }): Promise<{ status: string; message: string; weights: any }> => {
    const res = await apiClient.post('/jobs/matches/weights', weights);
    return res.data;
  },
  getMatchingWeights: async (): Promise<{ weights: any }> => {
    const res = await apiClient.get('/jobs/matches/weights');
    return res.data;
  },

  // Applications
  listApplications: async (state?: string, skip?: number, limit: number = 1000): Promise<Application[]> => {
    const res = await apiClient.get('/applications', { params: { state, skip, limit } });
    if (res.data && Array.isArray(res.data.items)) {
      return res.data.items;
    }
    return Array.isArray(res.data) ? res.data : [];
  },
  listApplicationsPaginated: async (
    params?: { state?: string; page?: number; page_size?: number; skip?: number; limit?: number }
  ): Promise<PaginatedApplicationsResponse> => {
    const res = await apiClient.get('/applications', { params });
    if (Array.isArray(res.data)) {
      return {
        items: res.data,
        total: res.data.length,
        page: 1,
        page_size: res.data.length,
        total_pages: 1,
      };
    }
    return res.data;
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
  createWsTicket: async (): Promise<{ ticket: string; expires_in: number }> => {
    const res = await apiClient.post('/ws/ticket');
    return res.data;
  },
  getRunEvents: async (runId: string, afterSeq?: number): Promise<TimelineEvent[]> => {
    const params: Record<string, any> = {};
    if (afterSeq !== undefined && afterSeq !== null) {
      params.after_seq = afterSeq;
    }
    const res = await apiClient.get(`/automation/runs/${runId}/events`, { params });
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

  // Advanced Strategic Analytics & Decision Support
  getFunnelOverview: async (params?: {
    start_date?: string;
    end_date?: string;
    platform?: string;
    campaign_id?: string;
  }): Promise<FunnelOverview> => {
    const res = await apiClient.get('/analytics/funnel', { params });
    return res.data;
  },
  getResumePerformance: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<ResumePerformanceMetric[]> => {
    const res = await apiClient.get('/analytics/resumes', { params });
    return res.data;
  },
  getSourcePerformance: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<SourcePerformanceMetric[]> => {
    const res = await apiClient.get('/analytics/sources', { params });
    return res.data;
  },
  getCampaignPerformance: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<CampaignPerformanceMetric[]> => {
    const res = await apiClient.get('/analytics/campaigns', { params });
    return res.data;
  },
  getSkillInsights: async (params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<SkillDemandInsight[]> => {
    const res = await apiClient.get('/analytics/skills', { params });
    return res.data;
  },
  getWeightTuning: async (): Promise<WeightTuningRecommendation> => {
    const res = await apiClient.get('/analytics/weights-tuning');
    return res.data;
  },
  getAIStatus: async (): Promise<any> => {
    const res = await apiClient.get('/analytics/ai-status');
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

  // Automation Campaigns & Safety Policies
  listCampaigns: async (): Promise<Campaign[]> => {
    const res = await apiClient.get('/campaigns');
    return res.data;
  },
  getCampaign: async (id: string): Promise<Campaign> => {
    const res = await apiClient.get(`/campaigns/${id}`);
    return res.data;
  },
  createCampaign: async (payload: any): Promise<Campaign> => {
    const res = await apiClient.post('/campaigns', payload);
    return res.data;
  },
  updateCampaign: async (id: string, payload: any): Promise<Campaign> => {
    const res = await apiClient.put(`/campaigns/${id}`, payload);
    return res.data;
  },
  deleteCampaign: async (id: string): Promise<void> => {
    await apiClient.delete(`/campaigns/${id}`);
  },
  startCampaign: async (id: string): Promise<CampaignExecution> => {
    const res = await apiClient.post(`/campaigns/${id}/start`);
    return res.data;
  },
  pauseCampaign: async (id: string): Promise<CampaignExecution> => {
    const res = await apiClient.post(`/campaigns/${id}/pause`);
    return res.data;
  },
  resumeCampaign: async (id: string): Promise<CampaignExecution> => {
    const res = await apiClient.post(`/campaigns/${id}/resume`);
    return res.data;
  },
  stopCampaign: async (id: string): Promise<CampaignExecution> => {
    const res = await apiClient.post(`/campaigns/${id}/stop`);
    return res.data;
  },
  getCampaignPacing: async (id: string): Promise<CampaignPacingStatus> => {
    const res = await apiClient.get(`/campaigns/${id}/pacing`);
    return res.data;
  },
  getCampaignLogs: async (id: string): Promise<CampaignActivityLog[]> => {
    const res = await apiClient.get(`/campaigns/${id}/logs`);
    return res.data;
  },

  // Operational Dashboard Overview (Timezone-Aware)
  getDashboardOverview: async (clientTz?: string): Promise<DashboardOverview> => {
    const tz = clientTz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const res = await apiClient.get('/dashboard/overview', {
      params: { client_tz: tz },
    });
    return res.data;
  },
};


