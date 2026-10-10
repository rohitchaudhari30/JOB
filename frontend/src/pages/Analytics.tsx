import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Layers,
  FileText,
  Sliders,
  Sparkles,
  CheckCircle2,
  RefreshCw,
  Award,
  Flame,
  Calendar,
  Filter,
  Globe,
  Target,
  ArrowUpRight,
  Cpu,
  Check,
  ChevronRight,
  Info,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api';
import {
  FunnelOverview,
  ResumePerformanceMetric,
  SourcePerformanceMetric,
  CampaignPerformanceMetric,
  SkillDemandInsight,
  WeightTuningRecommendation,
} from '../types';
import { useToast } from '../context/ToastContext';

interface AnalyticsProps {
  onNavigate?: (tab: any) => void;
}

type DateRangePreset = 'TODAY' | '7D' | '30D' | '90D' | 'CUSTOM' | 'ALL_TIME';

export const Analytics: React.FC<AnalyticsProps> = ({ onNavigate }) => {
  const { showError } = useToast();

  const [datePreset, setDatePreset] = useState<DateRangePreset>('30D');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  const [funnel, setFunnel] = useState<FunnelOverview | null>(null);
  const [resumes, setResumes] = useState<ResumePerformanceMetric[]>([]);
  const [sources, setSources] = useState<SourcePerformanceMetric[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignPerformanceMetric[]>([]);
  const [skills, setSkills] = useState<SkillDemandInsight[]>([]);
  const [weightTuning, setWeightTuning] = useState<WeightTuningRecommendation | null>(null);
  const [aiStatus, setAiStatus] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Compute timezone-aware date boundaries
  const dateParams = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = now;

    if (datePreset === 'TODAY') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (datePreset === '7D') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (datePreset === '30D') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (datePreset === '90D') {
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (datePreset === 'CUSTOM') {
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) end = new Date(customEndDate);
    } else if (datePreset === 'ALL_TIME') {
      start = null;
      end = null;
    }

    return {
      start_date: start ? start.toISOString() : undefined,
      end_date: end ? end.toISOString() : undefined,
    };
  }, [datePreset, customStartDate, customEndDate]);

  const fetchAnalyticsData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const queryParams = {
          start_date: dateParams.start_date,
          end_date: dateParams.end_date,
          platform: selectedPlatform !== 'ALL' ? selectedPlatform.toLowerCase() : undefined,
        };

        const [fData, rData, sData, cData, skData, wData, aiData] = await Promise.all([
          api.getFunnelOverview(queryParams).catch(() => null),
          api.getResumePerformance({ start_date: queryParams.start_date, end_date: queryParams.end_date }).catch(() => []),
          api.getSourcePerformance({ start_date: queryParams.start_date, end_date: queryParams.end_date }).catch(() => []),
          api.getCampaignPerformance({ start_date: queryParams.start_date, end_date: queryParams.end_date }).catch(() => []),
          api.getSkillInsights({ start_date: queryParams.start_date, end_date: queryParams.end_date }).catch(() => []),
          api.getWeightTuning().catch(() => null),
          api.getAIStatus().catch(() => null),
        ]);

        if (fData) setFunnel(fData);
        setResumes(rData || []);
        setSources(sData || []);
        setCampaigns(cData || []);
        setSkills(skData || []);
        setWeightTuning(wData);
        setAiStatus(aiData);
      } catch (e: any) {
        console.error('Failed to load analytics data:', e);
        showError('Unable to load analytics telemetry.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateParams, selectedPlatform, showError]
  );

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Observational resume variant with highest observed interview rate (safe terminology)
  const highestInterviewResume = useMemo(() => {
    if (!resumes || resumes.length === 0) return null;
    return [...resumes].sort(
      (a, b) => (b.interview_rate_pct ?? b.conversion_rate_pct) - (a.interview_rate_pct ?? a.conversion_rate_pct)
    )[0];
  }, [resumes]);

  return (
    <div className="space-y-8 animate-fadeIn pb-16">
      {/* 1. Header & Date Range Selection Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Analytics &amp; Strategy
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Decision Workspace
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Historical funnel conversion, resume variant comparison, platform attribution, and matching optimization.
              </p>
            </div>
          </div>
        </div>

        {/* Date Presets & Platform Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shadow-xs">
            {(
              [
                { id: 'TODAY', label: 'Today' },
                { id: '7D', label: '7D' },
                { id: '30D', label: '30D' },
                { id: '90D', label: '90D' },
                { id: 'CUSTOM', label: 'Custom' },
                { id: 'ALL_TIME', label: 'All Time' },
              ] as { id: DateRangePreset; label: string }[]
            ).map((preset) => (
              <button
                key={preset.id}
                onClick={() => setDatePreset(preset.id)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Platform Filter Dropdown */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="bg-transparent outline-none cursor-pointer text-xs font-semibold"
            >
              <option value="ALL">All Platforms</option>
              <option value="NAUKRI">Naukri.com</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="DIRECT">Direct ATS</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchAnalyticsData(true)}
            disabled={refreshing || loading}
            title="Refresh Analytics Telemetry"
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Range Picker Fields (if CUSTOM selected) */}
      {datePreset === 'CUSTOM' && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span className="font-bold text-slate-700 dark:text-slate-300">Custom Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">From:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-medium">To:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs text-slate-800 dark:text-white outline-none"
            />
          </div>
        </div>
      )}

      {/* 2. Executive KPI Cards: Separate Response, Interview, and Offer Rates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Confirmed Submissions */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Confirmed Submissions</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-black font-mono text-slate-900 dark:text-white">
            {funnel?.total_submitted ?? funnel?.total_applied ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {funnel && (funnel.total_triggered ?? funnel.total_applied ?? 0) > 0
              ? `${(funnel.submission_rate_pct ?? 100).toFixed(1)}% of triggered applications confirmed`
              : 'Verified form submissions'}
          </p>
        </div>

        {/* Employer Response Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Employer Response Rate</span>
            <Globe className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
            {(funnel?.response_rate_pct ?? 0).toFixed(1)}%
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {funnel?.total_responded ?? 0} recruiter responses &amp; follow-ups
          </p>
        </div>

        {/* Interview Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Interview Rate</span>
            <Award className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-black font-mono text-purple-600 dark:text-purple-400">
            {(funnel?.interview_rate_pct ?? 0).toFixed(1)}%
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {funnel?.total_interviewed ?? 0} screening &amp; technical rounds scheduled
          </p>
        </div>

        {/* Offer Rate */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Offer Rate</span>
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {(funnel?.offer_rate_pct ?? 0).toFixed(1)}%
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {funnel?.total_offered ?? 0} formal job offers received
          </p>
        </div>
      </div>

      {/* 3. The Complete 7-Stage Conversion Funnel */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Full Conversion Funnel (7 Stages)</span>
            </h2>
            <p className="text-xs text-slate-500">
              End-to-end drop-off progression from discovery to confirmed job offers.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">Telemetry Flow</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {funnel?.stages && funnel.stages.length > 0 ? (
            funnel.stages.map((stage, idx) => {
              const targetTab =
                stage.stage_name === 'Discovered'
                  ? 'discovery'
                  : stage.stage_name === 'AI Matched'
                  ? 'matches'
                  : 'crm';

              return (
                <div
                  key={stage.stage_name}
                  onClick={() => onNavigate?.(targetTab)}
                  className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 hover:border-indigo-400 dark:bg-slate-800/40 dark:border-slate-800 dark:hover:border-indigo-500/60 flex flex-col justify-between transition-all cursor-pointer group shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Stage {idx + 1}
                      </span>
                      <ArrowUpRight className="w-3 h-3 text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {stage.stage_name}
                    </h3>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-xl font-black text-indigo-600 dark:text-indigo-300 font-mono">
                      {stage.count}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {stage.conversion_rate_pct.toFixed(1)}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(stage.conversion_rate_pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-7 p-6 text-center text-xs text-slate-400">
              No conversion stage activity recorded in this date range.
            </div>
          )}
        </div>
      </div>

      {/* 4. Side-by-Side: Resume Performance Comparison & Platform Performance Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 4A: Resume Performance Comparison (Strict Observational Terminology) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Resume Performance Comparison</span>
              </h2>
              <p className="text-xs text-slate-500">
                Observational interview callback rates with sample sizes (non-experimental).
              </p>
            </div>
            {highestInterviewResume && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-500" />
                <span>Highest Observed Interview Rate</span>
              </span>
            )}
          </div>

          <div className="space-y-3 pt-1">
            {resumes.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
                Upload role-specific resumes in the Profile tab to observe comparative interview conversion rates.
              </div>
            ) : (
              resumes.map((r) => (
                <div
                  key={r.resume_id}
                  className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.label}</h4>
                      {highestInterviewResume?.resume_id === r.resume_id && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Best Observed Outcome
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Target Role: <strong>{r.target_role}</strong> • Sample Size: <strong>{r.applications_count} submissions</strong>
                    </p>
                    <div className="text-[11px] text-slate-500 flex items-center gap-3 pt-0.5">
                      <span>{r.response_count ?? 0} responses</span>
                      <span>•</span>
                      <span>{r.interview_count} interviews</span>
                      <span>•</span>
                      <span>{r.offer_count} offers</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0 space-y-0.5">
                    <div className="text-xs font-bold font-mono text-purple-600 dark:text-purple-400">
                      {(r.interview_rate_pct ?? r.conversion_rate_pct).toFixed(1)}% Interview Rate
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {(r.response_rate_pct ?? 0).toFixed(1)}% Response • {(r.offer_rate_pct ?? 0).toFixed(1)}% Offer
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Section 4B: Platform Performance Matrix (Unified Funnel Contract) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Platform &amp; ATS Performance</span>
              </h2>
              <p className="text-xs text-slate-500">
                Attribution across job boards using unified funnel stage metrics.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">Attribution</span>
          </div>

          <div className="space-y-3 pt-1">
            {sources.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
                No platform telemetry recorded for this date range yet.
              </div>
            ) : (
              sources.map((src) => (
                <div
                  key={src.source_id}
                  className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {src.source_type ? src.source_type.toUpperCase() : src.source_id}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {src.discovered_count} Discovered • {src.applied_count} Submitted
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2">
                      <span>{src.response_count ?? 0} responses</span>
                      <span>•</span>
                      <span>{src.interview_count ?? 0} interviews</span>
                      <span>•</span>
                      <span>{src.offer_count ?? 0} offers</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0 text-xs font-mono">
                    <div className="text-purple-600 dark:text-purple-400 font-bold">
                      {(src.interview_rate_pct ?? 0).toFixed(1)}% Interview
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {(src.response_rate_pct ?? src.success_rate_pct ?? 0).toFixed(1)}% Response
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Campaign Performance Attribution (First-Class Matrix) */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Campaign Performance Attribution</span>
            </h2>
            <p className="text-xs text-slate-500">
              Explicit multi-stage telemetry showing which campaigns produce verified interviews.
            </p>
          </div>
          <button
            onClick={() => onNavigate?.('direct_apply')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 cursor-pointer"
          >
            <span>Manage Campaigns</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 pb-2">
                  <th className="py-2.5 font-bold uppercase text-[10px]">Campaign</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Discovered</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Matched</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Triggered</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Submitted</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Interviews</th>
                  <th className="py-2.5 font-bold uppercase text-[10px]">Offers</th>
                  <th className="py-2.5 font-bold uppercase text-[10px] text-right">Interview Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {campaigns.map((c) => (
                  <tr key={c.campaign_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 font-semibold text-slate-900 dark:text-white">
                      <div>{c.campaign_name}</div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">{c.state}</span>
                    </td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-400">{c.discovered_count}</td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-400">{c.matched_count ?? c.discovered_count}</td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-400">{c.triggered_count ?? c.applied_count}</td>
                    <td className="py-3 font-mono text-slate-900 dark:text-white font-bold">{c.submitted_count ?? c.applied_count}</td>
                    <td className="py-3 font-mono text-purple-600 dark:text-purple-400 font-bold">{c.interview_count ?? 0}</td>
                    <td className="py-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">{c.offer_count ?? 0}</td>
                    <td className="py-3 font-mono text-right text-purple-600 dark:text-purple-400 font-bold">
                      {(c.interview_rate_pct ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
            No active campaigns executed within this time window.
          </div>
        )}
      </div>

      {/* 6. Market Skill Demand & Candidate Gap Analysis */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <span>Market Skill Demand &amp; Candidate Gap Analysis</span>
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated skill requirements discovered across target jobs vs. candidate profile strengths.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">Market Matrix</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.length === 0 ? (
            <div className="col-span-3 p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
              Discover jobs and run cascade evaluations to populate skill demand analysis.
            </div>
          ) : (
            skills.map((sk) => (
              <div
                key={sk.skill_name}
                className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 flex items-center justify-between text-xs shadow-xs"
              >
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-900 dark:text-white">{sk.skill_name}</span>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                      ✓ {sk.matched_frequency} match
                    </span>
                    {sk.missing_frequency > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-mono">
                        ✕ {sk.missing_frequency} gap
                      </span>
                    )}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-transparent font-mono">
                  Demand {sk.market_demand_score}/10
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 7. AI Matching Strategy & Optimization (STRICTLY READ-ONLY) */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>AI Matching Strategy &amp; Optimization</span>
            </h2>
            <p className="text-xs text-slate-500">
              Autonomous cascade routing status and strategic weight recommendations.
            </p>
          </div>

          {/* AI Routing Provider Badge */}
          {aiStatus && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <span className="text-slate-500">Active Routing:</span>
              <strong className="font-mono text-indigo-600 dark:text-indigo-400 uppercase">
                {aiStatus.active_routing}
              </strong>
            </div>
          )}
        </div>

        {/* Read-Only AI Strategic Insight Box */}
        <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900/40 space-y-2">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>AI Strategy Insight</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {weightTuning?.rationale ||
              'Semantic similarity is associated with higher interview conversion in the selected period. Structured skill overlap ensures base hard-filtering pass rate.'}
          </p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Recommendation: Consider increasing semantic similarity weight in Campaign or Matching Settings.
          </div>
        </div>

        {/* Weights Comparison Bars (Read-Only) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Skill Weight */}
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Structured Skill Overlap</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                {((weightTuning?.recommended_skill_weight || 0.45) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(weightTuning?.recommended_skill_weight || 0.45) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400">
              Current: {((weightTuning?.current_skill_weight || 0.40) * 100).toFixed(0)}%
            </div>
          </div>

          {/* Semantic Weight */}
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Semantic Embedding</span>
              <span className="text-purple-600 dark:text-purple-400 font-mono font-bold">
                {((weightTuning?.recommended_semantic_weight || 0.35) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-purple-600 dark:bg-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(weightTuning?.recommended_semantic_weight || 0.35) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400">
              Current: {((weightTuning?.current_semantic_weight || 0.35) * 100).toFixed(0)}%
            </div>
          </div>

          {/* Experience Weight */}
          <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-800 space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Experience Band</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                {((weightTuning?.recommended_experience_weight || 0.20) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(weightTuning?.recommended_experience_weight || 0.20) * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400">
              Current: {((weightTuning?.current_experience_weight || 0.25) * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Read-Only Action: Navigation to Matching Strategy / Settings */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              Recommendation Confidence: <strong>{((weightTuning?.confidence_score || 0.9) * 100).toFixed(0)}%</strong>
            </span>
          </div>

          <button
            onClick={() => onNavigate?.('matches')}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Configure Matching Strategy</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
