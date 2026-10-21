import json
import logging
from typing import Any, Dict, List
from google import genai
from google.genai import types
from app.core.config import settings
from app.core.exceptions import AIProviderException
from app.domain.ai.contracts import (
    AIProvider,
    GeneratedAnswerDTO,
    MatchEvaluationDTO,
    ParsedJobRequirementsDTO,
    ParsedResumeDTO,
    QuestionIntentDTO,
)

import os

logger = logging.getLogger("app.ai.gemini")


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str | None = None, model_name: str | None = None):
        raw_key = (
            api_key
            or settings.GEMINI_API_KEY
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
        )
        if raw_key and raw_key.strip().lower() in ("your_gemini_api_key_here", "placeholder", "none", "test", ""):
            self._api_key = None
        else:
            self._api_key = raw_key
        self._model = model_name or settings.GEMINI_DEFAULT_MODEL
        self._client = genai.Client(api_key=self._api_key) if self._api_key else None

    @property
    def provider_name(self) -> str:
        return "gemini"

    async def _call_gemini(self, system_instruction: str, prompt: str, max_tokens: int | None = None) -> str:
        if not self._client:
            raise AIProviderException("gemini", "Gemini API key is not configured.")
        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                max_output_tokens=max_tokens,
            )
            # In google-genai SDK, generate_content or async client can be used
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=prompt,
                config=config,
            )
            return response.text or "{}"
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}")
            raise AIProviderException("gemini", str(e))

    async def generate_structured(self, system_prompt: str, user_prompt: str, max_tokens: int | None = None) -> str:
        """Raw JSON text for a caller that validates the structure itself."""
        return await self._call_gemini(system_prompt, user_prompt, max_tokens=max_tokens)

    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        sys_inst = (
            "Extract resume details in JSON: headline (str), summary (str), skills (list of str), "
            "total_experience_years (float), experiences (list), educations (list)."
        )
        content = await self._call_gemini(sys_inst, raw_text)
        data = json.loads(content)
        return ParsedResumeDTO(
            headline=data.get("headline", ""),
            summary=data.get("summary", ""),
            skills=data.get("skills", []),
            total_experience_years=float(data.get("total_experience_years", 0.0)),
            experiences=data.get("experiences", []),
            educations=data.get("educations", []),
        )

    async def analyze_job(self, raw_description: str) -> ParsedJobRequirementsDTO:
        sys_inst = (
            "Extract job requirements in JSON: mandatory_skills (list of str), preferred_skills (list of str), "
            "min_experience_years (float), max_experience_years (float), education (str), role_summary (str)."
        )
        content = await self._call_gemini(sys_inst, raw_description)
        data = json.loads(content)
        return ParsedJobRequirementsDTO(
            mandatory_skills=data.get("mandatory_skills", []),
            preferred_skills=data.get("preferred_skills", []),
            min_experience_years=float(data.get("min_experience_years", 0.0)),
            max_experience_years=float(data.get("max_experience_years", 0.0)),
            education=data.get("education"),
            role_summary=data.get("role_summary", ""),
        )

    async def match_job(self, candidate_summary: str, job_summary: str) -> MatchEvaluationDTO:
        sys_inst = (
            "Compare candidate profile against job description. Return JSON: "
            "score (float 0 to 100), matched_skills (list), missing_skills (list), "
            "reasoning (str), confidence (float 0.0 to 1.0)."
        )
        prompt = f"Candidate:\n{candidate_summary}\n\nJob Description:\n{job_summary}"
        content = await self._call_gemini(sys_inst, prompt)
        data = json.loads(content)
        return MatchEvaluationDTO(
            score=float(data.get("score", 50.0)),
            matched_skills=data.get("matched_skills", []),
            missing_skills=data.get("missing_skills", []),
            reasoning=data.get("reasoning", "Gemini evaluation completed."),
            confidence=float(data.get("confidence", 0.95)),
            provider_used="gemini",
        )

    async def classify_question(self, question_text: str, options: List[str] | None = None) -> QuestionIntentDTO:
        sys_inst = (
            "Classify screening question into canonical intent: [FIRST_NAME, LAST_NAME, EMAIL, PHONE, "
            "LOCATION, TOTAL_EXPERIENCE, RELEVANT_EXPERIENCE, CURRENT_CTC, EXPECTED_CTC, NOTICE_PERIOD, "
            "JOINING_DATE, RELOCATION, WORK_AUTHORIZATION, VISA_STATUS, REMOTE_AVAILABILITY, SHIFT_AVAILABILITY, "
            "EDUCATION, SKILLS, RESUME, COVER_LETTER, WHY_COMPANY, WHY_ROLE, CUSTOM_ESSAY]. "
            "Return JSON: canonical_intent (str), confidence (float), extracted_options (list)."
        )
        prompt = f"Question: {question_text}\nOptions: {options or []}"
        content = await self._call_gemini(sys_inst, prompt)
        data = json.loads(content)
        return QuestionIntentDTO(
            canonical_intent=data.get("canonical_intent", "CUSTOM_ESSAY"),
            confidence=float(data.get("confidence", 0.90)),
            extracted_options=data.get("extracted_options", []),
        )

    async def generate_screening_answer(
        self,
        question_text: str,
        candidate_context: Dict[str, Any],
        max_words: int = 100
    ) -> GeneratedAnswerDTO:
        sys_inst = (
            f"Generate a concise answer (max {max_words} words) strictly grounded in candidate data. "
            "Return JSON: answer_text (str), confidence (float), reasoning (str)."
        )
        prompt = f"Question: {question_text}\nCandidate Data: {json.dumps(candidate_context)}"
        content = await self._call_gemini(sys_inst, prompt)
        data = json.loads(content)
        return GeneratedAnswerDTO(
            answer_text=data.get("answer_text", ""),
            confidence=float(data.get("confidence", 0.90)),
            reasoning=data.get("reasoning", ""),
        )
