import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../../services/api';
import type { SavedTailoredSummary } from '../../../types/tailoring';

/** One shared, lazily loaded list of the user's saved tailored resumes, so any card can show its state. */
let items: SavedTailoredSummary[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshSavedTailored(): Promise<void> {
  if (inflight) return inflight;
  inflight = Promise.resolve()
    .then(() => api.listSavedTailored())
    .then((rows) => {
      items = rows;
      loaded = true;
      emit();
    })
    .catch(() => {
      /* keep the last known list; the next refresh retries */
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetSavedTailoredForTests(): void {
  items = [];
  loaded = false;
  inflight = null;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;

export function useSavedTailored(): SavedTailoredSummary[] {
  useEffect(() => {
    if (!loaded) void refreshSavedTailored();
  }, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useHasSavedTailored(jobId: string): boolean {
  return useSavedTailored().some((i) => i.job_id === jobId);
}
