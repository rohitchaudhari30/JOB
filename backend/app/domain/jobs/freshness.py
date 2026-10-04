from datetime import datetime, timedelta, timezone
from enum import Enum
import re
from typing import Dict, Optional, Tuple


class FreshnessBucketEnum(str, Enum):
    JUST_NOW = "JUST_NOW"             # < 15 minutes
    LAST_1_HOUR = "LAST_1_HOUR"       # 15 mins to 1 hour
    LAST_3_HOURS = "LAST_3_HOURS"     # 1 to 3 hours
    LAST_6_HOURS = "LAST_6_HOURS"     # 3 to 6 hours
    LAST_12_HOURS = "LAST_12_HOURS"   # 6 to 12 hours
    LAST_24_HOURS = "LAST_24_HOURS"   # 12 to 24 hours (Today)
    LAST_3_DAYS = "LAST_3_DAYS"       # 1 to 3 days
    LAST_7_DAYS = "LAST_7_DAYS"       # 3 to 7 days
    LAST_14_DAYS = "LAST_14_DAYS"     # 7 to 14 days
    LAST_30_DAYS = "LAST_30_DAYS"     # 14 to 30 days
    OLDER_THAN_30_DAYS = "OLDER_THAN_30_DAYS"  # > 30 days
    UNKNOWN = "UNKNOWN"


# Default Configurable Freshness Score Table (0 - 100)
DEFAULT_FRESHNESS_SCORES: Dict[FreshnessBucketEnum, float] = {
    FreshnessBucketEnum.JUST_NOW: 100.0,
    FreshnessBucketEnum.LAST_1_HOUR: 100.0,
    FreshnessBucketEnum.LAST_3_HOURS: 95.0,
    FreshnessBucketEnum.LAST_6_HOURS: 90.0,
    FreshnessBucketEnum.LAST_12_HOURS: 85.0,
    FreshnessBucketEnum.LAST_24_HOURS: 80.0,
    FreshnessBucketEnum.LAST_3_DAYS: 70.0,
    FreshnessBucketEnum.LAST_7_DAYS: 55.0,
    FreshnessBucketEnum.LAST_14_DAYS: 35.0,
    FreshnessBucketEnum.LAST_30_DAYS: 15.0,
    FreshnessBucketEnum.OLDER_THAN_30_DAYS: 0.0,
    FreshnessBucketEnum.UNKNOWN: 50.0,
}


class PostedDateParser:
    """
    Robust Domain Date Parser that converts noisy source portal strings into UTC timestamps.
    Handles:
    - 'Just now', 'few seconds ago', 'moments ago'
    - '45 minutes ago', '10 mins ago', '1m ago'
    - '1 hour ago', '3 hours ago', '6 hrs ago'
    - 'Today', 'Posted Today'
    - 'Yesterday', '1 day ago'
    - '3 days ago', '5d ago'
    - '1 week ago', '2 weeks ago', '2w ago'
    - '1 month ago', '30+ days ago'
    - ISO timestamps: '2026-10-04T10:00:00Z', '2026-10-04'
    """

    @classmethod
    def parse(
        cls,
        raw_text: Optional[str],
        reference_time: Optional[datetime] = None,
    ) -> Tuple[Optional[datetime], str, Optional[str]]:
        """
        Returns: (posted_at_utc, precision, normalized_raw_text)
        precision can be 'EXACT', 'APPROXIMATE', or 'UNKNOWN'.
        """
        if not raw_text or not raw_text.strip():
            return None, "UNKNOWN", None

        ref = reference_time or datetime.now(timezone.utc)
        text = raw_text.strip()
        clean = text.lower().replace("posted", "").replace("ago", "").strip()

        # 1. Just now / seconds
        if any(w in clean for w in ["just now", "few seconds", "moment", "now", "just posted"]):
            return ref, "EXACT", text

        # 1b. Qualitative minutes: "few mins", "few minutes", "a minute"
        if any(w in clean for w in ["few min", "few mins", "a minute", "couple of minutes"]):
            return ref - timedelta(minutes=15), "APPROXIMATE", text

        # 1c. Qualitative hours: "few hours", "few hrs", "a few hours", "an hour"
        if any(w in clean for w in ["few hour", "few hrs", "a few hours", "couple of hours"]):
            return ref - timedelta(hours=3), "APPROXIMATE", text
        if "an hour" in clean:
            return ref - timedelta(hours=1), "APPROXIMATE", text

        # 2. ISO timestamp format
        try:
            if "t" in text.lower() or re.match(r"^\d{4}-\d{2}-\d{2}", text):
                iso_str = text.replace("Z", "+00:00")
                parsed_dt = datetime.fromisoformat(iso_str)
                if parsed_dt.tzinfo is None:
                    parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                return parsed_dt.astimezone(timezone.utc), "EXACT", text
        except Exception:
            pass

        # 3. Minutes: "45 minutes", "10 mins", "5m"
        min_match = re.search(r"(\d+)\s*(?:minutes?|mins?|m\b)", clean)
        if min_match:
            mins = int(min_match.group(1))
            return ref - timedelta(minutes=mins), "APPROXIMATE", text

        # 4. Hours: "1 hour", "3 hours", "6 hrs", "2h"
        hour_match = re.search(r"(\d+)\s*(?:hours?|hrs?|h\b)", clean)
        if hour_match:
            hours = int(hour_match.group(1))
            return ref - timedelta(hours=hours), "APPROXIMATE", text

        # 5. Today / Yesterday / a day ago
        if "today" in clean:
            return ref - timedelta(hours=2), "APPROXIMATE", text
        if "yesterday" in clean or "a day" in clean or "1 day" in clean:
            return ref - timedelta(days=1), "APPROXIMATE", text

        # 6. Days: "3 days", "1 day", "5d", "30+ days"
        if "30+" in clean or "30 plus" in clean:
            return ref - timedelta(days=35), "APPROXIMATE", text

        day_match = re.search(r"(\d+)\s*(?:days?|d\b)", clean)
        if day_match:
            days = int(day_match.group(1))
            return ref - timedelta(days=days), "APPROXIMATE", text

        # 7. Weeks: "1 week", "2 weeks", "3wks", "2w"
        week_match = re.search(r"(\d+)\s*(?:weeks?|wks?|w\b)", clean)
        if week_match:
            weeks = int(week_match.group(1))
            return ref - timedelta(weeks=weeks), "APPROXIMATE", text

        # 8. Months: "1 month", "2 months", "1 mo"
        month_match = re.search(r"(\d+)\s*(?:months?|mos?|mo\b)", clean)
        if month_match:
            months = int(month_match.group(1))
            return ref - timedelta(days=months * 30), "APPROXIMATE", text

        return None, "UNKNOWN", text


