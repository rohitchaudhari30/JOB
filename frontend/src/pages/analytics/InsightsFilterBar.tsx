import React from 'react';
import { RefreshCw, Calendar, Filter } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';

export type DateRangePreset = 'TODAY' | '7D' | '30D' | '90D' | 'CUSTOM' | 'ALL_TIME';

const PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'TODAY', label: 'Today' },
  { id: '7D', label: '7 days' },
  { id: '30D', label: '30 days' },
  { id: '90D', label: '90 days' },
  { id: 'CUSTOM', label: 'Custom' },
  { id: 'ALL_TIME', label: 'All time' },
];

const PLATFORMS: Record<string, string> = { ALL: 'All platforms', NAUKRI: 'Naukri.com', LINKEDIN: 'LinkedIn', DIRECT: 'Direct ATS' };

interface Props {
  datePreset: DateRangePreset;
  setDatePreset: (p: DateRangePreset) => void;
  customStartDate: string;
  customEndDate: string;
  setCustomStartDate: (v: string) => void;
  setCustomEndDate: (v: string) => void;
  selectedPlatform: string;
  setSelectedPlatform: (v: string) => void;
  onRefresh: () => void;
  busy: boolean;
}

/** Describes the active range in words, so every number below is clearly "for this period". */
export function describeRange(preset: DateRangePreset, start: string, end: string, platform: string): string {
  const range =
    preset === 'CUSTOM'
      ? start && end
        ? `${start} to ${end}`
        : 'choose a start and end date'
      : (PRESETS.find((p) => p.id === preset)?.label ?? '');
  const when = preset === 'ALL_TIME' ? 'All time' : preset === 'TODAY' ? 'Today' : preset === 'CUSTOM' ? range : `Last ${range}`;
  return `${when} · ${PLATFORMS[platform] ?? platform}`;
}

/** One filter bar for every Insights view: the period and platform apply to everything below it. */
export const InsightsFilterBar: React.FC<Props> = ({
  datePreset, setDatePreset, customStartDate, customEndDate, setCustomStartDate, setCustomEndDate,
  selectedPlatform, setSelectedPlatform, onRefresh, busy,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Period" className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            aria-pressed={datePreset === p.id}
            onClick={() => setDatePreset(p.id)}
            className={`rounded-lg px-3 text-xs font-bold transition-colors ${
              datePreset === p.id
                ? 'bg-white text-indigo-700 shadow-xs dark:bg-slate-900 dark:text-indigo-300'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        <Filter className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        <select
          aria-label="Platform"
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="cursor-pointer bg-transparent text-xs font-semibold outline-none"
        >
          {Object.entries(PLATFORMS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      </div>

      <IconButton label="Refresh insights" onClick={onRefresh} disabled={busy} className="border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin text-indigo-600' : ''}`} aria-hidden="true" />
      </IconButton>
    </div>

    {datePreset === 'CUSTOM' && (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
          <Calendar className="h-4 w-4 text-indigo-500" aria-hidden="true" /> Custom period
        </div>
        <label className="flex items-center gap-2 font-medium text-slate-600 dark:text-slate-400">
          From
          <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </label>
        <label className="flex items-center gap-2 font-medium text-slate-600 dark:text-slate-400">
          To
          <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </label>
      </div>
    )}
  </div>
);
