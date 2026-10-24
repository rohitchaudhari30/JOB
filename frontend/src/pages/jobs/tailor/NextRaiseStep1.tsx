import React from 'react';
import { Button } from '../../../components/ui/Button';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, ArrowRight } from 'lucide-react';
import type { TailoredResume } from '../../../types/tailoring';

interface Props {
  item: TailoredResume;
  onContinue: () => void;
}

export const NextRaiseStep1: React.FC<Props> = ({ item, onContinue }) => {
  const analysis = item.analysis;
  const nr = analysis?.nextraise;

  // Dynamic metrics derived from NextRaise analysis or base requirements
  const score = nr?.score ?? (analysis?.strengths?.length && analysis?.requirements?.length ? Math.min(Math.round((analysis.strengths.length / analysis.requirements.length) * 100), 100) : 60);
  const scoreLabel = nr?.score_label ?? (score >= 80 ? 'Strong match' : score >= 55 ? 'Fair match' : 'Needs alignment');

  const reqMatched = nr?.breakdown?.requirements?.matched ?? (analysis?.strengths?.length || 0);
  const reqTotal = nr?.breakdown?.requirements?.total ?? (analysis?.requirements?.length || 0);
  const reqPct = nr?.breakdown?.requirements?.percentage ?? (reqTotal > 0 ? Math.round((reqMatched / reqTotal) * 100) : 0);

  const respMatched = nr?.breakdown?.responsibilities?.matched ?? 0;
  const respTotal = nr?.breakdown?.responsibilities?.total ?? 0;
  const respPct = nr?.breakdown?.responsibilities?.percentage ?? (respTotal > 0 ? Math.round((respMatched / respTotal) * 100) : 0);

  const skillsMatched = nr?.breakdown?.skills?.matched ?? 0;
  const skillsTotal = nr?.breakdown?.skills?.total ?? 0;
  const skillsPct = nr?.breakdown?.skills?.percentage ?? (skillsTotal > 0 ? Math.round((skillsMatched / skillsTotal) * 100) : 0);

  const titlePct = nr?.breakdown?.job_title?.score ?? 50;

  const rows = nr?.comparison_rows;
  const recruiterView = rows?.recruiter_perspective || (
    `Your resume is technically impressive. When applying for ${item.job_title || 'this role'} at ${item.company || 'the company'}, ` +
    `tailoring highlights your relevant reporting, ETL pipelines, and business stakeholder impact so screening software immediately scores you in the top candidate tier.`
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-170px)] justify-between space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch flex-1">
        {/* Left Card: Score & Progress */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between">
          <div className="space-y-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Your Match
            </span>

            {/* Circular Gauge */}
            <div className="flex flex-col items-center justify-center pt-2">
              <div className="relative flex items-center justify-center">
                <svg width="150" height="90" viewBox="0 0 150 90" className="overflow-visible">
                  {/* Background Arc */}
                  <path
                    d="M 15 80 A 60 60 0 0 1 135 80"
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="12"
                    strokeLinecap="round"
                    className="dark:stroke-slate-800"
                  />
                  {/* Foreground Gradient Arc */}
                  <path
                    d="M 15 80 A 60 60 0 0 1 135 80"
                    fill="none"
                    stroke={score >= 80 ? '#10B981' : score >= 55 ? '#F59E0B' : '#EF4444'}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={Math.PI * 60}
                    strokeDashoffset={Math.PI * 60 - (score / 100) * (Math.PI * 60)}
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>

                {/* Score Number inside Gauge */}
                <div className="absolute top-8 flex flex-col items-center text-center">
                  <span className="text-3xl font-black text-slate-900 dark:text-white leading-none tracking-tight">
                    {score}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 mt-1">
                    out of 100
                  </span>
                </div>
              </div>

              <span
                className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                  score >= 80
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : score >= 55
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                }`}
              >
                {scoreLabel}
              </span>
            </div>

            {/* Breakdown Progress Bars */}
            <div className="space-y-3.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600 dark:text-slate-400">Requirements</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{reqMatched} of {reqTotal} · {reqPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${reqPct}%` }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600 dark:text-slate-400">Responsibilities</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{respMatched} of {respTotal} · {respPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-teal-500 rounded-full transition-all duration-700" style={{ width: `${respPct}%` }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600 dark:text-slate-400">Skills</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{skillsMatched} of {skillsTotal} · {skillsPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${skillsPct}%` }} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-600 dark:text-slate-400">Job title</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{titlePct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-700" style={{ width: `${titlePct}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">Scored Resume</span>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5" title={item.file_name || 'Resume'}>
              {nr?.scored_resume_name || item.master_label || item.file_name || 'Your Resume'}
            </span>
          </div>
        </div>

        {/* Right Card: Side-by-Side Comparison Table */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {score >= 80 ? (
                  <span>Your resume is a <span className="text-emerald-600 dark:text-emerald-400">strong match</span> for this job</span>
                ) : score >= 55 ? (
                  <span>Your resume is a <span className="text-amber-600 dark:text-amber-400">fair match</span> for this job</span>
                ) : (
                  <span>Your resume <span className="text-rose-600 dark:text-rose-400">needs alignment</span> for this job</span>
                )}
              </h3>
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-50/70 border border-indigo-100 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-900/50 dark:text-indigo-200">
                <Info className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>Tailoring rewrites the sections that should carry them.</span>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">
                    <th className="py-2.5 pr-4 w-36">Overview</th>
                    <th className="py-2.5 px-3 w-1/2">
                      <span className="text-indigo-600 dark:text-indigo-400">{item.company || 'Company'}</span> · {item.job_title || 'Job'}
                    </th>
                    <th className="py-2.5 pl-3 w-1/2">Your Resume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {/* Job Title Row */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span>Job title</span>
                    </td>
                    <td className="py-3 px-3">{item.job_title || 'Data Analyst - Power BI Job'}</td>
                    <td className="py-3 pl-3 text-slate-500 dark:text-slate-400">{nr?.structured_resume?.personal?.headline || 'Data Engineer'}</td>
                  </tr>

                  {/* Years of Experience Row */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>Years of experience</span>
                    </td>
                    <td className="py-3 px-3">2+ years</td>
                    <td className="py-3 pl-3 text-slate-500 dark:text-slate-400">2 years on your resume</td>
                  </tr>

                  {/* Required Qualifications Row */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-start gap-1.5 pt-3.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>Required qualifications</span>
                    </td>
                    <td colSpan={2} className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(rows?.qualifications || [
                          { name: '2+ years', matched: true },
                          { name: 'Computer Science degree', matched: true },
                          { name: 'Power Automate workflow', matched: true },
                          { name: 'SharePoint Online', matched: true },
                          { name: 'SQL', matched: true },
                          { name: 'Power BI', matched: true },
                          { name: 'ETL processes', matched: true },
                          { name: 'Management skills', matched: true },
                          { name: 'Communication skills', matched: false },
                        ]).map((q, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                              q.matched
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400'
                            }`}
                          >
                            {q.matched ? <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <span className="text-slate-400">➖</span>}
                            <span>{q.name}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>

                  {/* Core Responsibilities Row */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-start gap-1.5 pt-3.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>Core responsibilities</span>
                    </td>
                    <td colSpan={2} className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(rows?.responsibilities || [
                          { name: 'Datasets to identify', matched: true },
                          { name: 'Power Query transformations', matched: true },
                          { name: 'Automated workflows', matched: true },
                          { name: 'Python-based solutions', matched: true },
                          { name: 'Power BI dashboards', matched: true },
                          { name: 'Data validation', matched: true },
                          { name: 'CDID Code creations', matched: false },
                        ]).map((r, idx) => (
                          <span
                            key={idx}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                              r.matched
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400'
                            }`}
                          >
                            {r.matched ? <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> : <span className="text-slate-400">➖</span>}
                            <span>{r.name}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>

                  {/* Job Keywords Row */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-start gap-1.5 pt-3.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>Job keywords</span>
                    </td>
                    <td colSpan={2} className="py-3 px-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(rows?.keywords || [
                          { name: 'DAX', matched: true },
                          { name: 'Dashboard Development', matched: true },
                          { name: 'Data Analytics', matched: true },
                          { name: 'Data Modeling', matched: true },
                          { name: 'Data Pipelines', matched: true },
                          { name: 'ETL', matched: true },
                          { name: 'Power BI', matched: true },
                          { name: 'Power Query', matched: true },
                          { name: 'Python', matched: true },
                        ]).map((k, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            <span>{k.name}</span>
                          </span>
                        ))}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          +6 more
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* What a Recruiter Sees */}
                  <tr>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white flex items-start gap-1.5 pt-3.5">
                      <span className="text-slate-400 font-normal">➖</span>
                      <span>What a recruiter sees</span>
                    </td>
                    <td colSpan={2} className="py-3 px-3 leading-relaxed text-slate-600 dark:text-slate-300">
                      {recruiterView}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 mt-auto">
        <span className="text-xs text-slate-400">
          Tailoring aligns key terminology and achievements with this employer's requirements.
        </span>
        <Button variant="primary" size="md" onClick={onContinue} className="flex items-center gap-2">
          <span>Improve and tailor my resume for this job</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
