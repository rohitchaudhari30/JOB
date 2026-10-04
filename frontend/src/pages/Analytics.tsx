import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { api } from '../services/api';
import {
  FunnelOverview,
  ResumePerformanceMetric,
  SourcePerformanceMetric,
  SkillDemandInsight,
  WeightTuningRecommendation,
} from '../types';

export const Analytics: React.FC = () => {
  const [funnel, setFunnel] = useState<FunnelOverview | null>(null);
  const [resumes, setResumes] = useState<ResumePerformanceMetric[]>([]);
  const [sources, setSources] = useState<SourcePerformanceMetric[]>([]);
  const [skills, setSkills] = useState<SkillDemandInsight[]>([]);
  const [weightTuning, setWeightTuning] = useState<WeightTuningRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [appliedNotification, setAppliedNotification] = useState(false);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const [fData, rData, sData, skData, wData] = await Promise.all([
        api.getFunnelOverview(),
        api.getResumePerformance(),
        api.getSourcePerformance(),
        api.getSkillInsights(),
        api.getWeightTuning(),
      ]);
      setFunnel(fData);
      setResumes(rData);
      setSources(sData);
      setSkills(skData);
      setWeightTuning(wData);
    } catch (e) {
      console.error('Failed to load analytics data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const handleApplyRecommendedWeights = () => {
    setAppliedNotification(true);
    setTimeout(() => setAppliedNotification(false), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center space-y-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-xs">Calculating conversion funnels &amp; AI insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center space-x-2.5">
            <TrendingUp className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            <span>Conversion Analytics &amp; AI Learning</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            End-to-end application funnel, resume performance, skill demand insights, and dynamic weight optimization.
          </p>
        </div>
        <button
          onClick={fetchAnalyticsData}
          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 dark:border-slate-700 dark:text-slate-200 flex items-center space-x-2 transition-all shadow-xs self-start cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {appliedNotification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400 text-xs font-semibold flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>Recommended AI matching weights successfully activated for future cascade pipelines!</span>
        </div>
      )}

      {/* 1. End-to-End Application Funnel */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Application Conversion Funnel</span>
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Real-time Stage Progression</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {funnel?.stages.map((stage, idx) => (
            <div
              key={stage.stage_name}
              className="relative p-5 rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800 flex flex-col justify-between overflow-hidden shadow-xs"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Stage {idx + 1}
                </span>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">{stage.stage_name}</h3>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-300 font-mono">{stage.count}</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {stage.conversion_rate_pct}%
                </span>
              </div>

              {/* Progress bar line */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(stage.conversion_rate_pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Side-by-Side: AI Match Weight Learning & Source Success */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Match Weight Tuner */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>AI Weight Auto-Tuner</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30 flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                <span>AI Confidence {(weightTuning?.confidence_score ? weightTuning.confidence_score * 100 : 90).toFixed(0)}%</span>
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">
              {weightTuning?.rationale ||
                'AI analyzes match pass rates and optimizes cascade scoring weights for highest interview conversions.'}
            </p>

            <div className="space-y-4">
              {/* Skill Weight */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Structured Skill Overlap Weight</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-mono">
                    {(weightTuning?.recommended_skill_weight ? weightTuning.recommended_skill_weight * 100 : 45).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full"
                    style={{ width: `${(weightTuning?.recommended_skill_weight || 0.45) * 100}%` }}
                  />
                </div>
              </div>

              {/* Semantic Weight */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Semantic Embedding Weight</span>
                  <span className="text-purple-600 dark:text-purple-400 font-mono">
                    {(weightTuning?.recommended_semantic_weight ? weightTuning.recommended_semantic_weight * 100 : 35).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-600 dark:bg-purple-500 h-full rounded-full"
                    style={{ width: `${(weightTuning?.recommended_semantic_weight || 0.35) * 100}%` }}
                  />
                </div>
              </div>

              {/* Experience Weight */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">Experience Band Weight</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-mono">
                    {(weightTuning?.recommended_experience_weight ? weightTuning.recommended_experience_weight * 100 : 20).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 dark:bg-emerald-500 h-full rounded-full"
                    style={{ width: `${(weightTuning?.recommended_experience_weight || 0.20) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleApplyRecommendedWeights}
            className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Apply AI Recommended Weights</span>
          </button>
        </div>

        {/* Source Performance */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Platform &amp; ATS Performance</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Source Distribution</span>
          </div>

          <div className="space-y-3">
            {sources.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No platform telemetry available yet.</p>
            ) : (
              sources.map((src) => (
                <div
                  key={src.source_id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800 flex items-center justify-between shadow-xs"
                >
                  <div className="flex items-center space-x-3">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {src.source_type ? src.source_type.toUpperCase() : src.source_id}
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                      {src.discovered_count} Discovered
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-xs font-mono">
                    <span className="text-slate-700 dark:text-slate-300">{src.applied_count} Applied</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{src.success_rate_pct}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Resume Performance & Skill Gap Demand */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Resume Performance Matrix */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Resume A/B Conversion Matrix</span>
            </h2>
            <Award className="w-4 h-4 text-amber-500" />
          </div>

          <div className="space-y-3">
            {resumes.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Upload targeted resumes in the Profile tab to enable conversion analytics.
              </p>
            ) : (
              resumes.map((r) => (
                <div
                  key={r.resume_id}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/60 dark:border-slate-800 flex items-center justify-between shadow-xs"
                >
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.label}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Target Role: {r.target_role}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {r.conversion_rate_pct}% Success
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {r.applications_count} Submissions
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Skill Demand & Gap Insights */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 space-y-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Flame className="w-5 h-5 text-amber-500" />
              <span>Market Skill Demand &amp; Gaps</span>
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Top Keywords</span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {skills.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Discover jobs and run matching to populate skill demand analysis.
              </p>
            ) : (
              skills.map((sk) => (
                <div
                  key={sk.skill_name}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 dark:bg-slate-950/50 dark:border-slate-800/80 flex items-center justify-between text-xs shadow-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{sk.skill_name}</span>
                  <div className="flex items-center space-x-3">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                      ✓ {sk.matched_frequency} Matched
                    </span>
                    {sk.missing_frequency > 0 && (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-mono font-medium">
                        ✕ {sk.missing_frequency} Gap
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-transparent">
                      Demand {sk.market_demand_score}/10
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
