import React from 'react';
import { ArrowUpRight, ShieldCheck, AlertOctagon, ChevronRight } from 'lucide-react';
import type { DashboardOverview } from '../../types';

interface Props {
  overview: DashboardOverview | null;
  connections: any[];
  onNavigate: (tab: any) => void;
}

export const ActionRequiredSection: React.FC<Props> = ({ overview, connections, onNavigate }) => (
  <>
    {/* 2. Action Required / Blocker Triage Section */}
    {overview && overview.needs_attention.length > 0 ? (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
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
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.description}</p>
              </div>
              <button type="button"
                onClick={() => onNavigate(item.action_url)}
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
            <strong>Zero Operational Blockers:</strong> Execution pipeline is fully operational with no pending OTP,
            CAPTCHA, or authorization challenges.
          </span>
        </div>
        <button type="button"
          onClick={() => onNavigate('connections')}
          className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span>Platform Health</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    )}
  </>
);
