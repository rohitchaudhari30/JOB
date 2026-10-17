import React from 'react';
import { IndianRupee, Check } from 'lucide-react';
import type { CandidateProfile } from '../../types';
import { NOTICE_PERIOD_OPTIONS, formatLPA } from './profileOptions';

interface CompensationTabProps {
  profile: CandidateProfile;
  setProfile: (p: CandidateProfile) => void;
}

export const CompensationTab: React.FC<CompensationTabProps> = ({ profile, setProfile }) => {
  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
      <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <IndianRupee className="w-4 h-4 text-indigo-500" />
        <div>
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Compensation &amp; Notice Period
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Used to match salary filters and auto-answer compensation fields on portals.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Current CTC */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Current Annual CTC (₹ INR)
          </label>
          <div className="relative">
            <IndianRupee className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="number"
              min="0"
              step="50000"
              value={profile.current_ctc || ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  current_ctc: Number(e.target.value) || 0,
                })
              }
              placeholder="e.g. 1800000 (18 LPA)"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {profile.current_ctc && profile.current_ctc > 0 && (
            <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
              {formatLPA(profile.current_ctc)}
            </div>
          )}
        </div>

        {/* Expected CTC */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Expected Annual CTC (₹ INR) <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <IndianRupee className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="number"
              min="0"
              step="50000"
              value={profile.expected_ctc || ''}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  expected_ctc: Number(e.target.value) || 0,
                })
              }
              placeholder="e.g. 2400000 (24 LPA)"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {profile.expected_ctc && profile.expected_ctc > 0 && (
            <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
              <span>{formatLPA(profile.expected_ctc)}</span>
              {profile.current_ctc && profile.current_ctc > 0 && profile.expected_ctc > profile.current_ctc && (
                <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                  +{Math.round(((profile.expected_ctc - profile.current_ctc) / profile.current_ctc) * 100)}% hike
                </span>
              )}
            </div>
          )}
        </div>

        {/* Notice Period Selector */}
        <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Notice Period Duration</label>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {profile.notice_period_days === 0 ? 'Immediate Joiner' : `${profile.notice_period_days} Days`}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {NOTICE_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setProfile({ ...profile, notice_period_days: opt.value })}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex items-center justify-center space-x-1.5 ${
                  profile.notice_period_days === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                }`}
              >
                {profile.notice_period_days === opt.value && <Check className="w-3.5 h-3.5" />}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
