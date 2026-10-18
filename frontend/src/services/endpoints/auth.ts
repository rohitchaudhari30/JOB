import { apiClient } from '../http';
import type { User } from '../../types';

export const authApi = {
  // Auth
  login: async (email: string, password: string): Promise<{ access_token: string; refresh_token?: string }> => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (email: string, password: string, full_name: string): Promise<User & { access_token: string; refresh_token?: string }> => {
    const res = await apiClient.post('/auth/register', { email, password, full_name });
    return res.data;
  },
  // Tell the server to revoke our tokens. Never blocks logging out locally.
  logout: async (): Promise<void> => {
    // Capture both tokens now: callers clear them right after calling us.
    const refreshToken = localStorage.getItem('refresh_token');
    const authHeader = apiClient.defaults.headers.common['Authorization'];
    try {
      await apiClient.post(
        '/auth/logout',
        refreshToken ? { refresh_token: refreshToken } : {},
        authHeader ? { headers: { Authorization: String(authHeader) } } : undefined
      );
    } catch {
      // Offline or already expired: the local sign-out still happens.
    }
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },
};
