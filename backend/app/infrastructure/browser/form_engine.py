import asyncio
import logging
import random
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from playwright.async_api import Frame, Page
from app.domain.ai.contracts import AIProvider
from app.domain.profile.entities import CandidateProfile
from app.infrastructure.browser.dom_analyzer import ScannedField, ScannedForm, ScannedOption

logger = logging.getLogger("app.browser.form_engine")


class CanonicalIntent(str, Enum):
    FULL_NAME = "FULL_NAME"
    FIRST_NAME = "FIRST_NAME"
    LAST_NAME = "LAST_NAME"
    EMAIL = "EMAIL"
    PHONE = "PHONE"
    LOCATION = "LOCATION"
    CITY = "CITY"
    CURRENT_COMPANY = "CURRENT_COMPANY"
    CURRENT_TITLE = "CURRENT_TITLE"
    TOTAL_EXPERIENCE = "TOTAL_EXPERIENCE"
    RELEVANT_EXPERIENCE = "RELEVANT_EXPERIENCE"
    CURRENT_CTC = "CURRENT_CTC"
    EXPECTED_CTC = "EXPECTED_CTC"
    NOTICE_PERIOD = "NOTICE_PERIOD"
    LINKEDIN_URL = "LINKEDIN_URL"
    GITHUB_URL = "GITHUB_URL"
    PORTFOLIO_URL = "PORTFOLIO_URL"
    RESUME_UPLOAD = "RESUME_UPLOAD"
    GENDER = "GENDER"
    WORK_AUTHORIZATION = "WORK_AUTHORIZATION"
    WILLING_TO_RELOCATE = "WILLING_TO_RELOCATE"
    CUSTOM_QUESTION = "CUSTOM_QUESTION"
    UNKNOWN = "UNKNOWN"


INTENT_PATTERNS: Dict[CanonicalIntent, List[str]] = {
    CanonicalIntent.FULL_NAME: [
        r"\bfull\s*name\b",
        r"\byour\s*name\b",
        r"\bcandidate\s*name\b",
        r"\bname\b",
    ],
    CanonicalIntent.FIRST_NAME: [
        r"\bfirst\s*name\b",
        r"\bgiven\s*name\b",
        r"\bfname\b",
    ],
    CanonicalIntent.LAST_NAME: [
        r"\blast\s*name\b",
        r"\bsurname\b",
        r"\bfamily\s*name\b",
        r"\blname\b",
    ],
    CanonicalIntent.EMAIL: [
        r"\be[-_]?mail\b",
        r"\be[-_]?mail\s*address\b",
    ],
    CanonicalIntent.PHONE: [
        r"\bphone\b",
        r"\bmobile\b",
        r"\bcontact\s*no\b",
        r"\bphone\s*number\b",
        r"\bcell\b",
        r"\btel\b",
    ],
    CanonicalIntent.LOCATION: [
        r"\bcurrent\s*location\b",
        r"\blocation\b",
        r"\baddress\b",
        r"\bresidence\b",
    ],
    CanonicalIntent.CITY: [
        r"\bcity\b",
        r"\btown\b",
    ],
    CanonicalIntent.CURRENT_COMPANY: [
        r"\bcurrent\s*company\b",
        r"\bcurrent\s*employer\b",
        r"\bcompany\s*name\b",
        r"\borganization\b",
    ],
    CanonicalIntent.CURRENT_TITLE: [
        r"\bcurrent\s*designation\b",
        r"\bcurrent\s*title\b",
        r"\bjob\s*title\b",
        r"\brole\b",
        r"\bdesignation\b",
    ],
    CanonicalIntent.TOTAL_EXPERIENCE: [
        r"\btotal\s*experience\b",
        r"\byears\s*of\s*experience\b",
        r"\boverall\s*experience\b",
        r"\bexperience\s*in\s*years\b",
        r"\bwork\s*experience\b",
    ],
    CanonicalIntent.RELEVANT_EXPERIENCE: [
        r"\brelevant\s*experience\b",
        r"\brelated\s*experience\b",
    ],
    CanonicalIntent.CURRENT_CTC: [
        r"\bcurrent\s*ctc\b",
        r"\bcurrent\s*salary\b",
        r"\bcurrent\s*compensation\b",
        r"\bcurrent\s*annual\s*salary\b",
        r"\bpresent\s*ctc\b",
    ],
    CanonicalIntent.EXPECTED_CTC: [
        r"\bexpected\s*ctc\b",
        r"\bexpected\s*salary\b",
        r"\bdesired\s*salary\b",
        r"\bexpected\s*compensation\b",
        r"\bsalary\s*expectation\b",
    ],
    CanonicalIntent.NOTICE_PERIOD: [
        r"\bnotice\s*period\b",
        r"\bhow\s*soon\s*can\s*you\s*join\b",
        r"\bavailability\b",
        r"\bjoining\s*time\b",
        r"\bnotice\s*duration\b",
    ],
    CanonicalIntent.LINKEDIN_URL: [
        r"\blinkedin\b",
        r"\blinkedin\s*profile\b",
        r"\blinkedin\s*url\b",
    ],
    CanonicalIntent.GITHUB_URL: [
        r"\bgithub\b",
        r"\bgithub\s*profile\b",
        r"\bgithub\s*url\b",
    ],
    CanonicalIntent.PORTFOLIO_URL: [
        r"\bportfolio\b",
        r"\bwebsite\b",
        r"\bpersonal\s*url\b",
        r"\bblog\b",
    ],
    CanonicalIntent.RESUME_UPLOAD: [
        r"\bresume\b",
        r"\bcv\b",
        r"\bupload\s*resume\b",
        r"\battach\s*resume\b",
        r"\bcurriculum\s*vitae\b",
    ],
    CanonicalIntent.WORK_AUTHORIZATION: [
        r"\bwork\s*authorization\b",
        r"\bvisa\s*status\b",
        r"\blegally\s*authorized\b",
        r"\bsponsorship\b",
    ],
    CanonicalIntent.WILLING_TO_RELOCATE: [
        r"\brelocate\b",
        r"\bwilling\s*to\s*relocate\b",
        r"\bopen\s*to\s*relocation\b",
    ],
}


