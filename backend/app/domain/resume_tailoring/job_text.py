"""The job text a tailoring request works from."""
from typing import Any, Optional


def effective_job_text(job_description_override: Optional[str], job: Any) -> str:
    """Text the user pasted for this request, or else the saved posting's own description."""
    pasted = (job_description_override or "").strip()
    return pasted or (getattr(job, "raw_description", "") or "")
