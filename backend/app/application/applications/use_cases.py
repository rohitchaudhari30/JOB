import asyncio
from app.core.url_safety import unsafe_url_reason
from datetime import datetime, timezone, timedelta
import hashlib
import inspect
import logging
import os
from typing import Any, List, Optional
import uuid
from app.application.notifier import ws_manager
from app.core.exceptions import (
    AuthorizationException,
    DuplicateEntityException,
    EntityNotFoundException,
    InvalidStateTransitionException,
    ValidationException,
)
from app.domain.ai.contracts import AIProvider
from app.domain.campaigns.entities import (
    ErrorTaxonomyEnum,
    classify_automation_error,
    calculate_retry_backoff,
)
from app.domain.connections.entities import ConnectionStatus
from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
from app.domain.applications.entities import (
    Application,
    ApplicationEvent,
    ApplicationOutcomeStatus,
    ApplicationQuestion,
    WorkflowStateEnum,
)
from app.domain.applications.repositories import ApplicationRepository
from app.domain.jobs.repositories import JobRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository
from app.infrastructure.browser.browser_manager import browser_manager
from app.infrastructure.browser.dom_analyzer import DOMAnalyzer
from app.infrastructure.browser.form_engine import FormEngine
from app.infrastructure.browser.screenshot_streamer import ScreenshotStreamer
from app.infrastructure.browser.trace_manager import trace_manager

logger = logging.getLogger("app.application.applications")


