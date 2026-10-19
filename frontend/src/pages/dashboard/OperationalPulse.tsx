import React from 'react';
import { CheckCircle2, Globe, Check, Activity } from 'lucide-react';
import type { DashboardOverview } from '../../types';

interface Props {
  overview: DashboardOverview | null;
  connections: any[];
  onNavigate: (tab: any) => void;
}

export const OperationalPulse: React.FC<Props> = ({ overview, connections, onNavigate }) => (
  <>
    {/* 4. Today's Operational Pulse (Dynamic Effective Daily Limit) */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Card 1: Applications Today / Daily Cap */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Applications Today</span>
          <Activity className="w-4 h-4 text-indigo-500" />
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
            {overview?.today_applied_count ?? 0}
          </span>
          <span className="text-slate-400 font-mono text-lg font-bold">/ {overview?.effective_daily_limit ?? 30}</span>
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
          <span className="font-semibold text-slate-600 dark:text-slate-300">min(Campaign, Platform, Account)</span>
        </div>
      </div>

      {/* Card 2: Candidate Pipeline Readiness */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-bold uppercase tracking-wider">Pipeline Readiness</span>
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
                <button type="button"
                  onClick={() => onNavigate(item.action_url)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline cursor-pointer"
                >
                  {item.action_label}
                </button>
              )}
            </div>
          )) || <div className="text-xs text-slate-400 py-2">Loading readiness checks...</div>}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Profile &amp; Resumes</span>
          <button type="button"
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
          <span className="text-[11px] font-bold uppercase tracking-wider">Connected Platforms</span>
          <Globe className="w-4 h-4 text-indigo-500" />
        </div>

        <div className="space-y-2 pt-1">
          {connections.length === 0 && <div className="text-xs text-slate-400 py-2">No platform status available.</div>}
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
          <button type="button"
            onClick={() => onNavigate('connections')}
            className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            View Connections →
          </button>
        </div>
      </div>
    </div>
  </>
);
