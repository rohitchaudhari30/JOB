import asyncio
from datetime import datetime, timezone
from enum import Enum
import logging
from typing import Any, Dict, List, Optional
import uuid
from app.api.v1.ws import ws_manager
from app.application.applications.use_cases import CreateApplicationUseCase, ExecuteApplicationUseCase
from app.application.jobs.use_cases import DiscoverJobsUseCase
from app.application.matching.use_cases import EvaluateJobMatchUseCase
from app.core.exceptions import EntityNotFoundException, PlatformException
from app.domain.ai.contracts import AIGateway
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.applications.repositories import ApplicationRepository
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.domain.jobs.repositories import JobRepository, JobSourceRepository
from app.domain.matching.entities import DecisionEnum, MatchResult, MatchRule
from app.domain.matching.repositories import MatchResultRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository
from app.domain.auth.repositories import UserRepository

logger = logging.getLogger("app.automation.orchestrator")


class AutomationRunStatus(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ABORTED = "ABORTED"


class AutomationSession:
    """Maintains in-memory live execution state for an active automation run."""

    def __init__(self, run_id: str, user_id: str):
        self.run_id = run_id
        self.user_id = user_id
        self.status = AutomationRunStatus.IDLE
        self.is_paused = False
        self.pause_event = asyncio.Event()
        self.pause_event.set()  # Not paused by default
        self.cancel_requested = False
        self.user_input_queue: asyncio.Queue = asyncio.Queue()
        self.discovered_jobs_count = 0
        self.matched_jobs_count = 0
        self.applications_submitted_count = 0
        self.current_job_title: Optional[str] = None
        self.current_application_id: Optional[str] = None
        self.active_state: str = "IDLE"
        self.error_message: Optional[str] = None
        self.created_at = datetime.now(timezone.utc)
        self.completed_at: Optional[datetime] = None

    def pause(self):
        self.is_paused = True
        self.status = AutomationRunStatus.PAUSED
        self.pause_event.clear()
        logger.info(f"Automation run [{self.run_id}] paused.")

    def resume(self, user_input: Optional[str] = None):
        if user_input:
            self.user_input_queue.put_nowait(user_input)
        self.is_paused = False
        self.status = AutomationRunStatus.RUNNING
        self.pause_event.set()
        logger.info(f"Automation run [{self.run_id}] resumed.")

    def abort(self, reason: str = "Aborted by user"):
        self.cancel_requested = True
        self.status = AutomationRunStatus.ABORTED
        self.error_message = reason
        self.pause_event.set()  # Unblock if paused
        logger.info(f"Automation run [{self.run_id}] aborted: {reason}")


class AutomationOrchestrator:
    """
    Coordinates the entire end-to-end automation cycle:
    1. Job Discovery via specified Source Adapter.
    2. Multi-Stage AI Matching & Policy Filtering.
    3. Live Browser Application execution with real-time visual streaming.
    4. Human-in-the-Loop challenge pausing & interactive resumes.
    5. Event timeline logging & progress telemetry.
    """

    def __init__(self):
        self._sessions: Dict[str, AutomationSession] = {}
        self._user_active_runs: Dict[str, str] = {}
        self._lock = asyncio.Lock()

    def get_session(self, run_id: str) -> Optional[AutomationSession]:
        return self._sessions.get(run_id)

    def get_active_user_run(self, user_id: str) -> Optional[AutomationSession]:
        run_id = self._user_active_runs.get(user_id)
        if run_id:
            return self._sessions.get(run_id)
        return None

    async def start_run(
        self,
        user_id: str,
        source_type: str,
        roles: List[str],
        locations: Optional[List[str]] = None,
        min_salary: Optional[float] = None,
        match_rule: Optional[MatchRule] = None,
        auto_apply_matches: bool = True,
        max_applications: int = 10,
        job_repo: Optional[JobRepository] = None,
        source_repo: Optional[JobSourceRepository] = None,
        profile_repo: Optional[CandidateProfileRepository] = None,
        resume_repo: Optional[ResumeRepository] = None,
        match_repo: Optional[MatchResultRepository] = None,
        app_repo: Optional[ApplicationRepository] = None,
        user_repo: Optional[UserRepository] = None,
        ai_gateway: Optional[AIGateway] = None,
    ) -> AutomationSession:
        run_id = f"run_{uuid.uuid4().hex[:8]}"
        session = AutomationSession(run_id=run_id, user_id=user_id)
        session.status = AutomationRunStatus.RUNNING

        async with self._lock:
            self._sessions[run_id] = session
            self._user_active_runs[user_id] = run_id

        # Launch non-blocking background orchestration task
        asyncio.create_task(
            self._execute_run_pipeline(
                session=session,
                source_type=source_type,
                roles=roles,
                locations=locations,
                min_salary=min_salary,
                match_rule=match_rule or MatchRule(),
                auto_apply_matches=auto_apply_matches,
                max_applications=max_applications,
                job_repo=job_repo,
                source_repo=source_repo,
                profile_repo=profile_repo,
                resume_repo=resume_repo,
                match_repo=match_repo,
                app_repo=app_repo,
                user_repo=user_repo,
                ai_gateway=ai_gateway,
            )
        )

        return session

    async def _execute_run_pipeline(
        self,
        session: AutomationSession,
        source_type: str,
        roles: List[str],
        locations: Optional[List[str]],
        min_salary: Optional[float],
        match_rule: MatchRule,
        auto_apply_matches: bool,
        max_applications: int,
        job_repo: Any = None,
        source_repo: Any = None,
        profile_repo: Any = None,
        resume_repo: Any = None,
        match_repo: Any = None,
        app_repo: Any = None,
        user_repo: Any = None,
        ai_gateway: Any = None,
    ):
        try:
            if job_repo is None or hasattr(job_repo, "_session"):
                from app.core.database import AsyncSessionLocal
                from app.infrastructure.ai.gateway import MultiTierAIGateway
                from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
                from app.infrastructure.database.repositories.job_repository import (
                    SqlAlchemyJobRepository,
                    SqlAlchemyJobSourceRepository,
                )
                from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchResultRepository
                from app.infrastructure.database.repositories.profile_repository import (
                    SqlAlchemyProfileRepository,
                    SqlAlchemyResumeRepository,
                )
                from app.infrastructure.database.repositories.user_repository import SqlAlchemyUserRepository

                async with AsyncSessionLocal() as db_session:
                    j_repo = SqlAlchemyJobRepository(db_session)
                    s_repo = SqlAlchemyJobSourceRepository(db_session)
                    p_repo = SqlAlchemyProfileRepository(db_session)
                    r_repo = SqlAlchemyResumeRepository(db_session)
                    m_repo = SqlAlchemyMatchResultRepository(db_session)
                    a_repo = SqlAlchemyApplicationRepository(db_session)
                    u_repo = SqlAlchemyUserRepository(db_session)
                    ai_gw = MultiTierAIGateway(session=db_session)

                    await self._run_pipeline_core(
                        session=session,
                        source_type=source_type,
                        roles=roles,
                        locations=locations,
                        min_salary=min_salary,
                        match_rule=match_rule,
                        auto_apply_matches=auto_apply_matches,
                        max_applications=max_applications,
                        job_repo=j_repo,
                        source_repo=s_repo,
                        profile_repo=p_repo,
                        resume_repo=r_repo,
                        match_repo=m_repo,
                        app_repo=a_repo,
                        user_repo=u_repo,
                        ai_gateway=ai_gw,
                    )
                    await db_session.commit()
            else:
                await self._run_pipeline_core(
                    session=session,
                    source_type=source_type,
                    roles=roles,
                    locations=locations,
                    min_salary=min_salary,
                    match_rule=match_rule,
                    auto_apply_matches=auto_apply_matches,
                    max_applications=max_applications,
                    job_repo=job_repo,
                    source_repo=source_repo,
                    profile_repo=profile_repo,
                    resume_repo=resume_repo,
                    match_repo=match_repo,
                    app_repo=app_repo,
                    user_repo=user_repo,
                    ai_gateway=ai_gateway,
                )
        except Exception as e:
            logger.error(f"Automation run pipeline error: {e}", exc_info=True)
            session.status = AutomationRunStatus.FAILED
            session.error_message = str(e)
            await self._broadcast_event(
                session=session,
                event_name="RUN_FAILED",
                message=f"Run failed: {e}",
            )
        finally:
            async with self._lock:
                if session.user_id in self._user_active_runs:
                    del self._user_active_runs[session.user_id]

    async def _run_pipeline_core(
        self,
        session: AutomationSession,
        source_type: str,
        roles: List[str],
        locations: Optional[List[str]],
        min_salary: Optional[float],
        match_rule: MatchRule,
        auto_apply_matches: bool,
        max_applications: int,
        job_repo: Any,
        source_repo: Any,
        profile_repo: Any,
        resume_repo: Any,
        match_repo: Any,
        app_repo: Any,
        user_repo: Any,
        ai_gateway: Any,
    ):
        logger.info(f"Starting automation pipeline [{session.run_id}] for user [{session.user_id}]...")

        await self._broadcast_event(
            session=session,
            event_name="RUN_STARTED",
            message=f"Starting job automation cycle on [{source_type.upper()}] for roles: {', '.join(roles)}",
        )

        # Step 1: Job Discovery
        session.active_state = "DISCOVERING"
        filters = SearchQueryFilter(
            roles=roles,
            locations=locations or [],
            min_salary=min_salary,
            max_pages=2,
        )
        discover_uc = DiscoverJobsUseCase(job_repo=job_repo, job_source_repo=source_repo)
        discovery_result = await discover_uc.execute(
            user_id=session.user_id,
            source_type=source_type,
            filters=filters,
            run_id=session.run_id,
        )

        disc_total = discovery_result.get("discovered_total", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "discovered_total", 0)
        new_count = discovery_result.get("new_jobs_count", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "new_jobs_count", 0)
        dups_count = discovery_result.get("skipped_duplicates", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "skipped_duplicates", 0)
        session.discovered_jobs_count = disc_total

        await self._broadcast_event(
            session=session,
            event_name="DISCOVERY_COMPLETED",
            message=f"Discovered {disc_total} jobs ({new_count} new, {dups_count} existing).",
        )

        if session.cancel_requested:
            return

        # Step 2: 5-Stage Matching Cascade
        session.active_state = "MATCHING"
        evaluate_uc = EvaluateJobMatchUseCase(
            profile_repo=profile_repo,
            job_repo=job_repo,
            match_repo=match_repo,
            resume_repo=resume_repo,
            ai_gateway=ai_gateway,
        )

        shortlisted_jobs: List[tuple[Job, MatchResult]] = []
        jobs_list = discovery_result.get("jobs", []) if isinstance(discovery_result, dict) else getattr(discovery_result, "jobs", [])

        for job_summary in jobs_list:
            if session.cancel_requested:
                break

            await session.pause_event.wait()

            job_id = job_summary.get("id") if isinstance(job_summary, dict) else getattr(job_summary, "id", None)
            job_title = job_summary.get("title", "Job") if isinstance(job_summary, dict) else getattr(job_summary, "title", "Job")
            job_company = job_summary.get("company", "Company") if isinstance(job_summary, dict) else getattr(job_summary, "company", "Company")

            if not job_id:
                continue

            match_res = await evaluate_uc.execute(
                user_id=session.user_id,
                job_id=job_id,
                custom_rule=match_rule,
            )
            session.matched_jobs_count += 1

            await self._broadcast_event(
                session=session,
                event_name="JOB_EVALUATED",
                message=f"Evaluated [{job_title} at {job_company}]: Score {match_res.overall_score:.1f}% -> {match_res.decision.value}",
                payload={"score": match_res.overall_score, "decision": match_res.decision.value},
            )

            if match_res.decision in (DecisionEnum.AUTO_APPLY, DecisionEnum.REQUIRE_APPROVAL):
                job_obj = await job_repo.get_by_id(job_id)
                if job_obj:
                    shortlisted_jobs.append((job_obj, match_res))

        if session.cancel_requested:
            return

        # Step 3: Application Automation Execution
        session.active_state = "APPLYING"
        create_app_uc = CreateApplicationUseCase(app_repo=app_repo, job_repo=job_repo)
        exec_app_uc = ExecuteApplicationUseCase(
            app_repo=app_repo,
            job_repo=job_repo,
            profile_repo=profile_repo,
            resume_repo=resume_repo,
            user_repo=user_repo,
            ai_provider=ai_gateway,
        )

        for job_obj, match_res in shortlisted_jobs:
            if session.cancel_requested:
                break
            if session.applications_submitted_count >= max_applications:
                logger.info(f"Reached max applications limit ({max_applications}). Stopping run.")
                break

            await session.pause_event.wait()

            # Determine if we should auto apply
            should_apply = auto_apply_matches and (match_res.decision == DecisionEnum.AUTO_APPLY)
            initial_state = WorkflowStateEnum.APPROVED if should_apply else WorkflowStateEnum.APPROVAL_REQUIRED

            app_entity = await create_app_uc.execute(
                user_id=session.user_id,
                job_id=job_obj.id,
                resume_id=match_res.resume_id,
                initial_state=initial_state,
            )
            session.current_application_id = app_entity.id
            session.current_job_title = f"{job_obj.title} @ {job_obj.company}"

            if should_apply:
                await self._broadcast_event(
                    session=session,
                    event_name="AUTO_APPLYING",
                    message=f"Auto-applying to [{job_obj.title} at {job_obj.company}]...",
                )
                executed_app = await exec_app_uc.execute(
                    application_id=app_entity.id,
                    run_id=session.run_id,
                )
                if executed_app.workflow_state == WorkflowStateEnum.APPLIED:
                    session.applications_submitted_count += 1
                elif executed_app.workflow_state in (
                    WorkflowStateEnum.PAUSED_OTP,
                    WorkflowStateEnum.PAUSED_CAPTCHA,
                ):
                    session.pause()
                    await self._broadcast_event(
                        session=session,
                        event_name="PAUSED_FOR_USER",
                        message=f"Challenge encountered on {job_obj.company}. Automation paused for verification.",
                    )
                    await session.pause_event.wait()

        session.status = AutomationRunStatus.COMPLETED
        session.active_state = "FINISHED"
        session.completed_at = datetime.now(timezone.utc)

        await self._broadcast_event(
            session=session,
            event_name="RUN_COMPLETED",
            message=f"Automation cycle finished. Submitted {session.applications_submitted_count} applications.",
        )

    async def _broadcast_event(
        self,
        session: AutomationSession,
        event_name: str,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ):
        await ws_manager.broadcast_to_user(
            user_id=session.user_id,
            message={
                "type": "AUTOMATION_TIMELINE_EVENT",
                "run_id": session.run_id,
                "event_name": event_name,
                "state": session.active_state,
                "message": message,
                "stats": {
                    "discovered": session.discovered_jobs_count,
                    "matched": session.matched_jobs_count,
                    "applied": session.applications_submitted_count,
                },
                "payload": payload or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )


orchestrator = AutomationOrchestrator()
