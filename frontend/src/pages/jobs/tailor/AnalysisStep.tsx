import React, { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';
import { suggestionsText } from './tailorLogic';
import type { TailoredResume, TailoringAnswer, TailoringEdit } from '../../../types/tailoring';

interface Props {
  item: TailoredResume;
  busy: boolean;
  onAnswer: (answers: TailoringAnswer[]) => void;
  onGenerate: (editIds: string[]) => void;
}

type Choice = { has_it?: boolean; details: string };

const EvidenceText: React.FC<{ edit: TailoringEdit }> = ({ edit }) => {
  const quote = edit.evidence.find((e) => e.quote)?.quote;
  if (quote) return <>From your resume: “{quote}”</>;
  if (edit.evidence.some((e) => e.fact_id)) return <>Verified candidate credential</>;
  return <>Structural reorder</>;
};

export const ChangeList: React.FC<{
  edits: TailoringEdit[];
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}> = ({ edits, selected, onToggle }) => (
  <ul className="space-y-3">
    {edits.map((e) => (
      <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-2xs dark:border-slate-800 dark:bg-slate-900/50">
        <div className="flex items-start gap-3">
          {onToggle && selected && (
            <input
              id={`edit-${e.id}`}
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={selected.has(e.id)}
              onChange={() => onToggle(e.id)}
              aria-label={`Apply change: ${e.reason || e.type}`}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={e.category === 'B' ? 'info' : 'neutral'}>
                {e.category === 'B' ? 'Verified Fact' : e.type === 'REORDER' ? 'Reorder' : 'Rewording'}
              </StatusChip>
              {e.requirement && (
                <span className="text-xs text-slate-500 dark:text-slate-400">Target: {e.requirement}</span>
              )}
            </div>
            {e.type === 'REWORD' ? (
              <div className="space-y-1">
                <p className="break-words text-xs text-slate-400 line-through dark:text-slate-500">
                  <span className="sr-only">Before: </span>{e.before}
                </p>
                <p className="break-words text-xs font-medium text-slate-900 dark:text-slate-100">
                  <span className="sr-only">After: </span>{e.after}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-800 dark:text-slate-200">
                Reorders bullet points to highlight highest-priority qualifications first.
              </p>
            )}
            {e.reason && <p className="text-xs text-slate-600 dark:text-slate-300">{e.reason}</p>}
            <p className="text-[11px] text-slate-400 dark:text-slate-500"><EvidenceText edit={e} /></p>
          </div>
        </div>
      </li>
    ))}
  </ul>
);

export const AnalysisStep: React.FC<Props> = ({ item, busy, onAnswer, onGenerate }) => {
  const analysis = item.analysis;
  const edits = item.edit_plan?.edits ?? [];
  const suggestions = item.edit_plan?.suggestions ?? [];
  const rejected = item.edit_plan?.rejected ?? [];
  const [copied, setCopied] = useState('');
  const copySuggestions = async () => {
    try {
      await navigator.clipboard.writeText(suggestionsText(suggestions));
      setCopied('Copied to clipboard.');
    } catch {
      setCopied('Please select and copy manually.');
    }
  };
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set(edits.map((e) => e.id)));

  useEffect(() => {
    setSelected(new Set((item.edit_plan?.edits ?? []).map((e) => e.id)));
    setChoices({});
  }, [item.id, item.edit_plan]);

  if (!analysis) return null;
  const answered = analysis.questions.filter((q) => choices[q.id]?.has_it !== undefined);
  const invalid = answered.some((q) => choices[q.id].has_it && (choices[q.id].details || '').trim().length < 10);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canEdit = item.mode === 'EDIT';

  return (
    <div className="space-y-5">
      {/* Role Alignment */}
      <section aria-labelledby="tailor-fit" className="space-y-2">
        <h3 id="tailor-fit" className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
          Role Alignment
        </h3>
        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{analysis.match_note}</p>
        {analysis.strengths.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1" aria-label="Demonstrated strengths">
            {analysis.strengths.map((s) => (
              <li key={s.id}><StatusChip tone="success">{s.text}</StatusChip></li>
            ))}
          </ul>
        )}
      </section>

      {/* 1-Click Instant Action Banner */}
      {canEdit && edits.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/70 dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
              ⚡ Ready to Tailor ({selected.size} verified change{selected.size === 1 ? '' : 's'})
            </h4>
            <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300/80">
              Generated strictly from your verified background. Answering extra questions below is completely optional.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={busy}
            disabled={selected.size === 0}
            onClick={() => onGenerate(Array.from(selected))}
          >
            Create tailored resume
          </Button>
        </div>
      )}

      {/* Qualification Verification (Optional Accordion) */}
      {analysis.questions.length > 0 && (
        <details className="group rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-900/30">
          <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-xs text-slate-800 dark:text-slate-200">
            <span className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center rounded-full bg-slate-200 px-2 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                Optional
              </span>
              <span>Boost alignment further ({analysis.questions.length} unverified skill{analysis.questions.length === 1 ? '' : 's'})</span>
            </span>
            <span className="text-xs text-slate-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-3 space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Confirm experiences you possess to incorporate them into this tailored version and remember them for future jobs.
            </p>
            <div className="space-y-2.5">
              {analysis.questions.map((q) => {
                const c = choices[q.id] ?? { details: '' };
                return (
                  <fieldset key={q.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/50">
                    <legend className="px-1 text-xs font-bold text-slate-900 dark:text-white">{q.requirement}</legend>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{q.ask}</p>
                    <div className="mt-2.5 flex gap-4 text-xs font-medium text-slate-800 dark:text-slate-200">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name={`q-${q.id}`} checked={c.has_it === true} onChange={() => setChoices({ ...choices, [q.id]: { ...c, has_it: true } })} />
                        Yes, I have experience
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name={`q-${q.id}`} checked={c.has_it === false} onChange={() => setChoices({ ...choices, [q.id]: { ...c, has_it: false } })} />
                        No
                      </label>
                    </div>
                    {c.has_it && (
                      <div className="mt-2.5 space-y-1">
                        <label htmlFor={`d-${q.id}`} className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          Context / Project Experience
                        </label>
                        <textarea
                          id={`d-${q.id}`}
                          rows={2}
                          maxLength={500}
                          value={c.details}
                          placeholder="Briefly describe your relevant responsibilities or deliverables…"
                          onChange={(e) => setChoices({ ...choices, [q.id]: { ...c, details: e.target.value } })}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                        {(c.details || '').trim().length < 10 && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">Minimum 10 characters required.</p>
                        )}
                      </div>
                    )}
                  </fieldset>
                );
              })}
            </div>
            <Button
              size="sm"
              loading={busy}
              disabled={answered.length === 0 || invalid}
              onClick={() => onAnswer(answered.map((q) => ({ question_id: q.id, has_it: Boolean(choices[q.id].has_it), details: choices[q.id].details })))}
            >
              Save Confirmations
            </Button>
          </div>
        </details>
      )}

      {/* Identified Gaps */}
      {analysis.gaps.length > 0 && (
        <section aria-labelledby="tailor-gaps" className="space-y-1.5">
          <h3 id="tailor-gaps" className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Identified Role Gaps
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Requirements absent from your profile. These will not be fabricated.
          </p>
          <ul className="flex flex-wrap gap-1.5 pt-0.5">
            {analysis.gaps.map((g) => <li key={g.requirement}><StatusChip tone="warning">{g.requirement}</StatusChip></li>)}
          </ul>
        </section>
      )}

      {/* Proposed Changes */}
      <section aria-labelledby="tailor-changes" className="space-y-3">
        <h3 id="tailor-changes" className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
          {canEdit ? 'Proposed Modifications' : 'Suggested Phrasing'}
        </h3>
        {canEdit && edits.length === 0 && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            No safe modifications identified. Your resume already aligns well, or additional details are required.
          </p>
        )}
        {canEdit && edits.length > 0 && <ChangeList edits={edits} selected={selected} onToggle={toggle} />}
        {!canEdit && suggestions.length > 0 && <ChangeList edits={suggestions} />}
        {!canEdit && suggestions.some((s) => s.type === 'REWORD') && (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={copySuggestions}>Copy Suggestions</Button>
            <span role="status" className="text-xs text-slate-600 dark:text-slate-400">{copied}</span>
          </div>
        )}
        {!canEdit && suggestions.length === 0 && (
          <p className="text-xs text-slate-600 dark:text-slate-400">No phrasing suggestions generated for this role.</p>
        )}
        {!canEdit && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <p className="font-semibold text-amber-950 dark:text-amber-100">PDF Mode · Suggestions Only</p>
            <p className="mt-0.5 text-slate-600 dark:text-slate-400">
              PDF files have fixed formatting and cannot be rewritten in place. To generate and download an in-place tailored resume file, select your <strong>Word (.docx)</strong> master resume.
            </p>
          </div>
        )}
        {rejected.length > 0 && (
          <details className="text-xs text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer font-semibold hover:text-slate-900 dark:hover:text-white">
              {rejected.length} edit(s) rejected by safety checks
            </summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {rejected.map((r) => <li key={r.id}>{r.reasons.join('; ')}</li>)}
            </ul>
          </details>
        )}
      </section>

      {canEdit && edits.length > 0 && (
        <div className="pt-2">
          <Button variant="primary" loading={busy} disabled={selected.size === 0} onClick={() => onGenerate(Array.from(selected))}>
            Create tailored resume ({selected.size} change{selected.size === 1 ? '' : 's'})
          </Button>
        </div>
      )}
    </div>
  );
};
