import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { api } from '../../../services/api';
import { SetupStep } from './SetupStep';
import { AnalysisStep } from './AnalysisStep';
import { ReviewStep } from './ReviewStep';
import { useTailoring } from './useTailoring';
import { saveBlob, workingText } from './tailorLogic';
import { refreshSavedTailored } from './savedTailoredStore';

interface Props {
  open: boolean;
  jobId: string;
  jobTitle: string;
  onClose: () => void;
  /** Called after a copy is saved or discarded so the job panel can refresh its indicator. */
  onChanged?: () => void;
}

/** Whole tailoring flow in one dialog; the server status decides which step shows. */
export const TailorResumeDialog: React.FC<Props> = ({ open, jobId, jobTitle, onClose, onChanged }) => {
  const t = useTailoring(jobId);
  const { item, error, busy, working, loadingExisting } = t;
  const [reselect, setReselect] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const { loadExisting } = t;

  useEffect(() => {
    if (open) {
      setReselect(false);
      setDownloadError('');
      void loadExisting();
    }
  }, [open, loadExisting]);

  const download = async (format: 'docx' | 'pdf') => {
    if (!item) return;
    setDownloadError('');
    try {
      const blob = await api.downloadTailored(item.id, format);
      const base = (item.file_name || 'tailored-resume.docx').replace(/\.(docx|pdf)$/i, '');
      saveBlob(blob, `${base}.${format}`);
    } catch {
      setDownloadError('Could not download the file. Please try again.');
    }
  };

  const changed = async () => { await refreshSavedTailored(); onChanged?.(); };
  const save = async () => { await t.save(); await changed(); };
  const discard = async () => { await t.discard(); await changed(); };
  const status = item?.status;
  const deadEnd = status === 'FAILED' || status === 'STALE' || status === 'CANCELLED';

  let body: React.ReactNode;
  if (loadingExisting) body = <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Loading…</p>;
  else if (!item) body = <SetupStep busy={busy} needsDescription={error?.code === 'JOB_DESCRIPTION_TOO_SHORT'} onStart={t.start} />;
  else if (working) {
    body = (
      <div className="space-y-3">
        <p role="status" className="text-sm text-slate-800 dark:text-slate-100">{workingText(item.status)}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">You can close this window; the work continues and will be here when you come back.</p>
        <Button size="sm" onClick={() => void t.cancel()} disabled={busy}>Cancel</Button>
      </div>
    );
  } else if (deadEnd) {
    body = (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-slate-800 dark:text-slate-100">
          {item.error_message || (status === 'STALE' ? 'Your resume or the job changed, so this copy is out of date.' : 'This request did not finish.')}
        </p>
        <Button variant="primary" size="sm" onClick={t.reset}>Start again</Button>
      </div>
    );
  } else if (status === 'AWAITING_INPUT' || reselect) {
    body = <AnalysisStep item={item} busy={busy} onAnswer={(a) => void t.answer(a)} onGenerate={(ids) => { setReselect(false); void t.generate(ids); }} />;
  } else {
    body = <ReviewStep item={item} busy={busy} onDownload={download} onSave={save} onChangeSelection={() => setReselect(true)} onDiscard={discard} />;
  }

  return (
    <Modal open={open} onClose={onClose} title={`Tailor resume · ${jobTitle}`} widthClass="max-w-3xl" dismissible={!busy}>
      <div className="space-y-3">
        {body}
        {error && (
          <p role="alert" className="text-sm text-rose-800 dark:text-rose-300">
            {error.message}
            {error.code === 'NO_RESUME' && <> <a className="underline" href="/settings/resumes">Upload a resume</a></>}
          </p>
        )}
        {downloadError && <p role="alert" className="text-sm text-rose-800 dark:text-rose-300">{downloadError}</p>}
      </div>
    </Modal>
  );
};
