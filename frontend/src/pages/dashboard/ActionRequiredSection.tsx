import React, { useMemo } from 'react';
import { ArrowUpRight, ShieldCheck, AlertOctagon, ChevronRight, Layers } from 'lucide-react';
import type { DashboardOverview, DashboardAttentionItem } from '../../types';

interface Props {
  overview: DashboardOverview | null;
  connections: any[];
  onNavigate: (tab: any) => void;
}

interface GroupedAlert {
  key: string;
  severity: 'CRITICAL' | 'HIGH' | 'INFO';
  title: string;
  description: string;
  action_label: string;
  action_url: string;
  count: number;
}

export const ActionRequiredSection: React.FC<Props> = ({ overview, onNavigate }) => {
  const items = overview?.needs_attention ?? [];

  // Categorize alerts when scaling beyond 2 items to prevent vertical sprawl
  const groupedAlerts = useMemo<GroupedAlert[]>(() => {
    if (items.length <= 2) return [];

    const challenges: DashboardAttentionItem[] = [];
    const reviews: DashboardAttentionItem[] = [];
    const sessions: DashboardAttentionItem[] = [];
    const others: DashboardAttentionItem[] = [];

    for (const item of items) {
      const t = (item.type + ' ' + item.title).toLowerCase();
      if (t.includes('captcha') || t.includes('otp')) {
        challenges.push(item);
      } else if (t.includes('approval') || t.includes('review')) {
        reviews.push(item);
      } else if (t.includes('auth') || t.includes('session') || t.includes('expired')) {
        sessions.push(item);
      } else {
        others.push(item);
      }
    }

    const groups: GroupedAlert[] = [];

    if (challenges.length > 0) {
      const companies = challenges.map((c) => c.title.replace(/^.*:\s*/, '')).filter(Boolean);
      const companySample = companies.slice(0, 2).join(', ');
      const extra = companies.length > 2 ? ` + ${companies.length - 2} more` : '';
      groups.push({
        key: 'challenges',
        severity: 'CRITICAL',
        title: `${challenges.length} Verification Challenge${challenges.length > 1 ? 's' : ''}`,
        description: `Interactive CAPTCHAs or OTPs detected for ${companySample}${extra}. Requires manual input to resume.`,
        action_label: challenges.length === 1 ? 'Solve Challenge' : `Solve Next (${challenges.length})`,
        action_url: challenges[0].action_url,
        count: challenges.length,
      });
    }

    if (reviews.length > 0) {
      const companies = reviews.map((r) => r.title.replace(/^.*:\s*/, '')).filter(Boolean);
      const companySample = companies.slice(0, 2).join(', ');
      const extra = companies.length > 2 ? ` + ${companies.length - 2} more` : '';
      groups.push({
        key: 'reviews',
        severity: 'HIGH',
        title: `${reviews.length} Application${reviews.length > 1 ? 's' : ''} Awaiting Review`,
        description: `AI qualified jobs for ${companySample}${extra} held in the candidate review queue.`,
        action_label: reviews.length === 1 ? 'Review & Approve' : `Review Queue (${reviews.length})`,
        action_url: reviews.length === 1 ? reviews[0].action_url : '/applications',
        count: reviews.length,
      });
    }

    if (sessions.length > 0) {
      groups.push({
        key: 'sessions',
        severity: 'HIGH',
        title: `${sessions.length} Platform Session${sessions.length > 1 ? 's' : ''} Expired`,
        description: 'Authentication session expired on target portals. Reconnect to resume autonomous applying.',
        action_label: 'Reconnect Sessions',
        action_url: '/settings/connections',
        count: sessions.length,
      });
    }

    if (others.length > 0) {
      groups.push({
        key: 'others',
        severity: 'HIGH',
        title: `${others.length} Action Item${others.length > 1 ? 's' : ''}`,
        description: others[0].description,
        action_label: others[0].action_label,
        action_url: others[0].action_url,
        count: others.length,
      });
    }

    return groups;
  }, [items]);

  if (!overview || items.length === 0) {
    return (
      <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            <strong>Zero Operational Blockers:</strong> Execution pipeline is fully operational with no pending OTP,
            CAPTCHA, or authorization challenges.
          </span>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('connections')}
          className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span>Platform Health</span>
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    );
  }

  const isGrouped = items.length > 2 && groupedAlerts.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-rose-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            Immediate Action Required ({items.length})
          </h2>
        </div>
        {items.length > 2 && (
          <button
            type="button"
            onClick={() => onNavigate('applications')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Layers className="w-3 h-3" />
            <span>Open All in Review Queue ({items.length})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isGrouped
          ? groupedAlerts.map((group) => (
              <div
                key={group.key}
                className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50 flex items-start justify-between gap-4 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-rose-600 text-white">
                      {group.severity}
                    </span>
                    <h3 className="font-bold text-slate-900 dark:text-white text-xs">{group.title}</h3>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{group.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(group.action_url)}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>{group.action_label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          : items.map((item) => (
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
                <button
                  type="button"
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
  );
};
