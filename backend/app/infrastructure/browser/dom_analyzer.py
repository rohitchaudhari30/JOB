import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from playwright.async_api import Frame, Page

logger = logging.getLogger("app.browser.dom_analyzer")


@dataclass
class ScannedOption:
    text: str
    value: str


@dataclass
class ScannedField:
    field_id: str
    selector: str
    tag_name: str  # 'input', 'select', 'textarea', 'button'
    input_type: str  # 'text', 'email', 'tel', 'number', 'file', 'radio', 'checkbox', 'submit', etc.
    name_attr: Optional[str] = None
    id_attr: Optional[str] = None
    placeholder: Optional[str] = None
    aria_label: Optional[str] = None
    label_text: Optional[str] = None
    nearby_text: Optional[str] = None
    is_required: bool = False
    is_visible: bool = True
    current_value: Optional[str] = None
    options: List[ScannedOption] = field(default_factory=list)

    @property
    def composite_signal_text(self) -> str:
        """Aggregates all contextual text signals for semantic classification."""
        tokens = [
            self.label_text or "",
            self.aria_label or "",
            self.placeholder or "",
            self.name_attr or "",
            self.id_attr or "",
            self.nearby_text or "",
        ]
        return " ".join([t for t in tokens if t]).strip()


@dataclass
class ScannedForm:
    fields: List[ScannedField] = field(default_factory=list)
    submit_buttons: List[ScannedField] = field(default_factory=list)
    next_buttons: List[ScannedField] = field(default_factory=list)
    wizard_step_text: Optional[str] = None
    has_challenge: bool = False
    challenge_type: Optional[str] = None  # 'OTP', 'CAPTCHA', 'CLOUDFLARE', 'LOGIN_REQUIRED'


SCAN_DOM_JS = """
() => {
    function isElementVisible(el) {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function getElementLabel(el) {
        // 1. Direct label with for attribute
        if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label && label.innerText.trim()) return label.innerText.trim();
        }
        // 2. Ancestor label
        const parentLabel = el.closest('label');
        if (parentLabel && parentLabel.innerText.trim()) {
            return parentLabel.innerText.trim();
        }
        // 3. aria-labelledby
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const labelEl = document.getElementById(labelledBy);
            if (labelEl && labelEl.innerText.trim()) return labelEl.innerText.trim();
        }
        return null;
    }

    function getNearbyContext(el) {
        const parent = el.closest('div, p, tr, li, section, fieldset');
        if (parent) {
            const text = parent.innerText || '';
            // Return first 120 chars without excessive newlines
            return text.replace(/\\s+/g, ' ').trim().slice(0, 150);
        }
        return null;
    }

    const fields = [];
    const submitButtons = [];
    const nextButtons = [];

    // Scan interactive input elements
    const elements = document.querySelectorAll('input, select, textarea, button');
    let idx = 0;

    for (const el of elements) {
        if (!isElementVisible(el) && el.type !== 'file') continue;

        const tagName = el.tagName.toLowerCase();
        const inputType = (el.type || 'text').toLowerCase();
        const nameAttr = el.getAttribute('name') || null;
        const idAttr = el.getAttribute('id') || null;
        const placeholder = el.getAttribute('placeholder') || null;
        const ariaLabel = el.getAttribute('aria-label') || null;
        const isRequired = el.required || el.getAttribute('aria-required') === 'true';
        const labelText = getElementLabel(el);
        const nearbyText = getNearbyContext(el);
        const currentValue = el.value || null;

        // Build unique identifier or selector fallback
        let selector = '';
        if (idAttr) {
            selector = `#${CSS.escape(idAttr)}`;
        } else if (nameAttr) {
            selector = `${tagName}[name="${CSS.escape(nameAttr)}"]`;
        } else {
            selector = `${tagName}:nth-of-type(${idx + 1})`;
        }

        const options = [];
        if (tagName === 'select') {
            for (const opt of el.options) {
                options.push({
                    text: opt.text.trim(),
                    value: opt.value
                });
            }
        }

        const fieldData = {
            field_id: `f_${idx++}_${idAttr || nameAttr || tagName}`,
            selector: selector,
            tag_name: tagName,
            input_type: inputType,
            name_attr: nameAttr,
            id_attr: idAttr,
            placeholder: placeholder,
            aria_label: ariaLabel,
            label_text: labelText,
            nearby_text: nearbyText,
            is_required: isRequired,
            is_visible: isElementVisible(el) || inputType === 'file',
            current_value: currentValue,
            options: options
        };

        const btnText = (el.innerText || el.value || '').toLowerCase();
        if (tagName === 'button' || inputType === 'submit' || inputType === 'button') {
            if (btnText.includes('submit') || btnText.includes('apply') || btnText.includes('finish') || btnText.includes('send application')) {
                submitButtons.push(fieldData);
            } else if (btnText.includes('next') || btnText.includes('continue') || btnText.includes('proceed') || btnText.includes('step')) {
                nextButtons.push(fieldData);
            }
        }

        if (inputType !== 'submit' && inputType !== 'reset' && inputType !== 'button' && inputType !== 'hidden') {
            fields.push(fieldData);
        }
    }

    // Detect wizard / step progress text
    let wizardStepText = null;
    const stepIndicators = document.querySelectorAll('.step, [class*="step"], [id*="step"], [aria-label*="Step"]');
    for (const s of stepIndicators) {
        const text = s.innerText || '';
        const match = text.match(/step\\s*\\d+\\s*(of|\\/)\\s*\\d+/i);
        if (match) {
            wizardStepText = match[0];
            break;
        }
    }

    // Detect OTP / CAPTCHA / Bot challenges
    let hasChallenge = false;
    let challengeType = null;

    const pageText = document.body ? document.body.innerText : '';
    if (pageText.includes('Enter OTP') || pageText.includes('One Time Password') || document.querySelector('input[name*="otp"], input[id*="otp"]')) {
        hasChallenge = true;
        challengeType = 'OTP';
    } else if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="hcaptcha"], .cf-turnstile, #g-recaptcha')) {
        hasChallenge = true;
        challengeType = 'CAPTCHA';
    } else if (pageText.includes('Verify you are human') || pageText.includes('Attention Required! | Cloudflare')) {
        hasChallenge = true;
        challengeType = 'CLOUDFLARE';
    }

    return {
        fields: fields,
        submit_buttons: submitButtons,
        next_buttons: nextButtons,
        wizard_step_text: wizardStepText,
        has_challenge: hasChallenge,
        challenge_type: challengeType
    };
}
"""