class CreateApplicationUseCase:
    """Initializes a new job application record with idempotency and state validation."""

    def __init__(self, app_repo: ApplicationRepository, job_repo: JobRepository):
        self._app_repo = app_repo
        self._job_repo = job_repo

    async def execute(
        self,
        user_id: str,
        job_id: str,
        resume_id: Optional[str] = None,
        initial_state: WorkflowStateEnum = WorkflowStateEnum.APPROVED,
    ) -> Application:
        job = await self._job_repo.get_by_id(job_id)
        if not job:
            raise EntityNotFoundException(f"Job with ID [{job_id}] not found.")

        existing = await self._app_repo.get_by_user_and_job(user_id=user_id, job_id=job_id)
        if existing:
            return existing

        idempotency_key = hashlib.sha256(f"{user_id}:{job_id}".encode()).hexdigest()

        app = Application(
            id=f"app_{uuid.uuid4().hex[:12]}",
            user_id=user_id,
            job_id=job_id,
            resume_id=resume_id,
            idempotency_key=idempotency_key,
            workflow_state=initial_state,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        saved_app = await self._app_repo.save(app)

        await self._app_repo.add_event(
            ApplicationEvent(
                id=f"evt_{uuid.uuid4().hex[:12]}",
                application_id=saved_app.id,
                event_name="APPLICATION_INITIALIZED",
                payload={"initial_state": initial_state.value},
                created_at=datetime.now(timezone.utc),
            )
        )
        return saved_app


class ExecuteApplicationUseCase:
    """
    Orchestrates the browser automation execution lifecycle:
    1. Spawns isolated browser context with stealth scripts.
    2. Navigates to job application page.
    3. Scans DOM & handles multi-step forms.
    4. Handles OTP/CAPTCHA challenge pauses (Human-in-the-loop).
    5. Fills profile fields & answers screening questions with AI Gateway.
    6. Submits application & retains failure traces/screenshots on error.
    """

    def __init__(
        self,
        app_repo: ApplicationRepository,
        job_repo: JobRepository,
        profile_repo: CandidateProfileRepository,
        resume_repo: ResumeRepository,
        user_repo: Optional[Any] = None,
        session_repo: Optional[Any] = None,
        dom_analyzer: Optional[DOMAnalyzer] = None,
        form_engine: Optional[FormEngine] = None,
        ai_provider: Optional[AIProvider] = None,
    ):
        self._app_repo = app_repo
        self._job_repo = job_repo
        self._profile_repo = profile_repo
        self._resume_repo = resume_repo
        self._user_repo = user_repo
        self._session_repo = session_repo
        self._dom_analyzer = dom_analyzer or DOMAnalyzer()
        self._form_engine = form_engine or FormEngine()
        self._ai_provider = ai_provider

    async def execute(self, application_id: str, run_id: Optional[str] = None, headless: bool = True) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application with ID [{application_id}] not found.")

        job = await self._job_repo.get_by_id(app.job_id)
        if not job:
            raise EntityNotFoundException(f"Associated Job [{app.job_id}] not found.")

        profile = await self._profile_repo.get_by_user_id(app.user_id)
        if not profile:
            raise EntityNotFoundException(f"Candidate profile for user [{app.user_id}] not found.")

        candidate_name = None
        candidate_email = None
        if self._user_repo:
            user = await self._user_repo.get_by_id(app.user_id)
            if user:
                candidate_name = user.full_name
                candidate_email = user.email

        resume_file_path = None
        if app.resume_id:
            resume = await self._resume_repo.get_by_id(app.resume_id)
            if not resume:
                raise ValidationException(f"Selected resume [{app.resume_id}] not found in database.")
            if getattr(resume, "user_id", None) and resume.user_id != app.user_id:
                raise ValidationException(f"Selected resume [{app.resume_id}] does not belong to user [{app.user_id}].")
            if resume.file_path and not os.path.isfile(resume.file_path) and not resume.file_path.startswith("mock://"):
                raise ValidationException(f"Resume file [{resume.file_path}] is inaccessible or missing on disk.")
            resume_file_path = resume.file_path

        # Guard against concurrent or duplicate execution on completed, in-flight, or uncertain applications
        if app.workflow_state == WorkflowStateEnum.APPLIED:
            raise ValidationException(f"Application [{application_id}] is already applied.")
        if app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED:
            raise ValidationException(
                f"Application [{application_id}] requires reconciliation before execution."
            )

        run_id = run_id or f"run_{uuid.uuid4().hex[:8]}"

        # State transition: APPLYING (atomic check-and-set using expected_state)
        prev_state = app.workflow_state
        app.workflow_state = WorkflowStateEnum.APPLYING
        app.updated_at = datetime.now(timezone.utc)
        await _safe_save_app(self._app_repo, app, expected_state=prev_state)

        await ws_manager.broadcast_to_user(
            user_id=app.user_id,
            message={
                "type": "APPLICATION_EVENT",
                "run_id": run_id,
                "application_id": app.id,
                "state": app.workflow_state.value,
                "message": f"Starting application for {job.title} at {job.company}...",
            },
        )

        context = None
        page = None
        streamer = None
        attempt_id: Optional[str] = None

        # Look up active platform session if available
        encrypted_storage_state = None
        if self._session_repo:
            target_platform = (job.source_type or job.source_id or "").lower()
            if target_platform:
                try:
                    sess = await self._session_repo.get_by_user_and_platform(app.user_id, target_platform)
                    if sess and sess.encrypted_storage_state and getattr(sess, "status", "ACTIVE") == "ACTIVE":
                        encrypted_storage_state = sess.encrypted_storage_state
                        logger.info(f"Injecting authenticated session for applying to {target_platform}.")
                except Exception as sess_err:
                    logger.warning(f"Could not load session for applying to {target_platform}: {sess_err}")

        try:
            # 1. Acquire isolated browser context (with authenticated session if available)
            try:
                context = await browser_manager.create_isolated_context(
                    encrypted_storage_state=encrypted_storage_state,
                    headless=headless,
                )
            except TypeError:
                context = await browser_manager.create_isolated_context(
                    encrypted_storage_state=encrypted_storage_state,
                )
            await trace_manager.start_tracing(context)

            pages = getattr(context, "pages", None)
            page = pages[0] if (isinstance(pages, list) and len(pages) > 0) else await context.new_page()
            streamer = ScreenshotStreamer(page=page, user_id=app.user_id, run_id=run_id, fps=5)
            streamer.start()

            # 2. Navigate to Application URL
            target_url = job.apply_url
            blocked = unsafe_url_reason(target_url)
            if blocked:
                raise ValidationException(f"Blocked unsafe apply URL for job [{job.id}]: {blocked}.")
            logger.info(f"Navigating to job application URL: {target_url}")
            try:
                await page.goto(target_url, wait_until="domcontentloaded", timeout=30000)
            except Exception:
                await page.goto(target_url, timeout=30000)
            await asyncio.sleep(0.8)
            if hasattr(page, "evaluate"):
                try:
                    eval_res = page.evaluate("window.scrollBy({ top: 350, behavior: 'smooth' })")
                    if asyncio.iscoroutine(eval_res) or hasattr(eval_res, "__await__"):
                        await eval_res
                except Exception:
                    pass
            await asyncio.sleep(0.4)

            # 3. Scan DOM
            scanned_form = await self._dom_analyzer.scan_form(page)

            # 4. Check for OTP / CAPTCHA Challenge
            if scanned_form.has_challenge:
                pause_state = (
                    WorkflowStateEnum.PAUSED_OTP
                    if scanned_form.challenge_type == "OTP"
                    else WorkflowStateEnum.PAUSED_CAPTCHA
                )
                app.workflow_state = pause_state
                app.updated_at = datetime.now(timezone.utc)
                await self._app_repo.save(app)

                await ws_manager.broadcast_to_user(
                    user_id=app.user_id,
                    message={
                        "type": "PAUSED_CHALLENGE",
                        "run_id": run_id,
                        "application_id": app.id,
                        "challenge_type": scanned_form.challenge_type,
                        "state": pause_state.value,
                        "message": f"Challenge detected ({scanned_form.challenge_type}). Automation paused for user verification.",
                    },
                )
                return app

            # State transition: FORM_DETECTED
            app.workflow_state = WorkflowStateEnum.FORM_DETECTED
            await self._app_repo.save(app)

            # 5. Fill Form & Screening Questions
            fill_result = await self._form_engine.fill_form(
                page_or_frame=page,
                scanned_form=scanned_form,
                profile=profile,
                candidate_name=candidate_name,
                candidate_email=candidate_email,
                resume_file_path=resume_file_path,
                ai_provider=self._ai_provider,
            )

            # Persist answered screening questions
            for q_data in fill_result.screening_questions:
                q_entity = ApplicationQuestion(
                    id=f"q_{uuid.uuid4().hex[:10]}",
                    application_id=app.id,
                    question_text=q_data["question"],
                    canonical_intent="CUSTOM_QUESTION",
                    answer_provided=q_data["answer"],
                    answered_by=q_data["answered_by"],
                    confidence_score=q_data["confidence"],
                )
                await self._app_repo.add_question(q_entity)

            if not fill_result.is_complete and fill_result.unresolved_fields:
                app.workflow_state = WorkflowStateEnum.QUESTIONS_PENDING
                app.updated_at = datetime.now(timezone.utc)
                await self._app_repo.save(app)
                return app

            # State transition: FORM_FILLED
            app.workflow_state = WorkflowStateEnum.FORM_FILLED
            await self._app_repo.save(app)

            # 6. Submit or Navigate Wizard Steps
            if scanned_form.submit_buttons:
                # Prioritize visible, enabled submit buttons
                candidate_buttons = [b for b in scanned_form.submit_buttons if getattr(b, "is_enabled", True) and getattr(b, "is_visible", True)]
                if not candidate_buttons:
                    candidate_buttons = scanned_form.submit_buttons

                submit_btn = candidate_buttons[0]
                logger.info(f"Submitting form for application [{app.id}] using locator: {submit_btn.selector}")

                # Persist SUBMITTING state with attempt metadata BEFORE clicking submit to guard against worker crash
                attempt_id = f"att_{uuid.uuid4().hex[:12]}"
                app.current_attempt_id = attempt_id
                prev_submitting_state = app.workflow_state
                app.workflow_state = WorkflowStateEnum.SUBMITTING
                app.updated_at = datetime.now(timezone.utc)
                await _safe_save_app(self._app_repo, app, expected_state=prev_submitting_state)

                await self._app_repo.add_event(
                    ApplicationEvent(
                        id=f"evt_{uuid.uuid4().hex[:12]}",
                        application_id=app.id,
                        event_name="APPLICATION_SUBMITTING_ATTEMPT",
                        payload={"attempt_id": attempt_id, "started_at": datetime.now(timezone.utc).isoformat()},
                        created_at=datetime.now(timezone.utc),
                    )
                )

                # Pre-submission click ownership check: verify state is still SUBMITTING and attempt_id matches
                fresh_app = await self._app_repo.get_by_id(app.id)
                if (
                    not fresh_app
                    or fresh_app.workflow_state != WorkflowStateEnum.SUBMITTING
                    or (fresh_app.current_attempt_id and fresh_app.current_attempt_id != attempt_id)
                ):
                    logger.warning(
                        f"Worker lost ownership of application [{app.id}] prior to submit click "
                        f"(current state: {getattr(fresh_app, 'workflow_state', None)}, "
                        f"attempt: {getattr(fresh_app, 'current_attempt_id', None)}). Aborting submission."
                    )
                    return fresh_app or app

                # Context-aware Playwright click with fallback to text locator if CSS fails
                import inspect

                async def _safe_locator_call(func, *args, **kwargs):
                    if callable(func):
                        res = func(*args, **kwargs)
                        if inspect.isawaitable(res):
                            await res

                btn_locator = page.locator(submit_btn.selector).first
                try:
                    await _safe_locator_call(getattr(btn_locator, "wait_for", None), state="visible", timeout=7000)

                    # Last-millisecond pre-click verification: ensure recovery hasn't reclaimed ownership while waiting
                    pre_click_check = await self._app_repo.get_by_id(app.id)
                    if (
                        not pre_click_check
                        or pre_click_check.workflow_state != WorkflowStateEnum.SUBMITTING
                        or (pre_click_check.current_attempt_id and pre_click_check.current_attempt_id != attempt_id)
                    ):
                        logger.warning(
                            f"Worker lost ownership of application [{app.id}] immediately before submit click. Aborting submission."
                        )
                        return pre_click_check or app

                    await _safe_locator_call(getattr(btn_locator, "click", None), timeout=8000)
                except Exception as click_err:
                    # Check ownership before falling back to text locator
                    pre_click_check = await self._app_repo.get_by_id(app.id)
                    if (
                        not pre_click_check
                        or pre_click_check.workflow_state != WorkflowStateEnum.SUBMITTING
                        or (pre_click_check.current_attempt_id and pre_click_check.current_attempt_id != attempt_id)
                    ):
                        logger.warning(
                            f"Worker lost ownership of application [{app.id}] during click error handling. Aborting submission."
                        )
                        return pre_click_check or app

                    logger.warning(f"Primary selector click failed ({click_err}). Trying semantic button text fallback...")
                    fallback_text = (submit_btn.label_text or "Submit").strip()
                    fallback_locator = page.locator(f"button:has-text('{fallback_text}'), input[type='submit']").first
                    await _safe_locator_call(getattr(fallback_locator, "wait_for", None), state="visible", timeout=5000)

                    pre_click_check = await self._app_repo.get_by_id(app.id)
                    if (
                        not pre_click_check
                        or pre_click_check.workflow_state != WorkflowStateEnum.SUBMITTING
                        or (pre_click_check.current_attempt_id and pre_click_check.current_attempt_id != attempt_id)
                    ):
                        logger.warning(
                            f"Worker lost ownership of application [{app.id}] before fallback click. Aborting submission."
                        )
                        return pre_click_check or app

                    await _safe_locator_call(getattr(fallback_locator, "click", None), timeout=5000)

                # Evidence-based post-click submission outcome verification
                target_platform = (job.source_type or job.source_id or "").lower() if job else None
                state, outcome, detail = await self._verify_submission_outcome(
                    page=page,
                    original_url=target_url,
                    initial_scanned_form=scanned_form,
                    platform=target_platform,
                )

                app.workflow_state = state
                app.outcome_status = outcome
                app.updated_at = datetime.now(timezone.utc)

                if state == WorkflowStateEnum.APPLIED:
                    app.applied_at = datetime.now(timezone.utc)
                    await _safe_save_app(
                        self._app_repo,
                        app,
                        expected_state=WorkflowStateEnum.SUBMITTING,
                        expected_attempt_id=attempt_id,
                    )

                    await self._app_repo.add_event(
                        ApplicationEvent(
                            id=f"evt_{uuid.uuid4().hex[:12]}",
                            application_id=app.id,
                            event_name="APPLICATION_SUBMITTED",
                            payload={"outcome_status": "SUBMITTED", "confirmed_at": app.applied_at.isoformat(), "detail": detail},
                            created_at=datetime.now(timezone.utc),
                        )
                    )

                    await ws_manager.broadcast_to_user(
                        user_id=app.user_id,
                        message={
                            "type": "APPLICATION_SUBMITTED",
                            "run_id": run_id,
                            "application_id": app.id,
                            "state": app.workflow_state.value,
                            "message": f"Successfully applied to {job.title} at {job.company}!",
                        },
                    )
                elif state in (WorkflowStateEnum.PAUSED_OTP, WorkflowStateEnum.PAUSED_CAPTCHA):
                    await _safe_save_app(
                        self._app_repo,
                        app,
                        expected_state=WorkflowStateEnum.SUBMITTING,
                        expected_attempt_id=attempt_id,
                    )
                    await self._app_repo.add_event(
                        ApplicationEvent(
                            id=f"evt_{uuid.uuid4().hex[:12]}",
                            application_id=app.id,
                            event_name="APPLICATION_PAUSED_CHALLENGE",
                            payload={"state": state.value, "detail": detail},
                            created_at=datetime.now(timezone.utc),
                        )
                    )
                    await ws_manager.broadcast_to_user(
                        user_id=app.user_id,
                        message={
                            "type": "PAUSED_CHALLENGE",
                            "run_id": run_id,
                            "application_id": app.id,
                            "state": state.value,
                            "message": f"Verification challenge triggered post-submit. Automation paused for verification.",
                        },
                    )
                elif state == WorkflowStateEnum.FAILED:
                    app.failure_reason = detail
                    await _safe_save_app(
                        self._app_repo,
                        app,
                        expected_state=WorkflowStateEnum.SUBMITTING,
                        expected_attempt_id=attempt_id,
                    )
                    await self._app_repo.add_event(
                        ApplicationEvent(
                            id=f"evt_{uuid.uuid4().hex[:12]}",
                            application_id=app.id,
                            event_name="APPLICATION_FAILED",
                            payload={"error": detail},
                            created_at=datetime.now(timezone.utc),
                        )
                    )
                    await ws_manager.broadcast_to_user(
                        user_id=app.user_id,
                        message={
                            "type": "APPLICATION_FAILED",
                            "run_id": run_id,
                            "application_id": app.id,
                            "state": state.value,
                            "message": f"Submission failed: {detail}",
                        },
                    )
                else:  # RECONCILIATION_REQUIRED
                    app.failure_reason = detail
                    await _safe_save_app(
                        self._app_repo,
                        app,
                        expected_state=WorkflowStateEnum.SUBMITTING,
                        expected_attempt_id=attempt_id,
                    )
                    await self._app_repo.add_event(
                        ApplicationEvent(
                            id=f"evt_{uuid.uuid4().hex[:12]}",
                            application_id=app.id,
                            event_name="APPLICATION_RECONCILIATION_REQUIRED",
                            payload={"reason": detail},
                            created_at=datetime.now(timezone.utc),
                        )
                    )
                    await ws_manager.broadcast_to_user(
                        user_id=app.user_id,
                        message={
                            "type": "RECONCILIATION_REQUIRED",
                            "run_id": run_id,
                            "application_id": app.id,
                            "state": state.value,
                            "message": f"Submission outcome unknown. Manual reconciliation required.",
                        },
                    )
            else:
                # If no direct submit button, mark READY_TO_SUBMIT
                app.workflow_state = WorkflowStateEnum.READY_TO_SUBMIT
                await self._app_repo.save(app)

            return app

        except Exception as e:
            logger.error(f"Application execution failed for [{application_id}]: {e}", exc_info=True)
            if isinstance(e, ValidationException) and ("state conflict" in str(e).lower() or "attempt" in str(e).lower()):
                logger.warning(f"Worker fenced out for application [{application_id}]: {e}. Aborting without modifying DB.")
                curr = await self._app_repo.get_by_id(application_id)
                return curr or app
            screenshot_path, trace_path = await trace_manager.capture_failure_artifacts(
                application_id=app.id,
                page=page,
                context=context,
            )
            classification = classify_automation_error(str(e), retry_count=app.retry_count or 0)

            # Map category to state with submission uncertainty guard
            is_submission_uncertainty = (app.workflow_state == WorkflowStateEnum.SUBMITTING)
            if is_submission_uncertainty:
                app.workflow_state = WorkflowStateEnum.RECONCILIATION_REQUIRED
                app.outcome_status = ApplicationOutcomeStatus.UNKNOWN
            elif classification.category == ErrorTaxonomyEnum.ABORTED:
                app.workflow_state = WorkflowStateEnum.FAILED
            elif classification.category == ErrorTaxonomyEnum.AUTHENTICATION:
                app.workflow_state = WorkflowStateEnum.PAUSED_SESSION
            elif classification.category == ErrorTaxonomyEnum.USER_ACTION_REQUIRED:
                if "otp" in str(e).lower() or "verification code" in str(e).lower():
                    app.workflow_state = WorkflowStateEnum.PAUSED_OTP
                else:
                    app.workflow_state = WorkflowStateEnum.PAUSED_CAPTCHA
            elif classification.category in [ErrorTaxonomyEnum.JOB_UNAVAILABLE, ErrorTaxonomyEnum.BUSINESS_RULE]:
                app.workflow_state = WorkflowStateEnum.SKIPPED
            else:
                app.workflow_state = WorkflowStateEnum.FAILED

            app.error_category = classification.category.value
            if is_submission_uncertainty:
                app.failure_reason = f"[SUBMISSION_UNCERTAIN] Error occurred during form submission: {e}. Marked RECONCILIATION_REQUIRED to prevent double application."
            else:
                app.failure_reason = f"[{classification.category.value}] {classification.message} (Detail: {e})"
            app.screenshot_file_path = screenshot_path
            app.trace_file_path = trace_path

            if classification.is_retryable and not is_submission_uncertainty:
                backoff_sec = calculate_retry_backoff(app.retry_count or 0)
                app.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=backoff_sec)
            else:
                app.next_retry_at = None

            app.updated_at = datetime.now(timezone.utc)
            if attempt_id:
                try:
                    await _safe_save_app(
                        self._app_repo,
                        app,
                        expected_state=WorkflowStateEnum.SUBMITTING,
                        expected_attempt_id=attempt_id,
                    )
                except Exception as save_err:
                    logger.warning(
                        f"Exception handler could not update application [{app.id}] due to fencing/conflict ({save_err}). Preserving newer database state."
                    )
                    curr = await self._app_repo.get_by_id(application_id)
                    return curr or app
            else:
                curr = await self._app_repo.get_by_id(application_id)
                if curr and curr.workflow_state in (
                    WorkflowStateEnum.APPLIED,
                    WorkflowStateEnum.RECONCILIATION_REQUIRED,
                    WorkflowStateEnum.SUBMISSION_UNKNOWN,
                    WorkflowStateEnum.SKIPPED,
                ):
                    logger.warning(
                        f"Application [{app.id}] reached newer terminal/reconciliation state [{curr.workflow_state.value}]. Aborting exception save."
                    )
                    return curr
                await self._app_repo.save(app)
            return app

        finally:
            if streamer:
                await streamer.stop()
            if context:
                await context.close()

    async def _verify_submission_outcome(
        self,
        page: Any,
        original_url: str,
        initial_scanned_form: Any,
        platform: Optional[str] = None,
    ) -> tuple[WorkflowStateEnum, ApplicationOutcomeStatus, str]:
        """
        Evidence-based post-click submission outcome classification.
        Classifies outcome into:
        1. Platform Adapter Verification (Naukri, LinkedIn, Greenhouse, etc.)
        2. Human Challenge (PAUSED_OTP / PAUSED_CAPTCHA)
        3. Inline Validation Failure (FAILED)
        4. Confirmed Submission (APPLIED + SUBMITTED)
        5. Inconclusive / Ambiguous State (RECONCILIATION_REQUIRED + UNKNOWN)
        """
        await asyncio.sleep(2.0)

        # 1. Platform-specific confirmation check via adapter registry (if platform specified)
        if platform:
            try:
                from app.infrastructure.browser.adapters.registry import adapter_registry
                app_adapter = adapter_registry.get_application_adapter(platform)
                if hasattr(app_adapter, "verify_submission"):
                    adapter_res = await app_adapter.verify_submission(page, original_url)
                    if adapter_res is not None:
                        is_confirmed, detail_msg = adapter_res
                        if is_confirmed:
                            return (
                                WorkflowStateEnum.APPLIED,
                                ApplicationOutcomeStatus.SUBMITTED,
                                f"Platform adapter ({platform}) confirmed submission: {detail_msg}",
                            )
                        else:
                            return (
                                WorkflowStateEnum.FAILED,
                                ApplicationOutcomeStatus.NOT_SUBMITTED,
                                f"Platform adapter ({platform}) detected submission failure: {detail_msg}",
                            )
            except Exception as adp_err:
                logger.debug(f"Platform adapter submission verification skipped ({adp_err}).")

        # 2. Check for human challenge in post-submission DOM
        try:
            if hasattr(self._dom_analyzer, "scan_form"):
                post_scan = await self._dom_analyzer.scan_form(page)
                if post_scan and post_scan.has_challenge:
                    challenge_type = (post_scan.challenge_type or "CAPTCHA").upper()
                    if "OTP" in challenge_type:
                        return (
                            WorkflowStateEnum.PAUSED_OTP,
                            ApplicationOutcomeStatus.UNKNOWN,
                            "OTP verification challenge triggered post-submission.",
                        )
                    return (
                        WorkflowStateEnum.PAUSED_CAPTCHA,
                        ApplicationOutcomeStatus.UNKNOWN,
                        f"{challenge_type} challenge triggered post-submission.",
                    )
        except Exception as scan_err:
            logger.warning(f"Post-submission challenge check error: {scan_err}")

        # 3. Check for inline form validation errors / submission rejections
        try:
            if hasattr(page, "evaluate"):
                error_check_script = """
                () => {
                    const errorSelectors = [
                        '.error-message', '.field-error', '.form-error', '.alert-danger',
                        '.alert-error', '[role="alert"]', '.text-danger', '.has-error',
                        '.input-error', '.validation-error', '[aria-invalid="true"]'
                    ];
                    const foundErrors = [];
                    for (const sel of errorSelectors) {
                        const elements = document.querySelectorAll(sel);
                        for (const el of elements) {
                            if (el && el.offsetParent !== null && el.innerText) {
                                const text = el.innerText.trim();
                                if (text.length > 0 && 
                                    !text.toLowerCase().includes('success') && 
                                    !text.toLowerCase().includes('submitted') &&
                                    !text.toLowerCase().includes('thank you')) {
                                    foundErrors.push(text.slice(0, 150));
                                }
                            }
                        }
                    }
                    return foundErrors;
                }
                """
                res = page.evaluate(error_check_script)
                if inspect.isawaitable(res):
                    res = await res
                if res and isinstance(res, list) and len(res) > 0:
                    first_err = res[0]
                    return (
                        WorkflowStateEnum.FAILED,
                        ApplicationOutcomeStatus.NOT_SUBMITTED,
                        f"Form validation error post-submission: {first_err}",
                    )
        except Exception as eval_err:
            logger.warning(f"Inline error check evaluation error: {eval_err}")

        # 4. Check for unambiguous positive confirmation signals
        current_url = getattr(page, "url", "") or ""
        confirmation_url_tokens = ["/confirm", "/thank", "/applied", "/success", "/complete", "/received", "/submitted"]
        original_url_lower = (original_url or "").lower()
        current_url_lower = current_url.lower()

        is_url_confirmed = any(
            token in current_url_lower for token in confirmation_url_tokens
        ) and not any(token in original_url_lower for token in confirmation_url_tokens)

        is_text_confirmed = False
        try:
            if hasattr(page, "evaluate"):
                confirmation_script = """
                () => {
                    const text = (document.body ? document.body.innerText : '') || '';
                    const patterns = [
                        /application\\s+submitted/i,
                        /successfully\\s+applied/i,
                        /application\\s+received/i,
                        /thank\\s+you\\s+for\\s+applying/i,
                        /your\\s+application\\s+has\\s+been\\s+submitted/i,
                        /applied\\s+successfully/i,
                        /application\\s+sent/i,
                        /your\\s+application\\s+was\\s+sent/i
                    ];
                    return patterns.some(p => p.test(text));
                }
                """
                res = page.evaluate(confirmation_script)
                if inspect.isawaitable(res):
                    res = await res
                is_text_confirmed = bool(res)
        except Exception as txt_err:
            logger.warning(f"Confirmation text evaluation error: {txt_err}")

        # Check if button text turned to "Applied" / "Submitted"
        is_btn_confirmed = False
        try:
            if hasattr(page, "evaluate"):
                btn_state_script = """
                () => {
                    const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                    return btns.some(b => {
                        const txt = (b.innerText || b.value || '').trim().toLowerCase();
                        return (txt === 'applied' || txt === 'submitted') && (b.disabled || b.getAttribute('aria-disabled') === 'true');
                    });
                }
                """
                res = page.evaluate(btn_state_script)
                if inspect.isawaitable(res):
                    res = await res
                is_btn_confirmed = bool(res)
        except Exception as btn_err:
            logger.warning(f"Button state confirmation check error: {btn_err}")

        if is_url_confirmed or is_text_confirmed or is_btn_confirmed:
            confirmation_source = []
            if is_url_confirmed:
                confirmation_source.append(f"confirmation URL ({current_url})")
            if is_text_confirmed:
                confirmation_source.append("positive confirmation text")
            if is_btn_confirmed:
                confirmation_source.append("button state 'Applied'")
            return (
                WorkflowStateEnum.APPLIED,
                ApplicationOutcomeStatus.SUBMITTED,
                f"Application submission confirmed via {', '.join(confirmation_source)}.",
            )

        # 5. Inconclusive outcome guard (Byzantine uncertainty):
        return (
            WorkflowStateEnum.RECONCILIATION_REQUIRED,
            ApplicationOutcomeStatus.UNKNOWN,
            "Submission completed but confirmation outcome is inconclusive. Requires manual reconciliation.",
        )


