import React from 'react';
import { User, Briefcase, MapPin, Phone } from 'lucide-react';
import type { CandidateProfile } from '../../types';

interface PersonalTabProps {
  profile: CandidateProfile;
  setProfile: (p: CandidateProfile) => void;
}

export const PersonalTab: React.FC<PersonalTabProps> = ({ profile, setProfile }) => {
  const totalExpMonths = profile.total_experience_months || 0;
  const expYears = Math.floor(totalExpMonths / 12);
  const expMonths = totalExpMonths % 12;
  const experienceDisplay = `${expYears}y ${expMonths > 0 ? `${expMonths}m` : ''}`.trim();
  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
      <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <User className="w-4 h-4 text-indigo-500" />
        <div>
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Personal &amp; Contact Credentials
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Primary candidate identity used on job portal applications (Naukri, LinkedIn, Greenhouse, Lever).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Target Role Headline <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={profile.headline || ''}
              onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
              placeholder="e.g. Senior Data Engineer / Full-Stack Architect"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Contact Phone Number <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={profile.phone || ''}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="+91 98765 43210"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Current Location <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={profile.location || ''}
              onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              placeholder="e.g. Pune, Maharashtra, India"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
            Total Experience:{' '}
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{experienceDisplay}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                min="0"
                max="50"
                value={expYears}
                onChange={(e) => {
                  const yrs = Math.max(0, parseInt(e.target.value) || 0);
                  setProfile({
                    ...profile,
                    total_experience_months: yrs * 12 + expMonths,
                  });
                }}
                placeholder="0"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-400 font-medium">Yrs</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <select
                aria-label="Additional months of experience"
                value={expMonths}
                onChange={(e) => {
                  const mos = parseInt(e.target.value) || 0;
                  setProfile({
                    ...profile,
                    total_experience_months: expYears * 12 + mos,
                  });
                }}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {i} Mos
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            Professional Bio &amp; Summary
          </label>
          <span className="text-[10px] text-slate-400">Used by AI matching &amp; cover letters</span>
        </div>
        <textarea
          rows={3}
          value={profile.summary || ''}
          onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
          placeholder="Experienced engineer specializing in Python, distributed pipelines, and cloud architecture..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    </div>
  );
};
