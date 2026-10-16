import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { wsClient } from '../services/ws';
import { AutomationRunStatus } from '../types';
import { usePolling } from './usePolling';

export const ACTIVE_POLL_MS = 5000;
export const IDLE_POLL_MS = 30000;
const WS_DEBOUNCE_MS = 400;

/**
 * Single source of truth for the active automation run.
 *
 * - Polls fast (5 s) only while a run is RUNNING/PAUSED, slowly (30 s) when idle,
 *   and not at all while the tab is hidden.
 * - Any WebSocket message that carries a run id or state triggers a debounced
 *   refresh, so state changes show up without waiting for the next poll.
 *
 * Replaces the fixed 5 s poller that lived in App.tsx.
 */
export function useActiveRun(enabled: boolean): {
  activeRun: AutomationRunStatus | null;
  refresh: () => Promise<void>;
} {
  const [activeRun, setActiveRun] = useState<AutomationRunStatus | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const run = await api.getActiveRun();
      if (mounted.current) setActiveRun(run);
    } catch {
      // unauthenticated or transient network error: keep last known state
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setActiveRun(null);
      return;
    }
    void refresh();
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = wsClient.onMessage((msg) => {
      if (!msg.run_id && !msg.state && !msg.status) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => void refresh(), WS_DEBOUNCE_MS);
    });
    return () => {
      if (t) clearTimeout(t);
      unsubscribe?.();
    };
  }, [enabled, refresh]);

  const busy = activeRun?.status === 'RUNNING' || activeRun?.status === 'PAUSED';
  usePolling(() => void refresh(), busy ? ACTIVE_POLL_MS : IDLE_POLL_MS, enabled);

  return { activeRun, refresh };
}
