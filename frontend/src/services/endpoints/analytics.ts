import { apiClient } from '../http';
import type { CampaignPerformanceMetric, FunnelOverview, ResumePerformanceMetric, SkillDemandInsight, SourcePerformanceMetric, WeightTuningRecommendation } from '../../types';

export const analyticsApi = {
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
};
