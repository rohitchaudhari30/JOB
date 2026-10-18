import React, { useState } from 'react';
import { FileText, Upload, Trash2, Check, Loader2, Download } from 'lucide-react';
import { api } from '../../services/api';
import { Resume } from '../../types';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';

interface ResumeLibraryTabProps {
  resumes: Resume[];
  onResumesChange: (resumes: Resume[]) => void;
  /** Used as the default target role for new uploads. */
  defaultTargetRole: string;
}

export const ResumeLibraryTab: React.FC<ResumeLibraryTabProps> = ({ resumes, onResumesChange, defaultTargetRole }) => {
  const { showSuccess, showError } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [resumeLabel, setResumeLabel] = useState('');
  const [resumeTargetRole, setResumeTargetRole] = useState('');
  const [resumeMakeDefault, setResumeMakeDefault] = useState(true);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleSetDefaultResume = async (resumeId: string) => {
    try {
      setActionLoadingId(resumeId);
      await api.setDefaultResume(resumeId);
      const updated = await api.listResumes();
      onResumesChange(updated || []);
      showSuccess('Active default resume updated! Automated applications will use this document.');
    } catch (e: any) {
      showError(`Failed to set default: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteResume = async (resumeId: string, label: string) => {
    if (!window.confirm(`Are you sure you want to remove "${label}" from your resume library?`)) return;
    try {
      setActionLoadingId(resumeId);
      await api.deleteResume(resumeId);
      const updated = await api.listResumes();
      onResumesChange(updated || []);
      showSuccess(`Resume "${label}" deleted successfully.`);
    } catch (e: any) {
      showError(`Failed to delete resume: ${e.response?.data?.detail || e.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDownloadResume = async (resumeId: string, fileName: string) => {
    try {
      const blob = await api.downloadResume(resumeId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e: any) {
      showError(`Download failed: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleResumeUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setUploadingResume(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('label', resumeLabel.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('target_role', resumeTargetRole.trim() || defaultTargetRole || 'Software Engineer');
      formData.append('is_default', resumeMakeDefault || resumes.length === 0 ? 'true' : 'false');

      await api.uploadResume(formData);
      setSelectedFile(null);
      setResumeLabel('');
      setResumeTargetRole('');
      setResumeMakeDefault(true);
      const updatedResumes = await api.listResumes();
      onResumesChange(updatedResumes || []);
      showSuccess('Resume uploaded to library successfully!');
    } catch (e: any) {
      showError(`Upload failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setUploadingResume(false);
    }
  };

  return (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Resume Assets Library
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Manage multiple targeted resume versions and select which one auto-applies to job portals.
              </p>
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              {resumes.length} document{resumes.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Current Resumes Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {resumes.length === 0 ? (
              <div className="lg:col-span-2 p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-600 dark:text-slate-300 font-bold">No resumes in library yet</p>
                <p className="text-[11px] text-slate-400">Upload your primary PDF resume below to enable automated applications.</p>
              </div>
            ) : (
              resumes.map((r) => {
                const isSelected = r.is_default;
                return (
                  <div
                    key={r.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-indigo-50/50 border-indigo-300 dark:bg-indigo-950/20 dark:border-indigo-800 shadow-2xs ring-1 ring-indigo-500/20'
                        : 'bg-slate-50/70 border-slate-200 dark:bg-slate-800/60 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3 truncate">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-600/30'
                              : 'bg-white text-slate-500 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="truncate space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {r.label}
                            </span>
                            {isSelected ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-700/60 flex items-center space-x-1 shrink-0">
                                <Check className="w-2.5 h-2.5" />
                                <span>Active Default</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/60 text-slate-500 dark:bg-slate-700 dark:text-slate-400 shrink-0">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {r.file_name}
                          </div>
                          {r.target_role && (
                            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                              Target Role: {r.target_role}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1 shrink-0">
                        <button aria-label="Download"
                          type="button"
                          onClick={() => handleDownloadResume(r.id, r.file_name)}
                          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-600"
                          title="Download / View Resume"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => handleSetDefaultResume(r.id)}
                            disabled={actionLoadingId === r.id}
                            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-700 dark:text-slate-200 text-[11px] font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                            title="Set this resume as the active default for auto-apply"
                          >
                            {actionLoadingId === r.id ? 'Setting...' : 'Make Active'}
                          </button>
                        ) : null}

                        <button aria-label="Delete"
                          type="button"
                          onClick={() => handleDeleteResume(r.id, r.label)}
                          disabled={actionLoadingId === r.id}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer disabled:opacity-50 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50"
                          title="Delete Resume"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Upload New Resume Box */}
          <form
            onSubmit={handleResumeUpload}
            className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 space-y-4"
          >
            <div className="flex items-center space-x-2">
              <Upload className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Upload Additional Resume Version (PDF / DOCX)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Resume Label / Tag
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior Data Engineer / Full-Stack CV"
                  value={resumeLabel}
                  onChange={(e) => setResumeLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Target Role
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lead Architect / Senior Developer"
                  value={resumeTargetRole}
                  onChange={(e) => setResumeTargetRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                Select File (.pdf, .doc, .docx - max 10MB)
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setSelectedFile(file);
                  if (file && !resumeLabel) {
                    setResumeLabel(file.name.replace(/\.[^/.]+$/, ''));
                  }
                }}
                className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <label className="flex items-center space-x-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resumeMakeDefault}
                  onChange={(e) => setResumeMakeDefault(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Set as active default resume for automated applications</span>
              </label>

              <Button variant="primary" size="sm" type="submit"
                disabled={!selectedFile || uploadingResume}>
                {uploadingResume ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload to Library</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
  );
};
