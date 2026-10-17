import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  UserCheck,
  FileText,
  Save,
  Briefcase,
  Clock,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Building,
  IndianRupee,
  MapPin,
  ArrowRight,
  HelpCircle,
  Check,
  Loader2,
  Code2,
} from 'lucide-react';
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

interface ProfileManagerProps {
  onNavigate?: (tab: any) => void;
}





const defaultProfile: CandidateProfile = {
  id: '',
  user_id: '',
  headline: '',
  summary: '',
  phone: '',
  location: '',
  current_ctc: 0,
  expected_ctc: 0,
  currency: 'INR',
  notice_period_days: 30,
  total_experience_months: 36,
  work_authorization: 'Indian Citizen (No Visa / Sponsorship Needed)',
  relocation_preference: true,
  remote_preference: 'any',
  experiences: [],
  skills: [],
};

type SetupTab = 'personal' | 'skills' | 'experience' | 'compensation' | 'preferences' | 'resumes' | 'answers';

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

  // Helper formatting for LPA

  // Completeness Calculation
  const calculateCompleteness = () => {
    let score = 0;
    const missing: string[] = [];

    if (profile.headline) score += 15;
    else missing.push('Target Role Headline');

    if (profile.phone) score += 15;
    else missing.push('Contact Phone');

    if (profile.location) score += 15;
    else missing.push('Current Location');

    if (profile.skills && profile.skills.length >= 3) score += 20;
    else missing.push('At least 3 core skills');

    if (resumes.length > 0) score += 20;
    else missing.push('Default PDF Resume');

    if (profile.expected_ctc && profile.expected_ctc > 0) score += 15;
    else missing.push('Expected CTC');

    return { score: Math.min(100, score), missing };
  };

  const { score: completenessScore, missing: missingFields } = calculateCompleteness();
  const totalExpMonths = profile.total_experience_months || 0;
  const expYears = Math.floor(totalExpMonths / 12);
  const expMonths = totalExpMonths % 12;
  const experienceDisplay = `${expYears}y ${expMonths > 0 ? `${expMonths}m` : ''}`.trim();

  // Tab completion status
  const isTabComplete = (tabId: SetupTab): boolean => {
    switch (tabId) {
      case 'personal':
        return Boolean(profile.headline && profile.phone && profile.location);
      case 'skills':
        return Boolean(profile.skills && profile.skills.length >= 3);
      case 'experience':
        return Boolean(profile.experiences && profile.experiences.length > 0);
      case 'compensation':
        return Boolean(profile.expected_ctc && profile.expected_ctc > 0);
      case 'preferences':
        return Boolean(profile.work_authorization && profile.remote_preference);
      case 'resumes':
        return Boolean(resumes.length > 0);
      case 'answers':
        return Boolean(savedAnswers.length >= 3);
      default:
        return false;
    }
  };

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
      {/* Executive Hero Profile Header */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Candidate Identity Overview */}
          <div className="flex items-start sm:items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-indigo-500/20 shrink-0">
              {profile.headline ? profile.headline.charAt(0).toUpperCase() : <UserCheck className="w-6 h-6" />}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 dark:text-white">
                  {profile.headline || 'Candidate Profile'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/60">
                  Auto-Apply Profile
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                {profile.location && (
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profile.location}</span>
                  </span>
                )}
                {experienceDisplay && (
                  <span className="flex items-center space-x-1">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    <span>{experienceDisplay} Exp</span>
                  </span>
                )}
                {profile.notice_period_days !== undefined && (
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {profile.notice_period_days === 0 ? 'Immediate' : `${profile.notice_period_days}d Notice`}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Readiness Gauge & Single Authoritative Action Button */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
            {/* Readiness Mini Gauge */}
            <div className="flex items-center space-x-3 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 rounded-2xl border border-slate-200/70 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] gap-3">
                  <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                    <Sparkles className="w-3 h-3 text-indigo-500" />
                    <span>Readiness</span>
                  </span>
                  <span
                    className={`font-black ${
                      completenessScore >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {completenessScore}%
                  </span>
                </div>
                <div className="w-28 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      completenessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${completenessScore}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Actions: Save Changes (Primary) + Launch Campaigns (Shortcut if ready) */}
            <div className="flex items-center space-x-2">
              {completenessScore >= 80 && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('direct_apply')}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Launch automated campaign runs with this candidate profile"
                >
                  <span>Go to Campaigns</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}

              {/* Authoritative Single Save Button */}
              <button
                type="button"
                onClick={() => handleSaveProfile(true)}
                disabled={saving}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-60 cursor-pointer ${
                  savedSuccess
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Changes Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Missing fields guidance banner (if incomplete) */}
        {missingFields.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center space-x-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Recommended to complete:</span>
            </span>
            {missingFields.map((field, idx) => (
              <span
                key={field}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40 font-medium"
              >
                {field}
                {idx < missingFields.length - 1 ? '' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

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
