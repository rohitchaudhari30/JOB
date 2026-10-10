from datetime import datetime, time, timezone
from typing import List, Optional
import zoneinfo
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.domain.dashboard.entities import (
    ActiveRunStatus,
    AttentionItem,
    DashboardOverview,
    ReadinessItem,
    TopRecommendedJob,
)
from app.infrastructure.database.models import (
    ApplicationModel,
    AutomationRunModel,
    CampaignExecutionModel,
    CampaignModel,
    CampaignRuleModel,
    CampaignSafetyPolicyModel,
    CandidateProfileModel,
    CandidateSkillModel,
    JobModel,
    JobSourceModel,
    MatchResultModel,
    PlatformConnectionModel,
    ResumeModel,
)


class DashboardService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_overview(
        self,
        user_id: str,
        client_tz: Optional[str] = None,
    ) -> DashboardOverview:
        # 1. Resolve Timezone-Aware "Today" Boundaries in User's Local Timezone
        # Defaults to 'Asia/Kolkata' or 'UTC' if client_tz not specified or invalid
        resolved_tz = timezone.utc
        if client_tz:
            try:
                resolved_tz = zoneinfo.ZoneInfo(client_tz)
            except Exception:
                try:
                    resolved_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
                except Exception:
                    resolved_tz = timezone.utc
        else:
            try:
                resolved_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
            except Exception:
                resolved_tz = timezone.utc

        now_local = datetime.now(resolved_tz)
        local_midnight_today = datetime.combine(now_local.date(), time.min, tzinfo=resolved_tz)
        local_midnight_tomorrow = datetime.combine(now_local.date(), time.max, tzinfo=resolved_tz)

        # Convert local boundaries to UTC for database queries
        today_start_utc = local_midnight_today.astimezone(timezone.utc)
        today_end_utc = local_midnight_tomorrow.astimezone(timezone.utc)

        # Calculate Today's Confirmed Applied Count
        today_applied_stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state == "APPLIED",
            ApplicationModel.applied_at >= today_start_utc,
            ApplicationModel.applied_at <= today_end_utc,
        )
        today_applied_count = (await self.session.scalar(today_applied_stmt)) or 0

        # 2. Dynamic Effective Daily Limit:
        # MIN(Campaign Safety Limit, Platform Cap, Global Account Safe Ceiling)
        account_ceiling = settings.GLOBAL_ACCOUNT_SAFE_CEILING  # Configured in settings (e.g. 50 or 25)

        # Fetch campaign safety limits for user's campaigns
        policies_stmt = (
            select(CampaignSafetyPolicyModel.daily_application_limit)
            .join(CampaignModel, CampaignSafetyPolicyModel.campaign_id == CampaignModel.id)
            .where(CampaignModel.user_id == user_id)
        )
        campaign_limits = (await self.session.scalars(policies_stmt)).all()

        # Fetch platform caps for candidate's target platforms
        # Each source catalog has its rate/volume characteristics
        source_limits_stmt = select(JobSourceModel.rate_limit_per_min)
        platform_caps = (await self.session.scalars(source_limits_stmt)).all()
        # Daily platform cap derived from settings or active sources
        applicable_platform_cap = settings.PLATFORM_DAILY_CAP_DEFAULT

        limits_to_evaluate = [account_ceiling, applicable_platform_cap]
        if campaign_limits:
            limits_to_evaluate.append(min(campaign_limits))

        effective_daily_limit = min(limits_to_evaluate)
        quota_remaining = max(0, effective_daily_limit - today_applied_count)
        quota_pct = round((today_applied_count / max(effective_daily_limit, 1)) * 100, 1)

        # 3. Live Run / Automation Status
        active_run = ActiveRunStatus()

        # Check CampaignExecutionModel first
        exec_stmt = (
            select(CampaignExecutionModel)
            .join(CampaignModel, CampaignExecutionModel.campaign_id == CampaignModel.id)
            .where(
                CampaignExecutionModel.user_id == user_id,
                CampaignExecutionModel.status.in_(["RUNNING", "PAUSED"]),
            )
            .options(selectinload(CampaignExecutionModel.campaign))
            .order_by(CampaignExecutionModel.started_at.desc())
        )
        active_exec = (await self.session.scalars(exec_stmt)).first()

        if active_exec:
            total_target = max(1, active_exec.discovered_count or 10)
            progress = round(((active_exec.submitted_count or 0) / total_target) * 100, 1)
            active_run = ActiveRunStatus(
                is_running=active_exec.status == "RUNNING",
                run_id=active_exec.id,
                campaign_id=active_exec.campaign_id,
                campaign_name=active_exec.campaign.name if active_exec.campaign else "Active Campaign",
                status=active_exec.status,
                current_job_title=None,
                current_platform="Naukri",
                progress_percentage=min(progress, 100.0),
            )
        else:
            # Check AutomationRunModel
            run_stmt = (
                select(AutomationRunModel)
                .where(
                    AutomationRunModel.user_id == user_id,
                    AutomationRunModel.status.in_(["RUNNING", "PAUSED"]),
                )
                .order_by(AutomationRunModel.started_at.desc())
            )
            active_auto_run = (await self.session.scalars(run_stmt)).first()
            if active_auto_run:
                total_target = max(1, active_auto_run.target_count)
                progress = round((active_auto_run.applied_count / total_target) * 100, 1)
                active_run = ActiveRunStatus(
                    is_running=active_auto_run.status == "RUNNING",
                    run_id=active_auto_run.id,
                    campaign_id=None,
                    campaign_name="Quick Run",
                    status=active_auto_run.status,
                    current_job_title=active_auto_run.current_job_title,
                    current_platform=active_auto_run.source_type.capitalize() if active_auto_run.source_type else "Naukri",
                    progress_percentage=min(progress, 100.0),
                )

        # 4. Action Blockers & Human-in-the-Loop Alerts (Needs Attention)
        needs_attention: List[AttentionItem] = []

        # Check Paused / Blocked Applications
        blocker_states = [
            "PAUSED_OTP",
            "PAUSED_CAPTCHA",
            "PAUSED_USER_INPUT",
            "PAUSED_AUTH_EXPIRED",
            "APPROVAL_REQUIRED",
        ]
        blocked_apps_stmt = (
            select(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.workflow_state.in_(blocker_states),
            )
            .options(selectinload(ApplicationModel.job))
            .limit(5)
        )
        blocked_apps = (await self.session.scalars(blocked_apps_stmt)).all()

        for b_app in blocked_apps:
            title_text = b_app.job.title if b_app.job else "Application"
            comp_text = b_app.job.company if b_app.job else "Target Company"

            if b_app.workflow_state == "PAUSED_OTP":
                needs_attention.append(
                    AttentionItem(
                        id=f"otp_{b_app.id}",
                        type="OTP_REQUIRED",
                        title=f"OTP Verification Required: {comp_text}",
                        description=f"Job application for '{title_text}' is paused waiting for OTP input.",
                        action_label="Solve OTP",
                        action_url="/applications",
                        severity="CRITICAL",
                    )
                )
            elif b_app.workflow_state == "PAUSED_CAPTCHA":
                needs_attention.append(
                    AttentionItem(
                        id=f"captcha_{b_app.id}",
                        type="CAPTCHA_DETECTED",
                        title=f"CAPTCHA Challenge: {comp_text}",
                        description=f"Interactive CAPTCHA detected for '{title_text}'. Requires manual resolution.",
                        action_label="Solve CAPTCHA",
                        action_url="/applications",
                        severity="CRITICAL",
                    )
                )
            elif b_app.workflow_state == "APPROVAL_REQUIRED":
                needs_attention.append(
                    AttentionItem(
                        id=f"approval_{b_app.id}",
                        type="APPROVAL_PENDING",
                        title=f"Review Pending: {comp_text}",
                        description=f"Application for '{title_text}' requires your review before submission.",
                        action_label="Review & Approve",
                        action_url="/applications",
                        severity="HIGH",
                    )
                )
            elif b_app.workflow_state == "PAUSED_AUTH_EXPIRED":
                needs_attention.append(
                    AttentionItem(
                        id=f"auth_{b_app.id}",
                        type="AUTH_EXPIRED",
                        title=f"Session Expired: {comp_text}",
                        description="Portal authentication expired. Please re-authenticate.",
                        action_label="Reconnect Session",
                        action_url="/settings",
                        severity="HIGH",
                    )
                )

        # Check Platform Connections Health
        conn_stmt = select(PlatformConnectionModel).where(PlatformConnectionModel.user_id == user_id)
        connections = (await self.session.scalars(conn_stmt)).all()

        for conn in connections:
            if conn.status in ["DISCONNECTED", "SESSION_EXPIRED", "ERROR"]:
                needs_attention.append(
                    AttentionItem(
                        id=f"conn_{conn.id}",
                        type="AUTH_EXPIRED",
                        title=f"{conn.platform.capitalize()} Disconnected",
                        description=f"Session state for {conn.platform.capitalize()} is disconnected or expired.",
                        action_label="Reconnect",
                        action_url="/settings",
                        severity="HIGH",
                    )
                )

        # 5. Readiness Checklist (Derived directly from pre-flight rules)
        readiness: List[ReadinessItem] = []

        # (a) Profile completeness
        profile_stmt = (
            select(CandidateProfileModel)
            .where(CandidateProfileModel.user_id == user_id)
            .options(selectinload(CandidateProfileModel.skills))
        )
        profile = (await self.session.scalars(profile_stmt)).first()
        has_profile = profile is not None and bool(profile.headline or profile.summary)
        has_skills = profile is not None and len(profile.skills) > 0

        readiness.append(
            ReadinessItem(
                key="profile",
                title="Profile & Contact Information",
                is_ready=has_profile,
                action_label="Edit Profile" if not has_profile else "Completed",
                action_url="/profile",
            )
        )
        readiness.append(
            ReadinessItem(
                key="skills",
                title="Core & Primary Skills",
                is_ready=has_skills,
                action_label="Add Skills" if not has_skills else "Completed",
                action_url="/profile",
            )
        )

        # (b) Target Resume uploaded
        resume_stmt = select(func.count(ResumeModel.id)).where(ResumeModel.user_id == user_id)
        resume_count = (await self.session.scalar(resume_stmt)) or 0
        readiness.append(
            ReadinessItem(
                key="resume",
                title="Target Resume Uploaded",
                is_ready=resume_count > 0,
                action_label="Upload Resume" if resume_count == 0 else "Completed",
                action_url="/profile",
            )
        )

        # (c) Active platform connected
        active_conn_count = sum(1 for c in connections if c.status == "CONNECTED")
        readiness.append(
            ReadinessItem(
                key="platform",
                title="Job Platform Connected",
                is_ready=active_conn_count > 0,
                action_label="Connect Portal" if active_conn_count == 0 else "Completed",
                action_url="/settings",
            )
        )

        # 6. Top Recommended Actionable Jobs Today
        top_matches_stmt = (
            select(MatchResultModel, JobModel)
            .join(JobModel, MatchResultModel.job_id == JobModel.id)
            .outerjoin(
                ApplicationModel,
                (ApplicationModel.job_id == JobModel.id) & (ApplicationModel.user_id == user_id),
            )
            .where(
                MatchResultModel.user_id == user_id,
                MatchResultModel.hard_filter_passed.is_(True),
                or_(
                    ApplicationModel.id.is_(None),
                    ApplicationModel.workflow_state.notin_(["APPLIED", "REJECTED"]),
                ),
            )
            .order_by(MatchResultModel.overall_score.desc())
            .limit(4)
        )
        match_rows = (await self.session.execute(top_matches_stmt)).all()

        top_matches: List[TopRecommendedJob] = []
        for match_res, job in match_rows:
            platform = "Naukri"
            if job.apply_url:
                if "linkedin" in job.apply_url.lower():
                    platform = "LinkedIn"
                elif "indeed" in job.apply_url.lower():
                    platform = "Indeed"

            top_matches.append(
                TopRecommendedJob(
                    job_id=job.id,
                    title=job.title,
                    company=job.company,
                    location=job.location,
                    platform=platform,
                    match_score=round(match_res.overall_score, 1),
                    apply_url=job.apply_url,
                    decision=match_res.decision,
                )
            )

        return DashboardOverview(
            today_applied_count=today_applied_count,
            effective_daily_limit=effective_daily_limit,
            quota_remaining=quota_remaining,
            quota_percentage=quota_pct,
            active_run=active_run,
            needs_attention=needs_attention,
            readiness=readiness,
            top_matches=top_matches,
        )
