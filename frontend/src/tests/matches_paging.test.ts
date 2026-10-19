import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient } from '../services/http';
import { jobsApi } from '../services/endpoints/jobs';

afterEach(() => vi.restoreAllMocks());

describe('listMatchesPage (Q-03)', () => {
  it('returns the page and the server total from X-Total-Count', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ job_id: 'a' }], headers: { 'x-total-count': '312' } } as any);
    const page = await jobsApi.listMatchesPage({ skip: 100, limit: 100 });
    expect(page).toEqual({ items: [{ job_id: 'a' }], total: 312 });
    expect(get).toHaveBeenCalledWith('/jobs/matches', { params: { skip: 100, limit: 100 } });
  });

  it('falls back to the page size when the header is missing', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [{ job_id: 'a' }, { job_id: 'b' }], headers: {} } as any);
    expect((await jobsApi.listMatchesPage({})).total).toBe(2);
  });
});
