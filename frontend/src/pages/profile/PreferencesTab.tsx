import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CandidateProfile } from '../../types';
import { WORK_AUTH_OPTIONS } from './profileOptions';

interface PreferencesTabProps {
  profile: CandidateProfile;
  setProfile: (p: CandidateProfile) => void;
}

export const PreferencesTab: React.FC<PreferencesTabProps> = ({ profile, setProfile }) => {
  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
      <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <ShieldCheck className="w-4 h-4 text-indigo-500" />
        <div>
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Work Authorization &amp; Mode Preferences
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Determines eligibility filters for remote, onsite, and international opportunities.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Work Authorization Status */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Work Authorization Status
          </label>
          <select
            aria-label="Work authorization status"
            value={profile.work_authorization || WORK_AUTH_OPTIONS[0]}
            onChange={(e) => setProfile({ ...profile, work_authorization: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {WORK_AUTH_OPTIONS.map((auth) => (
              <option key={auth} value={auth}>
                {auth}
              </option>
            ))}
          </select>
        </div>

        {/* Preferred Work Mode */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Preferred Work Mode</label>
          <select
            aria-label="Preferred work mode"
            value={profile.remote_preference || 'any'}
            onChange={(e) => setProfile({ ...profile, remote_preference: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="any">Open to All (Remote / Hybrid / Onsite)</option>
            <option value="remote">100% Remote Only</option>
            <option value="hybrid">Hybrid (1-3 Days In-Office)</option>
            <option value="onsite">On-site Only</option>
          </select>
        </div>

        {/* Relocation Preference Toggle */}
        <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Open to Relocation</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Check this if you are willing to relocate to other tech hubs (Bangalore, Hyderabad, Pune, Gurgaon, etc.).
            </div>
          </div>
          <input
            type="checkbox"
            id="relocation"
            checked={profile.relocation_preference}
            onChange={(e) =>
              setProfile({
                ...profile,
                relocation_preference: e.target.checked,
              })
            }
            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
          />
        </div>
      </div>
    </div>
  );
};
