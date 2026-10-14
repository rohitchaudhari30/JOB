import React, { useEffect, useState, useCallback } from 'react';
import {
  LayoutDashboard,
  Play,
  Pause,
  Square,
  Tv,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Sparkles,
  RefreshCw,
  Briefcase,
  Globe,
  FileText,
  ChevronRight,
  Info,
  Check,
  Activity,
  Layers,
  Send,
} from 'lucide-react';
import { api } from '../services/api';
import {
  DashboardOverview,
  DashboardTopMatch,
  DashboardAttentionItem,
  DashboardReadinessItem,
  AutomationRunStatus,
  Application,
} from '../types';
import { useToast } from '../context/ToastContext';

interface DashboardProps {
  onNavigate: (tab: any) => void;
  activeRun: AutomationRunStatus | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, activeRun: propActiveRun }) => {
  const { showSuccess, showError, showInfo } = useToast();

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentApplications, setRecentApplications] = useState<Application[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [overviewData, appsData, connectionsData] = await Promise.all([
        api.getDashboardOverview(clientTz),
        api.listApplications().catch(() => []),
        api.listConnections().catch(() => []),
      ]);
      setConnections(connectionsData);

      setOverview(overviewData);
      setRecentApplications(appsData.slice(0, 5));
    } catch (e: any) {
      console.error('Failed to load dashboard overview:', e);
      if (isRefresh) {
        showError('Failed to refresh dashboard data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientTz, showError]);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData(true);
    }, 15000); // Polling every 15s for operational status
    return () => clearInterval(interval);
  }, [loadData]);

  // Operational Controls
  const handlePauseActiveRun = async () => {
    const runId = overview?.active_run.run_id || propActiveRun?.run_id;
    if (!runId) return;
    try {
      setActionLoading(true);
      await api.pauseRun(runId);
      showInfo('Automation session paused safely.');
      await loadData(true);
    } catch (e: any) {
      showError(`Failed to pause session: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeActiveRun = async () => {
    const runId = overview?.active_run.run_id || propActiveRun?.run_id;
    if (!runId) return;
    try {
      setActionLoading(true);
      await api.resumeRun(runId);
      showSuccess('Automation session resumed.');
      await loadData(true);
    } catch (e: any) {
      showError(`Failed to resume session: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopActiveRun = async () => {
    const runId = overview?.active_run.run_id || propActiveRun?.run_id;
    if (!runId) return;
    if (!window.confirm('Are you sure you want to stop the active automation run?')) return;
    try {
      setActionLoading(true);
      await api.stopRun(runId, 'Stopped from dashboard');
      showInfo('Automation session stopped.');
      await loadData(true);
    } catch (e: any) {
      showError(`Failed to stop session: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickApply = async (match: DashboardTopMatch) => {
    try {
      setApplyingJobId(match.job_id);
      await api.createApplication(match.job_id, undefined, undefined, 'DASHBOARD', false);
      showSuccess(`Queued application for ${match.title} at ${match.company}!`);
      await loadData(true);
    } catch (e: any) {
      showError(`Application request failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setApplyingJobId(null);
    }
  };

  const effectiveRunning =
    overview?.active_run.is_running || propActiveRun?.status === 'RUNNING';
  const effectiveStatus = overview?.active_run.status || propActiveRun?.status || 'IDLE';

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Header & Operational Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center shadow-xs">
            <LayoutDashboard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Dashboard
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Command Center
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Real-time automation controls, blocker triage, daily quota pacing, and recommended actions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Local Timezone Badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <span>Quota Zone: <strong className="font-semibold">{clientTz}</strong></span>
          </div>

          <button aria-label="Refresh"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            title="Refresh Operational State"
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          <button
            onClick={() => onNavigate('live_console')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-500" />
            <span>Live Console</span>
          </button>

          <button
            onClick={() => onNavigate('direct_apply')}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Campaign</span>
          </button>
        </div>
      </div>

      {/* 2. Action Required / Blocker Triage Section */}
      {overview && overview.needs_attention.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-rose-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Immediate Action Required ({overview.needs_attention.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overview.needs_attention.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 flex items-start justify-between gap-4 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-rose-600 text-white">
                      {item.severity}
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs">{item.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>
                <button
                  onClick={() => onNavigate(item.action_url.replace('/', ''))}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>{item.action_label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              <strong>Zero Operational Blockers:</strong> Execution pipeline is fully operational with no pending OTP, CAPTCHA, or authorization challenges.
            </span>
          </div>
          <button
            onClick={() => onNavigate('connections')}
            className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <span>Platform Health</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 3. Operational Command Card: Active Run or Idle Readiness */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                effectiveRunning
                  ? 'bg-emerald-500 animate-pulse'
                  : effectiveStatus.startsWith('PAUSED')
                  ? 'bg-amber-500'
                  : 'bg-slate-400'
              }`} />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {effectiveRunning
                      ? overview?.active_run.campaign_name || 'Active Automation Execution'
                      : effectiveStatus.startsWith('PAUSED')
                      ? 'Automation Session Paused'
                      : 'Automation Engine Idle'}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    effectiveRunning
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : effectiveStatus.startsWith('PAUSED')
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {effectiveStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {effectiveRunning
                    ? `Currently processing: ${overview?.active_run.current_job_title || 'Target Job Match'} via ${overview?.active_run.current_platform || 'Connected Adapter'}`
                    : effectiveStatus.startsWith('PAUSED')
                    ? 'Session is waiting for manual intervention or safe cooldown resolution.'
                    : 'System is ready to execute scheduled discovery, matching, and safe auto-apply.'}
                </p>
              </div>
            </div>

            {/* Active Run Controls */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {effectiveRunning ? (
                <>
                  <button
                    onClick={handlePauseActiveRun}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 font-bold text-xs border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                  <button
                    onClick={handleStopActiveRun}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                  <button
                    onClick={() => onNavigate('live_console')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Live Console</span>
                  </button>
                </>
              ) : effectiveStatus.startsWith('PAUSED') ? (
                <>
                  <button
                    onClick={handleResumeActiveRun}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Resume</span>
                  </button>
                  <button
                    onClick={handleStopActiveRun}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 font-bold text-xs border border-rose-200 dark:border-rose-800 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                  <button
                    onClick={() => onNavigate('live_console')}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Inspect</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onNavigate('direct_apply')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Auto-Apply</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress bar if running */}
          {effectiveRunning && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Execution Progress</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {overview?.active_run.progress_percentage.toFixed(0) || 0}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(5, overview?.active_run.progress_percentage || 0))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Today's Operational Pulse (Dynamic Effective Daily Limit) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Applications Today / Daily Cap */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Applications Today
            </span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
              {overview?.today_applied_count ?? 0}
            </span>
            <span className="text-slate-400 font-mono text-lg font-bold">
              / {overview?.effective_daily_limit ?? 30}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (overview?.quota_percentage ?? 0) >= 100
                    ? 'bg-rose-500'
                    : (overview?.quota_percentage ?? 0) >= 80
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.min(100, overview?.quota_percentage ?? 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{overview?.quota_remaining ?? 0} applications remaining</span>
              <span className="font-semibold">{overview?.quota_percentage?.toFixed(0) ?? 0}%</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Safety Limit Source:</span>
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              min(Campaign, Platform, Account)
            </span>
          </div>
        </div>

        {/* Card 2: Candidate Pipeline Readiness */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Pipeline Readiness
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>

          <div className="space-y-2 pt-1">
            {overview?.readiness.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.is_ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="font-medium text-slate-700 dark:text-slate-300">{item.title}</span>
                </div>
                {item.is_ready ? (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Ready
                  </span>
                ) : (
                  <button
                    onClick={() => onNavigate(item.action_url.replace('/', ''))}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline cursor-pointer"
                  >
                    {item.action_label}
                  </button>
                )}
              </div>
            )) || (
              <div className="text-xs text-slate-400 py-2">Loading readiness checks...</div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Profile &amp; Resumes</span>
            <button
              onClick={() => onNavigate('profile')}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              Manage Profile →
            </button>
          </div>
        </div>

        {/* Card 3: Platform Integration Health */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Connected Platforms
            </span>
            <Globe className="w-4 h-4 text-indigo-500" />
          </div>

          <div className="space-y-2 pt-1">
            {connections.length === 0 && (
              <div className="text-xs text-slate-400 py-2">No platform status available.</div>
            )}
            {connections.map((c) => (
              <div key={c.platform} className="flex items-center justify-between text-xs py-1">
                <span className="font-semibold text-slate-800 dark:text-slate-200">{c.display_name}</span>
                <span
                  className={
                    c.session_active
                      ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }
                >
                  {String(c.status).toUpperCase()}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Encrypted Session Tokens</span>
            <button
              onClick={() => onNavigate('connections')}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              View Connections →
            </button>
          </div>
        </div>
      </div>

      {/* 5. Top Actionable AI Matches (Immediate Opportunities) */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Top Actionable Job Matches
              </h2>
              <p className="text-xs text-slate-500">
                High-confidence opportunities discovered and evaluated for your profile.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('matches')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
          >
            <span>View All Matches</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {overview && overview.top_matches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.top_matches.slice(0, 4).map((match) => (
              <div
                key={match.job_id}
                className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:border-indigo-300 dark:bg-slate-800/40 dark:border-slate-700/80 transition-all space-y-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                      {match.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                      <span>{match.company}</span>
                      <span>•</span>
                      <span>{match.location}</span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-black text-xs border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-mono shrink-0">
                    {match.match_score.toFixed(0)}% Match
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {match.platform}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQuickApply(match)}
                      disabled={applyingJobId === match.job_id}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>{applyingJobId === match.job_id ? 'Queuing...' : '1-Click Apply'}</span>
                    </button>
                    <button aria-label="Open"
                      onClick={() => onNavigate('matches')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                      title="Inspect Match"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-xs rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
            No high-confidence matches found yet. Run discovery or configure your campaign criteria to populate matches.
          </div>
        )}
      </div>

      {/* 6. Recent Application Activity Stream */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Recent Application Activity
              </h2>
              <p className="text-xs text-slate-500">
                Latest submissions and execution states from your automation pipeline.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('crm')}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
          >
            <span>Open Application CRM</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentApplications.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentApplications.map((app) => (
              <div
                key={app.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 first:pt-0 last:pb-0"
              >
                <div className="space-y-0.5">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                    {app.job_title || `Application #${app.id.slice(-8)}`}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {app.company ? `${app.company} • ` : ''}Job ID: {app.job_id.slice(-10)} • Created: {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Technical Execution State */}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    app.workflow_state === 'APPLIED'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : app.workflow_state.startsWith('PAUSED')
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : app.workflow_state === 'FAILED'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {app.workflow_state}
                  </span>

                  {/* Business CRM Outcome Status */}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    app.outcome_status === 'SUBMITTED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : app.outcome_status === 'INTERVIEWING'
                      ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                      : app.outcome_status === 'OFFERED'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                  }`}>
                    {app.outcome_status || 'NOT_SUBMITTED'}
                  </span>

                  <button aria-label="Open"
                    onClick={() => onNavigate('crm')}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 dark:text-slate-500 text-xs rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800">
            No applications submitted yet. Start your first campaign to begin applying automatically.
          </div>
        )}
      </div>
    </div>
  );
};
