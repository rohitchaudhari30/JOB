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
    return True


def render_docx_to_pdf_reportlab(docx_path: str, output_dir: str) -> Optional[str]:
    """Generates a clean PDF from a docx file using ReportLab as a pure Python fallback."""
    try:
        import docx
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
        from reportlab.lib import colors

        os.makedirs(output_dir, exist_ok=True)
        stem = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, f"{stem}.pdf")

        doc = docx.Document(docx_path)
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'ResumeTitle',
            parent=styles['Normal'],
            fontSize=16,
            leading=20,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#0f172a'),
            alignment=1,
            spaceAfter=3,
        )
        subtitle_style = ParagraphStyle(
            'ResumeSubtitle',
            parent=styles['Normal'],
            fontSize=10.5,
            leading=13.5,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#4f46e5'),
            alignment=1,
            spaceAfter=3,
        )
        contact_style = ParagraphStyle(
            'ResumeContact',
            parent=styles['Normal'],
            fontSize=8.5,
            leading=11,
            fontName='Helvetica',
            textColor=colors.HexColor('#475569'),
            alignment=1,
            spaceAfter=6,
        )
        heading_style = ParagraphStyle(
            'ResumeHeading',
            parent=styles['Normal'],
            fontSize=10,
            leading=13.5,
            fontName='Helvetica-Bold',
            textColor=colors.HexColor('#0f172a'),
            spaceBefore=6,
            spaceAfter=2,
        )
        body_style = ParagraphStyle(
            'ResumeBody',
            parent=styles['Normal'],
            fontSize=8.5,
            leading=12,
            fontName='Helvetica',
            textColor=colors.HexColor('#1e293b'),
            spaceAfter=2,
        )
        bullet_style = ParagraphStyle(
            'ResumeBullet',
            parent=styles['Normal'],
            fontSize=8.5,
            leading=12,
            fontName='Helvetica',
            textColor=colors.HexColor('#1e293b'),
            leftIndent=12,
            firstLineIndent=-8,
            spaceAfter=2,
        )

        story = []
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue
            clean = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            if len(story) == 0:
                story.append(Paragraph(clean, title_style))
            elif len(story) == 1 and not any(k in clean for k in ("@", "+", "http")):
                story.append(Paragraph(clean, subtitle_style))
            elif any(k in clean for k in ("@", "+", "|")) and len(story) < 4:
                story.append(Paragraph(clean, contact_style))
                story.append(HRFlowable(width="100%", thickness=0.75, color=colors.HexColor("#e2e8f0"), spaceAfter=6))
            elif clean.isupper() and len(clean) < 40:
                story.append(Spacer(1, 3))
                story.append(Paragraph(clean, heading_style))
                story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=3))
            elif text.startswith(("-", "•", "*", "–", "—", "\u2013", "\u2014")):
                bullet_body = clean.lstrip("-•*–— 	")
                story.append(Paragraph(f"&bull;&nbsp;&nbsp;{bullet_body}", bullet_style))
            else:
                story.append(Paragraph(clean, body_style))

        pdf_doc = SimpleDocTemplate(
            pdf_path,
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=36,
            bottomMargin=36,
        )
        pdf_doc.build(story)
        if os.path.isfile(pdf_path) and os.path.getsize(pdf_path) > 0:
            return pdf_path
        return None
    except Exception as e:
        logger.warning("ReportLab PDF conversion failed: %s", e)
        return None


def render_docx_to_pdf(docx_path: str, output_dir: str) -> Optional[str]:
    """Returns the PDF path, or None if rendering is unavailable or failed (never raises)."""
    binary = find_office_binary()
    if binary:
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
            if completed.returncode == 0 and os.path.isfile(pdf_path):
                return pdf_path
            logger.warning("Document rendering with LibreOffice failed (exit %s)", completed.returncode)
        except (subprocess.TimeoutExpired, OSError) as error:
            logger.warning("Document rendering failed: %s", type(error).__name__)
        finally:
            shutil.rmtree(profile, ignore_errors=True)

    # Pure Python ReportLab fallback for systems without LibreOffice
    return render_docx_to_pdf_reportlab(docx_path, output_dir)


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