class ApproveApplicationUseCase:
    """Approves a shortlisted job application with fresh safety and validity re-validation."""

    def __init__(
        self,
        app_repo: ApplicationRepository,
        execute_use_case: ExecuteApplicationUseCase,
        job_repo: Optional[JobRepository] = None,
        resume_repo: Optional[ResumeRepository] = None,
        campaign_repo: Optional[Any] = None,
        connection_repo: Optional[Any] = None,
    ):
        self._app_repo = app_repo
        self._execute_use_case = execute_use_case
        self._job_repo = job_repo
        self._resume_repo = resume_repo
        self._campaign_repo = campaign_repo
        self._connection_repo = connection_repo

    async def execute(
        self,
        application_id: str,
        resume_id: Optional[str] = None,
        auto_execute: bool = True,
    ) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        # 1. Job Availability Check
        if self._job_repo:
            job = await self._job_repo.get_by_id(app.job_id)
            if not job:
                app.workflow_state = WorkflowStateEnum.SKIPPED
                app.failure_reason = "Job posting is no longer available in the database."
                return await self._app_repo.save(app)

        # 2. Duplicate Application Check
        existing_apps = await self._app_repo.list_by_user(app.user_id, limit=500)
        already_applied = any(
            a.id != app.id and a.job_id == app.job_id and a.workflow_state == WorkflowStateEnum.APPLIED
            for a in existing_apps
        )
        if already_applied:
            app.workflow_state = WorkflowStateEnum.SKIPPED
            app.failure_reason = "Already applied to this job previously."
            return await self._app_repo.save(app)

        # 3. Resume Availability Check
        target_resume_id = resume_id or app.resume_id
        if self._resume_repo and target_resume_id:
            res = await self._resume_repo.get_by_id(target_resume_id)
            if not res:
                app.workflow_state = WorkflowStateEnum.FAILED
                app.failure_reason = "Attached resume file not found. Please attach a valid resume."
                return await self._app_repo.save(app)
            if res.user_id != app.user_id:
                app.workflow_state = WorkflowStateEnum.FAILED
                app.failure_reason = "Attached resume does not belong to user."
                return await self._app_repo.save(app)

        # 4. Campaign Safety & Pacing Re-Validation
        if self._campaign_repo:
            user_campaigns = await self._campaign_repo.list_by_user(app.user_id, limit=1)
            if user_campaigns:
                active_camp = user_campaigns[0]
                today_count = await self._campaign_repo.count_today_applications(active_camp.id)
                hourly_count = await self._campaign_repo.count_hourly_applications(active_camp.id)
                can_apply, reason = SafetyPolicyEvaluator.evaluate(
                    active_camp.safety_policy,
                    today_count=today_count,
                    hourly_count=hourly_count,
                )
                if not can_apply:
                    app.workflow_state = WorkflowStateEnum.PAUSED_LIMIT
                    app.failure_reason = f"Safety limit guard: {reason}. Queued for next operating window."
                    return await self._app_repo.save(app)

        # 5. Platform Session Check
        if self._connection_repo and self._job_repo:
            job = await self._job_repo.get_by_id(app.job_id)
            if job and job.source_type:
                conn = await self._connection_repo.get_by_platform(app.user_id, job.source_type.lower())
                if conn is None or conn.status != ConnectionStatus.CONNECTED:
                    app.workflow_state = WorkflowStateEnum.PAUSED_SESSION
                    app.failure_reason = f"{job.source_type} session expired or unauthenticated. Please re-authenticate."
                    return await self._app_repo.save(app)

        # All Pre-Flight Validations Passed!
        app.workflow_state = WorkflowStateEnum.APPROVED
        if resume_id:
            app.resume_id = resume_id
        app.updated_at = datetime.now(timezone.utc)
        saved = await self._app_repo.save(app)

        if auto_execute:
            return await self._execute_use_case.execute(application_id=saved.id)
        return saved


