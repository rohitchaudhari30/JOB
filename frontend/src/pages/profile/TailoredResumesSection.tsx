import React, { useState } from 'react';
import { api } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { refreshSavedTailored, useSavedTailored } from '../jobs/tailor/savedTailoredStore';
import { saveBlob } from '../jobs/tailor/tailorLogic';

/** Every saved job-specific resume, with download and remove. Created from a job card's "Tailor resume". */
export const TailoredResumesSection: React.FC = () => {
  const items = useSavedTailored();
  const { showSuccess, showError } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const download = async (id: string, fileName?: string | null) => {
    setBusyId(id);
    try {
      saveBlob(await api.downloadTailored(id, 'docx'), fileName || 'tailored-resume.docx');
    } catch {
      showError('Could not download this file. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`Remove the tailored resume for "${title}"? Your master resume is not affected.`)) return;
    setBusyId(id);
    try {
      await api.discardTailored(id);
      await refreshSavedTailored();
      showSuccess('Tailored resume removed.');
    } catch (e: any) {
      showError(e?.response?.data?.detail || 'Could not remove it.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="tailored-heading" className="mt-8 space-y-3">
      <h3 id="tailored-heading" className="text-sm font-bold text-slate-900 dark:text-white">Tailored resumes</h3>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Saved copies made for a specific job. Each one is sent only when you apply to that job.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          None yet. Open the Jobs page and click “Tailor resume” on a job.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
          {items.map((i) => {
            const title = `${i.job_title || 'Job'}${i.company ? ` · ${i.company}` : ''}`;
            return (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Based on {i.master_label || 'your resume'}
                    {i.approved_at ? ` · saved ${new Date(i.approved_at).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === i.id} onClick={() => void download(i.id, i.file_name)}>Download</Button>
                  <Button size="sm" variant="ghost" disabled={busyId === i.id} onClick={() => void remove(i.id, title)}>Remove</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