class SemanticIntentClassifier:
    """Classifies scanned form fields into canonical intents using heuristic regex signals."""

    def classify(self, field: ScannedField) -> Tuple[CanonicalIntent, float]:
        if field.input_type == "file":
            return CanonicalIntent.RESUME_UPLOAD, 1.0

        if field.input_type == "email":
            return CanonicalIntent.EMAIL, 1.0

        if field.input_type == "tel":
            return CanonicalIntent.PHONE, 0.95

        signal_text = field.composite_signal_text.lower()
        if not signal_text:
            return CanonicalIntent.UNKNOWN, 0.0

        # Prioritize specific multi-word matches
        for intent, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, signal_text, re.IGNORECASE):
                    # Higher confidence for exact match vs substring
                    confidence = 0.95 if re.search(r"^" + pattern + r"$", signal_text, re.IGNORECASE) else 0.85
                    return intent, confidence

        # If it's a textarea or has question marks, treat as custom screening question
        if field.tag_name == "textarea" or "?" in signal_text:
            return CanonicalIntent.CUSTOM_QUESTION, 0.70

        return CanonicalIntent.UNKNOWN, 0.0


class FieldValueResolver:
    """Resolves profile attributes and preferences into field input values."""

    def resolve(
        self,
        intent: CanonicalIntent,
        profile: CandidateProfile,
        options: Optional[List[ScannedOption]] = None,
        candidate_name: Optional[str] = None,
        candidate_email: Optional[str] = None,
    ) -> Optional[str]:
        raw_val = None

        first_name = ""
        last_name = ""
        if candidate_name:
            parts = candidate_name.strip().split(" ", 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ""

        current_exp = profile.experiences[0] if profile.experiences else None

        if intent == CanonicalIntent.FULL_NAME:
            raw_val = candidate_name
        elif intent == CanonicalIntent.FIRST_NAME:
            raw_val = first_name
        elif intent == CanonicalIntent.LAST_NAME:
            raw_val = last_name
        elif intent == CanonicalIntent.EMAIL:
            raw_val = candidate_email
        elif intent == CanonicalIntent.PHONE:
            raw_val = profile.phone
        elif intent == CanonicalIntent.LOCATION or intent == CanonicalIntent.CITY:
            raw_val = profile.location
        elif intent == CanonicalIntent.CURRENT_COMPANY:
            raw_val = current_exp.company_name if current_exp else None
        elif intent == CanonicalIntent.CURRENT_TITLE:
            raw_val = current_exp.title if current_exp else profile.headline
        elif intent == CanonicalIntent.TOTAL_EXPERIENCE or intent == CanonicalIntent.RELEVANT_EXPERIENCE:
            years = int(profile.total_experience_months / 12.0)
            raw_val = str(years)
        elif intent == CanonicalIntent.CURRENT_CTC:
            raw_val = str(profile.current_ctc) if profile.current_ctc else None
        elif intent == CanonicalIntent.EXPECTED_CTC:
            raw_val = str(profile.expected_ctc) if profile.expected_ctc else None
        elif intent == CanonicalIntent.NOTICE_PERIOD:
            # 0 is a real answer ("Immediate"); only a missing value is unknown.
            days = profile.notice_period_days
            if days is not None:
                raw_val = f"{days} Days" if days > 0 else "Immediate"
        elif intent == CanonicalIntent.WILLING_TO_RELOCATE:
            raw_val = "Yes" if profile.relocation_preference else "No"
        elif intent == CanonicalIntent.WORK_AUTHORIZATION:
            # Never guess legal status: if the profile has no answer, leave it unresolved.
            raw_val = profile.work_authorization

        if not raw_val:
            return None

        # If dropdown options are present, perform fuzzy matching against option text/values
        if options:
            return self._match_best_option(raw_val, options)

        return raw_val

    def _match_best_option(self, target_value: str, options: List[ScannedOption]) -> Optional[str]:
        target_lower = target_value.lower()

        # 1. Exact text or value match
        for opt in options:
            if opt.text.lower() == target_lower or opt.value.lower() == target_lower:
                return opt.value or opt.text

        # 2. Substring match
        for opt in options:
            if target_lower in opt.text.lower() or target_lower in opt.value.lower():
                return opt.value or opt.text

        # 3. Numeric match for experience/notice period
        target_digits = re.findall(r"\d+", target_value)
        if target_digits:
            target_num = int(target_digits[0])
            for opt in options:
                opt_digits = re.findall(r"\d+", opt.text)
                if opt_digits and int(opt_digits[0]) == target_num:
                    return opt.value or opt.text

        # No honest match: return None so the form is flagged for the user,
        # instead of picking the first option.
        return None


# The AI gives no real confidence value, so we do not invent one.
# 0.0 means "not scored"; AI answers are always recorded as AI_GENERATED.
AI_ANSWER_CONFIDENCE = 0.0


@dataclass
class FilledFieldRecord:
    field_id: str
    intent: CanonicalIntent
    value: str
    answered_by: str  # 'PROFILE', 'AI_GENERATED', 'SAVED_ANSWER'
    confidence: float


@dataclass
class FormFillResult:
    filled_fields: List[FilledFieldRecord] = field(default_factory=list)
    unresolved_fields: List[ScannedField] = field(default_factory=list)
    screening_questions: List[Dict[str, Any]] = field(default_factory=list)
    is_complete: bool = True
    error_message: Optional[str] = None


class FormEngine:
    """
    Dynamic form automation engine.
    Classifies DOM fields, resolves profile data, answers screening questions via AI,
    and fills inputs with stealthy keypress delays and event dispatching.
    """

    def __init__(
        self,
        classifier: Optional[SemanticIntentClassifier] = None,
        resolver: Optional[FieldValueResolver] = None,
    ):
        self._classifier = classifier or SemanticIntentClassifier()
        self._resolver = resolver or FieldValueResolver()

    async def fill_form(
        self,
        page_or_frame: Page | Frame,
        scanned_form: ScannedForm,
        profile: CandidateProfile,
        candidate_name: Optional[str] = None,
        candidate_email: Optional[str] = None,
        resume_file_path: Optional[str] = None,
        ai_provider: Optional[AIProvider] = None,
    ) -> FormFillResult:
        result = FormFillResult()

        for field in scanned_form.fields:
            if not field.is_visible and field.input_type != "file":
                continue

            intent, confidence = self._classifier.classify(field)

            # Handle Resume File Upload
            if intent == CanonicalIntent.RESUME_UPLOAD:
                if resume_file_path and Path(resume_file_path).is_file():
                    try:
                        locator = page_or_frame.locator(field.selector).first
                        await locator.set_input_files(resume_file_path)
                        result.filled_fields.append(
                            FilledFieldRecord(
                                field_id=field.field_id,
                                intent=intent,
                                value=resume_file_path,
                                answered_by="PROFILE",
                                confidence=1.0,
                            )
                        )
                        logger.info(f"Uploaded resume [{resume_file_path}] to {field.selector}")
                    except Exception as e:
                        logger.error(f"Failed to upload resume to {field.selector}: {e}")
                        result.unresolved_fields.append(field)
                else:
                    logger.warning(f"Resume file path [{resume_file_path}] does not exist.")
                    if field.is_required:
                        result.unresolved_fields.append(field)
                continue

            # Handle Custom Screening Questions via AI
            if intent == CanonicalIntent.CUSTOM_QUESTION:
                question_text = field.label_text or field.placeholder or field.composite_signal_text
                answer = await self._solve_screening_question(
                    question_text=question_text,
                    profile=profile,
                    candidate_name=candidate_name,
                    options=[o.text for o in field.options] if field.options else None,
                    ai_provider=ai_provider,
                )
                if answer:
                    await self._fill_element(page_or_frame, field, answer)
                    result.filled_fields.append(
                        FilledFieldRecord(
                            field_id=field.field_id,
                            intent=intent,
                            value=answer,
                            answered_by="AI_GENERATED",
                            confidence=AI_ANSWER_CONFIDENCE,
                        )
                    )
                    result.screening_questions.append(
                        {
                            "question": question_text,
                            "answer": answer,
                            "answered_by": "AI_GENERATED",
                            "confidence": AI_ANSWER_CONFIDENCE,
                        }
                    )
                else:
                    result.unresolved_fields.append(field)
                continue

            # Standard Profile Attribute Resolution
            resolved_value = self._resolver.resolve(
                intent=intent,
                profile=profile,
                options=field.options,
                candidate_name=candidate_name,
                candidate_email=candidate_email,
            )
            if resolved_value:
                success = await self._fill_element(page_or_frame, field, resolved_value)
                if success:
                    result.filled_fields.append(
                        FilledFieldRecord(
                            field_id=field.field_id,
                            intent=intent,
                            value=resolved_value,
                            answered_by="PROFILE",
                            confidence=confidence,
                        )
                    )
                else:
                    result.unresolved_fields.append(field)
            else:
                if field.is_required:
                    result.unresolved_fields.append(field)

        if result.unresolved_fields:
            result.is_complete = False
            result.error_message = f"{len(result.unresolved_fields)} required fields could not be resolved."

        return result

    async def _fill_element(self, page_or_frame: Page | Frame, field: ScannedField, value: str) -> bool:
        """Executes natural element fill with human typing delays and validation triggers."""
        try:
            locator = page_or_frame.locator(field.selector).first

            if field.tag_name == "select":
                await locator.select_option(value=value)
            elif field.input_type == "radio" or field.input_type == "checkbox":
                if value.lower() in ["yes", "true", "1", "selected"]:
                    await locator.check()
            else:
                # Clear and type with natural human delay (10-30ms)
                await locator.click()
                await locator.fill("")
                for char in value:
                    await locator.type(char, delay=random.randint(10, 30))

            # Dispatch change & blur events for SPA form reactive triggers
            await locator.dispatch_event("input")
            await locator.dispatch_event("change")
            await locator.dispatch_event("blur")
            return True

        except Exception as e:
            logger.warning(f"Failed to fill field [{field.selector}] with value [{value}]: {e}")
            return False

    async def _solve_screening_question(
        self,
        question_text: str,
        profile: CandidateProfile,
        candidate_name: Optional[str] = None,
        options: Optional[List[str]] = None,
        ai_provider: Optional[AIProvider] = None,
    ) -> Optional[str]:
        """Generates concise, factual screening question responses based on candidate background."""
        exp_years = int(profile.total_experience_months / 12.0)
        skills_str = ", ".join([s.skill_name for s in profile.skills]) if profile.skills else ""

        if not ai_provider:
            # Fallback heuristic responses for common questions
            q_lower = question_text.lower()
            if "years of experience" in q_lower or "how many years" in q_lower:
                return str(exp_years)
            # Anything else needs a real answer from the user, not a guess.
            return None

        prompt = (
            f"You are an AI assistant answering a job application screening question for the following candidate:\n"
            f"Candidate: {candidate_name or 'Candidate'}, {profile.headline or ''}\n"
            f"Experience: {exp_years} years\n"
            f"Skills: {skills_str}\n"
            f"Bio: {profile.summary or ''}\n\n"
            f"Screening Question: {question_text}\n"
        )
        if options:
            prompt += f"Allowed Options: {', '.join(options)}\nPick the single best option text verbatim.\n"
        else:
            prompt += "Provide a direct, concise, and professional answer (1 to 2 sentences maximum).\n"

        try:
            response = await ai_provider.generate_text(prompt=prompt, system_instruction="Answer professionally and concisely.")
            return response.strip()
        except Exception as e:
            logger.error(f"AI screening question answering failed: {e}")
            return None
