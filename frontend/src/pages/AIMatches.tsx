import React, { useEffect, useState, useMemo } from 'react';

import { api } from '../services/api';
import { MatchResult } from '../types';
import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { getMatchScore } from '../utils/matchScores';
import { JobDetailDrawer, matchToDetailModel } from './jobs/JobDetailDrawer';
import { Button } from '../components/ui/Button';
import { ReadinessBanner } from '../components/ReadinessBanner';
import { MatchesHero } from './matches/MatchesHero';
import { MatchesKpis } from './matches/MatchesKpis';
import { MatchesToolbar } from './matches/MatchesToolbar';
import { MatchesGrid } from './matches/MatchesGrid';
import { SelectionBar } from './jobs/SelectionBar';
import { BulkTailorModal } from './jobs/tailor/BulkTailorModal';
import { useSelectionControl, type JobIdSet, type SetJobIds } from './jobs/useSelectionControl';

const PAGE_SIZE = 100;

interface AIMatchesProps {
  onNavigate?: (tab: any) => void;
  /** "review" = only matches that need the person's decision. */
  lens?: 'matched' | 'review';
  onLensChange?: (lens: 'matched' | 'review') => void;
  /** Shared with the other Jobs lenses so the selection survives switching between them. */
  selectedJobIds?: JobIdSet;
  onSelectedJobIdsChange?: SetJobIds;
}

