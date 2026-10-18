import React, { useEffect, useState, useMemo } from 'react';

import { api } from '../services/api';
import { MatchResult } from '../types';
import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { getMatchScore } from '../utils/matchScores';
import { JobDetailDrawer, matchToDetailModel } from './jobs/JobDetailDrawer';
import { ReadinessBanner } from '../components/ReadinessBanner';
import { MatchesHero } from './matches/MatchesHero';
import { MatchesKpis } from './matches/MatchesKpis';
import { MatchesToolbar } from './matches/MatchesToolbar';
import { MatchesGrid } from './matches/MatchesGrid';

interface AIMatchesProps {
  onNavigate?: (tab: any) => void;
}

export const AIMatches: React.FC<AIMatchesProps> = ({ onNavigate }) => {
  const actions = useJobActions({ onNavigate });
  const readiness = actions.readiness;
  const record = useRecordRoute('/jobs/matches', 'matches');
  const [allMatches, setAllMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [decisionFilter, setDecisionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('score_desc');

  useEffect(() => {
    loadAllMatches();
  }, []);

  const loadAllMatches = async () => {
    try {
      setLoading(true);
      // Fetch all matches from backend
      const data = await api.listMatches({ min_score: 0 });
      setAllMatches(data);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setLoading(false);
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
    return { total, autoApply, review, strong, avg };
  }, [allMatches]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <ReadinessBanner
        missing={readiness.missing}
        platformLabel="Your job platform"
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      <MatchesHero loading={loading} isEvaluatingAll={isEvaluatingAll} handleEvaluateAll={handleEvaluateAll} loadAllMatches={loadAllMatches} />

      <MatchesKpis stats={stats} />

      <MatchesToolbar allMatches={allMatches} filteredAndSortedMatches={filteredAndSortedMatches} minScoreFilter={minScoreFilter} setMinScoreFilter={setMinScoreFilter} decisionFilter={decisionFilter} setDecisionFilter={setDecisionFilter} searchQuery={searchQuery} setSearchQuery={setSearchQuery} sortBy={sortBy} setSortBy={setSortBy} />

      <MatchesGrid loading={loading} allMatches={allMatches} filteredAndSortedMatches={filteredAndSortedMatches} isEvaluatingAll={isEvaluatingAll} applyingJobId={applyingJobId} handleEvaluateAll={handleEvaluateAll} handleApplySingle={handleApplySingle} onNavigate={onNavigate} record={record} setDecisionFilter={setDecisionFilter} setMinScoreFilter={setMinScoreFilter} setSearchQuery={setSearchQuery} />

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
