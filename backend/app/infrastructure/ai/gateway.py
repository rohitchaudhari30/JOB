import logging
import time
from typing import Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.exceptions import AIProviderException
from app.domain.ai.contracts import (
    AIGateway,
    AIProvider,
    GeneratedAnswerDTO,
    MatchEvaluationDTO,
    ParsedJobRequirementsDTO,
    ParsedResumeDTO,
    QuestionIntentDTO,
)
from app.infrastructure.ai.gemini_provider import GeminiProvider
from app.infrastructure.ai.groq_provider import GroqProvider
from app.infrastructure.database.models.models import AIRequestModel

logger = logging.getLogger("app.ai.gateway")


class MultiTierAIGateway(AIGateway):
    def __init__(
        self,
        primary_provider: AIProvider | None = None,
        fallback_provider: AIProvider | None = None,
        session: AsyncSession | None = None,
    ):
        self._primary = primary_provider or GroqProvider()
        self._fallback = fallback_provider or GeminiProvider()
        self._session = session

    async def _execute_with_fallback(
        self,
        operation: str,
        func_name: str,
        *args,
        user_id: str | None = None,
        **kwargs
    ) -> Any:
        start_time = time.time()
        provider_used = self._primary.provider_name
        is_success = False
        error_msg = None

        try:
            # Try Primary Provider (Groq)
            func = getattr(self._primary, func_name)
            result = await func(*args, **kwargs)
            is_success = True
            return result
        except Exception as primary_error:
            logger.warning(
                f"Primary AI Provider ({self._primary.provider_name}) failed for {operation}: {primary_error}. "
                f"Attempting fallback to {self._fallback.provider_name}..."
            )
            provider_used = self._fallback.provider_name
            try:
                # Try Fallback Provider (Gemini)
                func = getattr(self._fallback, func_name)
                result = await func(*args, **kwargs)
                is_success = True
                return result
            except Exception as fallback_error:
                error_msg = f"Primary: {primary_error} | Fallback: {fallback_error}"
                logger.error(f"All AI Providers failed for {operation}: {error_msg}")
                raise AIProviderException("all_providers", error_msg)
        finally:
            latency_ms = int((time.time() - start_time) * 1000)
            await self._log_telemetry(
                user_id=user_id,
                provider=provider_used,
                model_name=settings.GROQ_DEFAULT_MODEL if provider_used == "groq" else settings.GEMINI_DEFAULT_MODEL,
                operation=operation,
                latency_ms=latency_ms,
                is_success=is_success,
                error_message=error_msg,
            )

    async def _log_telemetry(
        self,
        user_id: str | None,
        provider: str,
        model_name: str,
        operation: str,
        latency_ms: int,
        is_success: bool,
        error_message: str | None,
    ):
        if not self._session:
            return
        try:
            record = AIRequestModel(
                user_id=user_id,
                provider=provider,
                model_name=model_name,
                operation=operation,
                input_tokens=0,
                output_tokens=0,
                latency_ms=latency_ms,
                estimated_cost_usd=0.0001,  # Estimated baseline per request
                is_success=is_success,
                error_message=error_message,
            )
            self._session.add(record)
            await self._session.flush()
        except Exception as e:
            logger.warning(f"Failed to record AI request telemetry: {e}")

    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        return await self._execute_with_fallback("ANALYZE_RESUME", "analyze_resume", raw_text)

    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        return await self._execute_with_fallback("ANALYZE_JOB", "analyze_job", raw_description)

    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        return await self._execute_with_fallback("MATCH_JOB", "match_job", candidate_summary, job_summary)

    async def classify_question(self, question_text: str, options: List[str] | None = None) -> QuestionIntentDTO:
        return await self._execute_with_fallback("CLASSIFY_QUESTION", "classify_question", question_text, options)

    async def generate_screening_answer(
        self,
        question_text: str,
        candidate_context: Dict[str, Any],
        max_words: int = 100
    ) -> GeneratedAnswerDTO:
        return await self._execute_with_fallback(
            "GENERATE_ANSWER",
            "generate_screening_answer",
            question_text,
            candidate_context,
            max_words
        )
