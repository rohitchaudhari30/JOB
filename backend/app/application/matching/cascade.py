import logging
import math
import re
from typing import Any, Dict, List, Set, Tuple
from app.domain.ai.contracts import AIGateway
from app.domain.jobs.entities import Job
from app.domain.matching.entities import DecisionEnum, MatchResult, MatchRule
from app.domain.profile.entities import CandidateProfile, Resume

logger = logging.getLogger("app.matching.cascade")


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
        if job.max_salary and profile.expected_ctc:
            if job.max_salary < (profile.expected_ctc * 0.75):  # 25% flexibility margin
                return False, f"Job max salary ({job.max_salary}) is below candidate minimum expected ({profile.expected_ctc})"

        # 4. Job Freshness Max Age filter
        if rule and rule.max_job_age_hours is not None and job.posted_at:
            from datetime import datetime, timezone
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

    @classmethod
    def evaluate(cls, candidate_skills: List[str], job_description: str, job_title: str) -> Tuple[float, List[str], List[str]]:
        if not candidate_skills:
            return 0.0, [], []

        jd_tokens = set(re.findall(r"\b[a-zA-Z0-9#+.]{2,}\b", (job_description + " " + job_title).lower()))
        matched: List[str] = []
        missing: List[str] = []

        for skill in candidate_skills:
            norm = cls._normalize_skill(skill)
            if norm in jd_tokens or skill.lower() in job_description.lower():
                matched.append(skill)
            else:
                missing.append(skill)

        # Overlap score 0 to 100
        score = (len(matched) / len(candidate_skills)) * 100.0 if candidate_skills else 0.0
        return score, matched, missing


class LocalSemanticSimilarity:
    """Stage 3: Fast local cosine text similarity for Phase 1 development."""

    @staticmethod
    def compute(text_a: str, text_b: str) -> float:
        words_a = set(re.findall(r"\w+", text_a.lower()))
        words_b = set(re.findall(r"\w+", text_b.lower()))

        if not words_a or not words_b:
            return 0.0

        intersection = words_a.intersection(words_b)
        # Cosine similarity on word frequency sets
        score = len(intersection) / (math.sqrt(len(words_a)) * math.sqrt(len(words_b)))
        return min(100.0, max(0.0, score * 100.0))


class MatchingCascadeEngine:
    """
    Executes the complete 5-Stage Matching Cascade:
    Hard Filters -> Skill Overlap -> Semantic Similarity -> Groq Reasoning -> Gemini Fallback
    """

    def __init__(self, ai_gateway: AIGateway):
        self._ai_gateway = ai_gateway

    async def evaluate(
        self,
        profile: CandidateProfile,
        job: Job,
        rule: MatchRule | None = None,
        resume: Resume | None = None,
    ) -> MatchResult:
        rule = rule or MatchRule()

        # =========================================================================
        # Stage 1: Hard Filters
        # =========================================================================
        passed_hard, hard_reason = HardFilterEvaluator.evaluate(profile, job, rule=rule)
        if not passed_hard:
            return MatchResult(
                id=f"match_{profile.id}_{job.id}",
                user_id=profile.user_id,
                job_id=job.id,
                resume_id=resume.id if resume else None,
                overall_score=0.0,
                hard_filter_passed=False,
                skill_match_score=0.0,
                semantic_score=0.0,
                freshness_score=0.0,
                reasoning_summary=f"Hard filter rejected: {hard_reason}",
                matched_skills=[],
                missing_skills=[],
                decision=DecisionEnum.REJECT,
                ai_provider_used="none",
            )

        # =========================================================================
        # Stage 2: Structured Skill Match
        # =========================================================================
        candidate_skills = [s.skill_name for s in profile.skills]
        skill_score, matched_skills, missing_skills = SkillOverlapCalculator.evaluate(
            candidate_skills, job.raw_description, job.title
        )

        # =========================================================================
        # Stage 3: Semantic Similarity
        # =========================================================================
        candidate_summary = f"{profile.headline or ''} {profile.summary or ''} {' '.join(candidate_skills)}"
        semantic_score = LocalSemanticSimilarity.compute(candidate_summary, job.raw_description)

        # =========================================================================
        # Stage 4 & 5: AI Nuanced Reasoning (Groq primary + Gemini fallback)
        # =========================================================================
        try:
            ai_eval = await self._ai_gateway.match_job(
                candidate_summary=candidate_summary,
                job_summary=f"Title: {job.title}\nCompany: {job.company}\nDescription: {job.raw_description[:1500]}",
            )
            combined_matched = list(set(matched_skills + ai_eval.matched_skills))
            combined_missing = [s for s in (missing_skills + ai_eval.missing_skills) if s not in combined_matched]
            ai_score = ai_eval.score
            ai_reasoning = ai_eval.reasoning
            ai_provider_used = getattr(ai_eval, "provider_used", "groq") or "groq"
        except Exception as e:
            logger.warning(
                f"AI reasoning unavailable ({e}). Falling back to deterministic cascade (skill overlap + semantic similarity)."
            )
            combined_matched = matched_skills
            combined_missing = missing_skills
            ai_score = (skill_score * 0.6) + (semantic_score * 0.4)
            ai_reasoning = f"Evaluated via structured skill overlap ({skill_score:.0f}%) and profile similarity ({semantic_score:.0f}%)."
            ai_provider_used = "local_heuristic"

        # =========================================================================
        # Freshness Score Calculation
        # =========================================================================
        from app.domain.jobs.freshness import FreshnessCalculator
        freshness_score = job.freshness_score or FreshnessCalculator.calculate_score(
            job.posted_at,
            custom_score_table=rule.freshness_score_table,
        )

        # =========================================================================
        # Weighted Overall Score Calculation
        # =========================================================================
        # Role match heuristic
        role_score = 100.0 if any(r.lower() in job.title.lower() for r in [profile.headline or ""]) else 70.0
        # Location score
        location_score = 100.0 if not profile.location or profile.location.lower() in job.location.lower() else 75.0
        # Experience score
        exp_score = min(100.0, max(60.0, 100.0 - abs((profile.total_experience_months / 12.0) - job.min_experience_years) * 10))

        overall_score = (
            (skill_score * rule.skills_weight)
            + (exp_score * rule.experience_weight)
            + (role_score * rule.role_title_weight)
            + (location_score * rule.location_weight)
            + (freshness_score * rule.freshness_weight)
            + (ai_score * 0.15)  # AI reasoning contribution
        )
        overall_score = round(min(100.0, max(0.0, overall_score)), 1)

        # =========================================================================
        # Policy / Decision Engine
        # =========================================================================
        if overall_score >= rule.auto_apply_threshold:
            decision = DecisionEnum.AUTO_APPLY
        elif overall_score >= rule.approval_threshold:
            decision = DecisionEnum.REQUIRE_APPROVAL
        elif overall_score >= rule.min_match_score:
            decision = DecisionEnum.SAVE
        else:
            decision = DecisionEnum.REJECT

        return MatchResult(
            id=f"match_{profile.id}_{job.id}",
            user_id=profile.user_id,
            job_id=job.id,
            resume_id=resume.id if resume else None,
            overall_score=overall_score,
            hard_filter_passed=True,
            skill_match_score=round(skill_score, 1),
            semantic_score=round(semantic_score, 1),
            freshness_score=round(freshness_score, 1),
            reasoning_summary=ai_reasoning,
            matched_skills=combined_matched,
            missing_skills=combined_missing,
            decision=decision,
            ai_provider_used=ai_provider_used,
        )
