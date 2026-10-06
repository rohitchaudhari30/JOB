import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  Tv,
  CheckCircle2,
  Clock,
  Play,
  ArrowUpRight,
  TrendingUp,
  LayoutDashboard,
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
    <div className="space-y-6 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center shadow-xs">
            <LayoutDashboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
            <p className="text-xs text-slate-500 font-medium">Real-time automation activity, pipeline health, and top job recommendations.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onNavigate('direct_apply')}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Auto-Apply</span>
          </button>
          <button
            onClick={() => onNavigate('matches')}
            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>View AI Matches</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Modern Executive Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 p-6 shadow-sm text-white transition-all">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-[11px] font-bold border border-indigo-500/25">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>ApplyFlow Autonomous Engine</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Automate Your Career Search With Precision AI
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed font-normal">
              Automated job discovery across Naukri, LinkedIn, and corporate ATS portals. Precision-scored with multi-tier talent matching and submitted seamlessly with safe automation.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-800">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                activeRun && activeRun.status === 'RUNNING'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  activeRun && activeRun.status === 'RUNNING' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`} />
                {activeRun && activeRun.status === 'RUNNING' ? 'Engine Active' : 'Engine Ready'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('direct_apply')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Apply Now</span>
              </button>
              <button
                onClick={() => onNavigate('matches')}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-semibold text-xs border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>Explore High Matches</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Ambient glow decoration */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div
          onClick={() => onNavigate('crm')}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-400 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-indigo-500/80 transition-all shadow-sm hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Total Applications</span>
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono">{stats?.total ?? 0}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Across all connected job sources</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
        </div>

        <div
          onClick={() => onNavigate('crm')}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-emerald-400 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-emerald-500/80 transition-all shadow-sm hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Successfully Applied</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 group-hover:scale-105 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{stats?.applied ?? 0}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Confirmed form submissions</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
        </div>

        <div
          onClick={() => onNavigate('crm')}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-amber-400 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-amber-500/80 transition-all shadow-sm hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Pending User Action</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 group-hover:scale-105 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {(stats?.paused ?? 0) + (stats?.approval_required ?? 0)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Awaiting approval or OTP</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
        </div>

        <div
          onClick={() => onNavigate('live_console')}
          className="p-5 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-400 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-indigo-500/80 transition-all shadow-sm hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Active Run Status</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 group-hover:scale-105 transition-transform">
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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
            <span>Live WebSocket streaming</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
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

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/60 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Auto-apply eligible</span>
                  <button
                    onClick={() => onNavigate('matches')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    <span>Review &amp; Apply</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
