import React, { useEffect, useRef, useState } from 'react';
import { User, FileText, ShieldCheck, Building, IndianRupee, HelpCircle, Loader2, Code2 } from 'lucide-react';
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
import { defaultProfile, calculateCompleteness, isProfileTabComplete, SetupTab } from './profile/profileLogic';
import { ProfileHero } from './profile/ProfileHero';

interface ProfileManagerProps {
  onNavigate?: (tab: any) => void;
}






export const ProfileManager: React.FC<ProfileManagerProps> = ({ onNavigate }) => {
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<CandidateProfile>(defaultProfile);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [savedAnswers, setSavedAnswers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<SetupTab>('personal');
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

  const isTabComplete = (tabId: SetupTab): boolean =>
    isProfileTabComplete(tabId, profile, resumes.length, savedAnswers.length);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
        <span className="text-xs font-semibold text-slate-500">Loading candidate configuration...</span>
      </div>
    );
  }

  const tabsConfig: { id: SetupTab; label: string; icon: React.ElementType; badge?: string | number }[] = [
    { id: 'personal', label: 'Personal & Contact', icon: User },
    { id: 'skills', label: 'Skills Matrix', icon: Code2, badge: profile.skills?.length || 0 },
    { id: 'experience', label: 'Work Experience', icon: Building, badge: profile.experiences?.length || 0 },
    { id: 'compensation', label: 'Compensation & Notice', icon: IndianRupee },
    { id: 'preferences', label: 'Preferences & Visa', icon: ShieldCheck },
    { id: 'resumes', label: 'Resume Library', icon: FileText, badge: resumes.length },
    { id: 'answers', label: 'Screening Q&A', icon: HelpCircle, badge: savedAnswers.length },
  ];

  return (
    <div className="space-y-6 w-full animate-fadeIn pb-16">
      <ProfileHero profile={profile} experienceDisplay={experienceDisplay} completenessScore={completenessScore} missingFields={missingFields} onNavigate={onNavigate} handleSaveProfile={handleSaveProfile} saving={saving} savedSuccess={savedSuccess} />

      {/* Modern Segmented Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-800">
        {tabsConfig.map((tab) => {
          const Icon = tab.icon;
          const complete = isTabComplete(tab.id);
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400'
                      : 'bg-slate-200/70 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
              {complete && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Section has saved data" />
              )}
            </button>
          );
        })}
      </div>

      {/* PersonalTab */}
      {activeTab === 'personal' && (
        <PersonalTab profile={profile} setProfile={setProfile} />
      )}

      {/* SkillsTab */}
      {activeTab === 'skills' && (
        <SkillsTab profile={profile} handleAddSkill={handleAddSkill} handleRemoveSkill={handleRemoveSkill} newSkill={newSkill} newSkillYears={newSkillYears} setNewSkill={setNewSkill} setNewSkillYears={setNewSkillYears} />
      )}

      {/* ExperienceTab */}
      {activeTab === 'experience' && (
        <ExperienceTab profile={profile} handleAddExperience={handleAddExperience} handleRemoveExperience={handleRemoveExperience} newExpCompany={newExpCompany} newExpDesc={newExpDesc} newExpIsCurrent={newExpIsCurrent} newExpTitle={newExpTitle} setNewExpCompany={setNewExpCompany} setNewExpDesc={setNewExpDesc} setNewExpIsCurrent={setNewExpIsCurrent} setNewExpTitle={setNewExpTitle} />
      )}

      {/* CompensationTab */}
      {activeTab === 'compensation' && (
        <CompensationTab profile={profile} setProfile={setProfile} />
      )}

      {/* PreferencesTab */}
      {activeTab === 'preferences' && (
        <PreferencesTab profile={profile} setProfile={setProfile} />
      )}

      {activeTab === 'resumes' && (
        <ResumeLibraryTab
          resumes={resumes}
          onResumesChange={setResumes}
          defaultTargetRole={profile?.headline || ''}
        />
      )}

      {activeTab === 'answers' && <SavedAnswersTab savedAnswers={savedAnswers} onChange={setSavedAnswers} />}
    </div>
  );
};