async def _safe_save_app(
    repo: ApplicationRepository,
    app: Application,
    expected_state: Optional[WorkflowStateEnum] = None,
    expected_attempt_id: Optional[str] = None,
) -> Application:
    try:
        return await repo.save(app, expected_state=expected_state, expected_attempt_id=expected_attempt_id)
    except TypeError:
        try:
            return await repo.save(app, expected_state=expected_state)
        except TypeError:
            return await repo.save(app)


class RetryApplicationUseCase:
    """Intelligently retries an application adhering to error classification and max retry caps, re-validating job, resume, and safety quotas."""

    def __init__(
        self,
        app_repo: ApplicationRepository,
        execute_use_case: ExecuteApplicationUseCase,
        job_repo: Optional[JobRepository] = None,
        resume_repo: Optional[ResumeRepository] = None,
        campaign_repo: Optional[Any] = None,
        connection_repo: Optional[Any] = None,
    ):
        self._app_repo = app_repo
        self._execute_use_case = execute_use_case
        self._job_repo = job_repo
        self._resume_repo = resume_repo
        self._campaign_repo = campaign_repo
        self._connection_repo = connection_repo

    async def execute(
        self,
        application_id: str,
        user_id: Optional[str] = None,
        is_admin: bool = False,
    ) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        if user_id and app.user_id != user_id and not is_admin:
            raise AuthorizationException(f"User [{user_id}] is not authorized to retry application [{application_id}].")

        current_state = app.workflow_state

        # Concurrency & state safety guards
        if current_state == WorkflowStateEnum.APPLIED:
            raise ValidationException(f"Cannot retry application [{application_id}] that is already applied.")
        if current_state in (WorkflowStateEnum.APPLYING, WorkflowStateEnum.SUBMITTING):
            raise ValidationException(
                f"Cannot retry application [{application_id}] that is currently being processed by another worker (current state: {current_state.value})."
            )
        if current_state == WorkflowStateEnum.RECONCILIATION_REQUIRED:
            raise ValidationException(
                f"Cannot retry application [{application_id}] requiring reconciliation. Please resolve via reconciliation API."
            )

        classification = classify_automation_error(app.failure_reason or "", retry_count=app.retry_count or 0)

        if not classification.is_retryable or app.error_category in [
            ErrorTaxonomyEnum.JOB_UNAVAILABLE.value,
            ErrorTaxonomyEnum.BUSINESS_RULE.value,
            ErrorTaxonomyEnum.PERMANENT.value,
        ]:
            raise ValidationException(
                f"Cannot retry application: {classification.message} (Action: {classification.suggested_action})"
            )

        if (app.retry_count or 0) >= 3:
            raise ValidationException("Maximum retry attempts (3) exceeded for this application.")

        # 1. Job Availability Check
        if self._job_repo:
            job = await self._job_repo.get_by_id(app.job_id)
            if not job:
                app.workflow_state = WorkflowStateEnum.SKIPPED
                app.failure_reason = "Job posting is no longer available in the database."
                return await _safe_save_app(self._app_repo, app, expected_state=current_state)

        # 2. Resume Availability & Ownership Check
        if self._resume_repo and app.resume_id:
            res = await self._resume_repo.get_by_id(app.resume_id)
            if not res:
                app.workflow_state = WorkflowStateEnum.FAILED
                app.failure_reason = "Attached resume file not found."
                return await _safe_save_app(self._app_repo, app, expected_state=current_state)
            user_id_val = getattr(res, "user_id", None)
            if user_id_val and isinstance(user_id_val, str) and user_id_val != app.user_id:
                app.workflow_state = WorkflowStateEnum.FAILED
                app.failure_reason = "Attached resume does not belong to user."
                return await _safe_save_app(self._app_repo, app, expected_state=current_state)
            if res.file_path and not os.path.isfile(res.file_path) and not res.file_path.startswith("mock://"):
                app.workflow_state = WorkflowStateEnum.FAILED
                app.failure_reason = f"Attached resume file [{res.file_path}] is missing on disk."
                return await _safe_save_app(self._app_repo, app, expected_state=current_state)

        # 3. Campaign Safety & Quota Re-Validation
        if self._campaign_repo:
            user_campaigns = await self._campaign_repo.list_by_user(app.user_id, limit=1)
            if user_campaigns:
                active_camp = user_campaigns[0]
                today_count = await self._campaign_repo.count_today_applications(active_camp.id)
                hourly_count = await self._campaign_repo.count_hourly_applications(active_camp.id)
                can_apply, reason = SafetyPolicyEvaluator.evaluate(
                    active_camp.safety_policy,
                    today_count=today_count,
                    hourly_count=hourly_count,
                )
                if not can_apply:
                    app.workflow_state = WorkflowStateEnum.PAUSED_LIMIT
                    app.failure_reason = f"Safety limit guard: {reason}. Queued for next operating window."
                    return await _safe_save_app(self._app_repo, app, expected_state=current_state)

        # 4. State transition & audit event
        app.retry_count = (app.retry_count or 0) + 1
        app.workflow_state = WorkflowStateEnum.APPROVED
        app.updated_at = datetime.now(timezone.utc)
        saved = await _safe_save_app(self._app_repo, app, expected_state=current_state)

        await self._app_repo.add_event(
            ApplicationEvent(
                id=f"evt_{uuid.uuid4().hex[:12]}",
                application_id=saved.id,
                event_name="APPLICATION_RETRIED",
                payload={"retry_count": saved.retry_count, "previous_failure": app.failure_reason},
                created_at=datetime.now(timezone.utc),
            )
        )

        return await self._execute_use_case.execute(application_id=saved.id)


