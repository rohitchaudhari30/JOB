import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../../services/api';
import type { SavedTailoredSummary } from '../../../types/tailoring';

/** One shared, lazily loaded list of the user's saved tailored resumes, so any card can show its state. */
let items: SavedTailoredSummary[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
let generation = 0; // bumped on clear so a request started before logout cannot repopulate the list
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshSavedTailored(): Promise<void> {
  if (inflight) return inflight;
  const started = generation;
  inflight = Promise.resolve()
    .then(() => api.listSavedTailored())
    .then((rows) => {
      if (started !== generation) return;
      items = rows;
      loaded = true;
      emit();
    })
    .catch(() => {
      /* keep the last known list; the next refresh retries */
    })
    .finally(() => {
      if (started === generation) inflight = null;
    });
  return inflight;
}

/** Forget everything (logout, account deletion, tests) so the next user never sees the previous list. */
export function clearSavedTailored(): void {
  items = [];
  loaded = false;
  inflight = null;
  generation += 1;
  emit();
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
