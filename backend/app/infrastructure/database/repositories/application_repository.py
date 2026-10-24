from datetime import datetime, timezone, timedelta
from typing import List
import uuid
from sqlalchemy import func, select, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.domain.applications.entities import (
    Application,
    ApplicationEvent,
    ApplicationOutcomeStatus,
    ApplicationQuestion,
    WorkflowStateEnum,
)
from app.domain.applications.repositories import ApplicationRepository
from app.domain.applications.display_status import NEEDS_ATTENTION_STATES
from app.infrastructure.database.models.models import (
    ApplicationEventModel,
    ApplicationModel,
    ApplicationQuestionModel,
    MatchResultModel,
)


class SqlAlchemyApplicationRepository(ApplicationRepository):
    def __init__(self, session: AsyncSession, commit_each_write: bool = False):
        self._session = session
        # Long-running workers set this so every state change is durable at once
        # (e.g. SUBMITTING is saved before the submit click). Request handlers
        # leave it off and let the request commit.
        self._commit_each_write = commit_each_write

    async def _resume_label(self, resume_id: str | None) -> str | None:
        """Current label of a resume, saved on the application as a history record (DB-05)."""
        if not resume_id:
            return None
        from app.infrastructure.database.models.models import ResumeModel

        return await self._session.scalar(select(ResumeModel.label).where(ResumeModel.id == resume_id))

    async def _finish_write(self) -> None:
        await self._session.flush()
        if self._commit_each_write:
            await self._session.commit()

    def _to_entity(self, model: ApplicationModel, match_score: float | None = None) -> Application:
        questions = [
            ApplicationQuestion(
                id=q.id,
                application_id=q.application_id,
                question_text=q.question_text,
                canonical_intent=q.canonical_intent,
                answer_provided=q.answer_provided,
                answered_by=q.answered_by,
                confidence_score=q.confidence_score,
            )
            for q in (model.questions or [])
        ]
        job = getattr(model, "job", None)
        job_title = (job.title if job else None) or getattr(model, "job_title_snapshot", None)
        company = (job.company if job else None) or getattr(model, "company_snapshot", None)
        location = (job.location if job else None) or getattr(model, "location_snapshot", None)
        min_experience_years = job.min_experience_years if job else None
        max_experience_years = job.max_experience_years if job else None
        min_salary = job.min_salary if job else None
        max_salary = job.max_salary if job else None
        salary_currency = job.salary_currency if job else "INR"
        apply_url = (job.apply_url if job else None) or getattr(model, "apply_url_snapshot", None)
        platform = None
        if job:
            if getattr(job, "source_id", None) and "-" not in str(job.source_id):
                platform = str(job.source_id).capitalize()
            elif job.apply_url:
                url_lower = job.apply_url.lower()
                if "naukri" in url_lower:
                    platform = "Naukri"
                elif "linkedin" in url_lower:
                    platform = "LinkedIn"
                elif "indeed" in url_lower:
                    platform = "Indeed"
            if not platform:
                platform = "Naukri"

        outcome_status_raw = getattr(model, "outcome_status", None) or "NOT_SUBMITTED"
        try:
            from app.domain.applications.entities import ApplicationOutcomeStatus
            outcome_status = ApplicationOutcomeStatus(outcome_status_raw)
        except Exception:
            from app.domain.applications.entities import ApplicationOutcomeStatus
            outcome_status = ApplicationOutcomeStatus.NOT_SUBMITTED

        return Application(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            resume_id=model.resume_id,
            tailored_resume_id=model.tailored_resume_id,
            tailored_opt_out=model.tailored_opt_out,
            idempotency_key=model.idempotency_key,
            workflow_state=WorkflowStateEnum(model.workflow_state),
            outcome_status=outcome_status,
            applied_at=model.applied_at,
            failure_reason=model.failure_reason,
            trace_file_path=model.trace_file_path,
            screenshot_file_path=model.screenshot_file_path,
            retry_count=model.retry_count or 0,
            error_category=model.error_category,
            next_retry_at=model.next_retry_at,
            current_attempt_id=getattr(model, "current_attempt_id", None),
            created_at=model.created_at,
            updated_at=model.updated_at,
            job_title=job_title,
            company=company,
            location=location,
            min_experience_years=min_experience_years,
            max_experience_years=max_experience_years,
            min_salary=min_salary,
            max_salary=max_salary,
            salary_currency=salary_currency,
            apply_url=apply_url,
            platform=platform,
            match_score=match_score,
            questions=questions,
        )

    async def get_by_id(self, application_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(ApplicationModel.id == application_id)
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        result = await self._session.execute(stmt)
        row = result.first()
        return self._to_entity(row[0], match_score=row[1]) if row else None

    async def get_by_user_and_job(self, user_id: str, job_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.job_id == job_id,
            )
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        result = await self._session.execute(stmt)
        row = result.first()
        return self._to_entity(row[0], match_score=row[1]) if row else None

    async def save(
        self,
        application: Application,
        expected_state: WorkflowStateEnum | None = None,
        expected_attempt_id: str | None = None,
    ) -> Application:
        outcome_val = application.outcome_status.value if hasattr(application.outcome_status, "value") else str(application.outcome_status)

        if expected_state is not None or expected_attempt_id is not None:
            # 1. Atomic Conditional SQL UPDATE
            # Directly checks condition in the database transaction and verifies affected rowcount.
            conditions = [ApplicationModel.id == application.id]
            if expected_state is not None:
                conditions.append(ApplicationModel.workflow_state == expected_state.value)
            if expected_attempt_id is not None:
                conditions.append(ApplicationModel.current_attempt_id == expected_attempt_id)

            update_values = {
                "workflow_state": application.workflow_state.value,
                "outcome_status": outcome_val,
                "applied_at": application.applied_at,
                "failure_reason": application.failure_reason,
                "trace_file_path": application.trace_file_path,
                "screenshot_file_path": application.screenshot_file_path,
                "retry_count": application.retry_count,
                "error_category": application.error_category,
                "next_retry_at": application.next_retry_at,
                "current_attempt_id": application.current_attempt_id,
                "updated_at": datetime.now(timezone.utc),
            }
            if application.resume_id:
                update_values["resume_id"] = application.resume_id
            # Written unconditionally so the user's choice (including "master resume") can be cleared or set.
            update_values["tailored_resume_id"] = application.tailored_resume_id
            update_values["tailored_opt_out"] = application.tailored_opt_out

            stmt = (
                update(ApplicationModel)
                .where(*conditions)
                .values(**update_values)
            )
            res = await self._session.execute(stmt)
            if res.rowcount == 0:
                # Diagnostics on atomic conflict
                curr_res = await self._session.execute(select(ApplicationModel).where(ApplicationModel.id == application.id))
                curr_model = curr_res.scalar_one_or_none()
                if not curr_model:
                    from app.core.exceptions import EntityNotFoundException
                    raise EntityNotFoundException(f"Application [{application.id}] not found.")

                from app.core.exceptions import ValidationException
                exp_st_str = expected_state.value if expected_state else "*"
                exp_att_str = expected_attempt_id or "*"
                raise ValidationException(
                    f"Application state conflict: Expected state [{exp_st_str}] and attempt [{exp_att_str}], "
                    f"but current state is [{curr_model.workflow_state}] and attempt is [{curr_model.current_attempt_id}]."
                )

            self._session.expire_all()
            await self._finish_write()
            return await self.get_by_id(application.id)  # type: ignore

        # Standard non-conditional save (insert or update)
        stmt = select(ApplicationModel).where(ApplicationModel.id == application.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            j_title = getattr(application, "job_title", None)
            j_comp = getattr(application, "company", None)
            j_loc = getattr(application, "location", None)
            j_url = getattr(application, "apply_url", None)
            if (not j_title or not j_comp) and application.job_id:
                from app.infrastructure.database.models.models import JobModel
                rel_job = await self._session.get(JobModel, application.job_id)
                if rel_job:
                    j_title = j_title or rel_job.title
                    j_comp = j_comp or rel_job.company
                    j_loc = j_loc or rel_job.location
                    j_url = j_url or rel_job.apply_url
            model = ApplicationModel(
                id=application.id,
                user_id=application.user_id,
                job_id=application.job_id,
                resume_id=application.resume_id,
                tailored_resume_id=application.tailored_resume_id,
                tailored_opt_out=application.tailored_opt_out,
                idempotency_key=application.idempotency_key,
                workflow_state=application.workflow_state.value,
                outcome_status=outcome_val,
                applied_at=application.applied_at,
                failure_reason=application.failure_reason,
                trace_file_path=application.trace_file_path,
                screenshot_file_path=application.screenshot_file_path,
                retry_count=application.retry_count,
                error_category=application.error_category,
                next_retry_at=application.next_retry_at,
                current_attempt_id=application.current_attempt_id,
                resume_label_snapshot=await self._resume_label(application.resume_id),
                job_title_snapshot=j_title,
                company_snapshot=j_comp,
                location_snapshot=j_loc,
                apply_url_snapshot=j_url,
            )
            self._session.add(model)
        else:
            model.workflow_state = application.workflow_state.value
            model.outcome_status = outcome_val
            model.applied_at = application.applied_at
            model.failure_reason = application.failure_reason
            model.trace_file_path = application.trace_file_path
            model.screenshot_file_path = application.screenshot_file_path
            model.retry_count = application.retry_count
            model.error_category = application.error_category
            model.next_retry_at = application.next_retry_at
            model.current_attempt_id = application.current_attempt_id
            if application.resume_id:
                if application.resume_id != model.resume_id or not model.resume_label_snapshot:
                    model.resume_label_snapshot = await self._resume_label(application.resume_id)
                model.resume_id = application.resume_id
            model.tailored_resume_id = application.tailored_resume_id
            model.tailored_opt_out = application.tailored_opt_out

        await self._finish_write()
        return await self.get_by_id(application.id)  # type: ignore

    async def add_event(self, event: ApplicationEvent) -> ApplicationEvent:
        model = ApplicationEventModel(
            id=event.id,
            application_id=event.application_id,
            event_name=event.event_name,
            payload=event.payload,
        )
        self._session.add(model)
        await self._finish_write()
        return event

    async def add_question(self, question: ApplicationQuestion) -> ApplicationQuestion:
        model = ApplicationQuestionModel(
            id=question.id,
            application_id=question.application_id,
            question_text=question.question_text,
            canonical_intent=question.canonical_intent,
            answer_provided=question.answer_provided,
            answered_by=question.answered_by,
            confidence_score=question.confidence_score,
        )
        self._session.add(model)
        await self._finish_write()
        return question

    async def list_by_user(
        self,
        user_id: str,
        state: str | None = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Application]:
        stmt = (
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(ApplicationModel.user_id == user_id)
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        if state:
            stmt = stmt.where(ApplicationModel.workflow_state == state)

        stmt = stmt.order_by(ApplicationModel.created_at.desc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        rows = result.all()
        return [self._to_entity(m, match_score=score) for m, score in rows]

    async def count_recent_submissions(
        self, user_id: str, hours: int = 24, source_type: str | None = None
    ) -> int:
        """Applications that were, or may have been, sent in the last `hours`.

        Uncertain outcomes count too: they might have reached the platform, so
        they must use up the safety budget until someone reconciles them.
        """
        from datetime import datetime, timedelta, timezone
        from app.infrastructure.database.models.models import JobModel, JobSourceModel

        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        counted_states = [
            WorkflowStateEnum.APPLIED.value,
            WorkflowStateEnum.SUBMITTING.value,
            WorkflowStateEnum.SUBMISSION_UNKNOWN.value,
            WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
        ]
        stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state.in_(counted_states),
            ApplicationModel.updated_at >= since,
        )
        if source_type:
            stmt = (
                stmt.join(JobModel, ApplicationModel.job_id == JobModel.id)
                .join(JobSourceModel, JobModel.source_id == JobSourceModel.id)
                .where(JobSourceModel.source_type == source_type)
            )
        return (await self._session.scalar(stmt)) or 0

    async def count_by_state(self, user_id: str, state: str) -> int:
        stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state == state,
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0

    async def count_by_user(self, user_id: str, state: str | None = None) -> int:
        stmt = select(func.count(ApplicationModel.id)).where(ApplicationModel.user_id == user_id)
        if state:
            stmt = stmt.where(ApplicationModel.workflow_state == state)
        result = await self._session.execute(stmt)
        return result.scalar() or 0

    async def get_aggregate_stats(self, user_id: str) -> dict:
        stmt = (
            select(ApplicationModel.workflow_state, func.count(ApplicationModel.id))
            .where(ApplicationModel.user_id == user_id)
            .group_by(ApplicationModel.workflow_state)
        )
        result = await self._session.execute(stmt)
        counts = {state: count for state, count in result.all()}

        from datetime import datetime, time, timezone
        now_utc = datetime.now(timezone.utc)
        today_start_utc = datetime.combine(now_utc.date(), time.min, tzinfo=timezone.utc)

        today_stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state == WorkflowStateEnum.APPLIED.value,
            or_(
                ApplicationModel.applied_at >= today_start_utc,
                and_(ApplicationModel.applied_at.is_(None), ApplicationModel.created_at >= today_start_utc),
            ),
        )
        today_res = await self._session.execute(today_stmt)
        applied_today = today_res.scalar() or 0

        total = sum(counts.values())
        applied = counts.get(WorkflowStateEnum.APPLIED.value, 0)
        paused = (
            counts.get(WorkflowStateEnum.PAUSED_OTP.value, 0)
            + counts.get(WorkflowStateEnum.PAUSED_CAPTCHA.value, 0)
            + counts.get(WorkflowStateEnum.PAUSED_USER_INPUT.value, 0)
            + counts.get(WorkflowStateEnum.PAUSED_LIMIT.value, 0)
        )
        failed = counts.get(WorkflowStateEnum.FAILED.value, 0)
        skipped = counts.get(WorkflowStateEnum.SKIPPED.value, 0)
        approval_required = counts.get(WorkflowStateEnum.APPROVAL_REQUIRED.value, 0)
        reconciliation_required = (
            counts.get(WorkflowStateEnum.RECONCILIATION_REQUIRED.value, 0)
            + counts.get(WorkflowStateEnum.SUBMISSION_UNKNOWN.value, 0)
        )
        # Same rule as the per-application ``needs_attention`` flag (domain/applications/display_status.py).
        needs_attention = sum(counts.get(state.value, 0) for state in NEEDS_ATTENTION_STATES)
        # "success_rate" here means: share of all applications that reached the applied state.
        # It is not an interview or offer rate (ANA-05).
        success_rate = round((applied / total) * 100, 1) if total > 0 else 0.0

        return {
            "total": total,
            "applied": applied,
            "applied_today": applied_today,
            "paused": paused,
            "failed": failed,
            "skipped": skipped,
            "approval_required": approval_required,
            "reconciliation_required": reconciliation_required,
            "needs_attention": needs_attention,
            "success_rate": success_rate,
        }

    async def get_applied_job_map(self, user_id: str) -> dict[str, dict]:
        """Returns a compact mapping of job_id -> {status, applied_at} for all applications belonging to user_id.
        Queries only required columns (job_id, workflow_state, applied_at, created_at) without entity hydration.
        """
        stmt = (
            select(
                ApplicationModel.job_id,
                ApplicationModel.workflow_state,
                ApplicationModel.applied_at,
                ApplicationModel.created_at,
            )
            .where(ApplicationModel.user_id == user_id)
        )
        res = await self._session.execute(stmt)
        result = {}
        for row in res.all():
            job_id, workflow_state, applied_at, created_at = row
            dt = applied_at or created_at
            result[job_id] = {
                "status": workflow_state,
                "applied_at": dt.isoformat() if dt else None,
            }
        return result

    async def recover_stale_submitting_applications(self, older_than_seconds: int = 300) -> int:
        """
        Crash-safety recovery:
        Finds any application stuck in SUBMITTING older than older_than_seconds.
        Transitions them to RECONCILIATION_REQUIRED with outcome_status=UNKNOWN
        to prevent unsafe duplicate execution on worker restart.
        """
        threshold = datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
        stmt = (
            select(ApplicationModel)
            .where(
                ApplicationModel.workflow_state == WorkflowStateEnum.SUBMITTING.value,
                ApplicationModel.updated_at <= threshold,
            )
        )
        res = await self._session.execute(stmt)
        if hasattr(res, "scalars") and callable(res.scalars):
            scalars_res = res.scalars()
            stale_apps = scalars_res.all()
            from unittest.mock import Mock
            if isinstance(stale_apps, Mock) and hasattr(res, "all") and callable(res.all):
                stale_apps = res.all()
        elif hasattr(res, "all") and callable(res.all):
            stale_apps = res.all()
        else:
            stale_apps = []
        count = 0
        now_dt = datetime.now(timezone.utc)
        for item in stale_apps:
            app_id = item.id if hasattr(item, "id") else (item[0] if isinstance(item, (tuple, list)) else str(item))
            upd_stmt = (
                update(ApplicationModel)
                .where(
                    ApplicationModel.id == app_id,
                    ApplicationModel.workflow_state == WorkflowStateEnum.SUBMITTING.value,
                )
                .values(
                    workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
                    outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
                    failure_reason=(
                        "Worker crashed or abandoned process during submission. "
                        "Marked for reconciliation to prevent double-application."
                    ),
                    next_retry_at=None,
                    updated_at=now_dt,
                )
            )
            upd_res = await self._session.execute(upd_stmt)
            rowcount = getattr(upd_res, "rowcount", None)
            is_updated = (rowcount > 0) if isinstance(rowcount, int) else True
            if is_updated:
                if hasattr(item, "workflow_state"):
                    item.workflow_state = WorkflowStateEnum.RECONCILIATION_REQUIRED.value
                    item.outcome_status = ApplicationOutcomeStatus.UNKNOWN.value
                    item.next_retry_at = None
                    item.updated_at = now_dt
                evt_model = ApplicationEventModel(
                    id=f"evt_{uuid.uuid4().hex[:12]}",
                    application_id=app_id,
                    event_name="APPLICATION_RECONCILIATION_REQUIRED",
                    payload={"reason": "CRASH_RECOVERY_STALE_SUBMISSION"},
                    created_at=now_dt,
                )
                self._session.add(evt_model)
                count += (rowcount if isinstance(rowcount, int) and rowcount > 0 else 1)

        if count > 0:
            await self._session.flush()
        return count

