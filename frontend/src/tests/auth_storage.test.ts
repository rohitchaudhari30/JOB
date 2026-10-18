import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { apiClient, getAccessToken, restoreSession, setAuthToken } from '../services/http';

describe('SEC-08 token handling', () => {
  beforeEach(() => {
    localStorage.clear();
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it('keeps the access token in memory and writes nothing to storage', () => {
    setAuthToken('abc');
    expect(getAccessToken()).toBe('abc');
    expect(apiClient.defaults.headers.common['Authorization']).toBe('Bearer abc');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('clears the in-memory token and header on sign-out', () => {
    setAuthToken('abc');
    setAuthToken(null);
    expect(getAccessToken()).toBeNull();
    expect(apiClient.defaults.headers.common['Authorization']).toBeUndefined();
  });

  it('restoreSession asks the server (cookie) for a token and never sends a stored one', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'fresh' } });
    expect(await restoreSession()).toBe(true);
    expect(getAccessToken()).toBe('fresh');
    expect(post).toHaveBeenCalledWith('/api/v1/auth/refresh');
  });

  it('restoreSession reports signed-out when there is no valid cookie', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status: 401 } });
    setAuthToken('stale');
    expect(await restoreSession()).toBe(false);
    expect(getAccessToken()).toBeNull();
  });
});
