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
    is_enabled: bool = True
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

        // Build robust, semantic, context-aware selector hierarchy
        let selector = '';
        if (idAttr) {
            selector = `#${CSS.escape(idAttr)}`;
        } else if (nameAttr) {
            selector = `${tagName}[name="${CSS.escape(nameAttr)}"]`;
        } else if (ariaLabel) {
            selector = `${tagName}[aria-label="${CSS.escape(ariaLabel)}"]`;
        } else if (el.getAttribute('data-control-name')) {
            selector = `${tagName}[data-control-name="${CSS.escape(el.getAttribute('data-control-name'))}"]`;
        } else if (el.getAttribute('data-test-id') || el.getAttribute('data-testid')) {
            const dt = el.getAttribute('data-test-id') || el.getAttribute('data-testid');
            selector = `${tagName}[data-testid="${CSS.escape(dt)}"]`;
        } else {
            // Contextual / semantic selector based on form scoping or text
            const formParent = el.closest('form, [role="form"], [role="dialog"], .jobs-easy-apply-modal, .apply-modal');
            const cleanText = (el.innerText || el.value || '').trim();
            if (cleanText && cleanText.length <= 40 && (tagName === 'button' || inputType === 'submit' || inputType === 'button')) {
                // Playwright-compatible role and text-based locator
                if (formParent && formParent.id) {
                    selector = `#${CSS.escape(formParent.id)} button:has-text("${cleanText}")`;
                } else {
                    selector = `button:has-text("${cleanText}")`;
                }
            } else if (placeholder) {
                selector = `${tagName}[placeholder="${CSS.escape(placeholder)}"]`;
            } else {
                // Sibling-scoped unique path fallback
                const parentEl = el.parentElement;
                if (parentEl && parentEl.id) {
                    const siblingIdx = Array.from(parentEl.children).filter(c => c.tagName === el.tagName).indexOf(el);
                    selector = `#${CSS.escape(parentEl.id)} > ${tagName}:nth-of-type(${siblingIdx + 1})`;
                } else {
                    selector = `${tagName}[type="${inputType || 'button'}"]`;
                }
            }
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

        const isEnabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';

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
            is_enabled: isEnabled,
            current_value: currentValue,
            options: options
        };

        const btnText = (el.innerText || el.value || ariaLabel || '').toLowerCase();
        if ((tagName === 'button' || inputType === 'submit' || inputType === 'button') && isEnabled && (isElementVisible(el) || inputType === 'submit')) {
            // High-confidence submit actions vs intermediate wizard next steps
            const isSubmit = btnText.includes('submit') || 
                             btnText.includes('apply now') || 
                             btnText.includes('easy apply') || 
                             btnText.includes('finish') || 
                             btnText.includes('send application') || 
                             btnText.includes('confirm') ||
                             inputType === 'submit';

            const isNext = btnText.includes('next') || 
                           btnText.includes('continue') || 
                           btnText.includes('proceed') || 
                           btnText.includes('step') || 
                           btnText.includes('review');

            if (isSubmit && !btnText.includes('next')) {
                submitButtons.push(fieldData);
            } else if (isNext) {
                nextButtons.push(fieldData);
            } else if (btnText.includes('apply')) {
                // Secondary check for platform specific apply triggers
                submitButtons.push(fieldData);
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
                    field_id=f.get("field_id", f"f_{idx}"),
                    selector=f.get("selector", ""),
                    tag_name=f.get("tag_name", "input"),
                    input_type=f.get("input_type", "text"),
                    name_attr=f.get("name_attr"),
                    id_attr=f.get("id_attr"),
                    placeholder=f.get("placeholder"),
                    aria_label=f.get("aria_label"),
                    label_text=f.get("label_text"),
                    nearby_text=f.get("nearby_text"),
                    is_required=f.get("is_required", False),
                    is_visible=f.get("is_visible", True),
                    is_enabled=f.get("is_enabled", True),
                    current_value=f.get("current_value"),
                    options=[
                        ScannedOption(text=o["text"], value=o["value"])
                        for o in f.get("options", [])
                    ],
                )
                for idx, f in enumerate(raw_data.get("fields", []))
            ]

            submit_buttons = [
                ScannedField(
                    field_id=b["field_id"],
                    selector=b["selector"],
                    tag_name=b["tag_name"],
                    input_type=b["input_type"],
                    label_text=b.get("label_text"),
                    nearby_text=b.get("nearby_text"),
                    is_visible=b.get("is_visible", True),
                    is_enabled=b.get("is_enabled", True),
                )
                for b in raw_data.get("submit_buttons", [])
            ]

            next_buttons = [
                ScannedField(
                    field_id=b["field_id"],
                    selector=b["selector"],
                    tag_name=b["tag_name"],
                    input_type=b["input_type"],
                    label_text=b.get("label_text"),
                    nearby_text=b.get("nearby_text"),
                    is_visible=b.get("is_visible", True),
                    is_enabled=b.get("is_enabled", True),
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
