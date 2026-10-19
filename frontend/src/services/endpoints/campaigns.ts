import { apiClient } from '../http';
import type { Campaign, CampaignActivityLog, CampaignExecution, CampaignPacingStatus } from '../../types';

export const campaignsApi = {
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
  // Starts the campaign and its automation run together on the server (AUT-15).
  launchCampaign: async (id: string, overrides: Record<string, any> = {}): Promise<{ run_id: string; execution: CampaignExecution; status: string }> => {
    const res = await apiClient.post(`/campaigns/${id}/launch`, overrides);
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
};
