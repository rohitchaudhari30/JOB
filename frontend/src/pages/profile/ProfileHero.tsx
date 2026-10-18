import React from 'react';
import {
  UserCheck,
  Save,
  Briefcase,
  Clock,
  Sparkles,
  AlertCircle,
  MapPin,
  ArrowRight,
  Check,
  Loader2,
} from 'lucide-react';
import type { CandidateProfile } from '../../types';

interface Props {
  profile: CandidateProfile;
  experienceDisplay: string;
  completenessScore: number;
  missingFields: string[];
  onNavigate: ((tab: any) => void) | undefined;
  handleSaveProfile: (showMessage?: boolean) => void;
  saving: boolean;
  savedSuccess: boolean;
}

export const ProfileHero: React.FC<Props> = ({
  profile,
  experienceDisplay,
  completenessScore,
  missingFields,
  onNavigate,
  handleSaveProfile,
  saving,
  savedSuccess,
}) => (
  <>
    {/* Executive Hero Profile Header */}
    <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Candidate Identity Overview */}
        <div className="flex items-start sm:items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-indigo-500/20 shrink-0">
            {profile.headline ? profile.headline.charAt(0).toUpperCase() : <UserCheck className="w-6 h-6" />}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-black text-slate-900 dark:text-white">
                {profile.headline || 'Candidate Profile'}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60">
                Auto-Apply Profile
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {profile.location && (
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{profile.location}</span>
                </span>
              )}
              {experienceDisplay && (
                <span className="flex items-center space-x-1">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>{experienceDisplay} Exp</span>
                </span>
              )}
              {profile.notice_period_days !== undefined && (
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {profile.notice_period_days === 0 ? 'Immediate' : `${profile.notice_period_days}d Notice`}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Readiness Gauge & Single Authoritative Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
          {/* Readiness Mini Gauge */}
          <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] gap-3">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>Readiness</span>
                </span>
                <span
                  className={`font-black ${
                    completenessScore >= 80
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {completenessScore}%
                </span>
              </div>
              <div className="w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    completenessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${completenessScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Actions: Save Changes (Primary) + Launch Campaigns (Shortcut if ready) */}
          <div className="flex items-center space-x-2">
            {completenessScore >= 80 && onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('direct_apply')}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="Launch automated campaign runs with this candidate profile"
              >
                <span>Go to Campaigns</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            {/* Authoritative Single Save Button */}
            <button
              type="button"
              onClick={() => handleSaveProfile(true)}
              disabled={saving}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer ${
                savedSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Changes Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Missing fields guidance banner (if incomplete) */}
      {missingFields.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center space-x-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Recommended to complete:</span>
          </span>
          {missingFields.map((field, idx) => (
            <span
              key={field}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 font-medium"
            >
              {field}
              {idx < missingFields.length - 1 ? '' : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  </>
);
