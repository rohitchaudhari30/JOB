import { apiClient } from '../http';
import type { Application } from '../../types/applications';
import type { SavedTailoredSummary, TailoredResume, TailoringAnswer } from '../../types/tailoring';

export interface BulkTailorResultItem {
  job_id: string;
  success: boolean;
  tailored: TailoredResume | null;
  error?: string | null;
  code?: string | null;
}

export const tailoringApi = {
  bulkTailor: async (jobIds: string[], masterResumeId?: string, autoGenerate: boolean = true): Promise<BulkTailorResultItem[]> => {
    const res = await apiClient.post('/jobs/bulk-tailor', {
      job_ids: jobIds,
      master_resume_id: masterResumeId ?? null,
      auto_generate: autoGenerate,
    });
    return res.data;
  },
  startTailoring: async (jobId: string, masterResumeId?: string, jobDescription?: string): Promise<TailoredResume> => {
    const res = await apiClient.post(`/jobs/${jobId}/tailor`, {
      master_resume_id: masterResumeId ?? null,
      job_description: jobDescription || null,
    });
    return res.data;
  },
  getTailored: async (id: string): Promise<TailoredResume> => {
    const res = await apiClient.get(`/tailored-resumes/${id}`);
    return res.data;
  },
  listSavedTailored: async (): Promise<SavedTailoredSummary[]> => {
    const res = await apiClient.get('/tailored-resumes');
    return res.data;
  },
  setResumeChoice: async (applicationId: string, useTailored: boolean): Promise<Application> => {
    const res = await apiClient.put(`/applications/${applicationId}/resume-choice`, { use_tailored: useTailored });
    return res.data;
  },
  listTailoredForJob: async (jobId: string): Promise<TailoredResume[]> => {
    const res = await apiClient.get(`/jobs/${jobId}/tailored-resumes`);
    return res.data;
  },
  answerTailoring: async (id: string, answers: TailoringAnswer[]): Promise<TailoredResume> => {
    const res = await apiClient.post(`/tailored-resumes/${id}/answers`, { answers });
    return res.data;
  },
  generateTailored: async (id: string, approvedEditIds: string[]): Promise<TailoredResume> => {
    const res = await apiClient.post(`/tailored-resumes/${id}/generate`, { approved_edit_ids: approvedEditIds });
    return res.data;
  },
  saveTailored: async (id: string): Promise<TailoredResume> => {
    const res = await apiClient.post(`/tailored-resumes/${id}/save`);
    return res.data;
  },
  cancelTailored: async (id: string): Promise<TailoredResume> => {
    const res = await apiClient.post(`/tailored-resumes/${id}/cancel`);
    return res.data;
  },
  discardTailored: async (id: string): Promise<void> => {
    await apiClient.delete(`/tailored-resumes/${id}`);
  },
  downloadTailored: async (id: string, format: 'docx' | 'pdf' = 'docx'): Promise<Blob> => {
    const res = await apiClient.get(`/tailored-resumes/${id}/download`, { params: { format }, responseType: 'blob' });
    return res.data;
  },
};
