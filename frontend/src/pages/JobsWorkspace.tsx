import React, { useCallback, useEffect, useState } from 'react';
import { JobDiscovery } from './JobDiscovery';
import { AIMatches } from './AIMatches';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import type { AutomationRunStatus } from '../types';

export type JobsLens = 'all' | 'matched' | 'review';

const LENSES = [
  { id: 'all', label: 'All discovered' },
  { id: 'matched', label: 'Matched' },
  { id: 'review', label: 'Needs review' },
];

const DESCRIPTIONS: Record<JobsLens, string> = {
  all: 'Every job found so far, newest first. Find new jobs, then queue the ones you want to apply to.',
  matched: 'Jobs scored against your profile, best fit first. Select the ones you want to queue.',
  review: "Jobs the AI isn't sure about. Check each one and decide whether to queue it.",
};

/** Reads the lens from the address bar: /jobs is "all"; /jobs/matches is "matched" or, with ?lens=review, "review". */
export function readLens(tab: 'discovery' | 'matches', search = window.location.search): JobsLens {
  if (tab === 'discovery') return 'all';
  return new URLSearchParams(search).get('lens') === 'review' ? 'review' : 'matched';
}

interface Props {
  tab: 'discovery' | 'matches';
  activeRun?: AutomationRunStatus | null;
  onRefreshStatus?: () => void;
  onNavigate?: (tab: any) => void;
}

/**
 * One Jobs page. "All discovered", "Matched" and "Needs review" are lenses on the same jobs, so
 * the page, the selection and the Queue action stay the same while the view changes. Each lens
 * keeps its own URL (/jobs, /jobs/matches, /jobs/matches?lens=review) so old links still work.
 */
export const JobsWorkspace: React.FC<Props> = ({ tab, activeRun = null, onRefreshStatus, onNavigate }) => {
  const [lens, setLens] = useState<JobsLens>(() => readLens(tab));
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  // Follow the address bar (Back/Forward, deep links, the tab chosen elsewhere in the app).
  useEffect(() => {
    const sync = () => setLens(readLens(tab));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [tab]);

  const changeLens = useCallback(
    (next: JobsLens) => {
      if (next === lens) return;
      if (next === 'all') {
        onNavigate?.('discovery');
        return;
      }
      const path = next === 'review' ? '/jobs/matches?lens=review' : '/jobs/matches';
      window.history.pushState({ tab: 'matches' }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    [lens, onNavigate],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Jobs" description={DESCRIPTIONS[lens]} />
      <Tabs
        items={LENSES}
        value={lens}
        onChange={(id) => changeLens(id as JobsLens)}
        label="Jobs view"
        idPrefix="jobs-lens"
      />
      <TabPanel idPrefix="jobs-lens" id={lens} active>
        {lens === 'all' ? (
          <JobDiscovery
            activeRun={activeRun}
            onRefreshStatus={onRefreshStatus}
            onNavigate={onNavigate}
            selectedJobIds={selectedJobIds}
            onSelectedJobIdsChange={setSelectedJobIds}
          />
        ) : (
          <AIMatches
            onNavigate={onNavigate}
            lens={lens}
            onLensChange={changeLens}
            selectedJobIds={selectedJobIds}
            onSelectedJobIdsChange={setSelectedJobIds}
          />
        )}
      </TabPanel>
    </div>
  );
};
