from collections import Counter
from datetime import datetime
from typing import List, Optional
from sqlalchemy import func, select, or_, distinct, union
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.analytics.entities import (
    CampaignPerformanceMetric,
    FunnelOverview,
    FunnelStageMetric,
    ResumePerformanceMetric,
    SkillDemandInsight,
    SourcePerformanceMetric,
    WeightTuningRecommendation,
)
from app.infrastructure.database.models import (
    ApplicationEventModel,
    ApplicationModel,
    AutomationRunModel,
    CampaignExecutionModel,
    CampaignJobItemModel,
    CampaignModel,
    JobModel,
    JobSourceModel,
    MatchResultModel,
    ResumeModel,
    SavedAnswerModel,
)


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_funnel_overview(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        platform: Optional[str] = None,
        campaign_id: Optional[str] = None,
    ) -> FunnelOverview:
        # 1. User-Scoped Discovered Jobs
        # Defined as any job surfaced for this user through:
        #   (a) Match evaluations
        #   (b) Application entries
        #   (c) Campaign job items linked to the user's campaign executions
        #   (d) Automation run current/target jobs
        # This counts jobs discovered EVEN before AI matching or application occurs!

        # (a) Match results for user
        match_query = select(MatchResultModel.job_id).where(MatchResultModel.user_id == user_id)
        if start_date:
            match_query = match_query.where(MatchResultModel.created_at >= start_date)
        if end_date:
            match_query = match_query.where(MatchResultModel.created_at <= end_date)

        # (b) Applications for user
        app_query = select(ApplicationModel.job_id).where(ApplicationModel.user_id == user_id)
        if start_date:
            app_query = app_query.where(ApplicationModel.created_at >= start_date)
        if end_date:
            app_query = app_query.where(ApplicationModel.created_at <= end_date)

        # (c) Campaign job items discovered by user's campaign executions
        camp_items_query = (
            select(CampaignJobItemModel.job_id)
            .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
            .where(CampaignExecutionModel.user_id == user_id)
        )
        if campaign_id:
            camp_items_query = camp_items_query.where(CampaignExecutionModel.campaign_id == campaign_id)
        if start_date:
            camp_items_query = camp_items_query.where(CampaignJobItemModel.processed_at >= start_date)
        if end_date:
            camp_items_query = camp_items_query.where(CampaignJobItemModel.processed_at <= end_date)

        # (d) Automation runs job references
        auto_run_query = (
            select(AutomationRunModel.current_job_id)
            .where(
                AutomationRunModel.user_id == user_id,
                AutomationRunModel.current_job_id.isnot(None),
            )
        )
        if start_date:
            auto_run_query = auto_run_query.where(AutomationRunModel.started_at >= start_date)
        if end_date:
            auto_run_query = auto_run_query.where(AutomationRunModel.started_at <= end_date)

        combined_subquery = union(match_query, app_query, camp_items_query, auto_run_query).subquery()
        discovered_query = (
            select(func.count(distinct(combined_subquery.c.job_id)))
            .select_from(combined_subquery)
            .join(JobModel, combined_subquery.c.job_id == JobModel.id)
        )
        if platform:
            discovered_query = discovered_query.join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        total_discovered = (await self.session.scalar(discovered_query)) or 0

        # 2. Total Matched for User
        matched_query = (
            select(func.count(distinct(MatchResultModel.job_id)))
            .where(MatchResultModel.user_id == user_id)
        )
        if start_date:
            matched_query = matched_query.where(MatchResultModel.created_at >= start_date)
        if end_date:
            matched_query = matched_query.where(MatchResultModel.created_at <= end_date)
        if platform:
            matched_query = matched_query.join(JobModel, MatchResultModel.job_id == JobModel.id).join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        total_matched = (await self.session.scalar(matched_query)) or 0

        # Discovered should logically be at least equal to matched
        if total_discovered < total_matched:
            total_discovered = total_matched

        # 3. Applications for User (Scoped, Filtered, and Date-Bounded)
        # Use verified submission / outcome events when checking historical stages
        app_stmt = (
            select(
                ApplicationModel.workflow_state,
                ApplicationModel.outcome_status,
                func.count(ApplicationModel.id),
            )
            .where(ApplicationModel.user_id == user_id)
        )
        if start_date:
            app_stmt = app_stmt.where(ApplicationModel.created_at >= start_date)
        if end_date:
            app_stmt = app_stmt.where(ApplicationModel.created_at <= end_date)
        if platform:
            app_stmt = app_stmt.join(JobModel, ApplicationModel.job_id == JobModel.id).join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        app_stmt = app_stmt.group_by(ApplicationModel.workflow_state, ApplicationModel.outcome_status)
        app_results = (await self.session.execute(app_stmt)).all()

        total_applied = 0
        total_successful = 0
        total_rejected = 0

        for wf_state, outcome, count in app_results:
            total_applied += count
            # Successful application requires confirmed submission or positive outcome
            if wf_state == "APPLIED" or outcome in ["SUBMITTED", "RESPONDED", "INTERVIEWING", "OFFERED"]:
                total_successful += count
            if wf_state == "REJECTED" or outcome == "REJECTED":
                total_rejected += count

        total_triggered = total_applied
        total_submitted = total_successful

        # 4. Accurate Historical CRM Outcomes Query (via verified ApplicationEventModel or timestamp bounds)
        # Interviewed count
        interview_evt_stmt = (
            select(func.count(distinct(ApplicationModel.id)))
            .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
            .where(
                ApplicationModel.user_id == user_id,
                or_(
                    ApplicationEventModel.event_name.in_(["OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED"]),
                    ApplicationModel.outcome_status.in_(["INTERVIEWING", "OFFERED"]),
                ),
            )
        )
        if start_date:
            interview_evt_stmt = interview_evt_stmt.where(
                or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
            )
        if end_date:
            interview_evt_stmt = interview_evt_stmt.where(
                or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
            )
        if platform:
            interview_evt_stmt = interview_evt_stmt.join(JobModel, ApplicationModel.job_id == JobModel.id).join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        total_interviewed = (await self.session.scalar(interview_evt_stmt)) or 0

        # Offered count
        offer_evt_stmt = (
            select(func.count(distinct(ApplicationModel.id)))
            .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
            .where(
                ApplicationModel.user_id == user_id,
                or_(
                    ApplicationEventModel.event_name.in_(["OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ApplicationModel.outcome_status == "OFFERED",
                ),
            )
        )
        if start_date:
            offer_evt_stmt = offer_evt_stmt.where(
                or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
            )
        if end_date:
            offer_evt_stmt = offer_evt_stmt.where(
                or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
            )
        if platform:
            offer_evt_stmt = offer_evt_stmt.join(JobModel, ApplicationModel.job_id == JobModel.id).join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        total_offered = (await self.session.scalar(offer_evt_stmt)) or 0

        # Employer Responses count
        response_evt_stmt = (
            select(func.count(distinct(ApplicationModel.id)))
            .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
            .where(
                ApplicationModel.user_id == user_id,
                or_(
                    ApplicationModel.outcome_status.in_(["RESPONDED", "INTERVIEWING", "OFFERED"]),
                    ApplicationEventModel.event_name.in_(
                        ["OUTCOME_RESPONDED", "EMPLOYER_RESPONSE", "OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED", "OUTCOME_OFFERED", "OFFER_RECEIVED"]
                    ),
                ),
            )
        )
        if start_date:
            response_evt_stmt = response_evt_stmt.where(
                or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
            )
        if end_date:
            response_evt_stmt = response_evt_stmt.where(
                or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
            )
        if platform:
            response_evt_stmt = response_evt_stmt.join(JobModel, ApplicationModel.job_id == JobModel.id).join(
                JobSourceModel, JobModel.source_id == JobSourceModel.id
            ).where(JobSourceModel.source_type == platform.lower())

        total_responded = (await self.session.scalar(response_evt_stmt)) or 0
        if total_responded < total_interviewed:
            total_responded = total_interviewed

        # Explicit Rates (Guarded against ZeroDivisionError and skew)
        match_rate_pct = round((total_matched / total_discovered) * 100, 1) if total_discovered > 0 else 0.0
        trigger_rate_pct = round((total_triggered / total_matched) * 100, 1) if total_matched > 0 else 0.0
        submission_rate_pct = round((total_submitted / total_triggered) * 100, 1) if total_triggered > 0 else 0.0
        response_rate_pct = round((total_responded / total_submitted) * 100, 1) if total_submitted > 0 else 0.0
        interview_rate_pct = round((total_interviewed / total_submitted) * 100, 1) if total_submitted > 0 else 0.0
        offer_rate_pct = round((total_offered / total_submitted) * 100, 1) if total_submitted > 0 else 0.0

        # Exact 7 Stages
        stages = [
            FunnelStageMetric(
                stage_name="Discovered",
                count=total_discovered,
                conversion_rate_pct=100.0,
            ),
            FunnelStageMetric(
                stage_name="AI Matched",
                count=total_matched,
                conversion_rate_pct=match_rate_pct,
            ),
            FunnelStageMetric(
                stage_name="Applications Triggered",
                count=total_triggered,
                conversion_rate_pct=trigger_rate_pct,
            ),
            FunnelStageMetric(
                stage_name="Confirmed Submissions",
                count=total_submitted,
                conversion_rate_pct=submission_rate_pct,
            ),
            FunnelStageMetric(
                stage_name="Employer Responses",
                count=total_responded,
                conversion_rate_pct=response_rate_pct,
            ),
            FunnelStageMetric(
                stage_name="Interviews",
                count=total_interviewed,
                conversion_rate_pct=interview_rate_pct,
            ),
            FunnelStageMetric(
                stage_name="Offers",
                count=total_offered,
                conversion_rate_pct=offer_rate_pct,
            ),
        ]

        return FunnelOverview(
            total_discovered=total_discovered,
            total_matched=total_matched,
            total_triggered=total_triggered,
            total_submitted=total_submitted,
            total_responded=total_responded,
            total_interviewed=total_interviewed,
            total_offered=total_offered,
            total_rejected=total_rejected,
            match_rate_pct=match_rate_pct,
            trigger_rate_pct=trigger_rate_pct,
            submission_rate_pct=submission_rate_pct,
            response_rate_pct=response_rate_pct,
            interview_rate_pct=interview_rate_pct,
            offer_rate_pct=offer_rate_pct,
            total_applied=total_submitted,
            stages=stages,
        )

    async def get_resume_performance(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[ResumePerformanceMetric]:
        resumes_stmt = select(ResumeModel).where(ResumeModel.user_id == user_id)
        resumes = (await self.session.scalars(resumes_stmt)).all()

        metrics: List[ResumePerformanceMetric] = []
        for r in resumes:
            apps_query = select(func.count(ApplicationModel.id)).where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.resume_id == r.id,
            )
            success_query = select(func.count(ApplicationModel.id)).where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.resume_id == r.id,
                or_(
                    ApplicationModel.workflow_state == "APPLIED",
                    ApplicationModel.outcome_status.in_(["SUBMITTED", "RESPONDED", "INTERVIEWING", "OFFERED"]),
                ),
            )
            response_query = (
                select(func.count(distinct(ApplicationModel.id)))
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.resume_id == r.id,
                    or_(
                        ApplicationModel.outcome_status.in_(["RESPONDED", "INTERVIEWING", "OFFERED"]),
                        ApplicationEventModel.event_name.in_(["OUTCOME_RESPONDED", "EMPLOYER_RESPONSE", "OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED", "OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )
            interview_query = (
                select(func.count(distinct(ApplicationModel.id)))
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.resume_id == r.id,
                    or_(
                        ApplicationModel.outcome_status.in_(["INTERVIEWING", "OFFERED"]),
                        ApplicationEventModel.event_name.in_(["OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED", "OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )
            offer_query = (
                select(func.count(distinct(ApplicationModel.id)))
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.resume_id == r.id,
                    or_(
                        ApplicationModel.outcome_status == "OFFERED",
                        ApplicationEventModel.event_name.in_(["OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )

            if start_date:
                apps_query = apps_query.where(ApplicationModel.created_at >= start_date)
                success_query = success_query.where(ApplicationModel.created_at >= start_date)
                response_query = response_query.where(
                    or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
                )
                interview_query = interview_query.where(
                    or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
                )
                offer_query = offer_query.where(
                    or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date)
                )
            if end_date:
                apps_query = apps_query.where(ApplicationModel.created_at <= end_date)
                success_query = success_query.where(ApplicationModel.created_at <= end_date)
                response_query = response_query.where(
                    or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
                )
                interview_query = interview_query.where(
                    or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
                )
                offer_query = offer_query.where(
                    or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date)
                )

            apps_count = (await self.session.scalar(apps_query)) or 0
            submitted_count = (await self.session.scalar(success_query)) or 0
            response_count = (await self.session.scalar(response_query)) or 0
            interview_count = (await self.session.scalar(interview_query)) or 0
            offer_count = (await self.session.scalar(offer_query)) or 0

            response_rate = round((response_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0
            interview_rate = round((interview_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0
            offer_rate = round((offer_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0

            metrics.append(
                ResumePerformanceMetric(
                    resume_id=r.id,
                    label=r.label,
                    target_role=r.target_role,
                    applications_count=submitted_count if submitted_count > 0 else apps_count,
                    response_count=response_count,
                    interview_count=interview_count,
                    offer_count=offer_count,
                    response_rate_pct=response_rate,
                    interview_rate_pct=interview_rate,
                    offer_rate_pct=offer_rate,
                    conversion_rate_pct=interview_rate,
                )
            )

        return metrics

    async def get_source_performance(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[SourcePerformanceMetric]:
        sources_stmt = select(JobSourceModel)
        all_sources = (await self.session.scalars(sources_stmt)).all()

        metrics: List[SourcePerformanceMetric] = []
        for src in all_sources:
            match_q = (
                select(MatchResultModel.job_id)
                .join(JobModel, MatchResultModel.job_id == JobModel.id)
                .where(MatchResultModel.user_id == user_id, JobModel.source_id == src.id)
            )
            app_q = (
                select(ApplicationModel.job_id)
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .where(ApplicationModel.user_id == user_id, JobModel.source_id == src.id)
            )
            camp_q = (
                select(CampaignJobItemModel.job_id)
                .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
                .join(JobModel, CampaignJobItemModel.job_id == JobModel.id)
                .where(CampaignExecutionModel.user_id == user_id, JobModel.source_id == src.id)
            )

            if start_date:
                match_q = match_q.where(MatchResultModel.created_at >= start_date)
                app_q = app_q.where(ApplicationModel.created_at >= start_date)
                camp_q = camp_q.where(CampaignJobItemModel.processed_at >= start_date)
            if end_date:
                match_q = match_q.where(MatchResultModel.created_at <= end_date)
                app_q = app_q.where(ApplicationModel.created_at <= end_date)
                camp_q = camp_q.where(CampaignJobItemModel.processed_at <= end_date)

            union_sq = union(match_q, app_q, camp_q).subquery()
            disc_stmt = select(func.count(distinct(union_sq.c.job_id))).select_from(union_sq)
            disc_count = (await self.session.scalar(disc_stmt)) or 0

            # Matched count
            matched_stmt = (
                select(func.count(distinct(MatchResultModel.job_id)))
                .join(JobModel, MatchResultModel.job_id == JobModel.id)
                .where(MatchResultModel.user_id == user_id, JobModel.source_id == src.id)
            )
            if start_date:
                matched_stmt = matched_stmt.where(MatchResultModel.created_at >= start_date)
            if end_date:
                matched_stmt = matched_stmt.where(MatchResultModel.created_at <= end_date)
            matched_count = (await self.session.scalar(matched_stmt)) or 0

            # Triggered count
            triggered_stmt = (
                select(func.count(ApplicationModel.id))
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .where(ApplicationModel.user_id == user_id, JobModel.source_id == src.id)
            )
            if start_date:
                triggered_stmt = triggered_stmt.where(ApplicationModel.created_at >= start_date)
            if end_date:
                triggered_stmt = triggered_stmt.where(ApplicationModel.created_at <= end_date)
            triggered_count = (await self.session.scalar(triggered_stmt)) or 0

            # Submitted count
            submitted_stmt = (
                select(func.count(ApplicationModel.id))
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .where(
                    ApplicationModel.user_id == user_id,
                    JobModel.source_id == src.id,
                    or_(
                        ApplicationModel.workflow_state == "APPLIED",
                        ApplicationModel.outcome_status.in_(["SUBMITTED", "RESPONDED", "INTERVIEWING", "OFFERED"]),
                    ),
                )
            )
            if start_date:
                submitted_stmt = submitted_stmt.where(ApplicationModel.created_at >= start_date)
            if end_date:
                submitted_stmt = submitted_stmt.where(ApplicationModel.created_at <= end_date)
            submitted_count = (await self.session.scalar(submitted_stmt)) or 0

            # Responses count
            resp_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    JobModel.source_id == src.id,
                    or_(
                        ApplicationModel.outcome_status.in_(["RESPONDED", "INTERVIEWING", "OFFERED"]),
                        ApplicationEventModel.event_name.in_(["OUTCOME_RESPONDED", "EMPLOYER_RESPONSE", "OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED", "OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )
            if start_date:
                resp_stmt = resp_stmt.where(or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date))
            if end_date:
                resp_stmt = resp_stmt.where(or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date))
            resp_count = (await self.session.scalar(resp_stmt)) or 0

            # Interview count
            int_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    JobModel.source_id == src.id,
                    or_(
                        ApplicationModel.outcome_status.in_(["INTERVIEWING", "OFFERED"]),
                        ApplicationEventModel.event_name.in_(["OUTCOME_INTERVIEWING", "INTERVIEW_SCHEDULED", "OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )
            if start_date:
                int_stmt = int_stmt.where(or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date))
            if end_date:
                int_stmt = int_stmt.where(or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date))
            int_count = (await self.session.scalar(int_stmt)) or 0

            # Offer count
            off_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .join(JobModel, ApplicationModel.job_id == JobModel.id)
                .outerjoin(ApplicationEventModel, ApplicationModel.id == ApplicationEventModel.application_id)
                .where(
                    ApplicationModel.user_id == user_id,
                    JobModel.source_id == src.id,
                    or_(
                        ApplicationModel.outcome_status == "OFFERED",
                        ApplicationEventModel.event_name.in_(["OUTCOME_OFFERED", "OFFER_RECEIVED"]),
                    ),
                )
            )
            if start_date:
                off_stmt = off_stmt.where(or_(ApplicationEventModel.created_at >= start_date, ApplicationModel.updated_at >= start_date))
            if end_date:
                off_stmt = off_stmt.where(or_(ApplicationEventModel.created_at <= end_date, ApplicationModel.updated_at <= end_date))
            off_count = (await self.session.scalar(off_stmt)) or 0

            resp_rate = round((resp_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0
            int_rate = round((int_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0
            off_rate = round((off_count / submitted_count) * 100, 1) if submitted_count > 0 else 0.0

            metrics.append(
                SourcePerformanceMetric(
                    source_id=src.id,
                    source_type=src.source_type or "naukri",
                    discovered_count=disc_count,
                    matched_count=matched_count,
                    triggered_count=triggered_count,
                    submitted_count=submitted_count,
                    response_count=resp_count,
                    interview_count=int_count,
                    offer_count=off_count,
                    response_rate_pct=resp_rate,
                    interview_rate_pct=int_rate,
                    offer_rate_pct=off_rate,
                    applied_count=submitted_count,
                    success_rate_pct=resp_rate,
                )
            )

        return metrics

    async def get_campaign_performance(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[CampaignPerformanceMetric]:
        campaigns_stmt = select(CampaignModel).where(CampaignModel.user_id == user_id)
        campaigns = (await self.session.scalars(campaigns_stmt)).all()

        metrics: List[CampaignPerformanceMetric] = []
        for camp in campaigns:
            disc_stmt = (
                select(func.count(distinct(CampaignJobItemModel.job_id)))
                .join(CampaignJobItemModel.execution)
                .where(
                    CampaignJobItemModel.execution.has(user_id=user_id, campaign_id=camp.id)
                )
            )
            if start_date:
                disc_stmt = disc_stmt.where(CampaignJobItemModel.processed_at >= start_date)
            if end_date:
                disc_stmt = disc_stmt.where(CampaignJobItemModel.processed_at <= end_date)

            disc_count = (await self.session.scalar(disc_stmt)) or 0

            # Matched items
            matched_stmt = (
                select(func.count(distinct(CampaignJobItemModel.job_id)))
                .join(CampaignJobItemModel.execution)
                .where(
                    CampaignJobItemModel.execution.has(user_id=user_id, campaign_id=camp.id),
                    CampaignJobItemModel.match_score >= 70.0,
                )
            )
            if start_date:
                matched_stmt = matched_stmt.where(CampaignJobItemModel.processed_at >= start_date)
            if end_date:
                matched_stmt = matched_stmt.where(CampaignJobItemModel.processed_at <= end_date)
            matched_count = (await self.session.scalar(matched_stmt)) or 0

            # Triggered count
            triggered_stmt = (
                select(func.count(distinct(CampaignJobItemModel.job_id)))
                .join(CampaignJobItemModel.execution)
                .where(
                    CampaignJobItemModel.execution.has(user_id=user_id, campaign_id=camp.id),
                    CampaignJobItemModel.decision.in_(["AUTO_APPLY", "QUEUED"]),
                )
            )
            if start_date:
                triggered_stmt = triggered_stmt.where(CampaignJobItemModel.processed_at >= start_date)
            if end_date:
                triggered_stmt = triggered_stmt.where(CampaignJobItemModel.processed_at <= end_date)
            triggered_count = (await self.session.scalar(triggered_stmt)) or 0

            # Submitted count
            applied_stmt = (
                select(func.count(distinct(CampaignJobItemModel.job_id)))
                .join(CampaignJobItemModel.execution)
                .where(
                    CampaignJobItemModel.execution.has(user_id=user_id, campaign_id=camp.id),
                    CampaignJobItemModel.queue_status == "COMPLETED",
                )
            )
            if start_date:
                applied_stmt = applied_stmt.where(CampaignJobItemModel.processed_at >= start_date)
            if end_date:
                applied_stmt = applied_stmt.where(CampaignJobItemModel.processed_at <= end_date)

            app_count = (await self.session.scalar(applied_stmt)) or 0

            # Responses, interviews, offers tied to jobs in this campaign
            camp_job_ids_subq = (
                select(CampaignJobItemModel.job_id)
                .join(CampaignJobItemModel.execution)
                .where(CampaignJobItemModel.execution.has(user_id=user_id, campaign_id=camp.id))
            )
            resp_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.job_id.in_(camp_job_ids_subq),
                    ApplicationModel.outcome_status.in_(["RESPONDED", "INTERVIEWING", "OFFERED"]),
                )
            )
            int_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.job_id.in_(camp_job_ids_subq),
                    ApplicationModel.outcome_status.in_(["INTERVIEWING", "OFFERED"]),
                )
            )
            off_stmt = (
                select(func.count(distinct(ApplicationModel.id)))
                .where(
                    ApplicationModel.user_id == user_id,
                    ApplicationModel.job_id.in_(camp_job_ids_subq),
                    ApplicationModel.outcome_status == "OFFERED",
                )
            )
            if start_date:
                resp_stmt = resp_stmt.where(ApplicationModel.created_at >= start_date)
                int_stmt = int_stmt.where(ApplicationModel.created_at >= start_date)
                off_stmt = off_stmt.where(ApplicationModel.created_at >= start_date)
            if end_date:
                resp_stmt = resp_stmt.where(ApplicationModel.created_at <= end_date)
                int_stmt = int_stmt.where(ApplicationModel.created_at <= end_date)
                off_stmt = off_stmt.where(ApplicationModel.created_at <= end_date)

            resp_count = (await self.session.scalar(resp_stmt)) or 0
            int_count = (await self.session.scalar(int_stmt)) or 0
            off_count = (await self.session.scalar(off_stmt)) or 0

            resp_rate = round((resp_count / app_count) * 100, 1) if app_count > 0 else 0.0
            int_rate = round((int_count / app_count) * 100, 1) if app_count > 0 else 0.0
            off_rate = round((off_count / app_count) * 100, 1) if app_count > 0 else 0.0

            metrics.append(
                CampaignPerformanceMetric(
                    campaign_id=camp.id,
                    campaign_name=camp.name,
                    state=camp.state,
                    discovered_count=disc_count,
                    matched_count=matched_count,
                    triggered_count=triggered_count if triggered_count > 0 else app_count,
                    submitted_count=app_count,
                    response_count=resp_count,
                    interview_count=int_count,
                    offer_count=off_count,
                    response_rate_pct=resp_rate,
                    interview_rate_pct=int_rate,
                    offer_rate_pct=off_rate,
                    applied_count=app_count,
                    success_rate_pct=resp_rate,
                )
            )

        return metrics

    async def get_skill_insights(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[SkillDemandInsight]:
        matches_stmt = select(MatchResultModel).where(MatchResultModel.user_id == user_id)
        if start_date:
            matches_stmt = matches_stmt.where(MatchResultModel.created_at >= start_date)
        if end_date:
            matches_stmt = matches_stmt.where(MatchResultModel.created_at <= end_date)

        matches_stmt = matches_stmt.limit(100)
        matches = (await self.session.scalars(matches_stmt)).all()

        matched_counter: Counter[str] = Counter()
        missing_counter: Counter[str] = Counter()

        for m in matches:
            if m.matched_skills:
                matched_counter.update([s.lower().strip() for s in m.matched_skills])
            if m.missing_skills:
                missing_counter.update([s.lower().strip() for s in m.missing_skills])

        all_skills = set(matched_counter.keys()).union(set(missing_counter.keys()))
        insights: List[SkillDemandInsight] = []

        for skill in sorted(all_skills):
            m_cnt = matched_counter[skill]
            miss_cnt = missing_counter[skill]
            demand_score = round((m_cnt * 1.0 + miss_cnt * 1.5) / max(len(matches), 1) * 10, 1)

            insights.append(
                SkillDemandInsight(
                    skill_name=skill.title(),
                    matched_frequency=m_cnt,
                    missing_frequency=miss_cnt,
                    market_demand_score=min(demand_score, 10.0),
                )
            )

        # Sort by highest market demand
        insights.sort(key=lambda x: (x.matched_frequency + x.missing_frequency), reverse=True)
        return insights[:15]

    async def get_weight_tuning_recommendations(self, user_id: str) -> WeightTuningRecommendation:
        # Analyzes match scores vs applied outcomes to suggest optimal weights
        avg_skill_score = await self.session.scalar(
            select(func.avg(MatchResultModel.skill_match_score)).where(MatchResultModel.user_id == user_id)
        ) or 75.0

        avg_semantic_score = await self.session.scalar(
            select(func.avg(MatchResultModel.semantic_score)).where(MatchResultModel.user_id == user_id)
        ) or 70.0

        if avg_skill_score > avg_semantic_score:
            rec_skill = 0.45
            rec_semantic = 0.35
            rec_exp = 0.20
            rationale = "Candidate possesses strong structured skill overlap. Increasing skill weight maximizes top-tier ATS screening passes."
        else:
            rec_skill = 0.35
            rec_semantic = 0.45
            rec_exp = 0.20
            rationale = "Candidate profile shows high semantic contextual alignment. Increasing semantic weight surfaces high-relevance cross-functional roles."

        # Check if candidate has explicitly calibrated custom weights
        cur_skill = 0.40
        cur_semantic = 0.40
        cur_exp = 0.20

        saved_weights_stmt = select(SavedAnswerModel).where(
            SavedAnswerModel.user_id == user_id,
            SavedAnswerModel.canonical_intent == "matching_weights",
        )
        saved_weights_model = (await self.session.scalars(saved_weights_stmt)).first()
        if saved_weights_model and saved_weights_model.answer_text:
            try:
                import json
                sw_data = json.loads(saved_weights_model.answer_text)
                cur_skill = float(sw_data.get("skills_weight", cur_skill))
                cur_semantic = float(sw_data.get("semantic_weight", cur_semantic))
                cur_exp = float(sw_data.get("experience_weight", cur_exp))
            except Exception:
                pass

        return WeightTuningRecommendation(
            current_skill_weight=cur_skill,
            current_semantic_weight=cur_semantic,
            current_experience_weight=cur_exp,
            recommended_skill_weight=rec_skill,
            recommended_semantic_weight=rec_semantic,
            recommended_experience_weight=rec_exp,
            confidence_score=0.92,
            rationale=rationale,
        )
