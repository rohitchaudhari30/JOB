import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Sparkles, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import type { TailoredResume } from '../../../types/tailoring';

interface Props {
  item: TailoredResume;
  busy: boolean;
  onBack: () => void;
  onGenerate: (sections: string[], keywords: string[]) => void;
}

export const NextRaiseStep2: React.FC<Props> = ({ item, busy, onBack, onGenerate }) => {
  const [sections, setSections] = useState<Record<string, boolean>>({
    summary: true,
    skills: true,
    experience: true,
    projects: true,
  });

  const nr = item.analysis?.nextraise;
  const initialKeywords = (nr?.missing_keywords && nr.missing_keywords.length > 0)
    ? nr.missing_keywords
    : (item.analysis?.gaps || []).map((g) => ({ name: g.requirement, category: 'SKILLS THE JOB NAMES', selected: true }));

  const [keywords, setKeywords] = useState<Record<string, boolean>>(
    initialKeywords.reduce((acc, k) => ({ ...acc, [k.name]: true }), {})
  );

  const toggleSection = (s: string) => setSections((prev) => ({ ...prev, [s]: !prev[s] }));
  const toggleKeyword = (k: string) => setKeywords((prev) => ({ ...prev, [k]: !prev[k] }));

  const activeSectionCount = Object.values(sections).filter(Boolean).length;
  const activeKeywordList = Object.keys(keywords).filter((k) => keywords[k]);
  const activeKeywordCount = activeKeywordList.length;

  // Weaving loading state
  if (busy) {
    return (
      <div className="py-10 max-w-lg mx-auto flex flex-col items-center text-center space-y-6">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Tailoring For
          </span>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            {item.company || 'Hiring Company'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Usually 10–30 seconds — undo is one click if you change your mind.
          </p>
        </div>

        {/* Shimmering Resume Silhouette */}
        <div className="w-64 rounded-xl border border-slate-200 bg-white p-5 shadow-lg space-y-2.5 animate-pulse dark:border-slate-800 dark:bg-slate-900">
          <div className="flex justify-between items-center">
            <div className="h-3 w-28 rounded bg-slate-300 dark:bg-slate-700" />
            <Sparkles className="h-3.5 w-3.5 text-indigo-500 animate-spin" />
          </div>
          <div className="h-2 w-full rounded bg-indigo-200 dark:bg-indigo-900/60" />
          <div className="h-2 w-5/6 rounded bg-indigo-200 dark:bg-indigo-900/60" />
          <div className="h-2 w-4/6 rounded bg-indigo-200 dark:bg-indigo-900/60" />
          <div className="h-2 w-full rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-2 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
        </div>

        {/* Live Progress Bar */}
        <div className="w-full space-y-1.5 text-left">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-600 dark:text-slate-400">Resume match</span>
            <span className="text-indigo-600 dark:text-indigo-400">Optimizing...</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-indigo-600 rounded-full animate-pulse w-3/4" />
          </div>
        </div>

        {/* Active Weaving Keyword Chips */}
        <div className="flex flex-wrap justify-center gap-1.5 pt-2">
          {activeKeywordList.map((kw, i) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 animate-bounce dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <Check className="h-3 w-3 text-emerald-600" />
              <span>{kw}</span>
            </span>
          ))}
        </div>

        {/* Checklist */}
        <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400 text-left pt-2">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
            <span>✓</span>
            <span>Drafting fixes with AI</span>
          </div>
          <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
            <span className="animate-spin">🔄</span>
            <span>Rewriting your resume</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span>·</span>
            <span>Rescoring against the job</span>
          </div>
        </div>

        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
          Weaving in keywords... {activeKeywordCount}/{activeKeywordCount}
        </span>
      </div>
    );
  }

  const jobSkills = initialKeywords.filter((k) => k.category.includes('JOB') || !k.category.includes('CONTEXT'));
  const contextSkills = initialKeywords.filter((k) => k.category.includes('CONTEXT'));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Align your resume</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Pick what the AI is allowed to touch. Everything else stays exactly as you wrote it.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Column 1: Choose what to enhance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">1. Choose what to enhance</h4>

          <div className="space-y-3">
            {/* Summary */}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 p-3 hover:bg-slate-50/50 cursor-pointer transition dark:border-slate-800 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={sections.summary}
                onChange={() => toggleSection('summary')}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Summary</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Rewrites your summary so the job's own language leads.
                </p>
              </div>
            </label>

            {/* Skills */}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 p-3 hover:bg-slate-50/50 cursor-pointer transition dark:border-slate-800 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={sections.skills}
                onChange={() => toggleSection('skills')}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Skills</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Fills missing skills into your skill categories.
                </p>
              </div>
            </label>

            {/* Work Experience */}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 p-3 hover:bg-slate-50/50 cursor-pointer transition dark:border-slate-800 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={sections.experience}
                onChange={() => toggleSection('experience')}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Work Experience</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adds new bullets under the roles you already have.
                </p>
              </div>
            </label>

            {/* Projects */}
            <label className="flex items-start gap-3 rounded-xl border border-slate-200/80 p-3 hover:bg-slate-50/50 cursor-pointer transition dark:border-slate-800 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={sections.projects}
                onChange={() => toggleSection('projects')}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Projects</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Adds new bullets under your existing projects.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Column 2: Add missing job keywords */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              2. Add missing job keywords ({activeKeywordCount} of {initialKeywords.length})
            </h4>
            <button
              type="button"
              onClick={() => {
                const next = !Object.values(keywords).some(Boolean);
                setKeywords(initialKeywords.reduce((acc, k) => ({ ...acc, [k.name]: next }), {}));
              }}
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-400 cursor-pointer"
            >
              {Object.values(keywords).some(Boolean) ? 'Clear' : 'Select all'}
            </button>
          </div>

          <div className="space-y-4">
            {/* Group 1: Skills the job names */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Skills the job names · {jobSkills.length}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {jobSkills.map((k) => (
                  <button
                    key={k.name}
                    type="button"
                    onClick={() => toggleKeyword(k.name)}
                    className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-semibold text-left transition cursor-pointer ${
                      keywords[k.name]
                        ? 'border-indigo-400 bg-indigo-50/70 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                    }`}
                  >
                    <span className="truncate pr-1">{k.name}</span>
                    {keywords[k.name] && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Group 2: Context keywords */}
            {contextSkills.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Context keywords · {contextSkills.length}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {contextSkills.map((k) => (
                    <button
                      key={k.name}
                      type="button"
                      onClick={() => toggleKeyword(k.name)}
                      className={`flex items-center justify-between rounded-xl border p-2.5 text-xs font-semibold text-left transition cursor-pointer ${
                        keywords[k.name]
                          ? 'border-indigo-400 bg-indigo-50/70 text-indigo-900 dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <span className="truncate pr-1">{k.name}</span>
                      {keywords[k.name] && <Check className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
        <Button variant="secondary" size="sm" onClick={onBack} className="flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back</span>
        </Button>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {activeSectionCount} sections · {activeKeywordCount} keywords
          </span>
          <Button
            variant="primary"
            size="md"
            onClick={() => onGenerate(Object.keys(sections).filter((s) => sections[s]), activeKeywordList)}
            className="flex items-center gap-2"
          >
            <span>Generate my new resume · {activeKeywordCount + activeSectionCount}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
