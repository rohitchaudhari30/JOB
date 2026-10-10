import hashlib
import re
from typing import Tuple
from app.domain.matching.entities import IdentityConfidenceEnum


class CanonicalJobIdentifier:
    """
    Pure domain service for generating normalized cross-platform job fingerprints.
    Avoids aggressive false positives while detecting true multi-portal duplicates.
    """

    COMPANY_SUFFIXES = [
        r"\bpvt\.?\s*ltd\.?\b",
        r"\blimited\b",
        r"\bllc\b",
        r"\binc\.?\b",
        r"\bcorp\.?\b",
        r"\btechnologies\b",
        r"\bservices\b",
        r"\bsolutions\b",
        r"\bindia\b",
    ]

    LOCATION_ALIASES = {
        "bengaluru": "bangalore",
        "mumbai": "bombay",
        "gurugram": "gurgaon",
        "chennai": "madras",
        "kolkata": "calcutta",
    }

    TITLE_SYNONYMS = {
        r"\bsr\.?\b": "senior",
        r"\bjr\.?\b": "junior",
        r"\bsw\b": "software",
        r"\bsde\s*-\s*1\b": "software engineer 1",
        r"\bsde\s*-\s*2\b": "software engineer 2",
        r"\bsde\s*-\s*3\b": "software engineer 3",
        r"\bdev\b": "developer",
        r"\beng\b": "engineer",
    }

    STATE_OR_COUNTRY_SUFFIXES = [
        r"\bkarnataka\b",
        r"\bmaharashtra\b",
        r"\btamil\s*nadu\b",
        r"\btelangana\b",
        r"\bharyana\b",
        r"\buttar\s*pradesh\b",
        r"\bindia\b",
    ]

    @classmethod
    def normalize_company(cls, company: str) -> str:
        text = company.lower().strip()
        for suffix_pat in cls.COMPANY_SUFFIXES:
            text = re.sub(suffix_pat, "", text)
        return re.sub(r"[^a-z0-9]", "", text)

    @classmethod
    def normalize_title(cls, title: str) -> str:
        text = title.lower().strip()
        for pat, repl in cls.TITLE_SYNONYMS.items():
            text = re.sub(pat, repl, text)
        cleaned = re.sub(r"[^a-z0-9]", " ", text)
        return re.sub(r"\s+", " ", cleaned).strip()

    @classmethod
    def normalize_location(cls, location: str) -> str:
        text = location.lower().strip()
        for pat in cls.STATE_OR_COUNTRY_SUFFIXES:
            text = re.sub(pat, "", text)
        tokens = re.split(r"[,/\s]+", text)
        normalized_tokens = [cls.LOCATION_ALIASES.get(t, t) for t in tokens if len(t) > 2]
        return " ".join(sorted(set(normalized_tokens)))

    @classmethod
    def generate_description_fingerprint(cls, description: str, external_job_id: str = "") -> str:
        if not description or not description.strip():
            # If description is missing, fall back to external_job_id if available to avoid collapsing distinct vacancies
            if external_job_id:
                return f"ext_{hashlib.sha256(external_job_id.strip().encode('utf-8')).hexdigest()[:12]}"
            return "nodesc"
        cleaned = re.sub(r"\s+", " ", description.lower().strip())
        sample = cleaned[:600]
        return hashlib.sha256(sample.encode("utf-8")).hexdigest()[:16]

    @classmethod
    def compute_canonical_key(
        cls,
        company: str,
        title: str,
        location: str,
        description: str = "",
        external_job_id: str = "",
    ) -> Tuple[str, IdentityConfidenceEnum]:
        norm_comp = cls.normalize_company(company)
        norm_title = cls.normalize_title(title)
        norm_loc = cls.normalize_location(location)
        desc_fp = cls.generate_description_fingerprint(description, external_job_id=external_job_id)

        raw_payload = f"{norm_comp}|{norm_title}|{norm_loc}|{desc_fp}"
        canonical_key = hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()

        # If description is missing and no external_job_id provided, confidence is POSSIBLE_DUPLICATE
        if not description or not description.strip():
            confidence = IdentityConfidenceEnum.POSSIBLE_DUPLICATE
        else:
            confidence = IdentityConfidenceEnum.CANONICAL_DERIVED

        return canonical_key, confidence
