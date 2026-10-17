import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles,
  Brain,
  Sliders,
  Send,
  Building,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Clock,
  Bookmark,
  XCircle,
  RefreshCw,
  Search,
  BarChart3,
  Check,
  X,
  Target,
  ArrowUpDown,
  Flame,
} from 'lucide-react';
import { api } from '../services/api';
import { MatchResult } from '../types';
import { useJobActions } from '../hooks/useJobActions';
import { useRecordRoute } from '../hooks/useRecordRoute';
import { getMatchScore } from '../utils/matchScores';
import { JobDetailDrawer, matchToDetailModel } from './jobs/JobDetailDrawer';
import { ReadinessBanner } from '../components/ReadinessBanner';

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

  const getDecisionBadge = (decision: string) => {
    switch (decision) {
      case 'AUTO_APPLY':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
          label: 'AUTO-APPLY READY',
          classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30',
        };
      case 'REQUIRE_APPROVAL':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-indigo-500" />,
          label: 'NEEDS REVIEW',
          classes: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30',
        };
      case 'SAVE':
        return {
          icon: <Bookmark className="w-3.5 h-3.5 text-amber-500" />,
          label: 'SAVED MATCH',
          classes: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
        };
      case 'REJECT':
      default:
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-500" />,
          label: 'BELOW THRESHOLD',
          classes: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30',
        };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-600 dark:text-emerald-400 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800/40';
    if (score >= 60) return 'text-indigo-600 dark:text-indigo-400 border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-800/40';
    if (score >= 45) return 'text-amber-600 dark:text-amber-400 border-amber-200 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800/40';
    return 'text-rose-700 dark:text-rose-400 border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/40';
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <ReadinessBanner
        missing={readiness.missing}
        platformLabel="A job platform"
        onNavigate={(tab) => onNavigate?.(tab)}
      />

      {/* Hero Header */}
      <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-white via-indigo-50/20 to-white dark:from-slate-900/90 dark:via-indigo-950/20 dark:to-slate-900/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                AI Job Matches
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Compatibility scoring and skill alignment based on your profile and preferences.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={loadAllMatches}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-xs"
            title="Refresh AI Matches"
          
 aria-label="Refresh AI Matches"
