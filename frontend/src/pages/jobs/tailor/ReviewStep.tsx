import React from 'react';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';
import type { TailoredResume } from '../../../types/tailoring';
import { CHECK_LABELS } from './tailorLogic';
import { ChangeList } from './AnalysisStep';

interface Props {
  item: TailoredResume;
  busy: boolean;
  onDownload: (format: 'docx' | 'pdf') => void;
  onSave: () => void;
  onChangeSelection: () => void;
  onDiscard: () => void;
}

const TONE = { pass: 'success', fail: 'danger', unavailable: 'warning' } as const;
const WORD = { pass: 'Passed', fail: 'Failed', unavailable: 'Not checked' } as const;

export const ReviewStep: React.FC<Props> = ({ item, busy, onDownload, onSave, onChangeSelection, onDiscard }) => {
  const saved = item.status === 'SAVED';
  const passed = Boolean(item.validation?.passed);
  const appliedIds = new Set(item.validation?.applied ?? item.approved_edit_ids);
  const applied = (item.edit_plan?.edits ?? []).filter((e) => appliedIds.has(e.id));
  const skipped = item.validation?.skipped ?? [];
  return (
    <div className="space-y-5">
      {saved ? (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          Saved for this job. When you queue an application for it, this copy is the file that is sent.
        </p>
      ) : passed ? (
        <p role="status" className="text-sm text-slate-700 dark:text-slate-300">Your tailored copy is ready. Review what changed, then save it for this job.</p>
      ) : (
        <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          This copy did not pass every check, so it cannot be saved or downloaded. Choose fewer changes and try again.
        </p>
      )}

      <section aria-labelledby="tailor-checks">
        <h3 id="tailor-checks" className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Checks against your original</h3>
        <ul className="space-y-1.5">
          {(item.validation?.checks ?? []).map((c) => (
            <li key={c.name} className="flex flex-wrap items-start gap-2 text-sm text-slate-800 dark:text-slate-200">
              <StatusChip tone={TONE[c.status]}>{WORD[c.status]}</StatusChip>
              <span><strong>{CHECK_LABELS[c.name] ?? c.name}.</strong> <span className="text-slate-700 dark:text-slate-300">{c.detail}</span></span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Layout is compared by rendering both files with LibreOffice. Microsoft Word may lay text out slightly differently, so open the file once before sending it.</p>
      </section>

      {applied.length > 0 && (
        <section aria-labelledby="tailor-applied" className="space-y-2">
          <h3 id="tailor-applied" className="text-sm font-bold text-slate-900 dark:text-white">What changed</h3>
          <ChangeList edits={applied} />
        </section>
      )}
      {skipped.length > 0 && (
        <p className="text-xs text-slate-700 dark:text-slate-300">Not applied: {skipped.map((s) => s.reason).join('; ')}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {passed && <Button size="sm" disabled={busy} onClick={() => onDownload('docx')}>Download Word file</Button>}
        {passed && item.has_pdf && <Button size="sm" disabled={busy} onClick={() => onDownload('pdf')}>Download PDF</Button>}
        {!saved && passed && <Button variant="primary" size="sm" loading={busy} onClick={onSave}>Save for this job</Button>}
        {!saved && <Button size="sm" disabled={busy} onClick={onChangeSelection}>Choose different changes</Button>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>{saved ? 'Remove this copy' : 'Discard'}</Button>
      </div>
    </div>
  );
};
