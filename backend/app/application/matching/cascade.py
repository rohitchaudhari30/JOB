from dataclasses import asdict
import hashlib
import json
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from app.domain.ai.contracts import AIGateway
from app.domain.jobs.entities import Job
from app.domain.matching.embedding import EmbeddingService
from app.domain.matching.entities import (
    MatchBreakdown,
    MatchResult,
    MatchRule,
    RecommendationDecision,
)
from app.domain.profile.entities import CandidateProfile, Resume
from app.application.matching.recommendation import RecommendationEngine
from app.application.runtime import default_embedding_service

logger = logging.getLogger("app.matching.cascade")


class AIEvalPayload(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0)
    reasoning: str
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)


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
        # Only compare when both amounts use the same currency (JOB-05); otherwise skip the filter.
        same_currency = (job.salary_currency or "").upper() == (profile.currency or "").upper()
        if job.max_salary and profile.expected_ctc and same_currency:
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


class SkipLLM(Exception):
    """Raised internally when the LLM stage is intentionally skipped."""


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
            if norm in jd_tokens or cls._appears_as_whole_word(skill, jd_text):
                matched.append(skill)
            else:
                missing.append(skill)

        # Overlap score 0 to 100
        score = (len(matched) / len(candidate_skills)) * 100.0 if candidate_skills else 0.0
        return score, matched, missing


class LocalLexicalSimilarity:
    """Stage 3 Fallback: Lexical word vector intersection similarity."""

    @staticmethod
    def compute(text_a: str, text_b: str) -> float:
        words_a = set(re.findall(r"\w+", text_a.lower()))
        words_b = set(re.findall(r"\w+", text_b.lower()))

        if not words_a or not words_b:
            return 0.0

        intersection = words_a.intersection(words_b)
        score = len(intersection) / (math.sqrt(len(words_a)) * math.sqrt(len(words_b)))
        return min(100.0, max(0.0, score * 100.0))


# Alias for backward compatibility
LocalSemanticSimilarity = LocalLexicalSimilarity


