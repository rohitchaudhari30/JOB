import logging
from typing import List, Optional
from app.domain.jobs.entities import Job
from app.domain.jobs.freshness import FreshnessCalculator
from app.domain.matching.entities import (
    MatchResult,
    MatchRule,
    RecommendationDecision,
    RecommendationResult,
)

logger = logging.getLogger("app.matching.recommendation")


class RecommendationEngine:
    """
    Authoritative Recommendation Engine.
    Decouples pure candidate-job compatibility (MatchScore) from operational
    business actions, freshness, platform readiness, duplicate checks, and quota limits.
    """

    @classmethod
    def evaluate(
        cls,
        match: MatchResult,
        job: Job,
        rule: Optional[MatchRule] = None,
        applied_today_count: int = 0,
        daily_limit: int = 20,
        is_already_applied: bool = False,
        is_platform_connected: bool = True,
        has_resume: bool = True,
    ) -> RecommendationResult:
        rule = rule or MatchRule()
        reasons: List[str] = []
        blocking_reasons: List[str] = []

        # 1. Hard Filter Failure Guard
        if not match.hard_filter_passed:
            blocking_reasons.append(match.reasoning_summary or "Failed mandatory requirement.")
            return RecommendationResult(
                recommendation_score=0.0,
                decision=RecommendationDecision.REJECT,
                reasons=["Hard filter rejected."],
                blocking_reasons=blocking_reasons,
            )

        # 2. Duplicate Application Guard
        if is_already_applied:
            blocking_reasons.append("Already applied to this requisition.")
            return RecommendationResult(
                recommendation_score=0.0,
                decision=RecommendationDecision.SAVE,
                reasons=["Duplicate application detected; saved for reference."],
                blocking_reasons=blocking_reasons,
            )

        # 3. Resume Requirement Guard
        if not has_resume:
            blocking_reasons.append("No active resume configured for auto-application.")

        # 4. Platform Connection Guard
        if not is_platform_connected:
            blocking_reasons.append(f"Platform session for {job.source_type or job.source_id} is disconnected.")

        # 5. Freshness Calculation (affects recommendation priority, not fit score)
        freshness_score = job.freshness_score or FreshnessCalculator.calculate_score(
            job.posted_at,
            custom_score_table=rule.freshness_score_table,
        )

        # 6. Recommendation Priority Score Calculation
        # Combines compatibility (70%) + job freshness (20%) + quota headroom (10%)
        quota_headroom_score = max(0.0, 100.0 - (applied_today_count / max(1, daily_limit) * 100.0))
        rec_score = (
            (match.match_score * 0.70)
            + (freshness_score * 0.20)
            + (quota_headroom_score * 0.10)
        )
        rec_score = round(min(100.0, max(0.0, rec_score)), 1)

        reasons.append(f"Compatibility match: {match.match_score:.1f}%")
        if freshness_score >= 80:
            reasons.append("Fresh posting (posted within last 24-48 hours)")
        elif freshness_score <= 30:
            reasons.append("Older posting (> 7 days)")

        # 7. Action Decision Tree
        if blocking_reasons:
            decision = RecommendationDecision.REQUIRE_APPROVAL if match.match_score >= rule.approval_threshold else RecommendationDecision.SAVE
            reasons.append(f"Downgraded to {decision.value} due to: {', '.join(blocking_reasons)}")
        elif rec_score >= rule.auto_apply_threshold and match.match_score >= rule.auto_apply_threshold:
            decision = RecommendationDecision.AUTO_APPLY
            reasons.append(f"Exceeds auto-apply threshold ({rule.auto_apply_threshold:.0f}%)")
        elif rec_score >= rule.approval_threshold or match.match_score >= rule.approval_threshold:
            decision = RecommendationDecision.REQUIRE_APPROVAL
            reasons.append(f"Meets candidate approval threshold ({rule.approval_threshold:.0f}%)")
        elif rec_score >= rule.min_match_score or match.match_score >= rule.min_match_score:
            decision = RecommendationDecision.SAVE
            reasons.append(f"Saved for later review ({rule.min_match_score:.0f}% minimum threshold)")
        else:
            decision = RecommendationDecision.REJECT
            reasons.append(f"Below minimum threshold ({match.match_score:.1f}% < {rule.min_match_score:.0f}%)")

        return RecommendationResult(
            recommendation_score=rec_score,
            decision=decision,
            reasons=reasons,
            blocking_reasons=blocking_reasons,
        )
