import React, { useEffect, useState } from 'react';
import {
  User,
  UserCheck,
  FileText,
  Plus,
  Trash2,
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
  Phone,
} from 'lucide-react';
import { api } from '../services/api';
import { CandidateProfile, CandidateSkill, Resume, Experience } from '../types';
import { useToast } from '../context/ToastContext';
import { ResumeLibraryTab } from './profile/ResumeLibraryTab';
import { SavedAnswersTab } from './profile/SavedAnswersTab';

interface ProfileManagerProps {
  onNavigate?: (tab: any) => void;
}

const NOTICE_PERIOD_OPTIONS = [
  { label: 'Immediate (0 Days)', value: 0 },
  { label: '15 Days', value: 15 },
  { label: '30 Days (1 Mo)', value: 30 },
  { label: '45 Days', value: 45 },
  { label: '60 Days (2 Mos)', value: 60 },
  { label: '90 Days (3 Mos)', value: 90 },
];

const WORK_AUTH_OPTIONS = [
  'Indian Citizen (No Visa / Sponsorship Needed)',
  'Authorized to work without sponsorship',
  'Require Visa Sponsorship',
  'Permanent Resident / Green Card',
  'US / EU / UK Citizen',
];

const POPULAR_SKILLS = [
  'Python',
  'TypeScript',
  'React',
  'FastAPI',
  'Node.js',
  'SQL',
  'PostgreSQL',
  'AWS',
  'Docker',
  'Kubernetes',
  'Tailwind CSS',
  'Git',
];


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
      setProfile(profData ? { ...defaultProfile, ...profData } : defaultProfile);

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
      setProfile({ ...defaultProfile, ...updated });
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
  const formatLPA = (amount?: number) => {
    if (!amount || amount <= 0) return null;
    const lpa = (amount / 100000).toFixed(2);
    return `₹${lpa} Lakhs/yr (₹${amount.toLocaleString('en-IN')})`;
  };

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

      {/* Tab 1: Personal & Contact */}
      {activeTab === 'personal' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <User className="w-4 h-4 text-indigo-500" />
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Personal &amp; Contact Credentials
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Primary candidate identity used on job portal applications (Naukri, LinkedIn, Greenhouse, Lever).
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Role Headline <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={profile.headline || ''}
                  onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                  placeholder="e.g. Senior Data Engineer / Full-Stack Architect"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Contact Phone Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Current Location <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={profile.location || ''}
                  onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                  placeholder="e.g. Pune, Maharashtra, India"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Total Experience: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{experienceDisplay}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={expYears}
                    onChange={(e) => {
                      const yrs = Math.max(0, parseInt(e.target.value) || 0);
                      setProfile({ ...profile, total_experience_months: yrs * 12 + expMonths });
                    }}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400 font-medium">Yrs</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <select
                    value={expMonths}
                    onChange={(e) => {
                      const mos = parseInt(e.target.value) || 0;
                      setProfile({ ...profile, total_experience_months: expYears * 12 + mos });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i}>
                        {i} Mos
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Professional Bio &amp; Summary
              </label>
              <span className="text-[10px] text-slate-400">Used by AI matching &amp; cover letters</span>
            </div>
            <textarea
              rows={3}
              value={profile.summary || ''}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
              placeholder="Experienced engineer specializing in Python, distributed pipelines, and cloud architecture..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Professional & Skills */}
      {activeTab === 'skills' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Core Technical Skills Matrix
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Skills are compared against job descriptions by the multi-stage matching engine.
              </p>
            </div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              {profile.skills?.length || 0} registered
            </span>
          </div>

          {/* Current Skills List */}
          <div className="flex flex-wrap gap-2 min-h-[48px] p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            {profile.skills?.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1 px-1">
                No skills added yet. Click suggested skills below or type your core technologies.
              </p>
            ) : (
              profile.skills?.map((skill) => (
                <span
                  key={skill.skill_name}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 flex items-center space-x-2 shadow-2xs group hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
                >
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{skill.skill_name}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({skill.years_experience}y)</span>
                  <button aria-label="Delete"
                    type="button"
                    onClick={() => handleRemoveSkill(skill.skill_name)}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ml-1"
                    title={`Remove ${skill.skill_name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add Skill Form */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
            <input
              type="text"
              placeholder="Skill name (e.g. Python, Docker, AWS, SQL)"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSkill();
                }
              }}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
              <span className="text-[11px] font-bold text-slate-400">Exp:</span>
              <input
                type="number"
                min="0"
                max="40"
                value={newSkillYears}
                onChange={(e) => setNewSkillYears(Math.max(0, Number(e.target.value) || 0))}
                className="w-12 bg-transparent text-xs font-bold text-slate-900 dark:text-white outline-none text-center"
              />
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Years</span>
            </div>

            <button
              type="button"
              onClick={() => handleAddSkill()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Skill</span>
            </button>
          </div>

          {/* Quick-Add Popular Skills Suggestions */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Add Popular Technologies:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SKILLS.filter(
                (ps) => !profile.skills?.some((s) => s.skill_name.toLowerCase() === ps.toLowerCase())
              ).map((tech) => (
                <button
                  key={tech}
                  type="button"
                  onClick={() => handleAddSkill(tech, 3)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3 text-slate-400" />
                  <span>{tech}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Experience & Education */}
      {activeTab === 'experience' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Work Experience History
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Past and current companies used for auto-completing work history forms.
                </p>
              </div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {profile.experiences?.length || 0} roles
              </span>
            </div>

            {/* Experience Cards */}
            <div className="space-y-3">
              {(profile.experiences || []).length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
                  <Building className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">No past roles added yet.</p>
                  <p className="text-[11px] text-slate-400">Add your current and previous companies below.</p>
                </div>
              ) : (
                profile.experiences?.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{exp.title}</span>
                        {exp.is_current && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400">
                            Current Role
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center space-x-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span>{exp.company_name}</span>
                      </div>
                      {exp.description && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{exp.description}</p>
                      )}
                    </div>
                    <button aria-label="Delete"
                      type="button"
                      onClick={() => handleRemoveExperience(idx)}
                      className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer p-1"
                      title="Remove experience"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Experience Section */}
            <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3 pt-3">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Add Work Experience</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Job Title (e.g. Senior Data Engineer)"
                  value={newExpTitle}
                  onChange={(e) => setNewExpTitle(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Company Name (e.g. Microsoft / Infosys)"
                  value={newExpCompany}
                  onChange={(e) => setNewExpCompany(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <textarea
                rows={2}
                placeholder="Brief summary of duties, tech stack, and key accomplishments..."
                value={newExpDesc}
                onChange={(e) => setNewExpDesc(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newExpIsCurrent}
                    onChange={(e) => setNewExpIsCurrent(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>This is my current role</span>
                </label>

                <button
                  type="button"
                  onClick={handleAddExperience}
                  disabled={!newExpCompany.trim() || !newExpTitle.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Company Role</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Compensation & Notice */}
      {activeTab === 'compensation' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <IndianRupee className="w-4 h-4 text-indigo-500" />
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Compensation &amp; Notice Period
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Used to match salary filters and auto-answer compensation fields on portals.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Current CTC */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Current Annual CTC (₹ INR)
              </label>
              <div className="relative">
                <IndianRupee className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={profile.current_ctc || ''}
                  onChange={(e) => setProfile({ ...profile, current_ctc: Number(e.target.value) || 0 })}
                  placeholder="e.g. 1800000 (18 LPA)"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {profile.current_ctc && profile.current_ctc > 0 && (
                <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {formatLPA(profile.current_ctc)}
                </div>
              )}
            </div>

            {/* Expected CTC */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Expected Annual CTC (₹ INR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <IndianRupee className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="number"
                  min="0"
                  step="50000"
                  value={profile.expected_ctc || ''}
                  onChange={(e) => setProfile({ ...profile, expected_ctc: Number(e.target.value) || 0 })}
                  placeholder="e.g. 2400000 (24 LPA)"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {profile.expected_ctc && profile.expected_ctc > 0 && (
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1.5">
                  <span>{formatLPA(profile.expected_ctc)}</span>
                  {profile.current_ctc && profile.current_ctc > 0 && profile.expected_ctc > profile.current_ctc && (
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">
                      +{Math.round(((profile.expected_ctc - profile.current_ctc) / profile.current_ctc) * 100)}% hike
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Notice Period Selector */}
            <div className="md:col-span-2 space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Notice Period Duration
                </label>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {profile.notice_period_days === 0 ? 'Immediate Joiner' : `${profile.notice_period_days} Days`}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {NOTICE_PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProfile({ ...profile, notice_period_days: opt.value })}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer flex items-center justify-center space-x-1.5 ${
                      profile.notice_period_days === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                    }`}
                  >
                    {profile.notice_period_days === opt.value && <Check className="w-3.5 h-3.5" />}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Preferences & Visa */}
      {activeTab === 'preferences' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Work Authorization &amp; Mode Preferences
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Determines eligibility filters for remote, onsite, and international opportunities.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Work Authorization Status */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Work Authorization Status
              </label>
              <select
                value={profile.work_authorization || WORK_AUTH_OPTIONS[0]}
                onChange={(e) => setProfile({ ...profile, work_authorization: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {WORK_AUTH_OPTIONS.map((auth) => (
                  <option key={auth} value={auth}>
                    {auth}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred Work Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Preferred Work Mode
              </label>
              <select
                value={profile.remote_preference || 'any'}
                onChange={(e) => setProfile({ ...profile, remote_preference: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="any">Open to All (Remote / Hybrid / Onsite)</option>
                <option value="remote">100% Remote Only</option>
                <option value="hybrid">Hybrid (1-3 Days In-Office)</option>
                <option value="onsite">On-site Only</option>
              </select>
            </div>

            {/* Relocation Preference Toggle */}
            <div className="md:col-span-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Open to Relocation
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Check this if you are willing to relocate to other tech hubs (Bangalore, Hyderabad, Pune, Gurgaon, etc.).
                </div>
              </div>
              <input
                type="checkbox"
                id="relocation"
                checked={profile.relocation_preference}
                onChange={(e) => setProfile({ ...profile, relocation_preference: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
              />
            </div>
          </div>
        </div>
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
