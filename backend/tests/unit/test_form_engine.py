import pytest
from unittest.mock import AsyncMock, MagicMock
from app.domain.profile.entities import CandidateProfile, CandidateSkill, Experience
from app.infrastructure.browser.dom_analyzer import ScannedField, ScannedForm, ScannedOption
from app.infrastructure.browser.form_engine import (
    CanonicalIntent,
    FieldValueResolver,
    FormEngine,
    SemanticIntentClassifier,
)


@pytest.fixture
def sample_profile() -> CandidateProfile:
    return CandidateProfile(
        id="prof_123",
        user_id="user_123",
        headline="Lead Backend Engineer",
        summary="Experienced backend engineer with Python and distributed systems.",
        phone="+919876543210",
        location="Bengaluru, Karnataka, India",
        current_ctc=3000000.0,
        expected_ctc=4000000.0,
        currency="INR",
        notice_period_days=30,
        total_experience_months=78,
        work_authorization="Citizen",
        relocation_preference=True,
        remote_preference="any",
        experiences=[
            Experience(
                id="exp_1",
                profile_id="prof_123",
                company_name="FinTech Global",
                title="Lead Backend Engineer",
            )
        ],
        skills=[
            CandidateSkill(id="s1", profile_id="prof_123", skill_name="Python"),
            CandidateSkill(id="s2", profile_id="prof_123", skill_name="FastAPI"),
        ],
    )


def test_semantic_intent_classifier():
    classifier = SemanticIntentClassifier()

    field_email = ScannedField(
        field_id="1",
        selector="#email",
        tag_name="input",
        input_type="email",
        placeholder="Enter email address",
    )
    intent, conf = classifier.classify(field_email)
    assert intent == CanonicalIntent.EMAIL
    assert conf >= 0.9

    field_experience = ScannedField(
        field_id="2",
        selector="#exp",
        tag_name="input",
        input_type="number",
        label_text="Total years of experience",
    )
    intent, conf = classifier.classify(field_experience)
    assert intent == CanonicalIntent.TOTAL_EXPERIENCE
    assert conf >= 0.8

    field_ctc = ScannedField(
        field_id="3",
        selector="#ctc",
        tag_name="input",
        input_type="text",
        label_text="Expected CTC (in INR)",
    )
    intent, conf = classifier.classify(field_ctc)
    assert intent == CanonicalIntent.EXPECTED_CTC

    field_notice = ScannedField(
        field_id="4",
        selector="#notice",
        tag_name="select",
        input_type="select-one",
        label_text="Notice Period Duration",
    )
    intent, conf = classifier.classify(field_notice)
    assert intent == CanonicalIntent.NOTICE_PERIOD


def test_field_value_resolver(sample_profile: CandidateProfile):
    resolver = FieldValueResolver()

    val_name = resolver.resolve(
        CanonicalIntent.FULL_NAME, sample_profile, candidate_name="Jane Doe"
    )
    assert val_name == "Jane Doe"

    val_exp = resolver.resolve(CanonicalIntent.TOTAL_EXPERIENCE, sample_profile)
    assert val_exp == "6"

    val_ctc = resolver.resolve(CanonicalIntent.EXPECTED_CTC, sample_profile)
    assert val_ctc == "4000000.0"

    options = [
        ScannedOption(text="Immediate (0-15 days)", value="0"),
        ScannedOption(text="1 Month / 30 Days", value="30"),
        ScannedOption(text="60+ Days", value="60"),
    ]
    val_notice = resolver.resolve(CanonicalIntent.NOTICE_PERIOD, sample_profile, options=options)
    assert val_notice == "30"


@pytest.mark.asyncio
async def test_form_engine_fills_form_successfully(sample_profile: CandidateProfile):
    mock_classifier = SemanticIntentClassifier()
    mock_resolver = FieldValueResolver()
    engine = FormEngine(classifier=mock_classifier, resolver=mock_resolver)

    mock_locator = MagicMock()
    mock_locator.first = mock_locator
    mock_locator.click = AsyncMock()
    mock_locator.fill = AsyncMock()
    mock_locator.type = AsyncMock()
    mock_locator.dispatch_event = AsyncMock()

    mock_page = MagicMock()
    mock_page.locator.return_value = mock_locator

    scanned_form = ScannedForm(
        fields=[
            ScannedField(
                field_id="f_0",
                selector="#full_name",
                tag_name="input",
                input_type="text",
                label_text="Full Name",
                is_required=True,
            ),
            ScannedField(
                field_id="f_1",
                selector="#email",
                tag_name="input",
                input_type="email",
                label_text="Email Address",
                is_required=True,
            ),
        ]
    )

    result = await engine.fill_form(
        page_or_frame=mock_page,
        scanned_form=scanned_form,
        profile=sample_profile,
        candidate_name="Jane Doe",
        candidate_email="jane.doe@example.com",
    )

    assert result.is_complete is True
    assert len(result.filled_fields) == 2
    assert result.filled_fields[0].value == "Jane Doe"
    assert result.filled_fields[1].value == "jane.doe@example.com"