class ResumeApplicationUseCase:
    """Resumes an automation session from a paused challenge state."""

    def __init__(self, app_repo: ApplicationRepository, execute_use_case: ExecuteApplicationUseCase):
        self._app_repo = app_repo
        self._execute_use_case = execute_use_case

    async def execute(self, application_id: str, user_input: Optional[str] = None) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        if app.workflow_state not in [
            WorkflowStateEnum.PAUSED_OTP,
            WorkflowStateEnum.PAUSED_CAPTCHA,
            WorkflowStateEnum.PAUSED_USER_INPUT,
            WorkflowStateEnum.QUESTIONS_PENDING,
        ]:
            raise InvalidStateTransitionException(
                f"Cannot resume application currently in [{app.workflow_state.value}] state."
            )

        app.workflow_state = WorkflowStateEnum.APPROVED
        app.updated_at = datetime.now(timezone.utc)
        saved = await self._app_repo.save(app)

        return await self._execute_use_case.execute(application_id=saved.id)


class StopApplicationUseCase:
    """Aborts an active or paused application session."""

    def __init__(self, app_repo: ApplicationRepository):
        self._app_repo = app_repo

    async def execute(self, application_id: str, reason: str = "User aborted") -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        app.workflow_state = WorkflowStateEnum.FAILED
        app.failure_reason = reason
        app.updated_at = datetime.now(timezone.utc)
        return await self._app_repo.save(app)


