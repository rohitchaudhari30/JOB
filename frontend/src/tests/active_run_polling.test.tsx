import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getActiveRun = vi.fn();
let wsListener: ((m: any) => void) | null = null;

vi.mock('../services/api', () => ({ api: { getActiveRun: (...a: any[]) => getActiveRun(...a) } }));
vi.mock('../services/ws', () => ({
  wsClient: {
    onMessage: (l: (m: any) => void) => {
      wsListener = l;
      return () => {
        wsListener = null;
      };
    },
  },
}));

import { useActiveRun, ACTIVE_POLL_MS, IDLE_POLL_MS } from '../hooks/useActiveRun';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useActiveRun (single run-state poller)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getActiveRun.mockReset();
    setVisibility('visible');
  });
  afterEach(() => vi.useRealTimers());

  it('does nothing when disabled', async () => {
    renderHook(() => useActiveRun(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(getActiveRun).not.toHaveBeenCalled();
  });

  it('polls slowly while idle', async () => {
    getActiveRun.mockResolvedValue({ status: 'IDLE' });
    renderHook(() => useActiveRun(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getActiveRun).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_POLL_MS * 2);
    });
    expect(getActiveRun).toHaveBeenCalledTimes(3);
  });

  it('polls fast only while a run is active', async () => {
    getActiveRun.mockResolvedValue({ status: 'RUNNING', run_id: 'r1' });
    const { result } = renderHook(() => useActiveRun(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.activeRun?.status).toBe('RUNNING');
    getActiveRun.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS * 3);
    });
    expect(getActiveRun.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('stops polling while the tab is hidden and refreshes on return', async () => {
    getActiveRun.mockResolvedValue({ status: 'IDLE' });
    renderHook(() => useActiveRun(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    getActiveRun.mockClear();
    act(() => setVisibility('hidden'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_POLL_MS * 4);
    });
    expect(getActiveRun).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(getActiveRun).toHaveBeenCalledTimes(1);
  });

  it('refreshes (debounced) when a websocket message carries run state', async () => {
    getActiveRun.mockResolvedValue({ status: 'IDLE' });
    renderHook(() => useActiveRun(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    getActiveRun.mockClear();
    act(() => {
      wsListener?.({ type: 'x' }); // ignored: no run info
      wsListener?.({ type: 'state', run_id: 'r1', state: 'PAUSED' });
      wsListener?.({ type: 'state', run_id: 'r1', state: 'PAUSED' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getActiveRun).toHaveBeenCalledTimes(1);
  });
});
