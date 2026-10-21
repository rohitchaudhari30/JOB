"""Renders a DOCX to PDF with LibreOffice (headless) so layout can be compared.

LibreOffice does not lay text out exactly like Microsoft Word, so a comparison made with it can show
that a change is *likely* to shift the layout; it cannot prove the file looks identical in Word.
"""
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional

from pypdf import PdfReader

logger = logging.getLogger("app.documents.renderer")

RENDER_TIMEOUT_SECONDS = 90


@dataclass
class RenderedLayout:
    pdf_path: str
    page_count: int
    lines_per_page: List[int]


def find_office_binary() -> Optional[str]:
    return shutil.which("soffice") or shutil.which("libreoffice")


def renderer_available() -> bool:
    return find_office_binary() is not None


def render_docx_to_pdf(docx_path: str, output_dir: str) -> Optional[str]:
    """Returns the PDF path, or None if rendering is unavailable or failed (never raises)."""
    binary = find_office_binary()
    if not binary:
        return None
    os.makedirs(output_dir, exist_ok=True)
    profile = tempfile.mkdtemp(prefix="lo_profile_")
    try:
        completed = subprocess.run(
            [
                binary, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
                "--convert-to", "pdf", "--outdir", output_dir, docx_path,
            ],
            capture_output=True,
            timeout=RENDER_TIMEOUT_SECONDS,
            env={**os.environ, "HOME": profile},
        )
        pdf_path = os.path.join(output_dir, os.path.splitext(os.path.basename(docx_path))[0] + ".pdf")
        if completed.returncode != 0 or not os.path.isfile(pdf_path):
            logger.warning("Document rendering failed (exit %s)", completed.returncode)
            return None
        return pdf_path
    except (subprocess.TimeoutExpired, OSError) as error:
        logger.warning("Document rendering failed: %s", type(error).__name__)
        return None
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def measure_layout(pdf_path: str) -> Optional[RenderedLayout]:
    try:
        reader = PdfReader(pdf_path)
        lines = []
        for page in reader.pages:
            text = page.extract_text() or ""
            lines.append(len([ln for ln in text.splitlines() if ln.strip()]))
        return RenderedLayout(pdf_path=pdf_path, page_count=len(reader.pages), lines_per_page=lines)
    except Exception as error:
        logger.warning("Could not read rendered PDF: %s", type(error).__name__)
        return None
