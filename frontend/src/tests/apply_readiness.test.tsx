import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const listConnections = vi.fn();
const listResumes = vi.fn();
vi.mock('../services/api', () => ({
  api: { listConnections: (...a: any[]) => listConnections(...a), listResumes: (...a: any[]) => listResumes(...a) },
}));

import { useApplyReadiness } from '../hooks/useApplyReadiness';

describe('useApplyReadiness', () => {
  beforeEach(() => {
    listConnections.mockReset();
    listResumes.mockReset();
  });

  it('reports nothing missing while loading and when ready', async () => {
    listConnections.mockResolvedValue([{ platform: 'linkedin', status: 'CONNECTED' }]);
    listResumes.mockResolvedValue([{ id: 'r1' }]);
    const { result } = renderHook(() => useApplyReadiness());
    expect(result.current.missing).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('reports a missing connection and resume', async () => {
    listConnections.mockResolvedValue([{ platform: 'linkedin', status: 'NOT_CONNECTED' }]);
    listResumes.mockResolvedValue([]);
    const { result } = renderHook(() => useApplyReadiness());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual(['connection', 'resume']);
  });

  it('does not block the user when the lookup fails', async () => {
    listConnections.mockRejectedValue(new Error('network'));
    listResumes.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useApplyReadiness());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });
});