class GetApplicationUseCase:
    def __init__(self, app_repo: ApplicationRepository):
        self._app_repo = app_repo

    async def execute(self, application_id: str) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")
        return app


class ListApplicationsUseCase:
    def __init__(self, app_repo: ApplicationRepository):
        self._app_repo = app_repo

    async def execute(
        self,
        user_id: str,
        state: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[List[Application], int]:
        items = await self._app_repo.list_by_user(
            user_id=user_id,
            state=state,
            skip=skip,
            limit=limit,
        )
        total_count = await self._app_repo.count_by_user(
            user_id=user_id,
            state=state,
        )
        return items, total_count


class ReconcileApplicationUseCase:
    """
    Safely resolves uncertain submission states (RECONCILIATION_REQUIRED / SUBMISSION_UNKNOWN).
    Enforces the industry-standard idempotency rule:
    - CONFIRM_SUBMITTED: Transitions to APPLIED and marks outcome SUBMITTED.
    - MARK_NOT_SUBMITTED_AND_RETRY: Validates eligibility, resume, quotas, and safety rules
      before resetting to retry through the canonical application pipeline.
    - DISMISS: Sets to FAILED / SKIPPED with user audit notes without resubmitting.
    """

    def __init__(
        self,
        app_repo: ApplicationRepository,
        execute_use_case: Optional[ExecuteApplicationUseCase] = None,
        job_repo: Optional[JobRepository] = None,
        resume_repo: Optional[ResumeRepository] = None,
        campaign_repo: Optional[Any] = None,
        connection_repo: Optional[Any] = None,
    ):
        self._app_repo = app_repo
        self._execute_use_case = execute_use_case
        self._job_repo = job_repo
        self._resume_repo = resume_repo
        self._campaign_repo = campaign_repo
        self._connection_repo = connection_repo

    async def execute(
        self,
        application_id: str,
        action: str,
        notes: Optional[str] = None,
        user_id: Optional[str] = None,
        is_admin: bool = False,
    ) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        if user_id and app.user_id != user_id and not is_admin:
            raise AuthorizationException(f"User [{user_id}] is not authorized to reconcile application [{application_id}].")

        current_state = app.workflow_state

        if current_state not in [
            WorkflowStateEnum.RECONCILIATION_REQUIRED,
            WorkflowStateEnum.SUBMISSION_UNKNOWN,
            WorkflowStateEnum.FAILED,
        ]:
            raise ValidationException(
                f"Application [{application_id}] is in state [{current_state.value}], which does not require reconciliation."
            )

        now = datetime.now(timezone.utc)
        from app.domain.applications.entities import ApplicationOutcomeStatus

        if action == "CONFIRM_SUBMITTED":
            app.workflow_state = WorkflowStateEnum.APPLIED
            app.outcome_status = ApplicationOutcomeStatus.SUBMITTED
            app.applied_at = now
            app.updated_at = now
            if notes:
                app.failure_reason = f"Confirmed submitted by candidate: {notes}"
            saved = await _safe_save_app(self._app_repo, app, expected_state=current_state)

            await self._app_repo.add_event(
                ApplicationEvent(
                    id=f"evt_{uuid.uuid4().hex[:12]}",
                    application_id=app.id,
                    event_name="RECONCILIATION_CONFIRMED_SUBMITTED",
                    payload={"action": action, "notes": notes, "reconciled_at": now.isoformat()},
                    created_at=now,
                )
            )
            return saved

        elif action == "DISMISS":
            app.workflow_state = WorkflowStateEnum.SKIPPED
            app.failure_reason = notes or "Dismissed by candidate after submission timeout review."
            app.updated_at = now
            saved = await _safe_save_app(self._app_repo, app, expected_state=current_state)

            await self._app_repo.add_event(
                ApplicationEvent(
                    id=f"evt_{uuid.uuid4().hex[:12]}",
                    application_id=app.id,
                    event_name="RECONCILIATION_DISMISSED",
                    payload={"action": action, "notes": notes, "reconciled_at": now.isoformat()},
                    created_at=now,
                )
            )
            return saved

        elif action in ("MARK_NOT_SUBMITTED", "MARK_NOT_SUBMITTED_AND_RETRY"):
            # Safety gate: re-validate job, resume, and safety policy before allowing retry
            if self._job_repo:
                job = await self._job_repo.get_by_id(app.job_id)
                if not job:
                    raise ValidationException("Job posting is no longer available.")

            if self._resume_repo and app.resume_id:
                res = await self._resume_repo.get_by_id(app.resume_id)
                if not res:
                    raise ValidationException("Attached resume file is no longer available.")
                user_id_val = getattr(res, "user_id", None)
                if user_id_val and isinstance(user_id_val, str) and user_id_val != app.user_id:
                    raise ValidationException("Attached resume does not belong to user.")
                if res.file_path and not os.path.isfile(res.file_path) and not res.file_path.startswith("mock://"):
                    raise ValidationException(f"Resume file [{res.file_path}] is missing on disk.")

            if action == "MARK_NOT_SUBMITTED":
                app.workflow_state = WorkflowStateEnum.FAILED
                app.outcome_status = ApplicationOutcomeStatus.NOT_SUBMITTED
                app.failure_reason = f"Marked as not submitted by candidate: {notes or 'User verified portal did not record application'}"
                app.updated_at = now
                saved = await _safe_save_app(self._app_repo, app, expected_state=current_state)

                await self._app_repo.add_event(
                    ApplicationEvent(
                        id=f"evt_{uuid.uuid4().hex[:12]}",
                        application_id=app.id,
                        event_name="RECONCILIATION_MARKED_NOT_SUBMITTED",
                        payload={"action": action, "notes": notes, "reconciled_at": now.isoformat()},
                        created_at=now,
                    )
                )
                return saved

            # action == "MARK_NOT_SUBMITTED_AND_RETRY"
            if self._campaign_repo:
                user_campaigns = await self._campaign_repo.list_by_user(app.user_id, limit=1)
                if user_campaigns:
                    active_camp = user_campaigns[0]
                    today_count = await self._campaign_repo.count_today_applications(active_camp.id)
                    hourly_count = await self._campaign_repo.count_hourly_applications(active_camp.id)
                    can_apply, reason = SafetyPolicyEvaluator.evaluate(
                        active_camp.safety_policy,
                        today_count=today_count,
                        hourly_count=hourly_count,
                    )
                    if not can_apply:
                        raise ValidationException(f"Safety limit guard prevented retry: {reason}")

            app.workflow_state = WorkflowStateEnum.APPROVED
            app.outcome_status = ApplicationOutcomeStatus.NOT_SUBMITTED
            app.retry_count = (app.retry_count or 0) + 1
            app.failure_reason = f"Reconciled as not-submitted: {notes or 'User verified portal did not record application'}"
            app.updated_at = now
            saved = await _safe_save_app(self._app_repo, app, expected_state=current_state)

            await self._app_repo.add_event(
                ApplicationEvent(
                    id=f"evt_{uuid.uuid4().hex[:12]}",
                    application_id=app.id,
                    event_name="RECONCILIATION_RETRIED",
                    payload={"action": action, "notes": notes, "reconciled_at": now.isoformat()},
                    created_at=now,
                )
            )

            if self._execute_use_case:
                return await self._execute_use_case.execute(application_id=saved.id)
            return saved

        else:
            raise ValidationException(
                f"Invalid reconciliation action [{action}]. Must be CONFIRM_SUBMITTED, MARK_NOT_SUBMITTED, MARK_NOT_SUBMITTED_AND_RETRY, or DISMISS."
            )
