import { useCallback, useEffect, useState } from 'react';

function readParam(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

/**
 * String state mirrored into the URL query (?key=value) so filters survive
 * reload, back/forward and sharing. Uses replaceState (no history spam); the
 * param is removed when the value equals the default.
 */
export function useQueryParam(key: string, fallback = ''): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => readParam(key, fallback));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const current = params.get(key);
    if (value === fallback) {
      if (current === null) return;
      params.delete(key);
    } else {
      if (current === value) return;
      params.set(key, value);
    }
    const qs = params.toString();
    window.history.replaceState(window.history.state, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [key, value, fallback]);

  useEffect(() => {
    const onPop = () => setValue(readParam(key, fallback));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [key, fallback]);

  const set = useCallback((v: string) => setValue(v), []);
  return [value, set];
}