>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={handleEvaluateAll}
            disabled={isEvaluatingAll}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isEvaluatingAll ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running AI Matching...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>Run AI Matching</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Evaluated</div>
            <div className="text-xl font-black text-slate-900 dark:text-white font-mono">{stats.total}</div>
            <div className="text-[10px] text-slate-400">Active Pipeline</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Strong Matches</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{stats.strong}</div>
            <div className="text-[10px] text-slate-400">Score &ge; 60%</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Review Required</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-mono">{stats.review}</div>
            <div className="text-[10px] text-slate-400">Score &ge; 75%</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg Compatibility</div>
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-mono">{stats.avg}%</div>
            <div className="text-[10px] text-slate-400">5-Stage Average</div>
          </div>
        </div>
      </div>

      {/* Filter and Control Toolbar */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by role, company, location, or skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            {searchQuery && (
              <button aria-label="Close"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Min Score Slider with clean pill */}
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <Sliders className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">Min Score:</span>
              <input
                type="range" aria-label="Minimum match score"
                min="0"
                max="90"
                step="5"
                value={minScoreFilter}
                onChange={(e) => setMinScoreFilter(Number(e.target.value))}
                className="w-20 md:w-28 accent-indigo-600 dark:accent-indigo-500 cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 w-8">{minScoreFilter}%</span>
            </div>

            {/* Decision Filter */}
            <select aria-label="Filter by AI decision"
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none shadow-xs"
            >
              <option value="ALL">All Decisions</option>
              <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL (&ge;75%)</option>
              <option value="SAVE">SAVE (60-74%)</option>
              <option value="AUTO_APPLY">AUTO_APPLY (&ge;90%)</option>
              <option value="REJECT">REJECT (&lt;60%)</option>
            </select>

            {/* Sort Filter */}
            <div className="flex items-center space-x-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select aria-label="Sort matches"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent border-none text-xs font-semibold text-slate-800 dark:text-white focus:ring-0 outline-none cursor-pointer"
              >
                <option value="score_desc">Highest Match</option>
                <option value="score_asc">Lowest Match</option>
                <option value="skills">Best Skill Fit</option>
                <option value="semantic">Best Semantic Fit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick threshold presets */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
          <span className="text-slate-400 font-medium">Quick Score Presets:</span>
          {[
            { label: 'All Matches (0%+)', val: 0 },
            { label: 'Moderate Fit (50%+)', val: 50 },
            { label: 'Strong Matches (60%+)', val: 60 },
            { label: 'High Priority (70%+)', val: 70 },
          ].map((preset) => (
            <button
              key={preset.val}
              onClick={() => setMinScoreFilter(preset.val)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                minScoreFilter === preset.val
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-slate-400">
            Showing <span className="font-bold text-slate-700 dark:text-slate-200">{filteredAndSortedMatches.length}</span> of {allMatches.length} positions
          </span>
        </div>
      </div>

      {/* Matches Grid or Empty State */}
      {loading ? (
        <div className="text-center py-24 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">Evaluating &amp; Loading AI Matches...</div>
          <p className="text-xs text-slate-400">Analyzing skills overlap, semantic vectors, and LLM reasoning...</p>
        </div>
      ) : filteredAndSortedMatches.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 shadow-sm space-y-4 max-w-xl mx-auto">
          <div className="p-4 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 w-fit mx-auto">
            <Brain className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {allMatches.length === 0 ? 'No AI Evaluated Matches Yet' : 'No Matches Fit Current Filter'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              {allMatches.length === 0
                ? 'You have discovered jobs ready to be analyzed against your resume. Click below to run the 5-stage AI cascade evaluation.'
                : 'Try adjusting your minimum score slider, clearing the search query, or resetting filters.'}
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            {allMatches.length === 0 ? (
              <button
                onClick={handleEvaluateAll}
                disabled={isEvaluatingAll}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center space-x-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>Run AI Matching</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setMinScoreFilter(0);
                  setDecisionFilter('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-all cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredAndSortedMatches.map((m) => {
            const decisionInfo = getDecisionBadge(m.decision);
            const scoreClass = getScoreColor(getMatchScore(m));

            return (
              <div
                key={m.id}
                className="p-6 rounded-3xl bg-white border border-slate-200/80 hover:border-indigo-300 dark:bg-slate-900/80 dark:border-slate-800 dark:hover:border-indigo-500/40 transition-all flex flex-col justify-between space-y-5 shadow-sm hover:shadow-md group"
              >
                <div className="space-y-4">
                  {/* Card Header: Decision badge + Score */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${decisionInfo.classes}`}
                        >
                          {decisionInfo.icon}
                          <span>{decisionInfo.label}</span>
                        </span>
                      </div>

                      {/* Job Title */}
                      <h2 className="text-base font-bold text-slate-900 dark:text-white truncate pt-1" title={m.job_title || ''}>
                        <button
                          type="button"
                          onClick={() => record.open(m.job_id)}
                          className="text-left hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline cursor-pointer"
                          aria-label={`Open details for ${m.job_title || 'position'}`}
                        >
                        {m.job_title || 'Discovered Position'}
                        </button>
                      </h2>

                      {/* Company & Location & Freshness */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <div className="flex items-center space-x-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[160px] font-semibold text-slate-700 dark:text-slate-300">
                            {m.company || 'Direct Employer'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[140px]">{m.location || 'Remote / Hybrid'}</span>
                        </div>
                        {m.raw_posted_text && (
                          <div className="flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800/40">
                            <Flame className="w-3 h-3 text-amber-500" />
                            <span>{m.raw_posted_text}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Match Score & Recommendation Score Dial */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className={`px-3.5 py-1.5 rounded-2xl border text-xl font-black font-mono shadow-xs ${scoreClass}`}
                      >
                        {getMatchScore(m).toFixed(0)}%
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-1">Match Score</span>
                      {m.recommendation_score !== undefined && m.recommendation_score !== null && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 mt-0.5">
                          Priority {m.recommendation_score.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5-Stage Multi-stage Metrics Strip */}
                  <div className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 text-center">
                    <div className="px-1">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Hard Filters</div>
                      <div className="text-xs font-bold mt-0.5 flex items-center justify-center space-x-1">
                        {m.hard_filter_passed ? (
                          <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center">
                            <Check className="w-3 h-3 mr-0.5" /> Pass
                          </span>
                        ) : (
                          <span className="text-rose-700 dark:text-rose-400 inline-flex items-center">
                            <X className="w-3 h-3 mr-0.5" /> Fail
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Skill Match</div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                        {(m.skill_match_score || 0).toFixed(0)}%
                      </div>
                    </div>

                    <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Semantic Fit</div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                        {(m.semantic_score || 0).toFixed(0)}%
                      </div>
                    </div>

                    <div className="px-1 border-l border-slate-200/60 dark:border-slate-800/60">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">Experience</div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 font-mono">
                        {m.experience_score !== undefined ? `${m.experience_score.toFixed(0)}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* AI Reasoning Summary Callout */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                      <div className="flex items-center space-x-1.5">
                        <Brain className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>AI Match Analysis ({m.ai_provider_used || 'groq'}):</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                      {m.reasoning_summary || 'Evaluated against candidate qualifications, requirements, and domain skills.'}
                    </p>
                    {m.recommendation_reasons && m.recommendation_reasons.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-200/50 dark:border-slate-800/50 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Recommendation Drivers:</span>
                        <ul className="text-[11px] text-slate-600 dark:text-slate-300 list-disc list-inside space-y-0.5">
                          {m.recommendation_reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.blocking_reasons && m.blocking_reasons.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Caution / Disqualifiers:</span>
                        <ul className="text-[11px] text-rose-700 dark:text-rose-400 list-disc list-inside space-y-0.5">
                          {m.blocking_reasons.map((br, i) => (
                            <li key={i}>{br}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Skill Gap & Overlap Analysis */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <span>Skill Alignment:</span>
                      <span className="text-[10px] font-medium font-sans text-slate-500 dark:text-slate-400">
                        {m.matched_skills?.length || 0} Matched · {m.missing_skills?.length || 0} Missing
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {m.matched_skills && m.matched_skills.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/50 inline-flex items-center space-x-1"
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>{s}</span>
                        </span>
                      ))}

                      {m.missing_skills && m.missing_skills.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onNavigate?.('profile')}
                          title="Click to add/update skills in Candidate Profile"
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/80 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 dark:text-rose-300 dark:border-rose-800/40 inline-flex items-center space-x-1 cursor-pointer transition-colors"
                        >
                          <X className="w-2.5 h-2.5" />
                          <span>{s}</span>
                        </button>
                      ))}

                      {(!m.matched_skills || m.matched_skills.length === 0) &&
                        (!m.missing_skills || m.missing_skills.length === 0) && (
                          <span className="text-xs text-slate-400 italic">No explicit skills detected in JD.</span>
                        )}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Active Match'}
                  </div>

                  <div className="flex items-center space-x-2">
                    {m.apply_url && (
                      <a
                        href={m.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl border border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center space-x-1.5 transition-all shadow-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Job Link</span>
                      </a>
                    )}

                    <button
                      onClick={() => handleApplySingle(m.job_id)}
                      disabled={applyingJobId === m.job_id}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center space-x-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{applyingJobId === m.job_id ? 'Applying...' : 'Apply Now'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
