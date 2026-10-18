import asyncio
import inspect
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import logging
from typing import Any, Dict, List, Optional
import uuid
from app.application.notifier import ws_manager
from app.application.runtime import persistence
from app.application.applications.application_orchestrator import ApplicationOrchestrator
from app.application.applications.commands import ApplicationSource, QueueApplicationCommand
from app.application.applications.use_cases import CreateApplicationUseCase, ExecuteApplicationUseCase
from app.application.jobs.use_cases import DiscoverJobsUseCase
from app.application.matching.use_cases import EvaluateJobMatchUseCase
from app.core.exceptions import ConflictException, EntityNotFoundException, PlatformException
from app.domain.ai.contracts import AIGateway
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.applications.repositories import ApplicationRepository
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.domain.jobs.repositories import JobRepository, JobSourceRepository
from app.domain.matching.entities import DecisionEnum, MatchResult, MatchRule
from app.domain.matching.repositories import MatchResultRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository
from app.domain.auth.repositories import UserRepository
from app.domain.automation.state_machine import AutomationState, AutomationStateMachine

logger = logging.getLogger("app.automation.orchestrator")

# Alias for backwards compatibility across existing API consumers
AutomationRunStatus = AutomationState


@dataclass
class _RunLockEntry:
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    ref_count: int = 0



class AutomationSession:
    """
    Maintains in-memory live execution state for an active automation run.
    Enforces deterministic state transitions via AutomationStateMachine.
    """

    def __init__(
        self,
        run_id: str,
        user_id: str,
        execution_id: Optional[str] = None,
        campaign_id: Optional[str] = None,
        worker_id: Optional[str] = "worker-1",
        lease_version: int = 1,
        resume_id: Optional[str] = None,
    ):
        self.run_id = run_id
        self.user_id = user_id
        self.execution_id = execution_id or run_id
        self.campaign_id = campaign_id
        self.worker_id = worker_id
        self.lease_version = lease_version
        self.resume_id = resume_id
        self._state_machine = AutomationStateMachine(initial_state=AutomationState.IDLE)
        self.is_paused = False
        self.pause_event = asyncio.Event()
        self.pause_event.set()  # Not paused by default
        self.cancel_requested = False
        self.qualified_jobs_count = 0  # jobs the rule shortlisted (not just evaluated)
        self.terminal_event_sent = False  # set once RUN_COMPLETED / RUN_FAILED went out
        self.user_input_queue: asyncio.Queue = asyncio.Queue()
        self.events: List[Dict[str, Any]] = []
        self._event_seq: int = 0
        self.discovered_jobs_count = 0
        self.matched_jobs_count = 0
        self.applications_submitted_count = 0
        self.failed_applications_count = 0
        self.current_job_title: Optional[str] = None
        self.current_application_id: Optional[str] = None
        self.active_state: str = "IDLE"
        self.error_message: Optional[str] = None
        self.created_at = datetime.now(timezone.utc)
        self.completed_at: Optional[datetime] = None

    @property
    def status(self) -> AutomationState:
        return self._state_machine.current_state

    @status.setter
    def status(self, target_state: AutomationState):
        if self._state_machine.current_state != target_state:
            self._state_machine.transition_to(target_state)

    def transition_to(self, target_state: AutomationState) -> AutomationState:
        return self._state_machine.transition_to(target_state)

    def pause(self):
        self.is_paused = True
        self.transition_to(AutomationState.PAUSED)
        self.pause_event.clear()
        logger.info(f"Automation run [{self.run_id}] paused.")

    def resume(self, user_input: Optional[str] = None):
        if user_input:
            self.user_input_queue.put_nowait(user_input)
        self.is_paused = False
        self.transition_to(AutomationState.RUNNING)
        self.pause_event.set()
        logger.info(f"Automation run [{self.run_id}] resumed.")

    def abort(self, reason: str = "Aborted by user"):
        self.cancel_requested = True
        if self._state_machine.can_transition_to(AutomationState.ABORTED):
            self.transition_to(AutomationState.ABORTED)
        elif self._state_machine.can_transition_to(AutomationState.STOPPED):
            self.transition_to(AutomationState.STOPPED)
        self.error_message = reason
        self.pause_event.set()  # Unblock if paused
        logger.info("automation_cancelled", extra={"run_id": self.run_id, "user_id": self.user_id, "reason": reason})
        logger.info(f"Automation run [{self.run_id}] aborted: {reason}")


