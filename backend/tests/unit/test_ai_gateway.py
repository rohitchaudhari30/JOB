import pytest
from app.core.exceptions import AIProviderException
from app.domain.ai.contracts import (
    AIProvider,
    GeneratedAnswerDTO,
    MatchEvaluationDTO,
    ParsedJobRequirementsDTO,
    ParsedResumeDTO,
    QuestionIntentDTO,
)
from app.infrastructure.ai.gateway import MultiTierAIGateway


class MockGroqProvider(AIProvider):
    def __init__(self, should_fail: bool = False):
        self.should_fail = should_fail

    @property
    def provider_name(self) -> str:
        return "mock_groq"

    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        if self.should_fail:
            raise AIProviderException("mock_groq", "Rate limit exceeded (429)")
        return ParsedResumeDTO(
            headline="Senior Data Engineer",
            summary="Python and Spark expert",
            skills=["Python", "Spark", "SQL"],
            total_experience_years=5.0,
            experiences=[],
            educations=[],
        )

    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        if self.should_fail:
            raise AIProviderException("mock_groq", "Rate limit exceeded (429)")
        return ParsedJobRequirementsDTO(
            mandatory_skills=["Python", "SQL"],
            preferred_skills=["Spark"],
            min_experience_years=3.0,
            max_experience_years=6.0,
        )

    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        if self.should_fail:
            raise AIProviderException("mock_groq", "Service unavailable (503)")
        return MatchEvaluationDTO(
            score=92.0,
            matched_skills=["Python", "SQL"],
            missing_skills=[],
            reasoning="Excellent skill alignment.",
            confidence=0.95,
        )

    async def classify_question(self, question_text: str, options=None) -> QuestionIntentDTO:
        if self.should_fail:
            raise AIProviderException("mock_groq", "Error")
        return QuestionIntentDTO(canonical_intent="NOTICE_PERIOD", confidence=0.98)

    async def generate_screening_answer(self, question_text: str, candidate_context, max_words=100) -> GeneratedAnswerDTO:
        if self.should_fail:
            raise AIProviderException("mock_groq", "Error")
        return GeneratedAnswerDTO(answer_text="30 Days", confidence=0.95)


class MockGeminiProvider(AIProvider):
    @property
    def provider_name(self) -> str:
        return "mock_gemini"

    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        return ParsedResumeDTO(
            headline="Gemini Parsed Data Engineer",
            summary="Fallback summary",
            skills=["Python", "Spark"],
            total_experience_years=5.0,
            experiences=[],
            educations=[],
        )

    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        return ParsedJobRequirementsDTO(
            mandatory_skills=["Python"],
            preferred_skills=[],
            min_experience_years=3.0,
            max_experience_years=5.0,
        )

    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        return MatchEvaluationDTO(
            score=88.0,
            matched_skills=["Python"],
            missing_skills=["Kubernetes"],
            reasoning="Gemini fallback evaluated candidate.",
            confidence=0.90,
        )

    async def classify_question(self, question_text: str, options=None) -> QuestionIntentDTO:
        return QuestionIntentDTO(canonical_intent="NOTICE_PERIOD", confidence=0.95)

    async def generate_screening_answer(self, question_text: str, candidate_context, max_words=100) -> GeneratedAnswerDTO:
        return GeneratedAnswerDTO(answer_text="30 Days via Gemini", confidence=0.90)


@pytest.mark.asyncio
async def test_ai_gateway_primary_success():
    groq_mock = MockGroqProvider(should_fail=False)
    gemini_mock = MockGeminiProvider()
    gateway = MultiTierAIGateway(primary_provider=groq_mock, fallback_provider=gemini_mock)

    result = await gateway.match_job("Candidate Profile", "Job Description")
    assert result.score == 92.0
    assert result.reasoning == "Excellent skill alignment."


@pytest.mark.asyncio
async def test_ai_gateway_fallback_to_gemini_on_primary_failure():
    groq_failing = MockGroqProvider(should_fail=True)
    gemini_mock = MockGeminiProvider()
    gateway = MultiTierAIGateway(primary_provider=groq_failing, fallback_provider=gemini_mock)

    # When Groq fails, Gemini should catch and respond smoothly
    result = await gateway.match_job("Candidate Profile", "Job Description")
    assert result.score == 88.0
    assert "Gemini fallback" in result.reasoning
