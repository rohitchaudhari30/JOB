import json
import logging
from typing import Any, Dict, List
from groq import AsyncGroq
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

logger = logging.getLogger("app.ai.groq")


class GroqProvider(AIProvider):
    def __init__(self, api_key: str | None = None, model_name: str | None = None):
        raw_key = api_key or settings.GROQ_API_KEY
        if raw_key and raw_key.strip().lower() in ("your_groq_api_key_here", "placeholder", "none", "test", ""):
            self._api_key = None
        else:
            self._api_key = raw_key
        self._model = model_name or settings.GROQ_DEFAULT_MODEL
        self._client = AsyncGroq(api_key=self._api_key) if self._api_key else None

    @property
    def provider_name(self) -> str:
        return "groq"

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        if not self._client:
            raise AIProviderException("groq", "Groq API key is not configured.")
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=settings.GROQ_TEMPERATURE,
                max_tokens=settings.GROQ_MAX_TOKENS,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content or "{}"
        except Exception as e:
            logger.error(f"Groq API call failed: {e}")
            raise AIProviderException("groq", str(e))

    async def analyze_resume(self, raw_text: str) -> ParsedResumeDTO:
        system_prompt = (
            "You are an expert resume parser. Extract candidate details in valid JSON with fields: "
            "headline (str), summary (str), skills (list of str), total_experience_years (float), "
            "experiences (list of objects with company_name, title, location, start_year, end_year, description), "
            "educations (list of objects with institution, degree, field_of_study, start_year, end_year)."
        )
        content = await self._call_llm(system_prompt, raw_text)
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
        system_prompt = (
            "You are an ATS parser. Extract job requirements in valid JSON with fields: "
            "mandatory_skills (list of str), preferred_skills (list of str), min_experience_years (float), "
            "max_experience_years (float), education (str), role_summary (str)."
        )
        content = await self._call_llm(system_prompt, raw_description)
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
        system_prompt = (
            "You are a talent evaluation AI. Compare candidate profile against job description. "
            "Return valid JSON with: score (float between 0 and 100), matched_skills (list of str), "
            "missing_skills (list of str), reasoning (short explanation string), confidence (float 0.0 to 1.0)."
        )
        user_prompt = f"Candidate Profile:\n{candidate_summary}\n\nJob Description:\n{job_summary}"
        content = await self._call_llm(system_prompt, user_prompt)
        data = json.loads(content)
        return MatchEvaluationDTO(
            score=float(data.get("score", 50.0)),
            matched_skills=data.get("matched_skills", []),
            missing_skills=data.get("missing_skills", []),
            reasoning=data.get("reasoning", "Evaluated based on skill and role overlap."),
            confidence=float(data.get("confidence", 0.90)),
            provider_used="groq",
        )

    async def classify_question(self, question_text: str, options: List[str] | None = None) -> QuestionIntentDTO:
        system_prompt = (
            "Classify the screening question into one canonical intent from: "
            "[FIRST_NAME, LAST_NAME, EMAIL, PHONE, LOCATION, TOTAL_EXPERIENCE, RELEVANT_EXPERIENCE, "
            "CURRENT_CTC, EXPECTED_CTC, NOTICE_PERIOD, JOINING_DATE, RELOCATION, WORK_AUTHORIZATION, "
            "VISA_STATUS, REMOTE_AVAILABILITY, SHIFT_AVAILABILITY, EDUCATION, SKILLS, RESUME, COVER_LETTER, "
            "WHY_COMPANY, WHY_ROLE, CUSTOM_ESSAY]. "
            "Return JSON: canonical_intent (str), confidence (float 0.0 to 1.0), extracted_options (list of str)."
        )
        user_prompt = f"Question: {question_text}\nOptions: {options or []}"
        content = await self._call_llm(system_prompt, user_prompt)
        data = json.loads(content)
        return QuestionIntentDTO(
            canonical_intent=data.get("canonical_intent", "CUSTOM_ESSAY"),
            confidence=float(data.get("confidence", 0.85)),
            extracted_options=data.get("extracted_options", []),
        )

    async def generate_screening_answer(
        self,
        question_text: str,
        candidate_context: Dict[str, Any],
        max_words: int = 100
    ) -> GeneratedAnswerDTO:
        system_prompt = (
            f"Generate a professional, concise screening answer (max {max_words} words) grounded strictly "
            "in the candidate's real profile data. Never hallucinate facts. "
            "Return JSON: answer_text (str), confidence (float 0.0 to 1.0), reasoning (str)."
        )
        user_prompt = f"Question: {question_text}\nCandidate Data: {json.dumps(candidate_context)}"
        content = await self._call_llm(system_prompt, user_prompt)
        data = json.loads(content)
        return GeneratedAnswerDTO(
            answer_text=data.get("answer_text", ""),
            confidence=float(data.get("confidence", 0.85)),
            reasoning=data.get("reasoning", ""),
        )
