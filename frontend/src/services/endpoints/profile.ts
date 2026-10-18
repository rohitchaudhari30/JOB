import { apiClient } from '../http';
import type { CandidateProfile, Resume } from '../../types';

export const profileApi = {
  // Candidate Profile
  getProfile: async (): Promise<CandidateProfile> => {
    const res = await apiClient.get('/profile');
    return res.data;
  },
  updateProfile: async (profile: Partial<CandidateProfile>): Promise<CandidateProfile> => {
    const res = await apiClient.put('/profile', profile);
    return res.data;
  },
  listSavedAnswers: async (): Promise<any[]> => {
    const res = await apiClient.get('/profile/saved-answers');
    return res.data;
  },
  saveSavedAnswer: async (answer: { canonical_intent: string; question_pattern: string; answer_text: string }): Promise<any> => {
    const res = await apiClient.post('/profile/saved-answers', answer);
    return res.data;
  },

  // Resumes
  listResumes: async (): Promise<Resume[]> => {
    const res = await apiClient.get('/resumes');
    return res.data;
  },
  uploadResume: async (formData: FormData): Promise<Resume> => {
    const res = await apiClient.post('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  deleteResume: async (resumeId: string): Promise<void> => {
    await apiClient.delete(`/resumes/${resumeId}`);
  },
  setDefaultResume: async (resumeId: string): Promise<Resume> => {
    const res = await apiClient.post(`/resumes/${resumeId}/set-default`);
    return res.data;
  },
  downloadResume: async (resumeId: string): Promise<Blob> => {
    const res = await apiClient.get(`/resumes/${resumeId}/download`, {
      responseType: 'blob',
    });
    return res.data;
  },
};