class FreshnessCalculator:
    """
    Computes freshness bucket, freshness score, and human-friendly UI relative timestamps.
    """

    @classmethod
    def calculate_bucket(
        cls,
        posted_at: Optional[datetime],
        reference_time: Optional[datetime] = None,
    ) -> FreshnessBucketEnum:
        if not posted_at:
            return FreshnessBucketEnum.UNKNOWN

        ref = reference_time or datetime.now(timezone.utc)
        if posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)

        delta = ref - posted_at
        total_seconds = max(0.0, delta.total_seconds())
        hours = total_seconds / 3600.0

        if hours <= 0.25:  # <= 15 mins
            return FreshnessBucketEnum.JUST_NOW
        if hours <= 1.0:
            return FreshnessBucketEnum.LAST_1_HOUR
        if hours <= 3.0:
            return FreshnessBucketEnum.LAST_3_HOURS
        if hours <= 6.0:
            return FreshnessBucketEnum.LAST_6_HOURS
        if hours <= 12.0:
            return FreshnessBucketEnum.LAST_12_HOURS
        if hours <= 24.0:
            return FreshnessBucketEnum.LAST_24_HOURS
        if hours <= 72.0:  # 3 days
            return FreshnessBucketEnum.LAST_3_DAYS
        if hours <= 168.0:  # 7 days
            return FreshnessBucketEnum.LAST_7_DAYS
        if hours <= 336.0:  # 14 days
            return FreshnessBucketEnum.LAST_14_DAYS
        if hours <= 720.0:  # 30 days
            return FreshnessBucketEnum.LAST_30_DAYS
        return FreshnessBucketEnum.OLDER_THAN_30_DAYS

    @classmethod
    def calculate_score(
        cls,
        posted_at: Optional[datetime],
        custom_score_table: Optional[Dict[str, float]] = None,
        reference_time: Optional[datetime] = None,
    ) -> float:
        bucket = cls.calculate_bucket(posted_at, reference_time)
        if custom_score_table and bucket.value in custom_score_table:
            return float(custom_score_table[bucket.value])
        return DEFAULT_FRESHNESS_SCORES.get(bucket, 50.0)

    @classmethod
    def format_relative_time(
        cls,
        posted_at: Optional[datetime],
        raw_posted_text: Optional[str] = None,
        reference_time: Optional[datetime] = None,
    ) -> str:
        """Returns clean human-readable relative label, e.g. '45 min ago', '3 hours ago', '2 days ago'."""
        if not posted_at:
            return raw_posted_text or "Recently"

        ref = reference_time or datetime.now(timezone.utc)
        if posted_at.tzinfo is None:
            posted_at = posted_at.replace(tzinfo=timezone.utc)

        delta = ref - posted_at
        total_seconds = max(0.0, delta.total_seconds())
        minutes = int(total_seconds // 60)
        hours = int(total_seconds // 3600)
        days = int(total_seconds // 86400)

        if minutes < 1:
            return "Just now"
        if minutes < 60:
            return f"{minutes} min ago"
        if hours < 24:
            return "1 hour ago" if hours == 1 else f"{hours} hours ago"
        if days == 1:
            return "1 day ago"
        if days < 7:
            return f"{days} days ago"
        weeks = days // 7
        if weeks < 4:
            return "1 week ago" if weeks == 1 else f"{weeks} weeks ago"
        months = days // 30
        return "1 month ago" if months == 1 else f"{months} months ago"
