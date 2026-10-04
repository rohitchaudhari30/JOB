from datetime import datetime, timedelta, timezone
import pytest
from app.domain.jobs.freshness import (
    DEFAULT_FRESHNESS_SCORES,
    FreshnessBucketEnum,
    FreshnessCalculator,
    PostedDateParser,
)
from app.domain.jobs.entities import Job
from app.domain.matching.entities import MatchRule, DecisionEnum
from app.domain.profile.entities import CandidateProfile, CandidateSkill
from app.application.matching.cascade import HardFilterEvaluator, MatchingCascadeEngine


def test_posted_date_parser_relative_strings():
    now = datetime(2026, 10, 4, 12, 0, 0, tzinfo=timezone.utc)

    # 1. Just now
    dt, prec, raw = PostedDateParser.parse("Just now", reference_time=now)
    assert dt == now
    assert prec == "EXACT"

    # 2. Minutes ago
    dt, prec, raw = PostedDateParser.parse("45 minutes ago", reference_time=now)
    assert dt == now - timedelta(minutes=45)
    assert prec == "APPROXIMATE"

    # 3. Hours ago
    dt, prec, raw = PostedDateParser.parse("3 hours ago", reference_time=now)
    assert dt == now - timedelta(hours=3)
    assert prec == "APPROXIMATE"

    # 3b. Qualitative Few hours ago
    dt, prec, raw = PostedDateParser.parse("Few hours ago", reference_time=now)
    assert dt == now - timedelta(hours=3)
    assert prec == "APPROXIMATE"

    # 3c. Qualitative few minutes ago
    dt, prec, raw = PostedDateParser.parse("Few minutes ago", reference_time=now)
    assert dt == now - timedelta(minutes=15)
    assert prec == "APPROXIMATE"

    # 4. Today & Yesterday
    dt, prec, raw = PostedDateParser.parse("Today", reference_time=now)
    assert dt == now - timedelta(hours=2)
    assert prec == "APPROXIMATE"

    dt, prec, raw = PostedDateParser.parse("Yesterday", reference_time=now)
    assert dt == now - timedelta(days=1)
    assert prec == "APPROXIMATE"

    # 5. Days ago
    dt, prec, raw = PostedDateParser.parse("3 days ago", reference_time=now)
    assert dt == now - timedelta(days=3)
    assert prec == "APPROXIMATE"

    # 6. Weeks ago
    dt, prec, raw = PostedDateParser.parse("2 weeks ago", reference_time=now)
    assert dt == now - timedelta(weeks=2)
    assert prec == "APPROXIMATE"

    # 7. 30+ days
    dt, prec, raw = PostedDateParser.parse("30+ days ago", reference_time=now)
    assert dt == now - timedelta(days=35)
    assert prec == "APPROXIMATE"

    # 8. Empty / None
    dt, prec, raw = PostedDateParser.parse(None)
    assert dt is None
    assert prec == "UNKNOWN"


def test_freshness_calculator_buckets_and_scores():
    now = datetime(2026, 10, 4, 12, 0, 0, tzinfo=timezone.utc)

    # 15 mins -> JUST_NOW (100)
    dt_15m = now - timedelta(minutes=10)
    assert FreshnessCalculator.calculate_bucket(dt_15m, reference_time=now) == FreshnessBucketEnum.JUST_NOW
    assert FreshnessCalculator.calculate_score(dt_15m, reference_time=now) == 100.0

    # 2 hours -> LAST_3_HOURS (95)
    dt_2h = now - timedelta(hours=2)
    assert FreshnessCalculator.calculate_bucket(dt_2h, reference_time=now) == FreshnessBucketEnum.LAST_3_HOURS
    assert FreshnessCalculator.calculate_score(dt_2h, reference_time=now) == 95.0

    # 18 hours -> LAST_24_HOURS (80)
    dt_18h = now - timedelta(hours=18)
    assert FreshnessCalculator.calculate_bucket(dt_18h, reference_time=now) == FreshnessBucketEnum.LAST_24_HOURS
    assert FreshnessCalculator.calculate_score(dt_18h, reference_time=now) == 80.0

    # 2 days -> LAST_3_DAYS (70)
    dt_2d = now - timedelta(days=2)
    assert FreshnessCalculator.calculate_bucket(dt_2d, reference_time=now) == FreshnessBucketEnum.LAST_3_DAYS
    assert FreshnessCalculator.calculate_score(dt_2d, reference_time=now) == 70.0

    # 3 weeks -> OLDER_THAN_30_DAYS or LAST_30_DAYS (15)
    dt_21d = now - timedelta(days=21)
    assert FreshnessCalculator.calculate_bucket(dt_21d, reference_time=now) == FreshnessBucketEnum.LAST_30_DAYS
    assert FreshnessCalculator.calculate_score(dt_21d, reference_time=now) == 15.0

    # 40 days -> OLDER_THAN_30_DAYS (0)
    dt_40d = now - timedelta(days=40)
    assert FreshnessCalculator.calculate_bucket(dt_40d, reference_time=now) == FreshnessBucketEnum.OLDER_THAN_30_DAYS
    assert FreshnessCalculator.calculate_score(dt_40d, reference_time=now) == 0.0


def test_freshness_relative_format():
    now = datetime(2026, 10, 4, 12, 0, 0, tzinfo=timezone.utc)
    assert FreshnessCalculator.format_relative_time(now - timedelta(seconds=20), reference_time=now) == "Just now"
    assert FreshnessCalculator.format_relative_time(now - timedelta(minutes=42), reference_time=now) == "42 min ago"
    assert FreshnessCalculator.format_relative_time(now - timedelta(hours=3), reference_time=now) == "3 hours ago"
    assert FreshnessCalculator.format_relative_time(now - timedelta(days=1), reference_time=now) == "1 day ago"
    assert FreshnessCalculator.format_relative_time(now - timedelta(days=5), reference_time=now) == "5 days ago"
    assert FreshnessCalculator.format_relative_time(now - timedelta(days=21), reference_time=now) == "3 weeks ago"


def test_hard_filter_max_job_age_rejection():
    profile = CandidateProfile(
        id="prof_1",
        user_id="u_1",
        total_experience_months=60,
        location="Bengaluru",
        skills=[],
    )
    # Job posted 5 days ago (120 hours)
    job = Job(
        id="j_old",
        source_id="naukri",
        external_job_id="ext_old",
        title="Python Dev",
        company="OldCo",
        location="Bengaluru",
        posted_at=datetime.now(timezone.utc) - timedelta(days=5),
        raw_posted_text="5 days ago",
    )

    # Rule allowing max 24 hours
    strict_rule = MatchRule(max_job_age_hours=24.0)
    passed, reason = HardFilterEvaluator.evaluate(profile, job, rule=strict_rule)
    assert passed is False
    assert "exceeding maximum allowed age of 24.0 hours" in reason

    # Rule allowing max 150 hours
    relaxed_rule = MatchRule(max_job_age_hours=150.0)
    passed, reason = HardFilterEvaluator.evaluate(profile, job, rule=relaxed_rule)
    assert passed is True
