from datetime import datetime, timezone
import logging
import re
from typing import List, Tuple
from app.domain.jobs.entities import Job
from app.domain.matching.entities import MatchRule
from app.domain.profile.entities import CandidateProfile

logger = logging.getLogger("app.matching.evaluators")


class SkipLLM(Exception):
    """Raised internally when the LLM stage is intentionally skipped."""


class HardFilterEvaluator:
    """Stage 1: Evaluates hard rejection filters with zero AI cost."""

    @staticmethod
    def evaluate(profile: CandidateProfile, job: Job, rule: MatchRule | None = None) -> Tuple[bool, str]:
        # 1. Experience filter
        candidate_years = profile.total_experience_months / 12.0
        if job.min_experience_years > 0:
            # Allow 0.5 year grace margin for near-matches
            if candidate_years < (job.min_experience_years - 0.5):
                return False, f"Experience required: {job.min_experience_years} yrs vs candidate: {candidate_years:.1f} yrs"

        # 2. Location & Remote filter
        if profile.remote_preference == "remote":
            is_remote_job = "remote" in job.location.lower() or "remote" in job.title.lower()
            if not is_remote_job and profile.location:
                if profile.location.lower() not in job.location.lower() and not profile.relocation_preference:
                    return False, f"Candidate requires remote work, but job is onsite in {job.location}"

        # 3. Minimum Expected Salary filter (if disclosed on job)
        same_currency = (job.salary_currency or "").upper() == (profile.currency or "").upper()
        if job.max_salary and profile.expected_ctc and same_currency:
            if job.max_salary < (profile.expected_ctc * 0.75):  # 25% flexibility margin
                return False, f"Job max salary ({job.max_salary}) is below candidate minimum expected ({profile.expected_ctc})"

        # 4. Job Freshness Max Age filter
        if rule and rule.max_job_age_hours is not None and job.posted_at:
            now = datetime.now(timezone.utc)
            ref_dt = job.posted_at if job.posted_at.tzinfo else job.posted_at.replace(tzinfo=timezone.utc)
            age_hours = max(0.0, (now - ref_dt).total_seconds() / 3600.0)
            if age_hours > rule.max_job_age_hours:
                return False, f"Job was posted {age_hours:.1f} hours ago, exceeding maximum allowed age of {rule.max_job_age_hours} hours."

        return True, "Passed all hard filters."


class SkillOverlapCalculator:
    """Stage 2: Computes structured Jaccard / Token overlap between candidate skills and JD."""

    @staticmethod
    def _normalize_skill(skill: str) -> str:
        return re.sub(r"[^a-z0-9#+.]", "", skill.lower().strip())

    @staticmethod
    def _appears_as_whole_word(skill: str, text: str) -> bool:
        """True only when the skill stands alone, so 'java' does not match 'javascript' (AI-02)."""
        phrase = skill.lower().strip()
        if not phrase:
            return False
        pattern = r"(?<![a-z0-9#+])" + re.escape(phrase) + r"(?![a-z0-9#+])"
        return re.search(pattern, text) is not None

    @classmethod
    def evaluate(cls, candidate_skills: List[str], job_description: str, job_title: str) -> Tuple[float, List[str], List[str]]:
        if not candidate_skills:
            return 0.0, [], []

        jd_text = (job_description + " " + job_title).lower()
        jd_tokens = set(re.findall(r"[a-z0-9#+.]{2,}", jd_text))
        matched: List[str] = []
        missing: List[str] = []

        for skill in candidate_skills:
            norm = cls._normalize_skill(skill)
            if not norm:
                continue

            # Multi-word phrase or token presence check
            if " " in skill:
                if cls._appears_as_whole_word(skill, jd_text):
                    matched.append(skill)
                else:
                    missing.append(skill)
            else:
                if norm in jd_tokens or cls._appears_as_whole_word(skill, jd_text):
                    matched.append(skill)
                else:
                    missing.append(skill)

        total = len(candidate_skills)
        score = (len(matched) / total * 100.0) if total > 0 else 0.0
        return round(score, 1), matched, missing
