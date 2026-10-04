import React, { useEffect, useState } from 'react';
import {
  UserCheck,
  FileText,
  Upload,
  Plus,
  Trash2,
  Save,
  Briefcase,
  Clock,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Building,
  GraduationCap,
  IndianRupee,
  MapPin,
  MessageSquare,
  Globe,
  ArrowRight,
  HelpCircle,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { CandidateProfile, CandidateSkill, Resume } from '../types';
import { useToast } from '../context/ToastContext';

interface ProfileManagerProps {
  onNavigate?: (tab: any) => void;
}

const NOTICE_PERIOD_OPTIONS = [
  { label: 'Immediate / 0 Days', value: 0 },
  { label: '15 Days', value: 15 },
  { label: '30 Days (1 Month)', value: 30 },
  { label: '45 Days', value: 45 },
  { label: '60 Days (2 Months)', value: 60 },
  { label: '90 Days (3 Months)', value: 90 },
];

const WORK_AUTH_OPTIONS = [
  'Indian Citizen (No Visa / Sponsorship Needed)',
  'Authorized to work without sponsorship',
  'Require Visa Sponsorship',
  'Permanent Resident / Green Card',
  'US / EU / UK Citizen',
];

const STANDARD_SCREENING_INTENTS = [
  { intent: 'work_authorization', label: 'Are you legally authorized to work?', defaultPattern: 'authorized to work' },
  { intent: 'visa_sponsorship', label: 'Will you require visa sponsorship now or in future?', defaultPattern: 'require sponsorship' },
  { intent: 'notice_period', label: 'What is your official notice period?', defaultPattern: 'notice period' },
  { intent: 'relocation', label: 'Are you open to relocate for this role?', defaultPattern: 'willing to relocate' },
  { intent: 'remote_work', label: 'Are you comfortable working in remote or hybrid setup?', defaultPattern: 'remote or hybrid' },
  { intent: 'expected_salary', label: 'What is your expected annual compensation?', defaultPattern: 'expected salary' },
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

  // Skill input
  const [newSkill, setNewSkill] = useState('');
  const [newSkillYears, setNewSkillYears] = useState(3);

  // Resume upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);

  // Experience modal/inputs
  const [newExpCompany, setNewExpCompany] = useState('');
  const [newExpTitle, setNewExpTitle] = useState('');
  const [newExpDesc, setNewExpDesc] = useState('');

  // Custom QA input
  const [qaIntent, setQaIntent] = useState('');
  const [qaPattern, setQaPattern] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');

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
      setResumes(resumesData || []);
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
      if (showMessage) {
        showSuccess('Candidate profile saved successfully! All data is reused across all applications.');
      }
    } catch (e: any) {
      showError(`Save failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkill = () => {
    if (!newSkill.trim()) return;
    const skillObj: CandidateSkill = {
      skill_name: newSkill.trim(),
      years_experience: Number(newSkillYears) || 1,
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
    const expObj = {
      company_name: newExpCompany.trim(),
      title: newExpTitle.trim(),
      description: newExpDesc.trim() || undefined,
      is_current: (profile.experiences || []).length === 0,
    };
    setProfile({
      ...profile,
      experiences: [...(profile.experiences || []), expObj as any],
    });
    setNewExpCompany('');
    setNewExpTitle('');
    setNewExpDesc('');
  };

  const handleRemoveExperience = (idx: number) => {
    const updated = [...(profile.experiences || [])];
    updated.splice(idx, 1);
    setProfile({ ...profile, experiences: updated });
  };

  const handleResumeUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setUploadingResume(true);
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('label', selectedFile.name.replace(/\.[^/.]+$/, ''));
      formData.append('target_role', profile?.headline || 'Software Engineer');
      formData.append('is_default', 'true');

      await api.uploadResume(formData);
      setSelectedFile(null);
      const updatedResumes = await api.listResumes();
      setResumes(updatedResumes || []);
      showSuccess('Resume uploaded and set as default application document!');
    } catch (e: any) {
      showError(`Upload failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleSaveQA = async (intent: string, pattern: string, answerText: string) => {
    if (!answerText.trim()) return;
    try {
      await api.saveSavedAnswer({
        canonical_intent: intent,
        question_pattern: pattern || intent,
        answer_text: answerText.trim(),
      });
      const updated = await api.listSavedAnswers();
      setSavedAnswers(updated || []);
      showSuccess('Answer saved! This will now automatically fill during applications.');
    } catch (e: any) {
      showError(`Failed to save answer: ${e.message}`);
    }
  };

  // Completeness Calculation
  const calculateCompleteness = () => {
    let score = 0;
    const missing: string[] = [];

    if (profile.headline) score += 15;
    else missing.push('Target Headline / Role');

    if (profile.phone) score += 15;
    else missing.push('Contact Phone');

    if (profile.location) score += 15;
    else missing.push('Current Location');

    if (profile.skills && profile.skills.length >= 3) score += 20;
    else missing.push('At least 3 core skills');

    if (resumes.length > 0) score += 20;
    else missing.push('Uploaded PDF Resume');

    if (profile.expected_ctc && profile.expected_ctc > 0) score += 15;
    else missing.push('Expected CTC');

    return { score: Math.min(100, score), missing };
  };

  const { score: completenessScore, missing: missingFields } = calculateCompleteness();
  const totalExpMonths = profile.total_experience_months || 0;
  const expYears = Math.floor(totalExpMonths / 12);
  const expMonths = totalExpMonths % 12;
  const experienceDisplay = `${expYears} Year${expYears !== 1 ? 's' : ''}${expMonths > 0 ? `, ${expMonths} Month${expMonths !== 1 ? 's' : ''}` : ''}`;

  if (loading) {
    return <div className="text-center py-20 text-slate-500 text-xs">Loading Candidate Setup...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn pb-12">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/80 dark:bg-slate-900/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shrink-0">
            <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white">Candidate &amp; Application Setup</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Save your profile, resume, and screening answers once. All automation runs reuse this data automatically.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleSaveProfile(true)}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/25 flex items-center space-x-1.5 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving...' : 'Save Profile Once'}</span>
          </button>
        </div>
      </div>

      {/* Profile Completeness Indicator Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-slate-900 dark:text-white">Profile Readiness for Auto-Apply</span>
          </div>
          <span className={`font-black ${completenessScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            {completenessScore}% Ready
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              completenessScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${completenessScore}%` }}
          />
        </div>

        {missingFields.length > 0 && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1 pt-1">
            <span className="text-amber-600 dark:text-amber-400 font-bold">Missing:</span>
            <span>{missingFields.join(' • ')}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl">
        {[
          { id: 'personal', label: 'Personal & Contact' },
          { id: 'skills', label: 'Professional & Skills' },
          { id: 'experience', label: 'Experience & Education' },
          { id: 'compensation', label: 'Compensation & Notice' },
          { id: 'preferences', label: 'Preferences & Visa' },
          { id: 'resumes', label: `Resume Library (${resumes.length})` },
          { id: 'answers', label: 'Saved Screening Answers' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as SetupTab)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Personal & Contact */}
      {activeTab === 'personal' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <Briefcase className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Personal &amp; Contact Credentials
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Target Headline / Role</label>
              <input
                type="text"
                value={profile.headline || ''}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
                placeholder="e.g. Senior Data Engineer / Full-Stack Architect"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Contact Phone Number</label>
              <input
                type="text"
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Current Location</label>
              <input
                type="text"
                value={profile.location || ''}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                placeholder="e.g. Pune, Maharashtra, India"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
                      setProfile({ ...profile, total_experience_months: (yrs * 12) + expMonths });
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
                      setProfile({ ...profile, total_experience_months: (expYears * 12) + mos });
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
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Professional Bio &amp; Summary</label>
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
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Core Technical Skills Matrix
            </h2>
            <span className="text-[11px] text-slate-400">{profile.skills?.length || 0} skills registered</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {profile.skills?.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-2">No skills added yet. Add skills like Python, Spark, SQL, React below.</p>
            ) : (
              profile.skills?.map((skill) => (
                <span
                  key={skill.skill_name}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 flex items-center space-x-2 shadow-xs"
                >
                  <span>{skill.skill_name} ({skill.years_experience}y)</span>
                  <button
                    onClick={() => handleRemoveSkill(skill.skill_name)}
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
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
              onClick={handleAddSkill}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Skill</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Experience & Education */}
      {activeTab === 'experience' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="space-y-3">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building className="w-4 h-4 text-indigo-500" />
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Work Experience History
              </h2>
            </div>

            <div className="space-y-2.5">
              {(profile.experiences || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic">No past companies added yet. Add your current and previous roles below.</p>
              ) : (
                profile.experiences?.map((exp, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{exp.title}</div>
                      <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">{exp.company_name}</div>
                      {exp.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{exp.description}</p>}
                    </div>
                    <button
                      onClick={() => handleRemoveExperience(idx)}
                      className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
              <input
                type="text"
                placeholder="Company Name (e.g. Infosys)"
                value={newExpCompany}
                onChange={(e) => setNewExpCompany(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none"
              />
              <input
                type="text"
                placeholder="Job Title (e.g. Senior Data Engineer)"
                value={newExpTitle}
                onChange={(e) => setNewExpTitle(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none"
              />
              <button
                type="button"
                onClick={handleAddExperience}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Company</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Compensation & Notice */}
      {activeTab === 'compensation' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <IndianRupee className="w-4 h-4 text-indigo-500" />
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Compensation &amp; Notice Period
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Current Annual CTC (₹ INR)</label>
              <input
                type="number"
                min="0"
                step="50000"
                value={profile.current_ctc || ''}
                onChange={(e) => setProfile({ ...profile, current_ctc: Number(e.target.value) || 0 })}
                placeholder="e.g. 1800000 (18 LPA)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Expected Annual CTC (₹ INR)</label>
              <input
                type="number"
                min="0"
                step="50000"
                value={profile.expected_ctc || ''}
                onChange={(e) => setProfile({ ...profile, expected_ctc: Number(e.target.value) || 0 })}
                placeholder="e.g. 2400000 (24 LPA)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Notice Period: <span className="text-indigo-600 dark:text-indigo-400">{profile.notice_period_days === 0 ? 'Immediate Joiner' : `${profile.notice_period_days} Days`}</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {NOTICE_PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setProfile({ ...profile, notice_period_days: opt.value })}
                    className={`p-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                      profile.notice_period_days === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {opt.label.split(' (')[0]}
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
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Work Authorization &amp; Work Mode Preferences
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Work Authorization Status</label>
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

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Preferred Work Mode</label>
              <select
                value={profile.remote_preference || 'any'}
                onChange={(e) => setProfile({ ...profile, remote_preference: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="any">Open to All (Remote / Hybrid / Onsite)</option>
                <option value="remote">Remote Only</option>
                <option value="hybrid">Hybrid Preferred</option>
                <option value="onsite">On-site Only</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="relocation"
                checked={profile.relocation_preference}
                onChange={(e) => setProfile({ ...profile, relocation_preference: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="relocation" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                Willing to relocate for the right opportunity
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Resume Library */}
      {activeTab === 'resumes' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Resume Versions Library
            </h2>
            <span className="text-[11px] text-slate-400">{resumes.length} document(s)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resumes.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between shadow-xs"
              >
                <div className="truncate pr-2">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{r.label}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{r.file_name}</div>
                </div>
                {r.is_default && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400">
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleResumeUpload} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Upload New Resume (PDF)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
            />
            <button
              type="submit"
              disabled={!selectedFile || uploadingResume}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingResume ? 'Uploading...' : 'Upload & Save as Active'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Tab 7: Saved Screening Answers */}
      {activeTab === 'answers' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Saved Screening Answers Library
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pre-saved answers feed directly into the dynamic form engine so you are never asked the same question twice.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STANDARD_SCREENING_INTENTS.map((item) => {
              const existing = savedAnswers.find((a) => a.canonical_intent === item.intent);
              return (
                <div key={item.intent} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.label}</div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      defaultValue={existing?.answer_text || ''}
                      placeholder="e.g. Yes / 30 Days / 24 LPA"
                      id={`qa-${item.intent}`}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = (document.getElementById(`qa-${item.intent}`) as HTMLInputElement)?.value;
                        handleSaveQA(item.intent, item.defaultPattern, val);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom CTA to Start Apply */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-100 dark:border-indigo-900/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="text-sm font-black text-slate-900 dark:text-white">Profile setup complete?</div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Launch your automated application run with one click.
          </p>
        </div>

        <button
          onClick={async () => {
            await handleSaveProfile(false);
            if (onNavigate) onNavigate('direct_apply');
          }}
          className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg shadow-indigo-600/20 flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
        >
          <span>Save &amp; Go to 🚀 START APPLY</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
