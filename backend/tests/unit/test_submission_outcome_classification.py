import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.application.applications.use_cases import ExecuteApplicationUseCase
from app.domain.applications.entities import WorkflowStateEnum, ApplicationOutcomeStatus
from app.infrastructure.browser.dom_analyzer import ScannedForm


@pytest.fixture
def execute_app_use_case():
    mock_app_repo = AsyncMock()
    mock_job_repo = AsyncMock()
    mock_profile_repo = AsyncMock()
    mock_resume_repo = AsyncMock()
    mock_dom_analyzer = AsyncMock()
    mock_form_engine = AsyncMock()

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
        dom_analyzer=mock_dom_analyzer,
        form_engine=mock_form_engine,
    )
    return use_case


@pytest.mark.asyncio
async def test_verify_outcome_detects_otp_challenge(execute_app_use_case):
    """Post-submission challenge (OTP) transitions to PAUSED_OTP and UNKNOWN outcome."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    mock_form = ScannedForm(
        has_challenge=True,
        challenge_type="OTP",
    )
    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.PAUSED_OTP
    assert outcome == ApplicationOutcomeStatus.UNKNOWN
    assert "OTP" in detail


@pytest.mark.asyncio
async def test_verify_outcome_detects_captcha_challenge(execute_app_use_case):
    """Post-submission challenge (CAPTCHA / Cloudflare) transitions to PAUSED_CAPTCHA and UNKNOWN."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    mock_form = ScannedForm(
        has_challenge=True,
        challenge_type="CLOUDFLARE",
    )
    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.PAUSED_CAPTCHA
    assert outcome == ApplicationOutcomeStatus.UNKNOWN
    assert "CLOUDFLARE" in detail


@pytest.mark.asyncio
async def test_verify_outcome_detects_inline_validation_error(execute_app_use_case):
    """Post-submission inline validation error transitions to FAILED and NOT_SUBMITTED."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(
        return_value=ScannedForm(has_challenge=False)
    )

    # Page evaluate returns validation errors
    mock_page.evaluate = MagicMock(return_value=["Please fill in the required phone number field."])

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.FAILED
    assert outcome == ApplicationOutcomeStatus.NOT_SUBMITTED
    assert "validation error" in detail.lower()


@pytest.mark.asyncio
async def test_verify_outcome_detects_confirmation_url_redirect(execute_app_use_case):
    """Redirect to confirmation URL transitions to APPLIED + SUBMITTED."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply/thank-you"

    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(
        return_value=ScannedForm(has_challenge=False)
    )

    def mock_eval(script):
        if "errorSelectors" in script:
            return []
        return False

    mock_page.evaluate = MagicMock(side_effect=mock_eval)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.APPLIED
    assert outcome == ApplicationOutcomeStatus.SUBMITTED
    assert "confirmation URL" in detail


@pytest.mark.asyncio
async def test_verify_outcome_detects_confirmation_text(execute_app_use_case):
    """Positive confirmation text on page transitions to APPLIED + SUBMITTED."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(
        return_value=ScannedForm(has_challenge=False)
    )

    def mock_eval(script):
        if "errorSelectors" in script:
            return []
        if "application\\s+submitted" in script:
            return True
        return False

    mock_page.evaluate = MagicMock(side_effect=mock_eval)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.APPLIED
    assert outcome == ApplicationOutcomeStatus.SUBMITTED
    assert "positive confirmation text" in detail


@pytest.mark.asyncio
async def test_verify_outcome_detects_applied_button_state(execute_app_use_case):
    """Button text becoming 'Applied' and disabled transitions to APPLIED + SUBMITTED."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(
        return_value=ScannedForm(has_challenge=False)
    )

    def mock_eval(script):
        if "errorSelectors" in script:
            return []
        if "application\\s+submitted" in script:
            return False
        if "txt === 'applied'" in script:
            return True
        return False

    mock_page.evaluate = MagicMock(side_effect=mock_eval)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.APPLIED
    assert outcome == ApplicationOutcomeStatus.SUBMITTED
    assert "button state" in detail


@pytest.mark.asyncio
async def test_verify_outcome_inconclusive_guards_with_reconciliation_required(execute_app_use_case):
    """When DOM outcome is ambiguous/inconclusive, transitions to RECONCILIATION_REQUIRED with UNKNOWN outcome."""
    mock_page = MagicMock()
    mock_page.url = "https://jobs.example.com/apply"

    execute_app_use_case._dom_analyzer.scan_form = AsyncMock(
        return_value=ScannedForm(has_challenge=False)
    )

    def mock_eval(script):
        if "errorSelectors" in script:
            return []
        return False

    mock_page.evaluate = MagicMock(side_effect=mock_eval)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
            page=mock_page,
            original_url="https://jobs.example.com/apply",
            initial_scanned_form=None,
        )

    assert state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert outcome == ApplicationOutcomeStatus.UNKNOWN
    assert "reconciliation" in detail.lower()


@pytest.mark.asyncio
async def test_verify_outcome_uses_platform_adapter_verification(execute_app_use_case):
    """When platform adapter confirms submission, transitions to APPLIED + SUBMITTED via adapter detail."""
    mock_page = MagicMock()
    mock_page.url = "https://www.naukri.com/job/123"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("app.infrastructure.browser.adapters.registry.adapter_registry.get_application_adapter") as mock_get_adapter:
            mock_adapter = MagicMock()
            mock_adapter.verify_submission = AsyncMock(return_value=(True, "Naukri applied message confirmed."))
            mock_get_adapter.return_value = mock_adapter

            state, outcome, detail = await execute_app_use_case._verify_submission_outcome(
                page=mock_page,
                original_url="https://www.naukri.com/job/123",
                initial_scanned_form=None,
                platform="naukri",
            )

    assert state == WorkflowStateEnum.APPLIED
    assert outcome == ApplicationOutcomeStatus.SUBMITTED
    assert "Platform adapter (naukri) confirmed" in detail
