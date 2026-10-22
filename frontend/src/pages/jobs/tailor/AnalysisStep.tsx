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
  if (edit.evidence.some((e) => e.fact_id)) return <>Based on a skill you confirmed</>;
  return <>Reordered; no new content</>;
};

export const ChangeList: React.FC<{
  edits: TailoringEdit[];
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}> = ({ edits, selected, onToggle }) => (
  <ul className="space-y-3">
    {edits.map((e) => (
      <li key={e.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
        <div className="flex items-start gap-3">
          {onToggle && selected && (
            <input
              id={`edit-${e.id}`}
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selected.has(e.id)}
              onChange={() => onToggle(e.id)}
              aria-label={`Apply change: ${e.reason || e.type}`}
            />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={e.category === 'B' ? 'info' : 'neutral'}>{e.category === 'B' ? 'Uses a skill you confirmed' : e.type === 'REORDER' ? 'Reorder' : 'Rewording'}</StatusChip>
              {e.requirement && <span className="text-xs text-slate-600 dark:text-slate-400">Helps with: {e.requirement}</span>}
            </div>
            {e.type === 'REWORD' ? (
              <>
                <p className="break-words text-xs text-slate-600 line-through decoration-slate-400 dark:text-slate-400"><span className="sr-only">Before: </span>{e.before}</p>
                <p className="break-words text-slate-900 dark:text-slate-100"><span className="sr-only">After: </span>{e.after}</p>
              </>
            ) : (
              <p className="text-slate-900 dark:text-slate-100">Swap the order of two bullet points in the same list.</p>
            )}
            {e.reason && <p className="text-xs text-slate-700 dark:text-slate-300">{e.reason}</p>}
            <p className="text-xs text-slate-600 dark:text-slate-400"><EvidenceText edit={e} /></p>
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
      setCopied('Copied. Paste them into your own resume.');
    } catch {
      setCopied('Could not copy. Select the text above and copy it manually.');
    }
  };
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set(edits.map((e) => e.id)));

  useEffect(() => {
    setSelected(new Set((item.edit_plan?.edits ?? []).map((e) => e.id)));
    setChoices({});
  }, [item.id, item.edit_plan]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!analysis) return null;
  const answered = analysis.questions.filter((q) => choices[q.id]?.has_it !== undefined);
  const invalid = answered.some((q) => choices[q.id].has_it && (choices[q.id].details || '').trim().length < 10);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const canEdit = item.mode === 'EDIT';

  return (
    <div className="space-y-6">
      <section aria-labelledby="tailor-fit">
        <h3 id="tailor-fit" className="mb-1 text-sm font-bold text-slate-900 dark:text-white">How your resume fits this job</h3>
        <p className="text-sm text-slate-700 dark:text-slate-300">{analysis.match_note}</p>
        {analysis.strengths.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Skills your resume already shows">
            {analysis.strengths.map((s) => (
              <li key={s.id}><StatusChip tone="success">{s.text}</StatusChip></li>
            ))}
          </ul>
        )}
      </section>

      {analysis.questions.length > 0 && (
        <section aria-labelledby="tailor-questions" className="space-y-3">
          <h3 id="tailor-questions" className="text-sm font-bold text-slate-900 dark:text-white">Do you have these? (we never assume)</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">The job asks for these but your resume does not mention them. Only say yes if it is true; a yes lets us use it in this copy.</p>
          {analysis.questions.map((q) => {
            const c = choices[q.id] ?? { details: '' };
            return (
              <fieldset key={q.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-sm font-semibold text-slate-900 dark:text-white">{q.requirement}</legend>
                <p className="text-xs text-slate-600 dark:text-slate-400">{q.ask}</p>
                <div className="mt-2 flex gap-4 text-sm text-slate-800 dark:text-slate-200">
                  <label className="flex items-center gap-1.5"><input type="radio" name={`q-${q.id}`} checked={c.has_it === true} onChange={() => setChoices({ ...choices, [q.id]: { ...c, has_it: true } })} /> Yes, I have</label>
                  <label className="flex items-center gap-1.5"><input type="radio" name={`q-${q.id}`} checked={c.has_it === false} onChange={() => setChoices({ ...choices, [q.id]: { ...c, has_it: false } })} /> No</label>
                </div>
                {c.has_it && (
                  <div className="mt-2 space-y-1">
                    <label htmlFor={`d-${q.id}`} className="text-xs font-semibold text-slate-800 dark:text-slate-200">Where and how did you use it?</label>
                    <textarea
                      id={`d-${q.id}`}
                      rows={2}
                      maxLength={500}
                      value={c.details}
                      onChange={(e) => setChoices({ ...choices, [q.id]: { ...c, details: e.target.value } })}
                      className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    {(c.details || '').trim().length < 10 && <p className="text-xs text-slate-600 dark:text-slate-400">At least 10 characters.</p>}
                  </div>
                )}
              </fieldset>
            );
          })}
          <Button
            size="sm"
            loading={busy}
            disabled={answered.length === 0 || invalid}
            onClick={() => onAnswer(answered.map((q) => ({ question_id: q.id, has_it: Boolean(choices[q.id].has_it), details: choices[q.id].details })))}
          >
            Save my answers
          </Button>
        </section>
      )}

      {analysis.gaps.length > 0 && (
        <section aria-labelledby="tailor-gaps">
          <h3 id="tailor-gaps" className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Not in your resume (we will not add these)</h3>
          <ul className="flex flex-wrap gap-2">
            {analysis.gaps.map((g) => <li key={g.requirement}><StatusChip tone="warning">{g.requirement}</StatusChip></li>)}
          </ul>
        </section>
      )}

      <section aria-labelledby="tailor-changes" className="space-y-3">
        <h3 id="tailor-changes" className="text-sm font-bold text-slate-900 dark:text-white">{canEdit ? 'Proposed changes' : 'Suggested wording'}</h3>
        {canEdit && edits.length === 0 && <p className="text-sm text-slate-700 dark:text-slate-300">No safe wording changes were found for this job. Your resume already reads well for it, or the changes would have needed information it does not contain.</p>}
        {canEdit && edits.length > 0 && <ChangeList edits={edits} selected={selected} onToggle={toggle} />}
        {!canEdit && suggestions.length > 0 && <ChangeList edits={suggestions} />}
        {!canEdit && suggestions.some((s) => s.type === 'REWORD') && (
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={copySuggestions}>Copy suggestions</Button>
            <span role="status" className="text-xs text-slate-700 dark:text-slate-300">{copied}</span>
          </div>
        )}
        {!canEdit && suggestions.length === 0 && <p className="text-sm text-slate-700 dark:text-slate-300">No wording suggestions were found for this job.</p>}
        {!canEdit && <p role="note" className="text-xs text-slate-600 dark:text-slate-400">PDF files cannot be edited without changing their layout. Upload a Word version to get a tailored file.</p>}
        {rejected.length > 0 && (
          <details className="text-xs text-slate-700 dark:text-slate-300">
            <summary className="cursor-pointer font-semibold">{rejected.length} proposed change{rejected.length === 1 ? '' : 's'} refused for your protection</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {rejected.map((r) => <li key={r.id}>{r.reasons.join('; ')}</li>)}
            </ul>
          </details>
        )}
      </section>

      {canEdit && edits.length > 0 && (
        <Button variant="primary" loading={busy} disabled={selected.size === 0} onClick={() => onGenerate(Array.from(selected))}>
          Create tailored resume ({selected.size} change{selected.size === 1 ? '' : 's'})
        </Button>
      )}
    </div>
  );
};
