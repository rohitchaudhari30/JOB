import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UserModel(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    sessions = relationship("UserSessionModel", back_populates="user", cascade="all, delete-orphan")
    profile = relationship("CandidateProfileModel", back_populates="user", uselist=False, cascade="all, delete-orphan")
    resumes = relationship("ResumeModel", back_populates="user", cascade="all, delete-orphan")
    saved_answers = relationship("SavedAnswerModel", back_populates="user", cascade="all, delete-orphan")
    browser_sessions = relationship("BrowserSessionModel", back_populates="user", cascade="all, delete-orphan")
    platform_connections = relationship("PlatformConnectionModel", back_populates="user", cascade="all, delete-orphan")
    applications = relationship("ApplicationModel", back_populates="user", cascade="all, delete-orphan")
    match_results = relationship("MatchResultModel", back_populates="user", cascade="all, delete-orphan")


class UserSessionModel(Base):
    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    jwt_token_hash = Column(String(255), nullable=False, index=True)
    user_agent = Column(String(512), nullable=True)
    ip_address = Column(String(64), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("UserModel", back_populates="sessions")


class CandidateProfileModel(Base):
    __tablename__ = "candidate_profiles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    headline = Column(String(255), nullable=True)
    summary = Column(Text, nullable=True)
    phone = Column(String(64), nullable=True)
    location = Column(String(255), nullable=True)
    current_ctc = Column(Float, nullable=True)
    expected_ctc = Column(Float, nullable=True)
    currency = Column(String(10), default="INR", nullable=False)
    notice_period_days = Column(Integer, default=30, nullable=False)
    total_experience_months = Column(Integer, default=0, nullable=False)
    work_authorization = Column(String(128), nullable=True)
    relocation_preference = Column(Boolean, default=True, nullable=False)
    remote_preference = Column(String(32), default="any", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("UserModel", back_populates="profile")
    experiences = relationship("ExperienceModel", back_populates="profile", cascade="all, delete-orphan")
    educations = relationship("EducationModel", back_populates="profile", cascade="all, delete-orphan")
    skills = relationship("CandidateSkillModel", back_populates="profile", cascade="all, delete-orphan")


class ExperienceModel(Base):
    __tablename__ = "experiences"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    profile_id = Column(String(36), ForeignKey("candidate_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    company_name = Column(String(255), nullable=False)
    title = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(Boolean, default=False, nullable=False)
    description = Column(Text, nullable=True)

    profile = relationship("CandidateProfileModel", back_populates="experiences")


class EducationModel(Base):
    __tablename__ = "educations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    profile_id = Column(String(36), ForeignKey("candidate_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    institution = Column(String(255), nullable=False)
    degree = Column(String(255), nullable=False)
    field_of_study = Column(String(255), nullable=True)
    start_year = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    grade = Column(String(64), nullable=True)

    profile = relationship("CandidateProfileModel", back_populates="educations")


class CandidateSkillModel(Base):
    __tablename__ = "candidate_skills"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    profile_id = Column(String(36), ForeignKey("candidate_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_name = Column(String(128), nullable=False, index=True)
    years_experience = Column(Float, default=0.0, nullable=False)
    is_primary = Column(Boolean, default=False, nullable=False)

    profile = relationship("CandidateProfileModel", back_populates="skills")


class ResumeModel(Base):
    __tablename__ = "resumes"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(255), nullable=False)
    target_role = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(64), default="application/pdf", nullable=False)
    raw_text = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("UserModel", back_populates="resumes")


class SavedAnswerModel(Base):
    __tablename__ = "saved_answers"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    canonical_intent = Column(String(128), nullable=False, index=True)
    question_pattern = Column(String(512), nullable=False)
    answer_text = Column(Text, nullable=False)
    is_verified = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("UserModel", back_populates="saved_answers")


class JobSourceModel(Base):
    __tablename__ = "job_sources"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_type = Column(String(64), unique=True, nullable=False, index=True)  # 'naukri', 'linkedin'
    base_url = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    rate_limit_per_min = Column(Integer, default=20, nullable=False)

    jobs = relationship("JobModel", back_populates="source")
    browser_sessions = relationship("BrowserSessionModel", back_populates="source")


class JobModel(Base):
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    source_id = Column(String(36), ForeignKey("job_sources.id"), nullable=False, index=True)
    external_job_id = Column(String(255), nullable=False, index=True)
    title = Column(String(255), nullable=False, index=True)
    company = Column(String(255), nullable=False, index=True)
    location = Column(String(255), nullable=False, index=True)
    min_experience_years = Column(Float, default=0.0, nullable=False)
    max_experience_years = Column(Float, default=0.0, nullable=False)
    min_salary = Column(Float, nullable=True)
    max_salary = Column(Float, nullable=True)
    salary_currency = Column(String(10), default="INR", nullable=False)
    employment_type = Column(String(64), default="Full-time", nullable=False)
    apply_url = Column(Text, nullable=False)
    raw_description = Column(Text, nullable=False)
    parsed_requirements = Column(JSON, default=dict, nullable=False)
    embedding = Column(JSON, nullable=True)  # JSON in SQLite / Vector(1536) in PostgreSQL
    is_active = Column(Boolean, default=True, nullable=False)
    posted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    first_seen_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    last_seen_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    raw_posted_text = Column(String(128), nullable=True)
    posted_at_precision = Column(String(32), default="UNKNOWN", nullable=False)
    posted_at_source = Column(String(64), nullable=True)
    freshness_bucket = Column(String(32), default="UNKNOWN", nullable=False, index=True)
    freshness_score = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("source_id", "external_job_id", name="uq_source_external_job"),
    )

    source = relationship("JobSourceModel", back_populates="jobs")
    match_results = relationship("MatchResultModel", back_populates="job")
    applications = relationship("ApplicationModel", back_populates="job")


class MatchResultModel(Base):
    __tablename__ = "match_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    resume_id = Column(String(36), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)
    overall_score = Column(Float, default=0.0, nullable=False)
    hard_filter_passed = Column(Boolean, default=True, nullable=False)
    skill_match_score = Column(Float, default=0.0, nullable=False)
    semantic_score = Column(Float, default=0.0, nullable=False)
    reasoning_summary = Column(Text, default="", nullable=False)
    matched_skills = Column(JSON, default=list, nullable=False)
    missing_skills = Column(JSON, default=list, nullable=False)
    decision = Column(String(32), default="REQUIRE_APPROVAL", nullable=False)
    ai_provider_used = Column(String(32), default="groq", nullable=False)
    scoring_version = Column(String(16), default="v1", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_user_job_match"),
    )

    user = relationship("UserModel", back_populates="match_results")
    job = relationship("JobModel", back_populates="match_results")


class PlatformConnectionModel(Base):
    __tablename__ = "platform_connections"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(64), nullable=False, index=True)  # 'naukri', 'linkedin', 'greenhouse', etc.
    connection_type = Column(String(32), default="BROWSER_SESSION", nullable=False)
    status = Column(String(32), default="NOT_CONNECTED", nullable=False, index=True)
    external_account_reference = Column(String(255), nullable=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "platform", name="uq_user_platform_connection"),
    )

    user = relationship("UserModel", back_populates="platform_connections")
    session = relationship("BrowserSessionModel", back_populates="connection", uselist=False, cascade="all, delete-orphan")


class BrowserSessionModel(Base):
    __tablename__ = "browser_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    connection_id = Column(String(36), ForeignKey("platform_connections.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String(36), ForeignKey("job_sources.id"), nullable=True, index=True)
    encrypted_storage_state = Column(Text, nullable=False)  # AES-256-GCM
    status = Column(String(32), default="ACTIVE", nullable=False)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_health_check_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("UserModel", back_populates="browser_sessions")
    source = relationship("JobSourceModel", back_populates="browser_sessions")
    connection = relationship("PlatformConnectionModel", back_populates="session")


class ApplicationModel(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(String(36), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    resume_id = Column(String(36), ForeignKey("resumes.id", ondelete="SET NULL"), nullable=True)
    idempotency_key = Column(String(255), unique=True, nullable=False, index=True)
    workflow_state = Column(String(32), default="DISCOVERED", nullable=False, index=True)
    applied_at = Column(DateTime(timezone=True), nullable=True)
    failure_reason = Column(Text, nullable=True)
    trace_file_path = Column(String(512), nullable=True)
    screenshot_file_path = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_user_job_application"),
    )

    user = relationship("UserModel", back_populates="applications")
    job = relationship("JobModel", back_populates="applications")
    questions = relationship("ApplicationQuestionModel", back_populates="application", cascade="all, delete-orphan")
    events = relationship("ApplicationEventModel", back_populates="application", cascade="all, delete-orphan")


class ApplicationQuestionModel(Base):
    __tablename__ = "application_questions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    canonical_intent = Column(String(128), nullable=True)
    answer_provided = Column(Text, nullable=True)
    answered_by = Column(String(32), default="SAVED_ANSWER", nullable=False)
    confidence_score = Column(Float, default=1.0, nullable=False)

    application = relationship("ApplicationModel", back_populates="questions")


class ApplicationEventModel(Base):
    __tablename__ = "application_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    application_id = Column(String(36), ForeignKey("applications.id", ondelete="CASCADE"), nullable=False, index=True)
    event_name = Column(String(64), nullable=False)
    payload = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    application = relationship("ApplicationModel", back_populates="events")


class AIRequestModel(Base):
    __tablename__ = "ai_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    provider = Column(String(32), nullable=False)  # 'groq', 'gemini'
    model_name = Column(String(64), nullable=False)
    operation = Column(String(64), nullable=False)
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)
    latency_ms = Column(Integer, default=0, nullable=False)
    estimated_cost_usd = Column(Float, default=0.0, nullable=False)
    is_success = Column(Boolean, default=True, nullable=False)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
