import logging
import re
import sys
from app.core.config import settings

# Things that must never reach a log file: bearer tokens, JWTs, passwords, API keys. (SEC-14)
_REDACTIONS = [
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+"), r"\1[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*"), "[REDACTED_JWT]"),
    (
        re.compile(
            r"(?i)((?:password|passwd|secret|token|api[_-]?key|authorization|encryption[_-]?key)"
            r"[\"']?\s*[:=]\s*[\"']?)[^\s\"',}&]+"
        ),
        r"\1[REDACTED]",
    ),
]


def redact(text: str) -> str:
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


class RedactingFormatter(logging.Formatter):
    """Applies redact() to the final log line, including exception tracebacks."""

    def format(self, record: logging.LogRecord) -> str:
        return redact(super().format(record))


def setup_logging():
    """Configures structured application logging."""
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    formatter = RedactingFormatter(
        fmt="[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers = [handler]

    # Suppress verbose third-party logs
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("aiosqlite").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


logger = logging.getLogger("app")