class MatchingCascadeEngine:
    """
    Authoritative 5-Stage Matching Cascade Engine:
    Stage 1: HardFilterEvaluator (Zero AI cost on rejection)
    Stage 2: SkillOverlapCalculator (Structured lexical skills)
    Stage 3: EmbeddingService (Dense vector embedding cosine similarity)
    Stage 4 & 5: AI Nuanced Reasoning (Groq primary -> Gemini fallback -> Deterministic fallback)
    Final: Pure MatchScore calculation + RecommendationEngine priority determination.
    """

    ENGINE_VERSION = "4.0.0"
    CONFIG_VERSION = "v1"
    PROMPT_VERSION = "match-v2"
    LLM_MIN_SKILL_SCORE = 10.0
    LLM_MIN_SEMANTIC_SCORE = 20.0
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    EMBEDDING_VERSION = "2026.1"

    def __init__(
        self,
        ai_gateway: AIGateway,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        self._ai_gateway = ai_gateway
        self._embedding_service = embedding_service or default_embedding_service

    @classmethod
    def _compute_profile_canonical_hash(cls, profile: CandidateProfile) -> str:
        candidate_skills = sorted([s.skill_name.strip().lower() for s in profile.skills])
        payload = {
            "headline": profile.headline or "",
            "summary": profile.summary or "",
            "skills": candidate_skills,
            "total_experience_months": profile.total_experience_months,
            "location": profile.location or "",
            "expected_ctc": profile.expected_ctc,
            "remote_preference": profile.remote_preference or "",
            "relocation_preference": profile.relocation_preference,
        }
        canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def _compute_resume_canonical_hash(cls, resume: Optional[Resume]) -> str:
        if not resume:
            return "no_resume"
        payload = {
            "id": resume.id,
            "file_path": getattr(resume, "file_path", "") or "",
            "raw_text": getattr(resume, "raw_text", "") or "",
            "version": getattr(resume, "version", 1) or 1,
            "parsed_skills": sorted(getattr(resume, "parsed_skills", []) or []),
        }
        canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def _compute_job_canonical_hash(cls, job: Job) -> str:
        payload = {
            "title": job.title or "",
            "company": job.company or "",
            "location": job.location or "",
            "min_experience_years": job.min_experience_years,
            "max_salary": job.max_salary,
            "raw_description": (job.raw_description or "")[:1500],
        }
        canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def compute_evaluation_key(
        cls,
        profile: CandidateProfile,
        job: Job,
        resume: Optional[Resume] = None,
        embedding_model: Optional[str] = None,
        embedding_version: Optional[str] = None,
        rule: Optional[MatchRule] = None,
    ) -> Tuple[str, str, str, str]:
        profile_snapshot_hash = cls._compute_profile_canonical_hash(profile)
        resume_snapshot_hash = cls._compute_resume_canonical_hash(resume)
        job_snapshot_hash = cls._compute_job_canonical_hash(job)

        emb_model = embedding_model or cls.EMBEDDING_MODEL
        emb_ver = embedding_version or cls.EMBEDDING_VERSION

        eval_payload = {
            "user_id": profile.user_id,
            "job_id": job.id,
            "resume_id": resume.id if resume else "no_resume",
            "profile_snapshot_hash": profile_snapshot_hash,
            "resume_snapshot_hash": resume_snapshot_hash,
            "job_snapshot_hash": job_snapshot_hash,
            "engine_version": cls.ENGINE_VERSION,
            "config_version": cls.CONFIG_VERSION,
            "prompt_version": cls.PROMPT_VERSION,
            "embedding_model": emb_model,
            "embedding_version": emb_ver,
            # The rule changes the score, so it must change the cache key (AI-01).
            "rule": asdict(rule or MatchRule()),
        }
        canonical_eval_json = json.dumps(eval_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        evaluation_key = hashlib.sha256(canonical_eval_json.encode("utf-8")).hexdigest()
        return evaluation_key, resume_snapshot_hash, profile_snapshot_hash, job_snapshot_hash

    async def evaluate(
        self,
        profile: CandidateProfile,
        job: Job,
        rule: MatchRule | None = None,
        resume: Resume | None = None,
        applied_today_count: int = 0,
        daily_limit: int = 20,
        is_already_applied: bool = False,
        is_platform_connected: bool = True,
    ) -> MatchResult:
        rule = rule or MatchRule()

        emb_model = self._embedding_service.model_name
        emb_ver = self._embedding_service.model_version

        # Generate immutable snapshot hashes and authoritative evaluation key
        evaluation_key, resume_snapshot_hash, profile_snapshot_hash, job_snapshot_hash = self.compute_evaluation_key(
            profile=profile,
            job=job,
            resume=resume,
            embedding_model=emb_model,
            embedding_version=emb_ver,
            rule=rule,
        )
        candidate_skills = [s.skill_name for s in profile.skills]
        candidate_summary = f"{profile.headline or ''} {profile.summary or ''} {' '.join(candidate_skills)}"

        # =========================================================================
        # Stage 1: Hard Filters (Zero AI cost on reject)
        # =========================================================================
        passed_hard, hard_reason = HardFilterEvaluator.evaluate(profile, job, rule=rule)
        if not passed_hard:
            empty_breakdown = MatchBreakdown()
            match_res = MatchResult(
                id=f"match_{profile.id}_{job.id}",
                user_id=profile.user_id,
                job_id=job.id,
                resume_id=resume.id if resume else None,
                evaluation_key=evaluation_key,
                match_score=0.0,
                recommendation_score=0.0,
                overall_score=0.0,
                breakdown=empty_breakdown,
                hard_filter_passed=False,
                skill_match_score=0.0,
                experience_score=0.0,
                role_title_score=0.0,
                location_score=0.0,
                salary_score=0.0,
                semantic_score=0.0,
                freshness_score=0.0,
                ai_score=0.0,
                resume_version=getattr(resume, "version", 1) or 1,
                resume_snapshot_hash=resume_snapshot_hash,
                profile_version=getattr(profile, "version", 1) or 1,
                profile_snapshot_hash=profile_snapshot_hash,
                job_snapshot_hash=job_snapshot_hash,
                matching_engine_version=self.ENGINE_VERSION,
                matching_config_version=self.CONFIG_VERSION,
                prompt_version=self.PROMPT_VERSION,
                embedding_model=emb_model,
                embedding_version=emb_ver,
                reasoning_summary=f"Hard filter rejected: {hard_reason}",
                matched_skills=[],
                missing_skills=[],
                decision=RecommendationDecision.REJECT,
                recommendation_reasons=["Failed hard requirements check."],
                blocking_reasons=[hard_reason],
                ai_provider_used="none",
            )
            return match_res

        # =========================================================================
        # Stage 2: Structured Skill Overlap
        # =========================================================================
        skill_score, matched_skills, missing_skills = SkillOverlapCalculator.evaluate(
            candidate_skills, job.raw_description, job.title
        )

        # =========================================================================
        # Stage 3: Dense Vector Semantic Similarity (Cosine Similarity)
        # =========================================================================
        try:
            profile_text = f"{candidate_summary} {(getattr(resume, 'raw_text', '') or '')[:500] if resume else ''}".strip()
            job_text = f"{job.title} at {job.company}. {job.raw_description[:1000]}".strip()

            profile_vector = await self._embedding_service.embed_text(profile_text)
            job_vector = await self._embedding_service.embed_text(job_text)
            raw_cosine = self._embedding_service.cosine_similarity(profile_vector, job_vector)
            semantic_score = self._embedding_service.normalize_similarity_to_percentage(raw_cosine)
        except Exception as e:
            logger.warning(f"Dense vector embedding evaluation failed ({e}). Falling back to lexical similarity.")
            semantic_score = LocalLexicalSimilarity.compute(candidate_summary, job.raw_description)

        # =========================================================================
        # Stage 4 & 5: AI Nuanced Reasoning with Strict Pydantic Schema Validation
        # =========================================================================
        ai_provider_used = "groq"
        try:
            # Don't spend an LLM call on a job that clearly doesn't fit (AI-08).
            if skill_score < self.LLM_MIN_SKILL_SCORE and semantic_score < self.LLM_MIN_SEMANTIC_SCORE:
                raise SkipLLM("skill and semantic scores too low")
            ai_raw = await self._ai_gateway.match_job(
                candidate_summary=candidate_summary,
                job_summary=f"Title: {job.title}\nCompany: {job.company}\nDescription: {job.raw_description[:1500]}",
            )
            # Pydantic schema validation
            ai_eval = AIEvalPayload(
                score=float(getattr(ai_raw, "score", 0.0)),
                reasoning=str(getattr(ai_raw, "reasoning", "")),
                matched_skills=list(getattr(ai_raw, "matched_skills", []) or []),
                missing_skills=list(getattr(ai_raw, "missing_skills", []) or []),
            )
            # The LLM may only claim skills the candidate really has (AI-07).
            own_skills = {sk.lower().strip(): sk for sk in candidate_skills}
            ai_claimed = [own_skills[c.lower().strip()] for c in ai_eval.matched_skills if c.lower().strip() in own_skills]
            combined_matched = list(dict.fromkeys(matched_skills + ai_claimed))
            combined_missing = [s for s in (missing_skills + ai_eval.missing_skills) if s not in combined_matched]
            ai_score = ai_eval.score
            ai_reasoning = ai_eval.reasoning
            ai_provider_used = getattr(ai_raw, "provider_used", "groq") or "groq"
        except Exception as e:
            if not isinstance(e, SkipLLM):
                logger.warning(f"AI reasoning unavailable ({e}). Falling back to deterministic fallback.")
            combined_matched = matched_skills
            combined_missing = missing_skills
            ai_score = (skill_score * 0.6) + (semantic_score * 0.4)
            ai_reasoning = f"Evaluated via structured skill overlap ({skill_score:.0f}%) and profile similarity ({semantic_score:.0f}%)."
            ai_provider_used = "DETERMINISTIC_FALLBACK"

        # =========================================================================
        # Dimensional Compatibility Scores
        # =========================================================================
        role_score = 100.0 if any(r.lower() in job.title.lower() for r in [profile.headline or ""]) else 70.0
        location_score = 100.0 if not profile.location or profile.location.lower() in job.location.lower() else 75.0
        exp_score = min(100.0, max(50.0, 100.0 - abs((profile.total_experience_months / 12.0) - job.min_experience_years) * 10))
        salary_score = 100.0
        if job.max_salary and profile.expected_ctc and (job.salary_currency or "").upper() == (profile.currency or "").upper():
            salary_score = min(100.0, (job.max_salary / max(1.0, profile.expected_ctc)) * 100.0)

        # Pure candidate-job fit score (NO freshness, NO campaign quota)
        match_score = (
            (skill_score * rule.skills_weight)
            + (exp_score * rule.experience_weight)
            + (role_score * rule.role_title_weight)
            + (location_score * rule.location_weight)
            + (salary_score * rule.salary_weight)
            + (semantic_score * rule.semantic_weight)
            + (ai_score * rule.ai_weight)
        )
        match_score = round(min(100.0, max(0.0, match_score)), 1)

        breakdown = MatchBreakdown(
            skill_score=skill_score,
            experience_score=exp_score,
            role_title_score=role_score,
            location_score=location_score,
            salary_score=salary_score,
            semantic_score=semantic_score,
            freshness_score=job.freshness_score or 0.0,
            ai_score=ai_score,
        )

        partial_match = MatchResult(
            id=f"match_{profile.id}_{job.id}",
            user_id=profile.user_id,
            job_id=job.id,
            resume_id=resume.id if resume else None,
            evaluation_key=evaluation_key,
            match_score=match_score,
            recommendation_score=None,
            overall_score=match_score,
            breakdown=breakdown,
            hard_filter_passed=True,
            skill_match_score=round(skill_score, 1),
            experience_score=round(exp_score, 1),
            role_title_score=round(role_score, 1),
            location_score=round(location_score, 1),
            salary_score=round(salary_score, 1),
            semantic_score=round(semantic_score, 1),
            freshness_score=round(job.freshness_score or 0.0, 1),
            ai_score=round(ai_score, 1),
            resume_version=getattr(resume, "version", 1) or 1,
            resume_snapshot_hash=resume_snapshot_hash,
            profile_version=getattr(profile, "version", 1) or 1,
            profile_snapshot_hash=profile_snapshot_hash,
            job_snapshot_hash=job_snapshot_hash,
            matching_engine_version=self.ENGINE_VERSION,
            matching_config_version=self.CONFIG_VERSION,
            prompt_version=self.PROMPT_VERSION,
            embedding_model=emb_model,
            embedding_version=emb_ver,
            reasoning_summary=ai_reasoning,
            matched_skills=combined_matched,
            missing_skills=combined_missing,
            decision=RecommendationDecision.REQUIRE_APPROVAL,
            ai_provider_used=ai_provider_used,
            job_title=job.title,
            company=job.company,
            location=job.location,
            apply_url=job.apply_url,
            raw_posted_text=job.raw_posted_text,
        )

        # =========================================================================
        # Recommendation Engine: Decoupled Operational Decision
        # =========================================================================
        rec_result = RecommendationEngine.evaluate(
            match=partial_match,
            job=job,
            rule=rule,
            applied_today_count=applied_today_count,
            daily_limit=daily_limit,
            is_already_applied=is_already_applied,
            is_platform_connected=is_platform_connected,
            has_resume=bool(resume),
        )

        partial_match.recommendation_score = rec_result.recommendation_score
        partial_match.decision = rec_result.decision
        partial_match.recommendation_reasons = rec_result.reasons
        partial_match.blocking_reasons = rec_result.blocking_reasons

        return partial_match
