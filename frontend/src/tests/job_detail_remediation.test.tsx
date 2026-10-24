import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';

const evalOne = vi.fn();
vi.mock('../services/api', () => ({
  api: {
    evaluateMatch: (...args: any[]) => evalOne(...args),
    batchQueueApplications: vi.fn(),
    listConnections: vi.fn().mockResolvedValue([]),
    listResumes: vi.fn().mockResolvedValue([]),
    downloadTailored: vi.fn(),
  },
}));

const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
const mockShowWarning = vi.fn();
vi.mock('../context/ToastContext', () => ({
  ToastProvider: ({ children }: any) => children,
  useToast: () => ({
    showError: mockShowError,
    showSuccess: mockShowSuccess,
    showWarning: mockShowWarning,
    showInfo: vi.fn(),
  }),
}));

import { JobDetailDrawer, matchToDetailModel } from '../pages/jobs/JobDetailDrawer';
import { useJobActions } from '../hooks/useJobActions';

describe('Job Detail Remediation & Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evalOne.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockShowWarning.mockReset();
  });

  describe('DEF-01: External URL Safety in JobDetailDrawer', () => {
    const baseMatch: any = {
      job_id: 'j101',
      job_title: 'Security Architect',
      company: 'SecureCorp',
      match_score: 90,
      decision: 'AUTO_APPLY',
    };

    it('renders Job Link anchor for valid HTTPS url', () => {
      const matchWithUrl = { ...baseMatch, apply_url: 'https://careers.securecorp.com/jobs/101' };
      const model = matchToDetailModel(matchWithUrl);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );
      const link = screen.getByRole('link', { name: /job link/i }) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.href).toBe('https://careers.securecorp.com/jobs/101');
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noreferrer');
    });

    it('omits Job Link anchor for javascript: pseudo-protocol', () => {
      const matchWithBadUrl = { ...baseMatch, apply_url: 'javascript:alert(1)' };
      const model = matchToDetailModel(matchWithBadUrl);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );
      expect(screen.queryByRole('link', { name: /job link/i })).toBeNull();
    });

    it('omits Job Link anchor for malformed, data:, or empty url', () => {
      for (const unsafe of ['', 'not-a-valid-url', 'data:text/html,hack', '   ']) {
        const matchWithBadUrl = { ...baseMatch, apply_url: unsafe };
        const model = matchToDetailModel(matchWithBadUrl);
        const { unmount } = render(
          <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
        );
        expect(screen.queryByRole('link', { name: /job link/i })).toBeNull();
        unmount();
      }
    });
  });

  describe('DEF-02: Synchronous In-Flight Guard in useJobActions', () => {
    it('blocks rapid double-clicks on evaluateJob synchronously', async () => {
      let resolveFirst: (v: any) => void = () => {};
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      evalOne.mockReturnValueOnce(firstPromise);

      const { result } = renderHook(() => useJobActions());

      let p1: Promise<any>;
      let p2: Promise<any>;

      await act(async () => {
        // Fire two evaluateJob calls synchronously before re-render
        p1 = result.current.evaluateJob('job-race-1');
        p2 = result.current.evaluateJob('job-race-1');
      });

      // Second synchronous call should return immediately without triggering api call
      expect(evalOne).toHaveBeenCalledTimes(1);
      const r2 = await p2!;
      expect(r2).toBeNull();

      // Resolve first call
      await act(async () => {
        resolveFirst({ job_id: 'job-race-1', match_score: 88 });
        await p1;
      });

      expect(result.current.evaluatingIds.has('job-race-1')).toBe(false);

      // Now a subsequent evaluateJob call is allowed
      evalOne.mockResolvedValueOnce({ job_id: 'job-race-1', match_score: 92 });
      await act(async () => {
        await result.current.evaluateJob('job-race-1');
      });
      expect(evalOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('DEF-03: Missing Decision Values in JobDetailDrawer', () => {
    it('renders "PENDING EVALUATION" neutral chip instead of "undefined"', () => {
      const matchWithoutDecision: any = {
        job_id: 'j102',
        job_title: 'Backend Engineer',
        company: 'CloudTech',
        match_score: 65,
        decision: undefined,
      };
      const model = matchToDetailModel(matchWithoutDecision);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );

      expect(screen.queryByText(/^undefined$/i)).toBeNull();
      expect(screen.getByText('PENDING EVALUATION')).toBeTruthy();
    });
  });

  describe('DEF-04: Accessible Quick Tabs Semantics and Keyboard Navigation', () => {
    const fullMatch: any = {
      job_id: 'j103',
      job_title: 'Full Stack Engineer',
      company: 'AppCo',
      match_score: 85,
      decision: 'MANUAL_REVIEW',
      description: 'Long description about React and TypeScript...',
      matched_skills: ['React', 'TypeScript'],
      missing_skills: ['GraphQL'],
    };

    it('renders role="tablist" with aria-selected tabs and controls', () => {
      const model = matchToDetailModel(fullMatch);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );

      const tablist = screen.getByRole('tablist', { name: /job detail views/i });
      expect(tablist).toBeTruthy();

      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);

      // Default active tab is 'match'
      const matchTab = tabs.find((t) => t.textContent?.includes('AI Breakdown & Fit'));
      expect(matchTab).toBeTruthy();
      expect(matchTab?.getAttribute('aria-selected')).toBe('true');
      expect(matchTab?.getAttribute('tabindex')).toBe('0');

      const descTab = tabs.find((t) => t.textContent?.includes('Job Description'));
      expect(descTab).toBeTruthy();
      expect(descTab?.getAttribute('aria-selected')).toBe('false');
      expect(descTab?.getAttribute('tabindex')).toBe('-1');

      // Tabpanel
      const activePanel = screen.getByRole('tabpanel');
      expect(activePanel.id).toBe('tabpanel-match');
    });

    it('navigates between tabs via ArrowRight and ArrowLeft keyboard events', () => {
      const model = matchToDetailModel(fullMatch);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );

      const matchTab = screen.getByRole('tab', { name: /ai breakdown & fit/i });
      matchTab.focus();

      // Press ArrowRight to go to Skill Alignment
      fireEvent.keyDown(matchTab, { key: 'ArrowRight' });
      expect(screen.getByRole('tabpanel').id).toBe('tabpanel-skills');

      const skillsTab = screen.getByRole('tab', { name: /skill alignment/i });
      // Press ArrowRight to go to Job Description
      fireEvent.keyDown(skillsTab, { key: 'ArrowRight' });
      expect(screen.getByRole('tabpanel').id).toBe('tabpanel-description');

      const descTab = screen.getByRole('tab', { name: /job description/i });
      // Press ArrowLeft to return to Skill Alignment
      fireEvent.keyDown(descTab, { key: 'ArrowLeft' });
      expect(screen.getByRole('tabpanel').id).toBe('tabpanel-skills');
    });
  });

  describe('DEF-05: Multi-Stage Fit Dimensions Card Display Logic', () => {
    it('omits fit dimensions card when all dimension values are missing/null', () => {
      const matchNoDimensions: any = {
        job_id: 'j104',
        job_title: 'DevOps Lead',
        company: 'InfraCorp',
        match_score: 75,
        decision: 'AUTO_APPLY',
        skill_match_score: null,
        experience_score: null,
        role_title_score: null,
        semantic_score: null,
      };
      const model = matchToDetailModel(matchNoDimensions);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );

      expect(screen.queryByText(/Multi-Stage Fit Dimensions/i)).toBeNull();
    });

    it('renders fit dimensions card when at least one numeric dimension exists (even if 0)', () => {
      const matchWithZeroDim: any = {
        job_id: 'j105',
        job_title: 'Junior QA',
        company: 'TestCorp',
        match_score: 50,
        decision: 'MANUAL_REVIEW',
        skill_match_score: 0,
        experience_score: null,
      };
      const model = matchToDetailModel(matchWithZeroDim);
      render(
        <JobDetailDrawer model={model} onClose={() => {}} onEvaluate={() => {}} onQueue={() => {}} evaluating={false} queueing={false} />
      );

      expect(screen.getByText(/Multi-Stage Fit Dimensions/i)).toBeTruthy();
      expect(screen.getByText('0%')).toBeTruthy();
    });
  });
});
