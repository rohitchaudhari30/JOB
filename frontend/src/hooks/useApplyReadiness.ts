import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { ReadinessGap } from '../components/ReadinessBanner';

/**
 * Whether the account can actually submit applications: at least one connected
 * platform and at least one resume. Shared by every place that queues jobs so
 * the guard (and its wording) is identical everywhere (redesign §7).
 */
export function useApplyReadiness(enabled = true): {
  loading: boolean;
  missing: ReadinessGap[];
  refresh: () => Promise<void>;
} {
  const [loading, setLoading] = useState(enabled);
  const [anyConnected, setAnyConnected] = useState(true);
  const [hasResume, setHasResume] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [connections, resumes] = await Promise.all([api.listConnections(), api.listResumes()]);
      setAnyConnected((connections || []).some((c: any) => String(c.status).toUpperCase() === 'CONNECTED'));
      setHasResume((resumes || []).length > 0);
    } catch {
      // On failure do not block the user: the server remains the authority.
      setAnyConnected(true);
      setHasResume(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [refresh, enabled]);

  const missing: ReadinessGap[] = loading
    ? []
    : [...(!anyConnected ? (['connection'] as const) : []), ...(!hasResume ? (['resume'] as const) : [])];

  return { loading, missing, refresh };
}
