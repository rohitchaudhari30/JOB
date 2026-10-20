import { useCallback, useEffect, useState } from 'react';

/**
 * Deep-linkable "selected record" state backed by the path:
 *   /applications/:id, /jobs/:id, /jobs/matches/:id …
 * Opening/closing uses pushState so Back closes the panel. `reserved` lists
 * child segments that are routes, not ids (e.g. "matches" under /jobs).
 */
export function useRecordRoute(
  basePath: string,
  tab: string,
  reserved: string[] = []
): { id: string | null; open: (id: string) => void; close: () => void } {
  const read = useCallback((): string | null => {
    const prefix = basePath.replace(/\/+$/, '') + '/';
    const path = window.location.pathname;
    if (!path.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    const seg = path.slice(prefix.length).split('/')[0];
    if (!seg || reserved.includes(seg.toLowerCase())) return null;
    return decodeURIComponent(seg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, reserved.join('|')]);

  const [id, setId] = useState<string | null>(read);

  useEffect(() => {
    const onPop = () => setId(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [read]);

  const open = useCallback(
    (next: string) => {
      window.history.pushState({ tab }, '', `${basePath.replace(/\/+$/, '')}/${encodeURIComponent(next)}${window.location.search}`);
      setId(next);
    },
    [basePath, tab]
  );

  const close = useCallback(() => {
    if (read() !== null) window.history.pushState({ tab }, '', basePath + window.location.search);
    setId(null);
  }, [basePath, read, tab]);

  return { id, open, close };
}