export const AIMatches: React.FC<AIMatchesProps> = ({
  onNavigate,
  lens = 'matched',
  onLensChange,
  selectedJobIds: selectedFromParent,
  onSelectedJobIdsChange,
}) => {
  const [selectedJobIds, setSelectedJobIds] = useSelectionControl(selectedFromParent, onSelectedJobIdsChange);
  const [queueing, setQueueing] = useState(false);
  const [bulkTailorOpen, setBulkTailorOpen] = useState(false);
  const actions = useJobActions({ onNavigate });
  const readiness = actions.readiness;
  const record = useRecordRoute('/jobs/matches', 'matches');
  const [allMatches, setAllMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [serverTotal, setServerTotal] = useState(0);
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [decisionFilter, setDecisionFilterState] = useState<string>(lens === 'review' ? 'REQUIRE_APPROVAL' : 'ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('score_desc');

  useEffect(() => {
    loadAllMatches();
  }, []);

  // The lens and the fit filter are two views of the same choice: "Needs review" is the
  // REQUIRE_APPROVAL fit. Changing either one keeps the other (and the URL) in step.
  useEffect(() => {
    setDecisionFilterState((cur) => {
      if (lens === 'review') return 'REQUIRE_APPROVAL';
      return cur === 'REQUIRE_APPROVAL' ? 'ALL' : cur;
    });
  }, [lens]);

  const setDecisionFilter = (value: string) => {
    setDecisionFilterState(value);
    if (value === 'REQUIRE_APPROVAL' && lens !== 'review') onLensChange?.('review');
    else if (value !== 'REQUIRE_APPROVAL' && lens === 'review') onLensChange?.('matched');
  };

  const toggleSelect = (jobId: string) =>
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

  const handleQueueSelected = async () => {
    const ids = [...selectedJobIds];
    if (ids.length === 0) return;
    setQueueing(true);
    try {
      const result = await actions.queueJobs(ids, 'AI_MATCHES');
      if (result && result.queued_count > 0) {
        setSelectedJobIds(new Set());
        if (onNavigate) setTimeout(() => onNavigate('applications'), 600);
      }
    } finally {
      setQueueing(false);
    }
  };

  const loadAllMatches = async () => {
    try {
      setLoading(true);
      // First page, best score first; the rest comes with "Load more" (Q-03).
      const page = await api.listMatchesPage({ min_score: 0, skip: 0, limit: PAGE_SIZE });
      setAllMatches(page.items);
      setServerTotal(page.total);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    try {
      setLoadingMore(true);
      const page = await api.listMatchesPage({ min_score: 0, skip: allMatches.length, limit: PAGE_SIZE });
      // Matches can be re-evaluated between pages: never show the same job twice.
      setAllMatches((prev) => {
        const have = new Set(prev.map((m) => m.job_id));
        return [...prev, ...page.items.filter((m) => !have.has(m.job_id))];
      });
      setServerTotal(page.total);
    } catch (e) {
      console.error('Failed to load more matches:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleEvaluateAll = async () => {
    const results = await actions.evaluateAll(50);
    if (results) await loadAllMatches();
  };

  const handleEvaluateOne = async (jobId: string) => {
    const res = await actions.evaluateJob(jobId);
    if (res) await loadAllMatches();
  };

  const handleApplySingle = async (jobId: string) => {
    const result = await actions.queueJobs([jobId], 'AI_MATCHES');
    if (result && result.queued_count > 0 && onNavigate) {
      setTimeout(() => onNavigate('applications'), 600);
    }
  };

  const isEvaluatingAll = actions.isEvaluatingAll;
  const applyingJobId = [...actions.queueingIds][0] ?? null;

  const drawerModel = matchToDetailModel(record.id ? allMatches.find((m) => m.job_id === record.id) : undefined);

  // Client-side instant filter and sort for butter-smooth responsiveness
  const filteredAndSortedMatches = useMemo(() => {
    let result = [...allMatches];

    // Filter by min score
    if (minScoreFilter > 0) {
      result = result.filter((m) => getMatchScore(m) >= minScoreFilter);
    }

    // Filter by decision
    if (decisionFilter !== 'ALL') {
      result = result.filter((m) => m.decision === decisionFilter);
    }

    // Filter by text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((m) => {
        const title = (m.job_title || '').toLowerCase();
        const company = (m.company || '').toLowerCase();
        const location = (m.location || '').toLowerCase();
        const skills = [...(m.matched_skills || []), ...(m.missing_skills || [])].join(' ').toLowerCase();
        return title.includes(q) || company.includes(q) || location.includes(q) || skills.includes(q);
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'score_desc') return getMatchScore(b) - getMatchScore(a);
      if (sortBy === 'score_asc') return getMatchScore(a) - getMatchScore(b);
      if (sortBy === 'skills') return (b.skill_match_score || 0) - (a.skill_match_score || 0);
      if (sortBy === 'semantic') return (b.semantic_score || 0) - (a.semantic_score || 0);
      return 0;
    });

    return result;
  }, [allMatches, minScoreFilter, decisionFilter, searchQuery, sortBy]);

  // Aggregate stats across all matches
  const stats = useMemo(() => {
    const total = allMatches.length;
    const autoApply = allMatches.filter((m) => m.decision === 'AUTO_APPLY').length;
    const review = allMatches.filter((m) => m.decision === 'REQUIRE_APPROVAL').length;
    const strong = allMatches.filter((m) => getMatchScore(m) >= 60).length;
    const avg = total > 0 ? Math.round(allMatches.reduce((acc, m) => acc + getMatchScore(m), 0) / total) : 0;
    return { total: Math.max(total, serverTotal), autoApply, review, strong, avg };
  }, [allMatches, serverTotal]);

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      <ReadinessBanner
        missing={readiness.missing}
        platformLabel="Your job platform"
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      <MatchesHero loading={loading} isEvaluatingAll={isEvaluatingAll} handleEvaluateAll={handleEvaluateAll} loadAllMatches={loadAllMatches} />

      <MatchesKpis stats={stats} />

      <MatchesToolbar allMatches={allMatches} filteredAndSortedMatches={filteredAndSortedMatches} minScoreFilter={minScoreFilter} setMinScoreFilter={setMinScoreFilter} decisionFilter={decisionFilter} setDecisionFilter={setDecisionFilter} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy} />

      <MatchesGrid loading={loading} allMatches={allMatches} filteredAndSortedMatches={filteredAndSortedMatches} isEvaluatingAll={isEvaluatingAll} applyingJobId={applyingJobId} handleEvaluateAll={handleEvaluateAll} handleApplySingle={handleApplySingle} onNavigate={onNavigate} record={record} selectedJobIds={selectedJobIds} onToggleSelect={toggleSelect} setDecisionFilter={setDecisionFilter} setMinScoreFilter={setMinScoreFilter} setSearchQuery={setSearchQuery} />

      {allMatches.length < serverTotal && (
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
            Showing {allMatches.length} of {serverTotal} matches, best first. Filters and search apply to the matches shown.
          </p>
          <Button variant="secondary" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}

      <SelectionBar
        defaultResume={undefined}
        handleLaunchQueue={handleQueueSelected}
        isStartingQueue={queueing}
        selectedCount={selectedJobIds.size}
        setSelectedJobIds={setSelectedJobIds}
        onBulkTailor={() => setBulkTailorOpen(true)}
      />

      <BulkTailorModal
        open={bulkTailorOpen}
        onClose={() => setBulkTailorOpen(false)}
        jobIds={Array.from(selectedJobIds)}
        jobs={allMatches.map((m) => m.job).filter(Boolean) as any}
        onInspectJob={(id) => record.open(id)}
      />

      <JobDetailDrawer
        model={drawerModel}
        onClose={record.close}
        onEvaluate={handleEvaluateOne}
        onQueue={(id) => void handleApplySingle(id)}
        evaluating={actions.evaluatingIds.has(record.id ?? '')}
        queueing={actions.queueingIds.has(record.id ?? '')}
      />
    </div>
  );
};
