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
    # Shared Circuit Breaker state:
    # When Groq hits rate limit (429 / TPM / RPM exceeded), all ongoing and upcoming
    # calls immediately route to Gemini without waiting or failing repeatedly.
    _circuit_open_until: float = 0.0
    _consecutive_rate_limits: int = 0
    _last_rate_limit_reason: str | None = None

    def __init__(
        self,
        primary_provider: AIProvider | None = None,
        fallback_provider: AIProvider | None = None,
        session: AsyncSession | None = None,
    ):
        self._primary = primary_provider or GroqProvider()
        self._fallback = fallback_provider or GeminiProvider()
        self._session = session
        self.last_provider_used: str = self._primary.provider_name

    @classmethod
    def is_rate_limit_active(cls) -> bool:
        return time.time() < cls._circuit_open_until

    @classmethod
    def get_remaining_cooldown(cls) -> int:
        return max(0, int(cls._circuit_open_until - time.time()))

    @staticmethod
    def _is_rate_limit_or_quota(error: Exception) -> bool:
        err_str = str(error).lower()
        err_cls = type(error).__name__.lower()
        return any(
            indicator in err_str or indicator in err_cls
            for indicator in (
                "429",
                "rate_limit",
                "ratelimit",
                "quota",
                "resource_exhausted",
                "tokens per minute",
                "requests per minute",
                "too many requests",
                "limit exceeded",
                "tpm",
                "rpm",
            )
        )

    async def _execute_with_fallback(
        self,
        operation: str,
        func_name: str,
        *args,
        user_id: str | None = None,
        **kwargs
    ) -> Any:
        start_time = time.time()
        now = time.time()
        is_success = False
        error_msg = None
        provider_used = self._primary.provider_name

        # If Groq is currently in rate-limit cooldown, directly execute on Gemini (zero wait time!)
        if now < MultiTierAIGateway._circuit_open_until:
            rem = int(MultiTierAIGateway._circuit_open_until - now)
            logger.info(
                f"[AI AUTO-SWITCH] Groq rate-limited ({rem}s cooldown remaining). "
                f"Directly executing {operation} on Google Gemini..."
            )
            provider_used = self._fallback.provider_name
            try:
                func = getattr(self._fallback, func_name)
                result = await func(*args, **kwargs)
                is_success = True
                return result
            except Exception as fallback_error:
                # If Gemini also fails during Groq cooldown, clear circuit breaker so Groq can be retried
                MultiTierAIGateway._circuit_open_until = 0.0
                error_msg = f"Gemini (during Groq cooldown): {fallback_error}"
                logger.error(f"Fallback Gemini failed during Groq cooldown for {operation}: {fallback_error}")
                raise AIProviderException("all_providers", error_msg)

        # Primary is healthy: Try Groq first
        try:
            func = getattr(self._primary, func_name)
            result = await func(*args, **kwargs)
            is_success = True
            MultiTierAIGateway._consecutive_rate_limits = 0
            return result
        except Exception as primary_error:
            if self._is_rate_limit_or_quota(primary_error):
                MultiTierAIGateway._consecutive_rate_limits += 1
                cooldown_sec = min(300, 60 * MultiTierAIGateway._consecutive_rate_limits)
                MultiTierAIGateway._circuit_open_until = time.time() + cooldown_sec
                MultiTierAIGateway._last_rate_limit_reason = str(primary_error)
                logger.warning(
                    f"⚠️ [GROQ RATE LIMIT DETECTED] {primary_error}. "
                    f"⚡ AUTOMATICALLY SWITCHING to Google Gemini for the next {cooldown_sec} seconds!"
                )
            else:
                logger.warning(
                    f"Primary AI Provider ({self._primary.provider_name}) failed for {operation}: {primary_error}. "
                    f"Attempting immediate fallback to {self._fallback.provider_name}..."
                )

            # Route immediately to Gemini
            provider_used = self._fallback.provider_name
            try:
                func = getattr(self._fallback, func_name)
                result = await func(*args, **kwargs)
                is_success = True
                logger.info(f"✅ Fallback to {self._fallback.provider_name} succeeded for {operation}.")
                return result
            except Exception as fallback_error:
                error_msg = f"Groq: {primary_error} | Gemini: {fallback_error}"
                logger.error(f"All AI Providers failed for {operation}: {error_msg}")
                raise AIProviderException("all_providers", error_msg)
        finally:
            self.last_provider_used = provider_used
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

    async def generate_structured(
        self, operation: str, system_prompt: str, user_prompt: str, max_tokens: int | None = None, user_id: str | None = None
    ) -> tuple[str, str]:
        """Raw JSON text and the name of the provider that answered (primary first, then fallback)."""
        text = await self._execute_with_fallback(
            operation, "generate_structured", system_prompt, user_prompt, max_tokens=max_tokens, user_id=user_id
        )
        return text, self.last_provider_used

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