def slot_should_be_kept(state: Any) -> bool:
    """True when the application was, or may have been, submitted."""
    return state in (
        WorkflowStateEnum.APPLIED,
        WorkflowStateEnum.SUBMITTING,
        WorkflowStateEnum.SUBMISSION_UNKNOWN,
        WorkflowStateEnum.RECONCILIATION_REQUIRED,
    )


def daily_cap_reached(
    account_count: int, platform_count: int, account_ceiling: int, platform_cap: int
) -> str | None:
    """Return why a new submission must not start, or None if there is room.

    Applies to every run, with or without a campaign. (AUT-06)
    """
    if account_count >= account_ceiling:
        return f"account safety ceiling reached ({account_count}/{account_ceiling} in the last 24h)"
    if platform_count >= platform_cap:
        return f"platform daily cap reached ({platform_count}/{platform_cap} in the last 24h)"
    return None


def should_auto_submit(auto_apply_matches: bool, decision: "DecisionEnum") -> bool:
    """Only matches the rule marked AUTO_APPLY may be submitted without a human.

    REQUIRE_APPROVAL matches are queued as APPROVAL_REQUIRED and wait for the user,
    even when auto-apply is switched on and the score is high.
    """
    return bool(auto_apply_matches) and decision == DecisionEnum.AUTO_APPLY


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
        self._lock: Optional[asyncio.Lock] = None
        self._lock_loop = None
        self._run_locks: Dict[str, Any] = {}
        # Keep references so background pipelines are not garbage-collected
        # and can be cancelled on shutdown or in tests.
        self._background_tasks: set = set()

    @property
    def lock(self) -> asyncio.Lock:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if self._lock is None or self._lock_loop != loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    def get_run_lock(self, run_id: str) -> asyncio.Lock:
        """
        Backward-compatible helper returning the underlying asyncio.Lock for run_id.
        Creates or returns the canonical lock instance stored in _run_locks.
        Note: For guaranteed lifecycle safety and automatic ref-counting, callers
        should prefer `async with orchestrator.run_lock(run_id):`.
        """
        entry = self._run_locks.get(run_id)
        if entry is None:
            entry = _RunLockEntry()
            self._run_locks[run_id] = entry
        return entry.lock

    @asynccontextmanager
    async def run_lock(self, run_id: str):
        """
        Safe reference-counted context manager for run-level synchronization.
        
        Guarantees that:
        1. All concurrent producers, waiters, and callers for the same run_id share
           the exact same asyncio.Lock instance.
        2. Waiters increment refcount before waiting, preventing premature eviction.
        3. Even if a coroutine is cancelled while waiting on entry.lock or self.lock,
           reference count decrements are shielded, preventing counter leaks or negative counts.
        4. The lock entry is safely removed from the dictionary ONLY when refcount reaches 0
           and the lock is not currently held.
        5. No two different locks can ever exist simultaneously for the same run_id.
        """
        async with self.lock:
            entry = self._run_locks.get(run_id)
            if entry is None:
                entry = _RunLockEntry()
                self._run_locks[run_id] = entry
            entry.ref_count += 1

        acquired = False
        try:
            await entry.lock.acquire()
            acquired = True
            yield entry.lock
        finally:
            if acquired:
                entry.lock.release()
            async def _release_entry():
                async with self.lock:
                    entry.ref_count = max(0, entry.ref_count - 1)
                    if entry.ref_count == 0 and not entry.lock.locked():
                        if self._run_locks.get(run_id) is entry:
                            self._run_locks.pop(run_id, None)

            await asyncio.shield(_release_entry())

    def cleanup_run_lock(self, run_id: str) -> None:
        """
        Safely attempts to clean up run lock when no holders or waiters exist.
        If any coroutine is holding or waiting (ref_count > 0 or lock is held),
        cleanup is safely skipped.
        """
        entry = self._run_locks.get(run_id)
        if entry is not None:
            if entry.ref_count <= 0 and not entry.lock.locked():
                self._run_locks.pop(run_id, None)

    def get_session(self, run_id: str) -> Optional[AutomationSession]:
        return self._sessions.get(run_id)

    def get_active_user_run(self, user_id: str) -> Optional[AutomationSession]:
        run_id = self._user_active_runs.get(user_id)
        if run_id:
            return self._sessions.get(run_id)
        return None

    async def get_live_run_id(self, user_id: str) -> Optional[str]:
        """The id of the user's starting, running or paused run, from memory first and then the database."""
        mem = self.get_active_user_run(user_id)
        if mem and mem.status in (AutomationState.STARTING, AutomationState.RUNNING, AutomationState.PAUSED):
            return mem.run_id
        return await persistence.get_live_run_id(user_id)

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
        session_repo: Optional[Any] = None,
        ai_gateway: Optional[AIGateway] = None,
        headless: bool = True,
        execution_id: Optional[str] = None,
        campaign_id: Optional[str] = None,
        worker_id: Optional[str] = "worker-1",
        lease_version: int = 1,
        execution_repo: Optional[Any] = None,
        quota_repo: Optional[Any] = None,
        resume_id: Optional[str] = None,
    ) -> AutomationSession:
        run_id = execution_id or f"run_{uuid.uuid4().hex[:8]}"
        session = AutomationSession(
            run_id=run_id,
            user_id=user_id,
            execution_id=execution_id or run_id,
            campaign_id=campaign_id,
            worker_id=worker_id,
            lease_version=lease_version,
            resume_id=resume_id,
        )
        session.transition_to(AutomationState.STARTING)
        session.transition_to(AutomationState.RUNNING)

        # The run row must exist before events can point at it, and history is rebuilt from it.
        async def _persist_run_initial():
            await persistence.persist_run_start(
                run_id=run_id,
                user_id=user_id,
                status=session.status.value,
                source_type=source_type,
                target_count=max_applications,
                worker_id=worker_id or "worker-1",
                started_at=session.created_at,
            )

        try:
            await _persist_run_initial()
        except ConflictException:
            raise  # another live run exists: the caller answers 409, nothing was started
        except Exception as run_err:
            logger.error(f"Failed to persist initial AutomationRunModel [{run_id}]: {run_err}")
            raise RuntimeError(f"Cannot start automation run without persistent database record: {run_err}") from run_err

        async with self.lock:
            self._sessions[run_id] = session
            self._user_active_runs[user_id] = run_id

        # Launch non-blocking background orchestration task
        pipeline_task = asyncio.create_task(
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
                session_repo=session_repo,
                ai_gateway=ai_gateway,
                headless=headless,
                execution_repo=execution_repo,
                quota_repo=quota_repo,
            )
        )
        self._background_tasks.add(pipeline_task)
        pipeline_task.add_done_callback(self._background_tasks.discard)

        return session

    async def _settle_quota_slot(self, quota_repo: Any, reservation: Any, state: Any) -> None:
        """Consume the slot if the application was (or may have been) submitted, else free it.

        Uncertain outcomes keep their slot: the submission may have reached the
        platform, so it must keep counting until someone reconciles it. (AUT-08)
        """
        if not (quota_repo and reservation):
            return
        if slot_should_be_kept(state):
            await quota_repo.consume_slot(reservation.id)
        else:
            await quota_repo.release_slot(reservation.id)
        await self._commit_work(quota_repo)

    @staticmethod
    async def _daily_cap_reason(app_repo: Any, user_id: str, source_type: str) -> str | None:
        """Check the account-wide and per-platform 24h safety caps (AUT-06)."""
        from app.core.config import settings

        account_count = await app_repo.count_recent_submissions(user_id)
        platform_count = await app_repo.count_recent_submissions(user_id, source_type=source_type)
        return daily_cap_reached(
            account_count,
            platform_count,
            settings.GLOBAL_ACCOUNT_SAFE_CEILING,
            settings.PLATFORM_DAILY_CAP_DEFAULT,
        )

    @staticmethod
    async def _commit_work(repo: Any) -> None:
        """Make pending writes durable now.

        Repositories only flush. Without an explicit commit the data stays in an
        open transaction, which is lost on a crash and (on SQLite) blocks every
        other writer, including the event/telemetry writes. (AUT-01)
        """
        await repo._session.commit()

    async def cancel_background_tasks(self) -> None:
        """Cancel any running pipelines and wait for them to stop."""
        tasks = list(self._background_tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

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
        session_repo: Any = None,
        ai_gateway: Any = None,
        headless: bool = True,
        execution_repo: Any = None,
        quota_repo: Any = None,
    ):
        heartbeat_task = None
        if session.execution_id:
            heartbeat_task = asyncio.create_task(
                self._run_heartbeat_loop(session, interval_seconds=30, execution_repo=execution_repo)
            )

        try:
            if job_repo is None or hasattr(job_repo, "_session"):
                async with persistence.open_pipeline_repositories() as repos:
                    await self._run_pipeline_core(
                        session=session,
                        source_type=source_type,
                        roles=roles,
                        locations=locations,
                        min_salary=min_salary,
                        match_rule=match_rule,
                        auto_apply_matches=auto_apply_matches,
                        max_applications=max_applications,
                        job_repo=repos.job_repo,
                        source_repo=repos.source_repo,
                        profile_repo=repos.profile_repo,
                        resume_repo=repos.resume_repo,
                        match_repo=repos.match_repo,
                        app_repo=repos.app_repo,
                        user_repo=repos.user_repo,
                        session_repo=repos.session_repo,
                        ai_gateway=repos.ai_gateway,
                        headless=headless,
                        quota_repo=repos.quota_repo,
                    )
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
                    session_repo=session_repo,
                    ai_gateway=ai_gateway,
                    headless=headless,
                    quota_repo=quota_repo,
                )
            # A cancelled run can leave the pipeline early; the console and the
            # database still need a final event. (AUT-10)
            if not session.terminal_event_sent:
                if session._state_machine.can_transition_to(AutomationState.STOPPED):
                    session.transition_to(AutomationState.STOPPED)
                session.active_state = "FINISHED"
                session.completed_at = datetime.now(timezone.utc)
                await self._broadcast_event(
                    session=session,
                    event_name="RUN_COMPLETED",
                    message=f"Run stopped before completion. Submitted {session.applications_submitted_count} applications.",
                )
        except Exception as e:
            logger.error(f"Automation run pipeline error: {e}", exc_info=True)
            if session._state_machine.can_transition_to(AutomationState.FAILED):
                session.transition_to(AutomationState.FAILED)
            session.error_message = str(e)
            await self._broadcast_event(
                session=session,
                event_name="RUN_FAILED",
                message=f"Run failed: {e}",
            )
        finally:
            if heartbeat_task and not heartbeat_task.done():
                heartbeat_task.cancel()
            if session.execution_id:
                try:
                    async def _sync_final_state(repo):
                        exec_model = await repo.get_by_id(session.execution_id)
                        if exec_model:
                            # Fencing guard: verify this worker still owns the execution
                            if session.worker_id and exec_model.worker_id != session.worker_id:
                                logger.warning(
                                    f"Skipping final execution state sync for [{session.execution_id}]: "
                                    f"current owner [{exec_model.worker_id}] != session worker [{session.worker_id}]"
                                )
                                return
                            if hasattr(session, "lease_version") and exec_model.lease_version and session.lease_version < exec_model.lease_version:
                                logger.warning(
                                    f"Skipping final execution state sync for [{session.execution_id}]: "
                                    f"stale session lease_version [{session.lease_version}] < current [{exec_model.lease_version}]"
                                )
                                return
                            if exec_model.status in ("COMPLETED", "FAILED", "ABORTED") and exec_model.worker_id != session.worker_id:
                                logger.warning(
                                    f"Execution [{session.execution_id}] already finalized by another worker [{exec_model.worker_id}]."
                                )
                                return

                            if session.status == AutomationState.COMPLETED:
                                exec_model.status = "COMPLETED"
                            elif session.status == AutomationState.FAILED:
                                exec_model.status = "FAILED"
                                exec_model.error_message = session.error_message
                            elif session.status in (AutomationState.ABORTED, AutomationState.STOPPED):
                                exec_model.status = "ABORTED"
                            exec_model.completed_at = datetime.now(timezone.utc)
                            exec_model.discovered_count = session.discovered_jobs_count
                            exec_model.qualified_count = session.qualified_jobs_count
                            exec_model.submitted_count = session.applications_submitted_count
                            exec_model.failed_count = session.failed_applications_count
                            await repo.save(exec_model)

                    if execution_repo:
                        await _sync_final_state(execution_repo)
                    else:
                        async with persistence.open_execution_repository() as repo:
                            await _sync_final_state(repo)
                except Exception as sync_err:
                    logger.error(
                        f"Failed to synchronize final execution state for [{session.execution_id}]: {sync_err}",
                        exc_info=True,
                    )
            async with self.lock:
                if session.user_id in self._user_active_runs:
                    del self._user_active_runs[session.user_id]
                self.cleanup_run_lock(session.run_id)

    async def _run_heartbeat_loop(
        self,
        session: AutomationSession,
        interval_seconds: int = 30,
        execution_repo: Optional[Any] = None,
    ):
        while not session.cancel_requested:
            try:
                await asyncio.sleep(interval_seconds)
                if session.status in (AutomationState.RUNNING, AutomationState.STARTING, AutomationState.PAUSED):
                    if execution_repo:
                        await execution_repo.record_heartbeat(
                            execution_id=session.execution_id,
                            worker_id=session.worker_id or "worker-1",
                            lease_seconds=300,
                            lease_version=getattr(session, "lease_version", None),
                        )
                    else:
                        await persistence.record_heartbeat(
                            run_id=session.run_id,
                            execution_id=session.execution_id,
                            worker_id=session.worker_id or "worker-1",
                            lease_seconds=300,
                            lease_version=getattr(session, "lease_version", None),
                        )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Failed to record worker heartbeat for execution [{session.execution_id}]: {e}")

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
        session_repo: Optional[Any] = None,
        ai_gateway: Any = None,
        headless: bool = True,
        quota_repo: Optional[Any] = None,
    ):
        headless = True  # Strict enforcement: all automation runs headless and streams to in-UI canvas
        logger.info(f"Starting automation pipeline [{session.run_id}] for user [{session.user_id}] (headless={headless})...")

        mode_label = "Background Mode" if headless else "🖥️ Visible Desktop Browser Mode"
        await self._broadcast_event(
            session=session,
            event_name="RUN_STARTED",
            message=f"Starting job automation cycle on [{source_type.upper()}] ({mode_label}) for roles: {', '.join(roles)}",
            payload={"headless": headless},
        )

        # Step 1: Job Discovery
        session.active_state = "DISCOVERING"
        filters = SearchQueryFilter(
            roles=roles,
            locations=locations or [],
            min_salary=min_salary,
            max_pages=2,
        )

        # Check for active authenticated session for this platform (Naukri, LinkedIn, etc.)
        encrypted_storage_state = None
        if session_repo:
            try:
                browser_sess = await session_repo.get_by_user_and_platform(session.user_id, source_type.lower())
                if browser_sess and browser_sess.encrypted_storage_state and getattr(browser_sess, "status", "ACTIVE") == "ACTIVE":
                    encrypted_storage_state = browser_sess.encrypted_storage_state
                    logger.info(f"Loaded active session for user [{session.user_id}] on platform [{source_type}]. Injecting authenticated state.")
                    await self._broadcast_event(
                        session=session,
                        event_name="SESSION_ATTACHED",
                        message=f"Connected account detected: running authenticated automation on {source_type.upper()}.",
                        payload={"platform": source_type},
                    )
            except Exception as sess_err:
                logger.warning(f"Could not load session for [{source_type}]: {sess_err}. Running in guest mode.")

        discover_uc = DiscoverJobsUseCase(job_repo=job_repo, job_source_repo=source_repo)
        discovery_result = await discover_uc.execute(
            user_id=session.user_id,
            source_type=source_type,
            filters=filters,
            encrypted_storage_state=encrypted_storage_state,
            run_id=session.run_id,
            headless=headless,
        )

        disc_total = discovery_result.get("discovered_total", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "discovered_total", 0)
        new_count = discovery_result.get("new_jobs_count", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "new_jobs_count", 0)
        dups_count = discovery_result.get("skipped_duplicates", 0) if isinstance(discovery_result, dict) else getattr(discovery_result, "skipped_duplicates", 0)
        session.discovered_jobs_count = disc_total
        await self._commit_work(job_repo)

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

            try:
                match_res = await evaluate_uc.execute(
                    user_id=session.user_id,
                    job_id=job_id,
                    resume_id=session.resume_id,
                    custom_rule=match_rule,
                )
                await self._commit_work(job_repo)
                session.matched_jobs_count += 1

                await self._broadcast_event(
                    session=session,
                    event_name="JOB_EVALUATED",
                    message=f"Evaluated [{job_title} at {job_company}]: Score {match_res.overall_score:.1f}% -> {match_res.decision.value}",
                    payload={
                        "score": round(match_res.overall_score, 1),
                        "decision": match_res.decision.value,
                        "job_id": job_id,
                        "job_title": job_title,
                        "company": job_company,
                        "location": getattr(match_res, "location", None) or getattr(job_summary, "location", "") if isinstance(job_summary, dict) else "",
                        "matched_skills": match_res.matched_skills[:5] if match_res.matched_skills else [],
                        "missing_skills": match_res.missing_skills[:5] if match_res.missing_skills else [],
                        "reasoning": match_res.reasoning_summary,
                        "platform": source_type,
                    },
                )

                if match_res.decision in (DecisionEnum.AUTO_APPLY, DecisionEnum.REQUIRE_APPROVAL):
                    job_obj = await job_repo.get_by_id(job_id)
                    if job_obj:
                        shortlisted_jobs.append((job_obj, match_res))
                        session.qualified_jobs_count += 1
            except Exception as eval_err:
                logger.warning(f"Error evaluating job {job_id} ({job_title} at {job_company}): {eval_err}")
                await self._broadcast_event(
                    session=session,
                    event_name="JOB_EVALUATION_FAILED",
                    message=f"Skipped [{job_title} at {job_company}]: {eval_err}",
                    payload={"job_id": job_id, "error": str(eval_err)},
                )

        if session.cancel_requested:
            return

        if not shortlisted_jobs:
            logger.info(
                f"[{session.run_id}] Matching cascade completed. 0 of {len(jobs_list)} discovered jobs qualified for application (all scores below thresholds: auto-apply >= 80%, review >= 65%)."
            )

        # Step 3: Application Automation Execution
        session.active_state = "APPLYING"
        exec_app_uc = ExecuteApplicationUseCase(
            app_repo=app_repo,
            job_repo=job_repo,
            profile_repo=profile_repo,
            resume_repo=resume_repo,
            user_repo=user_repo,
            session_repo=session_repo,
            ai_provider=ai_gateway,
        )
        app_orchestrator = ApplicationOrchestrator(
            app_repo=app_repo,
            job_repo=job_repo,
            profile_repo=profile_repo,
            resume_repo=resume_repo,
            campaign_repo=None,
            connection_repo=session_repo,
            execute_use_case=exec_app_uc,
        )

        for job_obj, match_res in shortlisted_jobs:
            if session.cancel_requested:
                break
            if session.applications_submitted_count >= max_applications:
                logger.info(f"Reached max applications limit ({max_applications}). Stopping run.")
                break

            await session.pause_event.wait()

            # Determine if we should auto apply
            should_apply = should_auto_submit(auto_apply_matches, match_res.decision)

            if should_apply:
                cap_reason = await self._daily_cap_reason(app_repo, session.user_id, source_type)
                if cap_reason:
                    logger.warning(f"Stopping run [{session.run_id}]: {cap_reason}")
                    await self._broadcast_event(
                        session=session,
                        event_name="DAILY_CAP_REACHED",
                        message=f"Stopping safely: {cap_reason}.",
                        payload={"reason": cap_reason},
                    )
                    break
            initial_state = WorkflowStateEnum.APPROVED if should_apply else WorkflowStateEnum.APPROVAL_REQUIRED

            # Canonical application creation & validation through ApplicationOrchestrator
            effective_resume_id = session.resume_id or match_res.resume_id
            queue_cmd = QueueApplicationCommand(
                user_id=session.user_id,
                job_id=job_obj.id,
                source=ApplicationSource.CAMPAIGN if session.campaign_id else ApplicationSource.AUTOMATION,
                campaign_id=session.campaign_id,
                resume_id=effective_resume_id,
                auto_execute=False,
                initial_state=initial_state,
            )
            queue_res = await app_orchestrator.queue_application(queue_cmd)
            if not queue_res.is_queued or not queue_res.application:
                logger.info(
                    f"Application rejected/skipped for [{job_obj.title} at {job_obj.company}]: {queue_res.error_code} - {queue_res.error_message}"
                )
                continue

            app_entity = queue_res.application
            session.current_application_id = app_entity.id
            session.current_job_title = f"{job_obj.title} @ {job_obj.company}"

            if should_apply:
                reservation = None
                if quota_repo and session.campaign_id:
                    reservation = await quota_repo.reserve_slot(
                        campaign_id=session.campaign_id,
                        user_id=session.user_id,
                        job_id=job_obj.id,
                        daily_limit=max_applications,
                        execution_id=session.execution_id or session.run_id,
                        ttl_seconds=300,
                    )
                    await self._commit_work(quota_repo)
                    if not reservation:
                        logger.warning(
                            f"Atomic quota reservation limit reached for campaign [{session.campaign_id}] (limit={max_applications}). Stopping run safely."
                        )
                        await self._broadcast_event(
                            session=session,
                            event_name="QUOTA_EXHAUSTED",
                            message=f"Campaign daily application quota limit reached ({max_applications}). Stopping run safely.",
                            payload={"campaign_id": session.campaign_id, "limit": max_applications},
                        )
                        break

                await self._broadcast_event(
                    session=session,
                    event_name="AUTO_APPLYING",
                    message=f"Auto-applying to [{job_obj.title} at {job_obj.company}]...",
                    payload={
                        "job_id": job_obj.id,
                        "job_title": job_obj.title,
                        "company": job_obj.company,
                        "platform": job_obj.source_type or source_type,
                        "apply_url": job_obj.apply_url,
                        "score": round(match_res.overall_score, 1),
                    },
                )
                executed_app = None
                try:
                    executed_app = await exec_app_uc.execute(
                        application_id=app_entity.id,
                        run_id=session.run_id,
                        headless=headless,
                    )

                    # AUT-07: after a CAPTCHA/OTP pause, wait for the user and then
                    # try the SAME application again instead of skipping it.
                    if executed_app.workflow_state in (
                        WorkflowStateEnum.PAUSED_OTP,
                        WorkflowStateEnum.PAUSED_CAPTCHA,
                    ):
                        session.pause()
                        await self._broadcast_event(
                            session=session,
                            event_name="PAUSED_FOR_USER",
                            message=f"Challenge encountered on {job_obj.company}. Automation paused for verification.",
                        )
                        challenge_timeout_seconds = 300
                        try:
                            await asyncio.wait_for(session.pause_event.wait(), timeout=challenge_timeout_seconds)
                        except asyncio.TimeoutError:
                            logger.warning(
                                f"Challenge intervention timed out after {challenge_timeout_seconds}s for job [{job_obj.id}]"
                            )
                            session.failed_applications_count += 1
                            await self._broadcast_event(
                                session=session,
                                event_name="CHALLENGE_TIMEOUT",
                                message=f"Intervention timed out ({challenge_timeout_seconds}s) on {job_obj.company}. Moving on.",
                            )
                            session.is_paused = False
                            session.pause_event.set()
                        else:
                            if not session.cancel_requested:
                                executed_app = await exec_app_uc.execute(
                                    application_id=app_entity.id,
                                    run_id=session.run_id,
                                    headless=headless,
                                )

                    if executed_app.workflow_state == WorkflowStateEnum.APPLIED:
                        session.applications_submitted_count += 1
                        await self._broadcast_event(
                            session=session,
                            event_name="APPLICATION_SUBMITTED",
                            message=f"Application submitted successfully for [{job_obj.title} at {job_obj.company}].",
                            payload={
                                "job_id": job_obj.id,
                                "application_id": executed_app.id,
                                "job_title": job_obj.title,
                                "company": job_obj.company,
                                "platform": job_obj.source_type or source_type,
                                "score": round(match_res.overall_score, 1),
                            },
                        )
                    await self._settle_quota_slot(quota_repo, reservation, executed_app.workflow_state)
                except Exception as app_err:
                    # The outcome is unknown after an exception: ask the database what
                    # state the application reached before deciding about the slot.
                    state = executed_app.workflow_state if executed_app else None
                    if state is None:
                        try:
                            current = await app_repo.get_by_id(app_entity.id)
                            state = current.workflow_state if current else None
                        except Exception:
                            state = WorkflowStateEnum.SUBMISSION_UNKNOWN  # cannot tell: be safe
                    try:
                        await self._settle_quota_slot(quota_repo, reservation, state)
                    except Exception:
                        logger.warning("Could not settle quota slot after application error.", exc_info=True)
                    raise app_err

        if session.cancel_requested:
            if session._state_machine.can_transition_to(AutomationState.STOPPED):
                session.transition_to(AutomationState.STOPPED)
        else:
            if session._state_machine.can_transition_to(AutomationState.COMPLETED):
                session.transition_to(AutomationState.COMPLETED)
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
        logger.info(f"[{session.run_id}] [{event_name}] {message}")
        if event_name in ("RUN_COMPLETED", "RUN_FAILED"):
            session.terminal_event_sent = True
        event_dict = None
        # Atomic Transaction: update run state, allocate durable monotonic sequence, and insert event
        # SQLite concurrency safe: handles busy/locked retries and atomic sequence increments
        async with self.run_lock(session.run_id):
            for attempt in range(5):
                try:
                    snapshot = {
                        "run_id": session.run_id,
                        "user_id": session.user_id,
                        "status": session.status.value,
                        "worker_id": session.worker_id or "worker-1",
                        "created_at": session.created_at,
                        "discovered": session.discovered_jobs_count,
                        "matched": session.matched_jobs_count,
                        "applied": session.applications_submitted_count,
                        "failed": session.failed_applications_count,
                        "current_job_title": session.current_job_title,
                        "error_message": session.error_message,
                        "completed_at": session.completed_at,
                        "active_state": session.active_state,
                        "is_finished": session.status
                        in (AutomationState.COMPLETED, AutomationState.ABORTED, AutomationState.FAILED),
                    }
                    saved = await persistence.append_run_event(snapshot, event_name, message, payload or {})
                    current_seq = saved["seq"]
                    event_id = saved["event_id"]
                    # Update in-memory sequence ONLY after successful database commit
                    session._event_seq = current_seq

                    event_dict = {
                        "type": "AUTOMATION_TIMELINE_EVENT",
                        "id": event_id,
                        "seq": current_seq,
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
                    }
                    break  # Success
                except Exception as persist_err:
                    err_str = str(persist_err).lower()
                    is_retryable = any(kw in err_str for kw in ("locked", "busy", "unique constraint", "integrityerror"))
                    if attempt < 4 and is_retryable:
                        logger.warning(
                            f"Transient SQLite error on attempt {attempt + 1}/5 for [{event_name}] on run [{session.run_id}]: {persist_err}. Retrying..."
                        )
                        await asyncio.sleep(0.02 * (attempt + 1))
                        continue
                    logger.error(
                        f"Database event persistence failed for [{event_name}] on run [{session.run_id}] (attempt {attempt + 1}): {persist_err}",
                        exc_info=True,
                    )
                    # A lost log line must not stop real work, so give up on this event and carry on (ARC-06).
                    break

        if event_dict:
            if hasattr(session, "events"):
                session.events.append(event_dict)

            # Post-commit live broadcast
            await ws_manager.broadcast_to_user(
                user_id=session.user_id,
                message=event_dict,
            )


orchestrator = AutomationOrchestrator()
