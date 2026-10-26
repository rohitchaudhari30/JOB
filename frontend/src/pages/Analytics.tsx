import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import { InsightsFilterBar, describeRange, type DateRangePreset } from './analytics/InsightsFilterBar';
import { TopProgressBar } from '../components/ui/Skeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs, TabPanel } from '../components/ui/Tabs';

interface AnalyticsProps {
  onNavigate?: (tab: any) => void;
}

const GROUPS = [
  { id: 'overview', label: 'Overview' },
  { id: 'breakdowns', label: 'Breakdowns' },
  { id: 'scoring', label: 'Scoring' },
];
type InsightView = 'overview' | 'breakdowns' | 'scoring';

/** Older links used one tab per breakdown (?view=sources …). They now open Breakdowns at that section. */
const LEGACY_SECTION = new Set(['sources', 'resumes', 'campaigns', 'skills']);

export const Analytics: React.FC<AnalyticsProps> = ({ onNavigate }) => {
  const { showError } = useToast();
  const [viewParam, setViewParam] = useQueryParam('view', 'overview');
  const view: InsightView = LEGACY_SECTION.has(viewParam)
    ? 'breakdowns'
    : (GROUPS.some((g) => g.id === viewParam) ? viewParam : 'overview') as InsightView;
  const setView = (id: string) => setViewParam(id);

  // Open the section an older link pointed at (once, after the Breakdowns view has rendered).
  const legacyTarget = React.useRef(LEGACY_SECTION.has(viewParam) ? viewParam : null);
  useEffect(() => {
    const target = legacyTarget.current;
    if (!target || view !== 'breakdowns') return;
    const el = document.getElementById(`insights-${target}`);
    if (!el) return;
    legacyTarget.current = null;
    el.scrollIntoView?.({ block: 'start' });
    el.focus({ preventScroll: true });
  });

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

        setFunnel(fData);
        setResumes(rData);
        setSources(sData);
        setCampaigns(cData);
        setSkills(skData);
        setWeightTuning(wData);
        setAiStatus(aiData);
      } catch (err) {
        console.error('Failed to load analytics data:', err);
        showError('Failed to load analytics dashboard data.');
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

  const highestInterviewResume = useMemo(() => {
    if (!resumes || resumes.length === 0) return null;
    return [...resumes].sort(
      (a, b) => (b.interview_rate_pct ?? b.conversion_rate_pct) - (a.interview_rate_pct ?? a.conversion_rate_pct)
    )[0];
  }, [resumes]);

  return (
    <div className="space-y-4 animate-fadeIn pb-16 relative">
      <TopProgressBar active={refreshing} className="rounded-full" />
      {/* Clean, standard SaaS page header without cluttering subtitle */}
      <PageHeader title="Insights" />

      {/* Unified Executive Insights Control Bar: Views on left, Filter Presets on right */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <Tabs items={GROUPS} value={view} onChange={setView} label="Insights views" idPrefix="insights" className="border-b-0 shrink-0" />

        <div className="flex items-center gap-3">
          <InsightsFilterBar
            datePreset={datePreset}
            setDatePreset={setDatePreset}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            setCustomStartDate={setCustomStartDate}
            setCustomEndDate={setCustomEndDate}
            selectedPlatform={selectedPlatform}
            setSelectedPlatform={setSelectedPlatform}
            onRefresh={() => fetchAnalyticsData(true)}
            busy={refreshing || loading}
          />
        </div>
      </div>

      {/* Observational context indicator */}
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-0.5">
        <p role="status">
          Showing: <strong className="font-semibold text-slate-700 dark:text-slate-200">{describeRange(datePreset, customStartDate, customEndDate, selectedPlatform)}</strong>. Applies to every view below.
        </p>
      </div>

      <TabPanel idPrefix="insights" id={view} active>
        <div className="space-y-6 pt-2">
          {view === 'overview' && <OverviewSection funnel={funnel} onNavigate={onNavigate} />}
          {view === 'breakdowns' && (
            <>
              <section id="insights-sources" tabIndex={-1} aria-label="Sources" className="scroll-mt-4 focus:outline-none">
                <SourcesSection funnel={funnel} sources={sources} />
              </section>
              <section id="insights-resumes" tabIndex={-1} aria-label="Resumes" className="scroll-mt-4 focus:outline-none">
                <ResumesSection resumes={resumes} highestInterviewResume={highestInterviewResume} />
              </section>
              <section id="insights-campaigns" tabIndex={-1} aria-label="Campaigns" className="scroll-mt-4 focus:outline-none">
                <CampaignsSection campaigns={campaigns} onNavigate={onNavigate} />
              </section>
              <section id="insights-skills" tabIndex={-1} aria-label="Skills" className="scroll-mt-4 focus:outline-none">
                <SkillsSection skills={skills} />
              </section>
            </>
          )}
          {view === 'scoring' && <ScoringSection weightTuning={weightTuning} aiStatus={aiStatus} onNavigate={onNavigate} />}
        </div>
      </TabPanel>
    </div>
  );
};
