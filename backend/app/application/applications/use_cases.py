import asyncio
from datetime import datetime, timezone
import hashlib
import logging
from typing import Any, List, Optional
import uuid
from app.api.v1.ws import ws_manager
from app.core.exceptions import (
    DuplicateEntityException,
    EntityNotFoundException,
    InvalidStateTransitionException,
)
from app.domain.ai.contracts import AIProvider
from app.domain.applications.entities import (
    Application,
    ApplicationEvent,
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
            if resume:
                resume_file_path = resume.file_path

        run_id = run_id or f"run_{uuid.uuid4().hex[:8]}"

        # State transition: APPLYING
        app.workflow_state = WorkflowStateEnum.APPLYING
        app.updated_at = datetime.now(timezone.utc)
        await self._app_repo.save(app)

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
                app.workflow_state = WorkflowStateEnum.SUBMITTING
                await self._app_repo.save(app)

                submit_btn = scanned_form.submit_buttons[0]
                await page.locator(submit_btn.selector).first.click()
                await page.wait_for_timeout(3000)

                # State transition: APPLIED
                app.workflow_state = WorkflowStateEnum.APPLIED
                app.applied_at = datetime.now(timezone.utc)
                app.updated_at = datetime.now(timezone.utc)
                await self._app_repo.save(app)

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
            else:
                # If no direct submit button, mark READY_TO_SUBMIT
                app.workflow_state = WorkflowStateEnum.READY_TO_SUBMIT
                await self._app_repo.save(app)

            return app

        except Exception as e:
            logger.error(f"Application execution failed for [{application_id}]: {e}", exc_info=True)
            screenshot_path, trace_path = await trace_manager.capture_failure_artifacts(
                application_id=app.id,
                page=page,
                context=context,
            )
            app.workflow_state = WorkflowStateEnum.FAILED
            app.failure_reason = str(e)
            app.screenshot_file_path = screenshot_path
            app.trace_file_path = trace_path
            app.updated_at = datetime.now(timezone.utc)
            await self._app_repo.save(app)
            return app

        finally:
            if streamer:
                await streamer.stop()
            if context:
                await context.close()


class ApproveApplicationUseCase:
    """Approves a shortlisted job application and optionally triggers immediate execution."""

    def __init__(self, app_repo: ApplicationRepository, execute_use_case: ExecuteApplicationUseCase):
        self._app_repo = app_repo
        self._execute_use_case = execute_use_case

    async def execute(
        self,
        application_id: str,
        resume_id: Optional[str] = None,
        auto_execute: bool = True,
    ) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if not app:
            raise EntityNotFoundException(f"Application [{application_id}] not found.")

        app.workflow_state = WorkflowStateEnum.APPROVED
        if resume_id:
            app.resume_id = resume_id
        app.updated_at = datetime.now(timezone.utc)
        saved = await self._app_repo.save(app)

        if auto_execute:
            return await self._execute_use_case.execute(application_id=saved.id)
        return saved


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
    ) -> List[Application]:
        return await self._app_repo.list_by_user(
            user_id=user_id,
            state=state,
            skip=skip,
            limit=limit,
        )
