"""AUT-02 / AUT-03: code must only reference enum members that exist.

A typo like `AutomationState.ERROR` raises AttributeError at runtime, and the
surrounding `except Exception` blocks used to hide it. This test scans the
source so such a typo fails the build instead.
"""
import re
from pathlib import Path

import pytest

from app.domain.applications.entities import (
    ApplicationOutcomeStatus,
    WorkflowStateEnum,
)
from app.domain.automation.state_machine import AutomationState

APP_DIR = Path(__file__).resolve().parents[2] / "app"
ENUMS = {
    "AutomationState": AutomationState,
    "WorkflowStateEnum": WorkflowStateEnum,
    "ApplicationOutcomeStatus": ApplicationOutcomeStatus,
}


@pytest.mark.parametrize("enum_name", list(ENUMS))
def test_every_referenced_member_exists(enum_name):
    enum_cls = ENUMS[enum_name]
    pattern = re.compile(rf"\b{enum_name}\.([A-Z][A-Z0-9_]*)\b")
    missing = []
    for path in APP_DIR.rglob("*.py"):
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for member in pattern.findall(line):
                if member not in enum_cls.__members__:
                    missing.append(f"{path.relative_to(APP_DIR)}:{lineno} {enum_name}.{member}")
    assert not missing, "Unknown enum members referenced:\n" + "\n".join(missing)


def test_application_failure_text_uses_the_persisted_field():
    """AUT-09: `last_error_message` is not a column, so anything stored there was lost."""
    offenders = [
        str(path.relative_to(APP_DIR))
        for path in (APP_DIR / "application" / "applications").rglob("*.py")
        if "app.last_error_message" in path.read_text(encoding="utf-8")
    ]
    assert not offenders, f"Use app.failure_reason instead: {offenders}"
