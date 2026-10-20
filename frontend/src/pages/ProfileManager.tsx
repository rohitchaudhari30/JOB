import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { CandidateProfile, CandidateSkill, Resume, Experience } from '../types';
import { useToast } from '../context/ToastContext';
import { PersonalTab } from './profile/PersonalTab';
import { SkillsTab } from './profile/SkillsTab';
import { ExperienceTab } from './profile/ExperienceTab';
import { CompensationTab } from './profile/CompensationTab';
import { PreferencesTab } from './profile/PreferencesTab';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { ResumeLibraryTab } from './profile/ResumeLibraryTab';
import { SavedAnswersTab } from './profile/SavedAnswersTab';
import { defaultProfile, calculateCompleteness } from './profile/profileLogic';
import { PageHeader } from '../components/ui/PageHeader';
import { UnsavedSaveBar } from './profile/UnsavedSaveBar';
import { ProfileHero } from './profile/ProfileHero';

/** Which Settings page is showing. All three share one form state, so unsaved edits survive moving between them. */
export type ProfileView = 'profile' | 'resumes' | 'preferences';

interface ProfileManagerProps {
  onNavigate?: (tab: any) => void;
  view?: ProfileView;
}






export const ProfileManager: React.FC<ProfileManagerProps> = ({ onNavigate, view = 'profile' }) => {
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [savedAnswers, setSavedAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  // Snapshot of what the server last returned; edits that differ from it are "unsaved".
  const savedSnapshot = useRef(JSON.stringify(defaultProfile));
  const dirty = !loading && JSON.stringify(profile) !== savedSnapshot.current;
  useUnsavedChanges(dirty);

  // Skill input
  const [newSkill, setNewSkill] = useState('');
  const [newSkillYears, setNewSkillYears] = useState(3);

  // Resume upload & management

  // Experience modal/inputs
  const [newExpCompany, setNewExpCompany] = useState('');
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpIsCurrent, setNewExpIsCurrent] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [profData, resumesData, answersData] = await Promise.all([
        api.getProfile().catch(() => null),
        api.listResumes().catch(() => []),
        api.listSavedAnswers().catch(() => []),
      ]);
      const loaded = profData ? { ...defaultProfile, ...profData } : defaultProfile;
      savedSnapshot.current = JSON.stringify(loaded);
      setProfile(loaded);

      // Auto-fix if multiple resumes were previously marked default
      const defaults = (resumesData || []).filter((r: any) => r.is_default);
      if (defaults.length > 1) {
        await api.setDefaultResume(defaults[0].id).catch(() => {});
        const fixed = await api.listResumes().catch(() => resumesData);
        setResumes(fixed || []);
      } else {
        setResumes(resumesData || []);
      }

      setSavedAnswers(answersData || []);
    } catch (e) {
      console.error('Failed to load candidate setup data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (showMessage = true) => {
    try {
      setSaving(true);
      const updated = await api.updateProfile(profile);
      const next = { ...defaultProfile, ...updated };
      savedSnapshot.current = JSON.stringify(next);
      setProfile(next);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2200);
      if (showMessage) {
        showSuccess('Candidate profile saved successfully! Reusable across all applications.');
      }
    } catch (e: any) {
      showError(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkill = (skillNameToAdd?: string, yearsToAdd?: number) => {
    const targetName = (skillNameToAdd || newSkill).trim();
    if (!targetName) return;

    // Check if skill already exists
    const existing = (profile.skills || []).some(
      (s) => s.skill_name.toLowerCase() === targetName.toLowerCase()
    );
    if (existing) {
      showError(`Skill "${targetName}" is already added.`);
      return;
    }

    const skillObj: CandidateSkill = {
      skill_name: targetName,
      years_experience: yearsToAdd ?? (Number(newSkillYears) || 1),
      is_primary: true,
    };
    setProfile({
      ...profile,
      skills: [...(profile.skills || []), skillObj],
    });
    setNewSkill('');
  };

  const handleRemoveSkill = (skillName: string) => {
    setProfile({
      ...profile,
      skills: (profile.skills || []).filter((s) => s.skill_name !== skillName),
    });
  };

  const handleAddExperience = () => {
    if (!newExpCompany.trim() || !newExpTitle.trim()) return;
    const expObj: Experience = {
      company_name: newExpCompany.trim(),
      title: newExpTitle.trim(),
      description: newExpDesc.trim() || undefined,
      is_current: newExpIsCurrent || (profile.experiences || []).length === 0,
    };
    setProfile({
      ...profile,
      experiences: [...(profile.experiences || []), expObj],
    });
    setNewExpCompany('');
    setNewExpTitle('');
    setNewExpDesc('');
    setNewExpIsCurrent(false);
  };

  const handleRemoveExperience = (idx: number) => {
    const updated = [...(profile.experiences || [])];
    updated.splice(idx, 1);
    setProfile({ ...profile, experiences: updated });
  };

  const { score: completenessScore, missing: missingFields } = calculateCompleteness(profile, resumes.length);
  const totalExpMonths = profile.total_experience_months || 0;
  const expYears = Math.floor(totalExpMonths / 12);
  const expMonths = totalExpMonths % 12;
  const experienceDisplay = `${expYears}y ${expMonths > 0 ? `${expMonths}m` : ''}`.trim();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="text-xs font-semibold text-slate-500">Loading candidate configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full animate-fadeIn pb-16">
      {view === 'profile' ? (
      <ProfileHero profile={profile} experienceDisplay={experienceDisplay} completenessScore={completenessScore} missingFields={missingFields} onNavigate={onNavigate} handleSaveProfile={handleSaveProfile} saving={saving} savedSuccess={savedSuccess} />
      ) : (
        <PageHeader
          title={view === 'resumes' ? 'Resumes & answers' : 'Preferences'}
          description={
            view === 'resumes'
              ? 'The resume files and saved screening answers used on every application.'
              : 'Compensation, notice period, work authorization and work mode used to match and fill forms.'
          }
        />
      )}

      {view === 'profile' && (
        <>
          <PersonalTab profile={profile} setProfile={setProfile} />
          <SkillsTab profile={profile} handleAddSkill={handleAddSkill} handleRemoveSkill={handleRemoveSkill} newSkill={newSkill} newSkillYears={newSkillYears} setNewSkill={setNewSkill} setNewSkillYears={setNewSkillYears} />
          <ExperienceTab profile={profile} handleAddExperience={handleAddExperience} handleRemoveExperience={handleRemoveExperience} newExpCompany={newExpCompany} newExpDesc={newExpDesc} newExpIsCurrent={newExpIsCurrent} newExpTitle={newExpTitle} setNewExpCompany={setNewExpCompany} setNewExpDesc={setNewExpDesc} setNewExpIsCurrent={setNewExpIsCurrent} setNewExpTitle={setNewExpTitle} />
        </>
      )}

      {view === 'preferences' && (
        <>
          <CompensationTab profile={profile} setProfile={setProfile} />
          <PreferencesTab profile={profile} setProfile={setProfile} />
        </>
      )}

      {view === 'resumes' && (
        <>
          <ResumeLibraryTab
            resumes={resumes}
            onResumesChange={setResumes}
            defaultTargetRole={profile?.headline || ''}
          />
          <SavedAnswersTab savedAnswers={savedAnswers} onChange={setSavedAnswers} />
        </>
      )}

      {view !== 'resumes' && (
        <UnsavedSaveBar dirty={dirty} saving={saving} savedSuccess={savedSuccess} onSave={() => handleSaveProfile(true)} />
      )}
    </div>
  );
};