class DOMAnalyzer:
    """
    Heuristic DOM scanner and accessibility tree parser.
    Inspects visible form inputs, selects, textareas, file uploads, buttons,
    wizard indicators, and challenge overlays across main pages and iframes.
    """

    async def scan_form(self, page_or_frame: Page | Frame) -> ScannedForm:
        try:
            raw_data: Dict[str, Any] = await page_or_frame.evaluate(SCAN_DOM_JS)

            fields = [
                ScannedField(
                    field_id=f["field_id"],
                    selector=f["selector"],
                    tag_name=f["tag_name"],
                    input_type=f["input_type"],
                    name_attr=f["name_attr"],
                    id_attr=f["id_attr"],
                    placeholder=f["placeholder"],
                    aria_label=f["aria_label"],
                    label_text=f["label_text"],
                    nearby_text=f["nearby_text"],
                    is_required=f["is_required"],
                    is_visible=f["is_visible"],
                    current_value=f["current_value"],
                    options=[
                        ScannedOption(text=o["text"], value=o["value"])
                        for o in f.get("options", [])
                    ],
                )
                for f in raw_data.get("fields", [])
            ]

            submit_buttons = [
                ScannedField(
                    field_id=b["field_id"],
                    selector=b["selector"],
                    tag_name=b["tag_name"],
                    input_type=b["input_type"],
                    label_text=b["label_text"],
                    nearby_text=b["nearby_text"],
                )
                for b in raw_data.get("submit_buttons", [])
            ]

            next_buttons = [
                ScannedField(
                    field_id=b["field_id"],
                    selector=b["selector"],
                    tag_name=b["tag_name"],
                    input_type=b["input_type"],
                    label_text=b["label_text"],
                    nearby_text=b["nearby_text"],
                )
                for b in raw_data.get("next_buttons", [])
            ]

            scanned = ScannedForm(
                fields=fields,
                submit_buttons=submit_buttons,
                next_buttons=next_buttons,
                wizard_step_text=raw_data.get("wizard_step_text"),
                has_challenge=raw_data.get("has_challenge", False),
                challenge_type=raw_data.get("challenge_type"),
            )

            logger.info(
                f"DOM Scanned: {len(scanned.fields)} fields, "
                f"{len(scanned.submit_buttons)} submit buttons, "
                f"challenge={scanned.has_challenge} ({scanned.challenge_type})"
            )
            return scanned

        except Exception as e:
            logger.error(f"DOM scan failed: {e}", exc_info=True)
            return ScannedForm()
