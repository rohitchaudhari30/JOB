import { useCallback, useState } from 'react';
import { api } from '../../../services/api';
import { usePolling } from '../../../hooks/usePolling';
import type { TailoredResume, TailoringAnswer } from '../../../types/tailoring';
import { pickResumable, toTailorError, WORKING, type TailorError } from './tailorLogic';

/** Drives one tailoring request: start, poll while the server works, then answer / generate / save / discard. */
export function useTailoring(jobId: string) {
  const [item, setItem] = useState<TailoredResume | null>(null);
  const [error, setError] = useState<TailorError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const working = Boolean(item && WORKING.has(item.status));

  const refresh = useCallback(async () => {
    if (!item) return;
    try {
      setItem(await api.getTailored(item.id));
    } catch (e) {
      setError(toTailorError(e));
    }
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  usePolling(refresh, 2000, working);

  const run = useCallback(async (action: () => Promise<TailoredResume | void>, after?: 'clear') => {
    setBusy(true);
    setError(null);
    try {
      const next = await action();
      if (after === 'clear') setItem(null);
      else if (next) setItem(next);
    } catch (e) {
      setError(toTailorError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadExisting = useCallback(async () => {
    setLoadingExisting(true);
    try {
      setItem(pickResumable(await api.listTailoredForJob(jobId)));
    } catch {
      setItem(null);
    } finally {
      setLoadingExisting(false);
    }
  }, [jobId]);

  return {
    item, error, busy, working, loadingExisting, loadExisting,
    clearError: () => setError(null),
    reset: () => { setItem(null); setError(null); },
    start: (masterResumeId?: string, jobDescription?: string) => run(() => api.startTailoring(jobId, masterResumeId, jobDescription)),
    answer: (answers: TailoringAnswer[]) => run(() => api.answerTailoring(item!.id, answers)),
    generate: (ids: string[]) => run(() => api.generateTailored(item!.id, ids)),
    save: () => run(() => api.saveTailored(item!.id)),
    cancel: () => run(() => api.cancelTailored(item!.id)),
    discard: () => run(() => api.discardTailored(item!.id), 'clear'),
  };
}
