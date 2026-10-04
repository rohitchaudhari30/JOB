import pytest
from unittest.mock import AsyncMock
from app.infrastructure.browser.dom_analyzer import DOMAnalyzer, ScannedField, ScannedOption


@pytest.mark.asyncio
async def test_dom_analyzer_scans_fields_and_challenge():
    analyzer = DOMAnalyzer()

    mock_page = AsyncMock()
    mock_page.evaluate.return_value = {
        "fields": [
            {
                "field_id": "f_0_full_name",
                "selector": "#full_name",
                "tag_name": "input",
                "input_type": "text",
                "name_attr": "full_name",
                "id_attr": "full_name",
                "placeholder": "Enter full name",
                "aria_label": None,
                "label_text": "Full Name",
                "nearby_text": "Full Name *",
                "is_required": True,
                "is_visible": True,
                "current_value": "",
                "options": [],
            },
            {
                "field_id": "f_1_notice_period",
                "selector": "#notice_period",
                "tag_name": "select",
                "input_type": "select-one",
                "name_attr": "notice",
                "id_attr": "notice_period",
                "placeholder": None,
                "aria_label": "Notice Period",
                "label_text": "Notice Period",
                "nearby_text": "How soon can you join?",
                "is_required": True,
                "is_visible": True,
                "current_value": "30",
                "options": [
                    {"text": "Immediate (0-15 days)", "value": "0"},
                    {"text": "1 Month / 30 Days", "value": "30"},
                    {"text": "2 Months / 60 Days", "value": "60"},
                ],
            },
        ],
        "submit_buttons": [
            {
                "field_id": "b_0_submit",
                "selector": "button[type='submit']",
                "tag_name": "button",
                "input_type": "submit",
                "label_text": "Submit Application",
                "nearby_text": "Submit Application",
            }
        ],
        "next_buttons": [],
        "wizard_step_text": "Step 1 of 3",
        "has_challenge": False,
        "challenge_type": None,
    }

    form = await analyzer.scan_form(mock_page)

    assert len(form.fields) == 2
    assert form.fields[0].label_text == "Full Name"
    assert form.fields[0].is_required is True
    assert form.fields[1].tag_name == "select"
    assert len(form.fields[1].options) == 3
    assert len(form.submit_buttons) == 1
    assert form.wizard_step_text == "Step 1 of 3"
    assert form.has_challenge is False


@pytest.mark.asyncio
async def test_dom_analyzer_detects_otp_challenge():
    analyzer = DOMAnalyzer()

    mock_page = AsyncMock()
    mock_page.evaluate.return_value = {
        "fields": [],
        "submit_buttons": [],
        "next_buttons": [],
        "wizard_step_text": None,
        "has_challenge": True,
        "challenge_type": "OTP",
    }

    form = await analyzer.scan_form(mock_page)

    assert form.has_challenge is True
    assert form.challenge_type == "OTP"
