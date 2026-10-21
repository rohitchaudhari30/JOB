import { authApi } from './endpoints/auth';
import { profileApi } from './endpoints/profile';
import { jobsApi } from './endpoints/jobs';
import { applicationsApi } from './endpoints/applications';
import { automationApi } from './endpoints/automation';
import { analyticsApi } from './endpoints/analytics';
import { campaignsApi } from './endpoints/campaigns';
import { dashboardApi } from './endpoints/dashboard';
import { tailoringApi } from './endpoints/tailoring';
export { apiClient, setAuthToken, restoreSession, getAccessToken } from './http';

/** Every endpoint, grouped by area under ./endpoints. */
export const api = {
  ...authApi,
  ...profileApi,
  ...jobsApi,
  ...applicationsApi,
  ...automationApi,
  ...analyticsApi,
  ...campaignsApi,
  ...dashboardApi,
  ...tailoringApi,
};
