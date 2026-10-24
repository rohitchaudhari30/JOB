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
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3.5 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          Saved for this job. This tailored resume will be submitted when you apply.
        </div>
      ) : passed ? (
        <div role="status" className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs font-medium text-indigo-900 dark:border-indigo-800/60 dark:bg-indigo-950/20 dark:text-indigo-200">
          Tailored copy ready. Review verified modifications below before saving.
        </div>
      ) : (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-medium text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
          Integrity checks failed. Choose fewer changes and retry.
        </div>
      )}

      {/* Verification Checks */}
      <section aria-labelledby="tailor-checks" className="space-y-2">
        <h3 id="tailor-checks" className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
          Integrity & Formatting Checks
        </h3>
        <ul className="space-y-1.5">
          {(item.validation?.checks ?? []).map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
              <StatusChip tone={TONE[c.status]}>{WORD[c.status]}</StatusChip>
              <span>
                <strong>{CHECK_LABELS[c.name] ?? c.name}.</strong>{' '}
                <span className="text-slate-600 dark:text-slate-400">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">
          Formatting and layout verified against master resume.
        </p>
      </section>

      {/* Applied Changes */}
      {applied.length > 0 && (
        <section aria-labelledby="tailor-applied" className="space-y-2">
          <h3 id="tailor-applied" className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
            Applied Modifications
          </h3>
          <ChangeList edits={applied} />
        </section>
      )}
      {skipped.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Omitted: {skipped.map((s) => s.reason).join('; ')}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
        {passed && (
          <Button size="sm" disabled={busy} onClick={() => onDownload('docx')}>
            Download Word file
          </Button>
        )}
        {passed && item.has_pdf && (
          <Button size="sm" disabled={busy} onClick={() => onDownload('pdf')}>
            Download PDF
          </Button>
        )}
        {!saved && passed && (
          <Button variant="primary" size="sm" loading={busy} onClick={onSave}>
            Save for this job
          </Button>
        )}
        {!saved && (
          <Button size="sm" disabled={busy} onClick={onChangeSelection}>
            Choose different changes
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={onDiscard}>
          {saved ? 'Remove this copy' : 'Discard'}
        </Button>
      </div>
    </div>
  );
};
