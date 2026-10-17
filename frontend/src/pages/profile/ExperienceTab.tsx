import React from 'react';
import { Plus, Trash2, Building } from 'lucide-react';
import type { CandidateProfile } from '../../types';

interface ExperienceTabProps {
  profile: CandidateProfile;
  handleAddExperience: () => void;
  handleRemoveExperience: (idx: number) => void;
  newExpCompany: string;
  newExpDesc: string;
  newExpIsCurrent: boolean;
  newExpTitle: string;
  setNewExpCompany: (v: string) => void;
  setNewExpDesc: (v: string) => void;
  setNewExpIsCurrent: (v: boolean) => void;
  setNewExpTitle: (v: string) => void;
}

export const ExperienceTab: React.FC<ExperienceTabProps> = ({
  profile,
  handleAddExperience,
  handleRemoveExperience,
  newExpCompany,
  newExpDesc,
  newExpIsCurrent,
  newExpTitle,
  setNewExpCompany,
  setNewExpDesc,
  setNewExpIsCurrent,
  setNewExpTitle,
}) => {
  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Work Experience History
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Past and current companies used for auto-completing work history forms.
            </p>
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
            {profile.experiences?.length || 0} roles
          </span>
        </div>

        {/* Experience Cards */}
        <div className="space-y-3">
          {(profile.experiences || []).length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
              <Building className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No past roles added yet.</p>
              <p className="text-[11px] text-slate-400">Add your current and previous companies below.</p>
            </div>
          ) : (
            profile.experiences?.map((exp, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between shadow-2xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{exp.title}</span>
                    {exp.is_current && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400">
                        Current Role
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center space-x-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    <span>{exp.company_name}</span>
                  </div>
                  {exp.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{exp.description}</p>
                  )}
                </div>
                <button
                  aria-label="Delete"
                  type="button"
                  onClick={() => handleRemoveExperience(idx)}
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-1"
                  title="Remove experience"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Experience Section */}
        <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3 pt-3">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Add Work Experience</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Job Title (e.g. Senior Data Engineer)"
              value={newExpTitle}
              onChange={(e) => setNewExpTitle(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Company Name (e.g. Microsoft / Infosys)"
              value={newExpCompany}
              onChange={(e) => setNewExpCompany(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <textarea
            rows={2}
            placeholder="Brief summary of duties, tech stack, and key accomplishments..."
            value={newExpDesc}
            onChange={(e) => setNewExpDesc(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newExpIsCurrent}
                onChange={(e) => setNewExpIsCurrent(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>This is my current role</span>
            </label>

            <button
              type="button"
              onClick={handleAddExperience}
              disabled={!newExpCompany.trim() || !newExpTitle.trim()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Company Role</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
