from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class ParsedResumeDTO:
    headline: str
    summary: str
    skills: List[str]
    total_experience_years: float
    experiences: List[Dict[str, Any]]
    educations: List[Dict[str, Any]]


@dataclass
class ParsedJobRequirementsDTO:
    mandatory_skills: List[str]
    preferred_skills: List[str]
    min_experience_years: float
    max_experience_years: float
    education: str | None = None
    role_summary: str = ""


@dataclass
class MatchEvaluationDTO:
    score: float  # 0 to 100
    matched_skills: List[str]
    missing_skills: List[str]
    reasoning: str
    confidence: float  # 0.0 to 1.0
    provider_used: str = "groq"


@dataclass
class QuestionIntentDTO:
    canonical_intent: str
    confidence: float
    extracted_options: List[str] = field(default_factory=list)


@dataclass
class GeneratedAnswerDTO:
    answer_text: str
    confidence: float
    reasoning: str = ""


@dataclass
class AIRequestRecord:
    provider: str
    model_name: str
    operation: str
    input_tokens: int
    output_tokens: int
    latency_ms: int
    estimated_cost_usd: float
    is_success: bool
    user_id: str | None = None
    error_message: str | None = None


class AIProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        pass

    @abstractmethod
    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        pass

    @abstractmethod
    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        pass

    @abstractmethod
    async def classify_question(self, question_text: str, options: List[str] | None = None) -> QuestionIntentDTO:
        pass

    @abstractmethod
    async def generate_screening_answer(
        self,
        question_text: str,
        candidate_context: Dict[str, Any],
        max_words: int = 100
    ) -> GeneratedAnswerDTO:
        pass


class AIGateway(ABC):
    @abstractmethod
    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        pass

    @abstractmethod
    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        pass

    @abstractmethod
    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        pass

    @abstractmethod
    async def classify_question(self, question_text: str, options: List[str] | None = None) -> QuestionIntentDTO:
        pass

    @abstractmethod
    async def generate_screening_answer(
        self,
        question_text: str,
        candidate_context: Dict[str, Any],
        max_words: int = 100
    ) -> GeneratedAnswerDTO:
        pass
