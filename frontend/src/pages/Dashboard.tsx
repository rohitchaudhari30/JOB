import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Tv,
  CheckCircle2,
  Clock,
  Play,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';
import { api } from '../services/api';
import { ApplicationStats, MatchResult, AutomationRunStatus } from '../types';

interface DashboardProps {
  onNavigate: (tab: any) => void;
  activeRun: AutomationRunStatus | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeRun }) => {
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [topMatches, setTopMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsData, matchesData] = await Promise.all([
        api.getApplicationStats(),
        api.listMatches({ min_score: 75 }),
      ]);
      setStats(statsData);
      setTopMatches(matchesData.slice(0, 4));
    } catch (e) {
      console.error('Error loading dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-800 dark:from-indigo-950/80 dark:via-purple-950/60 dark:to-slate-900 border border-indigo-500/20 p-8 shadow-xl shadow-indigo-600/10 dark:shadow-none text-white transition-all duration-200">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/15 dark:bg-indigo-500/20 text-indigo-100 dark:text-indigo-300 text-xs font-bold border border-white/20 dark:border-indigo-500/30 mb-4 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ApplyFlow Autonomous Engine</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2 text-white">
            Automate Your Career Search With Precision AI
          </h1>
          <p className="text-indigo-100 dark:text-slate-300 text-sm leading-relaxed mb-6 font-normal">
            Multi-portal scraping across Naukri, LinkedIn & direct ATS boards. Scored with 5-Stage Groq & Gemini reasoning and applied automatically via human-in-the-loop Playwright automation.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate('direct_apply')}
              className="px-5 py-2.5 rounded-2xl bg-white text-indigo-700 hover:bg-slate-100 font-black text-xs shadow-lg shadow-black/10 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>🚀 Start Apply Now</span>
            </button>
            <button
              onClick={() => onNavigate('matches')}
              className="px-5 py-2.5 rounded-2xl bg-indigo-800/40 hover:bg-indigo-800/60 text-white font-semibold text-xs border border-white/20 dark:bg-slate-800/80 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700/60 flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Explore High Matches</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-200 dark:text-slate-400" />
            </button>
          </div>
        </div>

        {/* Ambient glow decoration */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-white/10 dark:bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-slate-700/80 transition-all shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Applications</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">{stats?.total ?? 0}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Across all connected job sources</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-slate-700/80 transition-all shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider">Successfully Applied</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{stats?.applied ?? 0}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Confirmed form submissions</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-slate-700/80 transition-all shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending User Action</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {(stats?.paused ?? 0) + (stats?.approval_required ?? 0)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Awaiting approval or OTP verification</p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-slate-700/80 transition-all shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Run Status</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <Tv className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            {activeRun && activeRun.status === 'RUNNING' ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Active Session</span>
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400 font-medium text-base">Idle</span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Live WebSocket streaming ready</p>
        </div>
      </div>

      {/* Top AI Matches Preview */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/40 dark:border-slate-800 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Top Recommended AI Matches (&gt;75% Match)</h2>
          </div>
          <button
            onClick={() => onNavigate('matches')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
          >
            <span>View All Matches</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {topMatches.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            No high matches calculated yet. Run discovery and matching from the Job Discovery page.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topMatches.map((m) => (
              <div
                key={m.id}
                className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:border-indigo-300 dark:bg-slate-900/80 dark:border-slate-800/80 dark:hover:border-indigo-500/40 transition-all space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-tight">Job Match #{m.job_id.slice(-6)}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Scored with {m.ai_provider_used}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-black text-xs border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono">
                      {m.overall_score.toFixed(0)}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                  {m.reasoning_summary}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {m.matched_skills.slice(0, 4).map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/40"
                    >
                      ✓ {skill}
                    </span>
                  ))}
                  {m.missing_skills.slice(0, 2).map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/30"
                    >
                      ✗ {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
