import { useState, type Dispatch, type SetStateAction } from 'react';

export type JobIdSet = Set<string>;
export type SetJobIds = Dispatch<SetStateAction<JobIdSet>>;

/**
 * The Jobs page keeps one selection that survives switching between lenses. Pages receive it
 * from the workspace; rendered on their own (tests, future reuse) they fall back to local state.
 */
export function useSelectionControl(ids?: JobIdSet, setIds?: SetJobIds): [JobIdSet, SetJobIds] {
  const [own, setOwn] = useState<JobIdSet>(new Set());
  return ids && setIds ? [ids, setIds] : [own, setOwn];
}
