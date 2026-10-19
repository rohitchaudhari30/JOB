import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CandidateProfile } from '../../types';
import { POPULAR_SKILLS } from './profileOptions';

interface SkillsTabProps {
  profile: CandidateProfile;
  handleAddSkill: (name?: string, years?: number) => void;
  handleRemoveSkill: (name: string) => void;
  newSkill: string;
  newSkillYears: number;
  setNewSkill: (v: string) => void;
  setNewSkillYears: (v: number) => void;
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  profile,
  handleAddSkill,
  handleRemoveSkill,
  newSkill,
  newSkillYears,
  setNewSkill,
  setNewSkillYears,
}) => {
  return (
    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Skills
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Skills are compared against job descriptions by the multi-stage matching engine.
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
          {profile.skills?.length || 0} registered
        </span>
      </div>

      {/* Current Skills List */}
      <div className="flex flex-wrap gap-2 min-h-[48px] p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
        {profile.skills?.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-1 px-1">
            No skills added yet. Click suggested skills below or type your core technologies.
          </p>
        ) : (
          profile.skills?.map((skill) => (
            <span
              key={skill.skill_name}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 flex items-center space-x-2 shadow-2xs group hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
            >
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{skill.skill_name}</span>
              <span className="text-[10px] text-slate-400 font-normal">({skill.years_experience}y)</span>
              <button
                aria-label="Delete"
                type="button"
                onClick={() => handleRemoveSkill(skill.skill_name)}
                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ml-1"
                title={`Remove ${skill.skill_name}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Add Skill Form */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
        <input
          type="text"
          placeholder="Skill name (e.g. Python, Docker, AWS, SQL)"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddSkill();
            }
          }}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
          <span className="text-[11px] font-bold text-slate-400">Exp:</span>
          <input
            type="number"
            aria-label="Years of experience with this skill"
            min="0"
            max="40"
            value={newSkillYears}
            onChange={(e) => setNewSkillYears(Math.max(0, Number(e.target.value) || 0))}
            className="w-12 bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none text-center"
          />
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Years</span>
        </div>

        <button
          type="button"
          onClick={() => handleAddSkill()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Skill</span>
        </button>
      </div>

      {/* Quick-Add Popular Skills Suggestions */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Quick Add Popular Technologies:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POPULAR_SKILLS.filter(
            (ps) => !profile.skills?.some((s) => s.skill_name.toLowerCase() === ps.toLowerCase()),
          ).map((tech) => (
            <button
              key={tech}
              type="button"
              onClick={() => handleAddSkill(tech, 3)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1"
            >
              <Plus className="w-3 h-3 text-slate-400" />
              <span>{tech}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
