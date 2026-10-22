import React, { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../../components/ui/Button';
import type { Resume } from '../../../types';

interface Props {
  busy: boolean;
  /** True when the saved posting has no usable description: the user must paste it. */
  needsDescription?: boolean;
  onStart: (masterResumeId?: string, jobDescription?: string) => void;
}

const MIN_PASTED_CHARS = 150;

export const SetupStep: React.FC<Props> = ({ busy, needsDescription: asked = false, onStart }) => {
  const [pasted, setPasted] = useState('');
  // Once asked, keep the box open (the error clears while the next request runs).
  const [needsDescription, setNeedsDescription] = useState(false);
  useEffect(() => { if (asked) setNeedsDescription(true); }, [asked]);
  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selected, setSelected] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listResumes()
      .then((list) => {
        if (!alive) return;
        setResumes(list);
        setSelected((list.find((r) => r.is_default) ?? list[0])?.id ?? '');
      })
      .catch(() => alive && setLoadError(true));
    return () => { alive = false; };
  }, []);

  if (loadError) return <p role="alert" className="text-sm text-rose-800 dark:text-rose-300">Could not load your resumes. Close this and try again.</p>;
  if (!resumes) return <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Loading your resumes…</p>;
  if (resumes.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-800 dark:text-slate-100">You need a resume before it can be tailored.</p>
        <a href="/settings/resumes" className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
          Upload a resume
        </a>
      </div>
    );
  }
  const chosen = resumes.find((r) => r.id === selected);
  const isPdf = chosen?.file_name.toLowerCase().endsWith('.pdf');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        We compare this job with your resume, suggest small wording changes that your resume already supports, and make a
        <strong> separate copy</strong>. Your original resume is never changed.
      </p>
      <div className="space-y-1.5">
        <label htmlFor="tailor-master" className="text-xs font-bold text-slate-800 dark:text-slate-200">Resume to start from</label>
        <select
          id="tailor-master"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>{r.label} ({r.file_name}){r.is_default ? ' · default' : ''}</option>
          ))}
        </select>
      </div>
      {isPdf && (
        <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          PDF files cannot be edited without changing their layout, so you will get suggested wording only. For a tailored file, upload a Word (.docx) version.
        </p>
      )}
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Your resume and this job description are sent to our AI provider to suggest wording. Nothing is added to your resume without evidence from it or your confirmation.
      </p>
      {needsDescription && (
        <div className="space-y-1.5">
          <label htmlFor="tailor-jd" className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Job description (copy it from the job posting)
          </label>
          <textarea
            id="tailor-jd"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            maxLength={40000}
            placeholder="Paste the full job description here…"
            className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Used only for this tailored copy; the saved job is not changed. {pasted.trim().length}/{MIN_PASTED_CHARS}+ characters.
          </p>
        </div>
      )}
      <Button
        variant="primary"
        loading={busy}
        disabled={!selected || (needsDescription && pasted.trim().length < MIN_PASTED_CHARS)}
        onClick={() => onStart(selected, needsDescription ? pasted.trim() : undefined)}
      >
        Analyse this job
      </Button>
    </div>
  );
};
