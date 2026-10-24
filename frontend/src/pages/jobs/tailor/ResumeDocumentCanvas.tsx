import React from 'react';
import { FileText, Layers, CheckCircle2 } from 'lucide-react';
import type { StructuredResumeData, TailoringEdit } from '../../../types/tailoring';
import { cleanResumeFileName } from './tailorLogic';

interface Props {
  personal: {
    firstName: string;
    lastName: string;
    headline: string;
    email: string;
    phone: string;
    linkedin?: string;
    location: string;
  };
  summaryText: string;
  structured?: StructuredResumeData;
  edits?: TailoringEdit[];
  rewrittenLines?: string[];
  textSize: 'Small' | 'Normal' | 'Large';
  pageMargin: 'Narrow' | 'Normal' | 'Wide';
  gapSize: 'Tight' | 'Normal' | 'Airy';
  isOnePage: boolean;
  onToggleOnePage: () => void;
  fileName?: string;
}

export const ResumeDocumentCanvas: React.FC<Props> = ({
  personal,
  summaryText,
  structured,
  edits = [],
  rewrittenLines = [],
  textSize,
  pageMargin,
  gapSize,
  isOnePage,
  onToggleOnePage,
  fileName,
}) => {
  const fontClass = textSize === 'Small' ? 'text-[11px]' : textSize === 'Large' ? 'text-[13px]' : 'text-xs';
  const marginClass = pageMargin === 'Narrow' ? 'p-5' : pageMargin === 'Wide' ? 'p-8 sm:p-10' : 'p-6 sm:p-8';
  const gapClass = gapSize === 'Tight' ? 'space-y-2' : gapSize === 'Airy' ? 'space-y-4' : 'space-y-3';
  const docTitle = React.useMemo(() => {
    const candidate = `${personal.firstName} ${personal.lastName}`.trim();
    return cleanResumeFileName(fileName, candidate, 'pdf');
  }, [fileName, personal.firstName, personal.lastName]);

  const resolveBullet = (bullet: string, expIdx: number, bulletIdx: number) => {
    const matchedEdit = edits.find((e) => {
      const bClean = bullet.toLowerCase().trim();
      const beforeClean = (e.before || '').toLowerCase().trim();
      return beforeClean.length > 15 && (bClean.includes(beforeClean.slice(0, 30)) || beforeClean.includes(bClean.slice(0, 30)));
    });
    if (matchedEdit) return { text: matchedEdit.after, isTailored: true };
    const flatIdx = expIdx * 3 + bulletIdx;
    if (edits.length === 0 && rewrittenLines[flatIdx] && (bulletIdx === 1 || bulletIdx === 2)) {
      return { text: rewrittenLines[flatIdx], isTailored: true };
    }
    return { text: bullet, isTailored: false };
  };

  const experiences = structured?.experiences || [];
  const projects = structured?.projects || [];
  const education = structured?.education || [];
  const certifications = structured?.certifications || [];

  const renderHeader = (isContinuation = false) => (
    <div className="border-b border-slate-200 dark:border-slate-800 pb-3 mb-3">
      {isContinuation ? (
        <div className="flex justify-between items-center text-xs">
          <span className="font-black text-slate-900 dark:text-white uppercase tracking-tight">
            {personal.firstName} {personal.lastName} · {personal.headline}
          </span>
          <span className="text-[10px] text-slate-500">{personal.email}</span>
        </div>
      ) : (
        <div className="text-center space-y-1">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
            {personal.firstName} {personal.lastName}
          </h1>
          <p className="text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400">{personal.headline}</p>
          <div className="flex flex-wrap justify-center items-center gap-x-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
            {personal.phone && <span>{personal.phone}</span>}
            {personal.phone && personal.email && <span>|</span>}
            {personal.email && <span>{personal.email}</span>}
            {personal.location && <span>|</span>}
            {personal.location && <span>{personal.location}</span>}
            {personal.linkedin && <span>|</span>}
            {personal.linkedin && (
              <a href={personal.linkedin} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
                LinkedIn
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderSummary = () => {
    if (!summaryText && !structured?.summary) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-1.5">
          Professional Summary
        </h2>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-justify">{summaryText || structured?.summary}</p>
      </div>
    );
  };

  const renderSkills = () => {
    const hasCats = structured?.skills_categories && structured.skills_categories.length > 0;
    const hasSkills = structured?.skills && structured.skills.length > 0;
    if (!hasCats && !hasSkills) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-1.5">
          Technical Skills
        </h2>
        <div className="space-y-1 text-slate-700 dark:text-slate-300">
          {hasCats ? (
            structured!.skills_categories!.map((c) => (
              <p key={c.category} className="leading-snug">
                <span className="font-bold text-slate-900 dark:text-white">{c.category}: </span>
                <span>{c.skills}</span>
              </p>
            ))
          ) : (
            <p className="leading-snug">
              <span className="font-bold text-slate-900 dark:text-white">Core Skills: </span>
              <span>{structured!.skills!.join(' · ')}</span>
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderExperience = (expList: typeof experiences) => {
    if (!expList || expList.length === 0) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-2">
          Work Experience
        </h2>
        <div className="space-y-3">
          {expList.map((exp, expIdx) => (
            <div key={`${exp.company}-${expIdx}`} className="space-y-1">
              <div className="flex flex-wrap justify-between items-baseline font-bold">
                <span className="text-slate-900 dark:text-white">
                  {exp.title} <span className="text-slate-400 font-normal">·</span> {exp.company}
                </span>
                <span className="text-slate-500 font-normal text-[10px] sm:text-[11px]">
                  {exp.location ? `${exp.location} | ` : ''}{exp.dates}
                </span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                {exp.bullets.map((b, bIdx) => {
                  const res = resolveBullet(b, expIdx, bIdx);
                  return (
                    <li
                      key={bIdx}
                      className={`leading-relaxed ${
                        res.isTailored
                          ? 'bg-amber-100/90 text-amber-950 font-medium px-1.5 py-0.5 rounded border-l-2 border-amber-500 dark:bg-amber-950/70 dark:text-amber-200'
                          : ''
                      }`}
                    >
                      <span>{res.text}</span>
                      {res.isTailored && (
                        <span className="inline-flex items-center gap-0.5 ml-1.5 px-1 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                          <CheckCircle2 className="w-2.5 h-2.5 text-amber-700 dark:text-amber-300 inline" />
                          <span>Optimized</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProjects = () => {
    if (!projects || projects.length === 0) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-2">
          Key Projects
        </h2>
        <div className="space-y-2.5">
          {projects.map((proj, pIdx) => (
            <div key={pIdx} className="space-y-0.5">
              <div className="flex flex-wrap justify-between items-baseline font-bold">
                <span className="text-slate-900 dark:text-white">{proj.title}</span>
                {proj.technologies && <span className="text-slate-400 font-normal text-[10px]">{proj.technologies}</span>}
              </div>
              {proj.bullets.length > 0 && (
                <ul className="list-disc pl-4 space-y-1 text-slate-700 dark:text-slate-300">
                  {proj.bullets.map((pb, pbIdx) => <li key={pbIdx} className="leading-relaxed">{pb}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderEducation = () => {
    if (!education || education.length === 0) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-1.5">
          Education
        </h2>
        <div className="space-y-1 text-slate-700 dark:text-slate-300">
          {education.map((edu, eIdx) => (
            <div key={eIdx} className="flex justify-between items-baseline">
              <span className="font-semibold text-slate-900 dark:text-white">
                {edu.degree} · <span className="font-normal text-slate-600 dark:text-slate-400">{edu.institution}</span>
              </span>
              <span className="text-slate-500 font-medium text-[10px] sm:text-[11px]">
                {edu.details ? `${edu.details} · ` : ''}{edu.dates}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCertifications = () => {
    if (!certifications || certifications.length === 0) return null;
    return (
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 pb-0.5 dark:border-slate-800 mb-1.5">
          Certifications
        </h2>
        <ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-300">
          {certifications.map((cert, cIdx) => <li key={cIdx} className="leading-relaxed">{cert}</li>)}
        </ul>
      </div>
    );
  };

  const hasStructuredContent = experiences.length > 0 || projects.length > 0 || education.length > 0 || Boolean(summaryText);
  const renderRawFallback = () => {
    if (hasStructuredContent || !structured?.raw_text) return null;
    return (
      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
        {structured.raw_text}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 justify-between">
      <div className="flex flex-wrap items-center justify-between pb-3 mb-2 border-b border-slate-200 dark:border-slate-800 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-indigo-600 shrink-0" />
          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate max-w-xs" title={docTitle}>
            {docTitle}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 select-none">
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>{isOnePage ? '1 Page' : '2 Pages'}</span>
          </span>

          <button
            type="button"
            onClick={onToggleOnePage}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
              isOnePage
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            {isOnePage ? '✓ Fitted to 1 page' : 'Fit to 1 page'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2 sm:p-4 flex flex-col items-center space-y-6 scroll-smooth overscroll-contain">
        {isOnePage ? (
          <div className={`w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900 ${marginClass} ${fontClass} leading-relaxed text-slate-800 dark:text-slate-200`}>
            {renderHeader(false)}
            <div className={gapClass}>
              {renderRawFallback()}
              {renderSummary()}
              {renderSkills()}
              {renderExperience(experiences.slice(0, 2))}
              {renderProjects()}
              {renderEducation()}
              {renderCertifications()}
            </div>
            <div className="mt-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between">
              <span>{personal.firstName} {personal.lastName} · Resume</span>
              <span>1 Page View</span>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6">
            <div className={`w-full rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900 ${marginClass} ${fontClass} leading-relaxed text-slate-800 dark:text-slate-200`}>
              {renderHeader(false)}
              <div className={gapClass}>
                {renderRawFallback()}
                {renderSummary()}
                {renderSkills()}
                {renderExperience(experiences)}
              </div>
              <div className="mt-6 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between">
                <span>{personal.firstName} {personal.lastName} · Professional Experience</span>
                <span>Page 1 of 2</span>
              </div>
            </div>

            <div className="w-full flex items-center gap-3 text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest my-2 select-none">
              <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                Page Break · Continued Below
              </span>
              <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1" />
            </div>

            <div className={`w-full rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900 ${marginClass} ${fontClass} leading-relaxed text-slate-800 dark:text-slate-200`}>
              {renderHeader(true)}
              <div className={gapClass}>
                {renderProjects()}
                {renderEducation()}
                {renderCertifications()}
              </div>
              <div className="mt-6 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between">
                <span>{personal.firstName} {personal.lastName} · Projects & Credentials</span>
                <span>Page 2 of 2</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
