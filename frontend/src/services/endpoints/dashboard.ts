import { apiClient } from '../http';
import type { DashboardOverview } from '../../types';

export const dashboardApi = {
  // Operational Dashboard Overview (Timezone-Aware)
  getDashboardOverview: async (clientTz?: string): Promise<DashboardOverview> => {
    const tz = clientTz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const res = await apiClient.get('/dashboard/overview', {
      params: { client_tz: tz },
    });
    return res.data;
  },
};
