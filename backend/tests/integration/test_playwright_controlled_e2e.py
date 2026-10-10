import asyncio
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from playwright.async_api import async_playwright
from app.application.applications.use_cases import ExecuteApplicationUseCase
from app.domain.applications.entities import WorkflowStateEnum, ApplicationOutcomeStatus
from app.infrastructure.browser.dom_analyzer import DOMAnalyzer
from app.infrastructure.browser.form_engine import FormEngine, ScannedField


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_playwright_controlled_success_confirmation():
    """Real Chromium browser submits form, navigates to thank-you page with confirmation text."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Load simulated apply form
        html_form = """
        <!DOCTYPE html>
        <html>
        <body>
            <h1>Apply for Senior Engineer</h1>
            <form id="apply-form" onsubmit="event.preventDefault(); window.location.href = 'https://jobs.example.com/confirmation';">
                <input type="text" id="name" name="name" value="Jane Doe" />
                <button type="submit" id="submit-btn">Submit Application</button>
            </form>
        </body>
        </html>
        """
        await page.set_content(html_form)
        await page.click("#submit-btn")

        # Set confirmation page content
        confirmation_html = """
        <!DOCTYPE html>
        <html>
        <body>
            <h2>Application Submitted</h2>
            <p>Thank you for applying to our engineering role.</p>
        </body>
        </html>
        """
        await page.set_content(confirmation_html)

        use_case = ExecuteApplicationUseCase(
            app_repo=AsyncMock(),
            job_repo=AsyncMock(),
            profile_repo=AsyncMock(),
            resume_repo=AsyncMock(),
            dom_analyzer=DOMAnalyzer(),
        )

        with patch("asyncio.sleep", new_callable=AsyncMock):
            state, outcome, detail = await use_case._verify_submission_outcome(
                page=page,
                original_url="https://jobs.example.com/apply",
                initial_scanned_form=None,
            )

        assert state == WorkflowStateEnum.APPLIED
        assert outcome == ApplicationOutcomeStatus.SUBMITTED
        assert "positive confirmation text" in detail or "confirmation URL" in detail

        await browser.close()


@pytest.mark.asyncio
async def test_playwright_controlled_inline_validation_error():
    """Real Chromium browser triggers client-side validation error."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        html_with_error = """
        <!DOCTYPE html>
        <html>
        <body>
            <form id="apply-form">
                <input type="text" id="phone" name="phone" aria-invalid="true" />
                <div class="error-message">Please enter a valid 10-digit phone number.</div>
                <button type="submit" id="submit-btn">Submit</button>
            </form>
        </body>
        </html>
        """
        await page.set_content(html_with_error)

        use_case = ExecuteApplicationUseCase(
            app_repo=AsyncMock(),
            job_repo=AsyncMock(),
            profile_repo=AsyncMock(),
            resume_repo=AsyncMock(),
            dom_analyzer=DOMAnalyzer(),
        )

        with patch("asyncio.sleep", new_callable=AsyncMock):
            state, outcome, detail = await use_case._verify_submission_outcome(
                page=page,
                original_url="https://jobs.example.com/apply",
                initial_scanned_form=None,
            )

        assert state == WorkflowStateEnum.FAILED
        assert outcome == ApplicationOutcomeStatus.NOT_SUBMITTED
        assert "validation error" in detail.lower()
        assert "10-digit phone" in detail

        await browser.close()


@pytest.mark.asyncio
async def test_playwright_controlled_post_submit_captcha():
    """Real Chromium browser detects CAPTCHA challenge element."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        html_with_captcha = """
        <!DOCTYPE html>
        <html>
        <body>
            <div id="g-recaptcha" class="g-recaptcha"></div>
            <iframe src="https://recaptcha.net/recaptcha/api2/anchor"></iframe>
            <p>Verify you are human to proceed.</p>
        </body>
        </html>
        """
        await page.set_content(html_with_captcha)

        use_case = ExecuteApplicationUseCase(
            app_repo=AsyncMock(),
            job_repo=AsyncMock(),
            profile_repo=AsyncMock(),
            resume_repo=AsyncMock(),
            dom_analyzer=DOMAnalyzer(),
        )

        with patch("asyncio.sleep", new_callable=AsyncMock):
            state, outcome, detail = await use_case._verify_submission_outcome(
                page=page,
                original_url="https://jobs.example.com/apply",
                initial_scanned_form=None,
            )

        assert state == WorkflowStateEnum.PAUSED_CAPTCHA
        assert outcome == ApplicationOutcomeStatus.UNKNOWN
        assert "CAPTCHA" in detail

        await browser.close()


@pytest.mark.asyncio
async def test_playwright_controlled_real_resume_file_upload(tmp_path):
    """Real Chromium browser interacts with input[type=file] and uploads a real physical file."""
    test_resume_file = tmp_path / "jane_doe_resume.pdf"
    test_resume_file.write_text("%PDF-1.4 Mock Resume File Contents for Playwright Integration")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        html_with_file_input = """
        <!DOCTYPE html>
        <html>
        <body>
            <form id="apply-form">
                <label for="resume-input">Upload Resume</label>
                <input type="file" id="resume-input" name="resume" accept=".pdf,.doc,.docx" />
            </form>
        </body>
        </html>
        """
        await page.set_content(html_with_file_input)

        # Use FormEngine to scan and fill
        analyzer = DOMAnalyzer()
        form_engine = FormEngine()

        scanned = await analyzer.scan_form(page)
        resume_fields = [f for f in scanned.fields if f.input_type == "file"]
        assert len(resume_fields) == 1

        # Use locator to upload real file
        locator = page.locator(resume_fields[0].selector).first
        await locator.set_input_files(str(test_resume_file))

        # Verify in Chromium DOM that file was attached
        uploaded_filename = await page.eval_on_selector(
            "#resume-input", "el => el.files.length > 0 ? el.files[0].name : ''"
        )
        assert uploaded_filename == "jane_doe_resume.pdf"

        await browser.close()


@pytest.mark.asyncio
async def test_playwright_controlled_inconclusive_outcome_guards_reconciliation():
    """Real Chromium browser remains on form with no change -> transitions to RECONCILIATION_REQUIRED + UNKNOWN."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        static_form = """
        <!DOCTYPE html>
        <html>
        <body>
            <form id="apply-form">
                <input type="text" id="name" value="Candidate" />
                <button type="submit" id="submit-btn">Submit</button>
            </form>
        </body>
        </html>
        """
        await page.set_content(static_form)

        use_case = ExecuteApplicationUseCase(
            app_repo=AsyncMock(),
            job_repo=AsyncMock(),
            profile_repo=AsyncMock(),
            resume_repo=AsyncMock(),
            dom_analyzer=DOMAnalyzer(),
        )

        with patch("asyncio.sleep", new_callable=AsyncMock):
            state, outcome, detail = await use_case._verify_submission_outcome(
                page=page,
                original_url="https://jobs.example.com/apply",
                initial_scanned_form=None,
            )

        assert state == WorkflowStateEnum.RECONCILIATION_REQUIRED
        assert outcome == ApplicationOutcomeStatus.UNKNOWN
        assert "reconciliation" in detail.lower()

        await browser.close()
