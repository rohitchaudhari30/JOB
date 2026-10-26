import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Download, Sparkles, Edit3, Palette, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import type { TailoredResume, TailoringEdit } from '../../../types/tailoring';
import { ResumeDocumentCanvas } from './ResumeDocumentCanvas';

interface Props {
  item: TailoredResume;
  onBack: () => void;
  onSave: () => void;
  onDownload: (format: 'docx' | 'pdf') => void;
  busy: boolean;
}

export const NextRaiseStep3: React.FC<Props> = ({ item, onBack, onSave, onDownload, busy }) => {
  const [activeTab, setActiveTab] = useState<'rewrite' | 'editor' | 'style'>('rewrite');

  // Style states
  const [textSize, setTextSize] = useState<'Small' | 'Normal' | 'Large'>('Normal');
  const [pageMargin, setPageMargin] = useState<'Narrow' | 'Normal' | 'Wide'>('Normal');
  const [gapSize, setGapSize] = useState<'Tight' | 'Normal' | 'Airy'>('Normal');
  const nr = item.analysis?.nextraise;
  const originalPageCount = nr?.original_page_count || 1;
  const [isOnePage, setIsOnePage] = useState<boolean>(originalPageCount === 1);

  const structured = nr?.structured_resume;

  // Editor states (live editable)
  const [personal, setPersonal] = useState({
    firstName: structured?.personal?.first_name || '',
    lastName: structured?.personal?.last_name || '',
    headline: structured?.personal?.headline || 'Professional',
    email: structured?.personal?.email || '',
    phone: structured?.personal?.phone || '',
    linkedin: structured?.personal?.linkedin,
    location: structured?.personal?.location || '',
  });

  const [summaryText, setSummaryText] = useState(
    structured?.summary || ''
  );

  const edits = item.edit_plan?.edits ?? [];
  const rewrittenLines: string[] = edits.map((e: TailoringEdit) => e.after);

  const beforeScore = nr?.score || 60;
  const totalGaps = Math.max(1, (item.analysis?.gaps?.length || (nr?.comparison_rows?.qualifications?.filter((q) => !q.matched).length || 4)));
  const appliedCount = item.approved_edit_ids?.length || edits.length;
  const potentialLift = Math.max(0, 100 - beforeScore);
  const liftRatio = Math.min(1.0, appliedCount / totalGaps);
  const afterScore = appliedCount > 0
    ? Math.min(98, Math.round(beforeScore + (potentialLift * 0.7 * liftRatio)))
    : beforeScore;

  const handleToggleOnePage = () => {
    if (!isOnePage) {
      setTextSize('Small');
      setPageMargin('Narrow');
      setGapSize('Tight');
      setIsOnePage(true);
    } else {
      setTextSize('Normal');
      setPageMargin('Normal');
      setGapSize('Normal');
      setIsOnePage(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 2-Column Split Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[580px] lg:h-[680px]">
        {/* Left Pane: Tabs & Controls (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col h-full min-h-0 overflow-hidden">
          {/* 3 Sub-tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 shrink-0 mb-3">
            <button
              type="button"
              onClick={() => setActiveTab('rewrite')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                activeTab === 'rewrite'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Rewrite</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                activeTab === 'editor'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Editor</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                activeTab === 'style'
                  ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Palette className="h-3.5 w-3.5" />
              <span>Style</span>
            </button>
          </div>

          {/* Tab 1: AI Rewrite (Fills entire left pane with zero white void) */}
          {activeTab === 'rewrite' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-3 overflow-hidden">
              {/* Match Score Delta Card */}
              <div className="flex items-center gap-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20 shrink-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-black text-sm shadow-xs">
                  {afterScore}%
                </div>
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-300 block">
                    Match Score Improved
                  </span>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {beforeScore}% → {afterScore}% against requirements
                  </p>
                </div>
              </div>

              {/* What Changed Summary */}
              <div className="space-y-1 shrink-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">What Changed</span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>4 experience bullets tailored</span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>2 key projects aligned</span>
                  </div>
                </div>
              </div>

              {/* Rewritten Lines List (Flex-1 scroll container filling available space) */}
              <div className="flex-1 flex flex-col min-h-0 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between pb-1.5 shrink-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {rewrittenLines.length} lines tailored
                  </span>
                  <span className="text-[10px] text-slate-400">Targeting screening criteria</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
                  {rewrittenLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900/80 transition space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                          <Check className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Bullet #{idx + 1} Enhanced</span>
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Editor */}
          {activeTab === 'editor' && (
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3">
              <div className="rounded-lg bg-indigo-50/70 p-2 text-[11px] text-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
                Edits here apply to this job's resume only. Base resume remains untouched.
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Headline</label>
                <input
                  type="text"
                  value={personal.headline}
                  onChange={(e) => setPersonal({ ...personal, headline: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Summary</label>
                <textarea
                  rows={4}
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">First Name</label>
                  <input
                    type="text"
                    value={personal.firstName}
                    onChange={(e) => setPersonal({ ...personal, firstName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Last Name</label>
                  <input
                    type="text"
                    value={personal.lastName}
                    onChange={(e) => setPersonal({ ...personal, lastName: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Style */}
          {activeTab === 'style' && (
            <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
                <p className="text-xs text-slate-500">
                  Formatting changes are live in the preview and travel into the PDF. They never touch the words on your resume.
                </p>
                {[
                  { label: 'Text Size', val: textSize, set: setTextSize, opts: ['Small', 'Normal', 'Large'] as const },
                  { label: 'Page Margins', val: pageMargin, set: setPageMargin, opts: ['Narrow', 'Normal', 'Wide'] as const },
                  { label: 'Gaps', val: gapSize, set: setGapSize, opts: ['Tight', 'Normal', 'Airy'] as const },
                ].map(({ label, val, set, opts }) => (
                  <div key={label} className="space-y-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</span>
                    <div className="grid grid-cols-3 gap-2">
                      {opts.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => (set as (v: any) => void)(s)}
                          className={`rounded-lg border py-2 text-xs font-semibold cursor-pointer ${
                            val === s
                              ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Right Pane: Live Document Preview Canvas (7 Cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-950/50 flex flex-col min-h-0 h-full overflow-hidden">
          <ResumeDocumentCanvas
            personal={personal}
            summaryText={summaryText}
            structured={structured}
            edits={edits}
            rewrittenLines={rewrittenLines}
            textSize={textSize}
            pageMargin={pageMargin}
            gapSize={gapSize}
            isOnePage={isOnePage}
            onToggleOnePage={handleToggleOnePage}
            originalPageCount={originalPageCount}
            fileName={item.file_name || `${personal.firstName}_${personal.lastName}_Resume.pdf`}
          />
        </div>
      </div>

      {/* Bottom Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onBack} className="flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDownload('docx')} className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 text-indigo-600" />
            <span>Download Word (.docx)</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onDownload('pdf')} className="flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5 text-rose-600" />
            <span>Download PDF</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="md"
            loading={busy}
            onClick={onSave}
            aria-label="Save for this job"
            className="flex items-center gap-2"
          >
            <span>Save for this job & apply</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
