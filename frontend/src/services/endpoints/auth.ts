import { apiClient } from '../http';
import type { User } from '../../types';

export const authApi = {
  // Auth
  login: async (email: string, password: string): Promise<{ access_token: string }> => {
    const res = await apiClient.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (email: string, password: string, full_name: string): Promise<User & { access_token: string }> => {
    const res = await apiClient.post('/auth/register', { email, password, full_name });
    return res.data;
  },
  // Tell the server to revoke our tokens and clear the cookie. Never blocks logging out locally.
  logout: async (): Promise<void> => {
    // Capture the header now: callers clear the token right after calling us.
    const authHeader = apiClient.defaults.headers.common['Authorization'];
    try {
      await apiClient.post('/auth/logout', {}, authHeader ? { headers: { Authorization: String(authHeader) } } : undefined);
    } catch {
      // Offline or already expired: the local sign-out still happens.
    }
  },
  changePassword: async (current_password: string, new_password: string): Promise<{ access_token: string }> => {
    const res = await apiClient.post('/auth/change-password', { current_password, new_password });
    return res.data;
  },
  // Raw JSON text of everything stored about the user (credentials and file paths excluded by the server).
  exportMyData: async (): Promise<Blob> => {
    const res = await apiClient.get('/auth/me/export', { responseType: 'blob' });
    return res.data;
  },
  deleteAccount: async (password: string): Promise<void> => {
    await apiClient.delete('/auth/me', { data: { password } });
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },
};
