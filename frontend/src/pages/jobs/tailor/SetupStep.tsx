import React, { useEffect, useState } from 'react';
import {
  Sparkles,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import { api } from '../../../services/api';
import { Button } from '../../../components/ui/Button';
import type { Resume } from '../../../types';

interface Props {
  busy: boolean;
  /** True when the saved posting has no usable description: the user must paste it. */
  needsDescription?: boolean;
  onStart: (masterResumeId?: string, jobDescription?: string) => void;
  jobTitle?: string;
  applyUrl?: string;
}

const MIN_PASTED_CHARS = 150;

export const SetupStep: React.FC<Props> = ({
  busy,
  needsDescription: asked = false,
  onStart,
  jobTitle = '',
  applyUrl = '',
}) => {
  const [pasted, setPasted] = useState('');
  const [needsDescription, setNeedsDescription] = useState(false);
  useEffect(() => {
    if (asked) setNeedsDescription(true);
  }, [asked]);

  const [resumes, setResumes] = useState<Resume[] | null>(null);
  const [selected, setSelected] = useState('');
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listResumes()
      .then((list) => {
        if (!alive) return;
        setResumes(list);
        setSelected((list.find((r) => r.is_default) ?? list[0])?.id ?? '');
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        Unable to load resumes. Please retry.
      </div>
    );
  }

  if (!resumes) {
    return (
      <div className="flex items-center justify-center space-x-3 py-10 text-xs text-slate-500 dark:text-slate-400">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <span>Loading master resumes…</span>
      </div>
    );
  }

  if (resumes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
          <FileText className="h-5 w-5" />
        </div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">No Master Resume Found</h4>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          Upload a master resume first to tailor it against this role.
        </p>
        <div className="mt-4">
          <a
            href="/settings/resumes"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
          >
            Upload a resume
          </a>
        </div>
      </div>
    );
  }

  const chosen = resumes.find((r) => r.id === selected);
  const isPdf = chosen?.file_name.toLowerCase().endsWith('.pdf');
  const pastedLength = pasted.trim().length;
  const isPastedValid = pastedLength >= MIN_PASTED_CHARS;

  return (
    <div className="space-y-4">
      {/* Value Pillars Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 p-4 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-600/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
            <Sparkles className="h-3 w-3" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Role-Specific Resume Alignment
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Tailors your authentic career achievements specifically for this role without altering your master resume.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-200/60 pt-2.5 text-[11px] font-medium text-slate-600 sm:grid-cols-3 dark:border-slate-800 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Verified Facts Only</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Layout Preserved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Independent Copy</span>
          </div>
        </div>
      </div>

      {/* Resume Selection Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between pb-2">
          <label htmlFor="tailor-master" className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Master Resume
          </label>
          {chosen && (
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isPdf
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              {isPdf ? 'PDF · Suggestions Mode' : 'DOCX · In-Place Editing'}
            </span>
          )}
        </div>

        <div className="relative">
          <select
            id="tailor-master"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50/50 py-2.5 pl-3.5 pr-10 text-xs font-medium text-slate-900 shadow-2xs transition hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400 dark:focus:bg-slate-900"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} ({r.file_name}) {r.is_default ? '★ Default' : ''}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {isPdf && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-200/70 bg-amber-50/50 p-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p>
              PDF mode generates wording suggestions to preserve formatting. Upload a <strong>.docx</strong> file for direct document export.
            </p>
          </div>
        )}
      </div>

      {/* Emergency Fallback Description Box (Only shown if source crawl fails) */}
      {needsDescription && (
        <div className="space-y-3 rounded-xl border border-amber-300/80 bg-amber-50/50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h5 className="text-xs font-bold text-amber-950 dark:text-amber-100">
                Job Description Required
              </h5>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Direct link unavailable. Paste the job description below to analyze requirements.
              </p>
            </div>
            {applyUrl && (
              <a
                href={applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 shadow-2xs hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
              >
                <span>Open Posting</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="tailor-jd" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Job description (copy it from the job posting)
              </label>
              <span
                className={`text-[11px] font-mono font-medium ${
                  isPastedValid
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {pastedLength} / {MIN_PASTED_CHARS}+ characters {isPastedValid ? '✓' : ''}
              </span>
            </div>
            <textarea
              id="tailor-jd"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={6}
              maxLength={40000}
              placeholder="Paste responsibilities and requirements from the job posting…"
              className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs text-slate-900 shadow-2xs transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-end border-t border-slate-200/80 pt-3.5 dark:border-slate-800">
        <Button
          variant="primary"
          loading={busy}
          disabled={!selected || (needsDescription && !isPastedValid)}
          onClick={() => onStart(selected, needsDescription ? pasted.trim() : undefined)}
          className="min-w-[160px] shadow-sm shadow-indigo-600/20"
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            <span>Analyse this job</span>
          </span>
        </Button>
      </div>
    </div>
  );
};
