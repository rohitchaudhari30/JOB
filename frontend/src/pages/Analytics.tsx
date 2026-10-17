import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { TrendingUp, RefreshCw, Calendar, Filter } from 'lucide-react';
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
import { useQueryParam } from '../hooks/useQueryParam';
import { OverviewSection } from './analytics/OverviewSection';
import { ResumesSection } from './analytics/ResumesSection';
import { SourcesSection } from './analytics/SourcesSection';
import { CampaignsSection } from './analytics/CampaignsSection';
import { SkillsSection } from './analytics/SkillsSection';
import { ScoringSection } from './analytics/ScoringSection';

interface AnalyticsProps {
  onNavigate?: (tab: any) => void;
}

type DateRangePreset = 'TODAY' | '7D' | '30D' | '90D' | 'CUSTOM' | 'ALL_TIME';

const INSIGHT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'sources', label: 'Sources' },
  { id: 'resumes', label: 'Resumes' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'skills', label: 'Skills' },
  { id: 'scoring', label: 'Scoring weights' },
] as const;
type InsightView = (typeof INSIGHT_TABS)[number]['id'];

export const Analytics: React.FC<AnalyticsProps> = ({ onNavigate }) => {
  const { showError } = useToast();
  const [viewParam, setView] = useQueryParam('view', 'overview');
  const view: InsightView = (INSIGHT_TABS.some((t) => t.id === viewParam) ? viewParam : 'overview') as InsightView;

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
            <select aria-label="Platform"
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
          <button aria-label="Refresh"
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

      {/* Insights sections (URL: ?view=) */}
      <div role="tablist" aria-label="Insight sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {INSIGHT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`insight-tab-${t.id}`}
            aria-selected={view === t.id}
            aria-controls="insight-panel"
            onClick={() => setView(t.id)}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px cursor-pointer transition-colors ${
              view === t.id
                ? 'border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="insight-panel" role="tabpanel" aria-labelledby={`insight-tab-${view}`} className="space-y-6">
        {view === 'overview' && <OverviewSection funnel={funnel} onNavigate={onNavigate} />}
        {view === 'resumes' && <ResumesSection resumes={resumes} highestInterviewResume={highestInterviewResume} />}
        {view === 'sources' && <SourcesSection funnel={funnel} sources={sources} />}
        {view === 'campaigns' && <CampaignsSection campaigns={campaigns} onNavigate={onNavigate} />}
        {view === 'skills' && <SkillsSection skills={skills} />}
        {view === 'scoring' && <ScoringSection weightTuning={weightTuning} aiStatus={aiStatus} onNavigate={onNavigate} />}
      </div>
    </div>
  );
};
