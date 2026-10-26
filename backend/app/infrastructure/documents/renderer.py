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

        total_words = sum(len(p.text.split()) for p in doc.paragraphs)
        target_pages = 1 if total_words <= 420 else 2

        pdf_doc = SimpleDocTemplate(
            pdf_path,
            pagesize=letter,
            leftMargin=32,
            rightMargin=32,
            topMargin=32,
            bottomMargin=32,
        )
        pdf_doc.build(story)

        # Dynamic page budget convergence: scale down if it exceeds target_pages
        if os.path.isfile(pdf_path):
            try:
                reader = PdfReader(pdf_path)
                if len(reader.pages) > target_pages:
                    compact_b = ParagraphStyle('CompactB', parent=styles['Normal'], fontSize=7.8, leading=10, fontName='Helvetica', textColor=colors.HexColor('#1e293b'), spaceAfter=1)
                    compact_bul = ParagraphStyle('CompactBU', parent=styles['Normal'], fontSize=7.8, leading=10, fontName='Helvetica', textColor=colors.HexColor('#1e293b'), leftIndent=10, firstLineIndent=-7, spaceAfter=1)
                    compact_story = []
                    for item in story:
                        if isinstance(item, Paragraph) and item.style == bullet_style:
                            compact_story.append(Paragraph(item.text, compact_bul))
                        elif isinstance(item, Paragraph) and item.style == body_style:
                            compact_story.append(Paragraph(item.text, compact_b))
                        elif isinstance(item, Spacer):
                            compact_story.append(Spacer(1, 1.5))
                        else:
                            compact_story.append(item)
                    pdf_doc2 = SimpleDocTemplate(pdf_path, pagesize=letter, leftMargin=28, rightMargin=28, topMargin=28, bottomMargin=28)
                    pdf_doc2.build(compact_story)
            except Exception as pe:
                logger.debug("Page convergence exception: %s", pe)

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


def render_docx_to_pdf_pure_python(docx_path: str, output_dir: str) -> Optional[str]:
    """Generates a clean, valid PDF from docx using pure Python without external C libraries."""
    try:
        import docx

        os.makedirs(output_dir, exist_ok=True)
        stem = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, f"{stem}.pdf")

        doc = docx.Document(docx_path)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        if not paragraphs:
            paragraphs = ["Resume"]

        page_width, page_height = 612, 792
        margin = 44
        y = page_height - margin
        pages = []
        current_cmds = []

        def sanitize(t: str) -> str:
            return t.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

        for para in paragraphs:
            is_title = len(pages) == 0 and len(current_cmds) == 0
            is_heading = para.isupper() and len(para) < 40

            is_compact = len(paragraphs) > 30
            font = "/F2 14" if is_title else ("/F2 10.5" if is_heading else "/F1 9") if is_compact else ("/F2 15" if is_title else ("/F2 11" if is_heading else "/F1 9.5"))
            spacing = (17 if is_title else (13 if is_heading else 11)) if is_compact else (22 if is_title else (16 if is_heading else 13))

            if y - spacing < margin:
                pages.append("\n".join(current_cmds))
                current_cmds = []
                y = page_height - margin

            y -= spacing
            clean = sanitize(para)
            if len(clean) > 90:
                words = clean.split(" ")
                curr_line = ""
                for w in words:
                    if len(curr_line) + len(w) + 1 > 88:
                        current_cmds.append(f"BT {font} Tf {margin} {y:.1f} Td ({curr_line}) Tj ET")
                        y -= 12
                        curr_line = w
                    else:
                        curr_line = f"{curr_line} {w}".strip()
                if curr_line:
                    current_cmds.append(f"BT {font} Tf {margin} {y:.1f} Td ({curr_line}) Tj ET")
            else:
                current_cmds.append(f"BT {font} Tf {margin} {y:.1f} Td ({clean}) Tj ET")

        if current_cmds:
            pages.append("\n".join(current_cmds))

        objects = []

        def add_obj(c: str) -> int:
            objects.append(c)
            return len(objects)

        add_obj("<< /Type /Catalog /Pages 3 0 R >>")
        add_obj("<< /Type /Outlines /Count 0 >>")
        add_obj("")
        f1_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        f2_id = add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

        page_ids = []
        for p_str in pages:
            s_bytes = p_str.encode("latin-1", errors="replace")
            c_id = add_obj(f"<< /Length {len(s_bytes)} >>\nstream\n{p_str}\nendstream")
            p_obj = (
                f"<< /Type /Page /Parent 3 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Contents {c_id} 0 R "
                f"/Resources << /Font << /F1 {f1_id} 0 R /F2 {f2_id} 0 R >> >> >>"
            )
            p_id = add_obj(p_obj)
            page_ids.append(f"{p_id} 0 R")

        kids = " ".join(page_ids)
        objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>"

        with open(pdf_path, "wb") as f:
            f.write(b"%PDF-1.4\n")
            offsets = []
            for i, o_str in enumerate(objects, 1):
                offsets.append(f.tell())
                f.write(f"{i} 0 obj\n{o_str}\nendobj\n".encode("latin-1", errors="replace"))

            xref_start = f.tell()
            f.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))
            for off in offsets:
                f.write(f"{off:010d} 00000 n \n".encode("latin-1"))

            f.write(
                f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n".encode("latin-1")
            )

        if os.path.isfile(pdf_path) and os.path.getsize(pdf_path) > 100:
            return pdf_path
        return None
    except Exception as err:
        logger.warning("Pure Python PDF conversion fallback failed: %s", err)
        return None

    # Pure Python ReportLab fallback for systems without LibreOffice
    res = render_docx_to_pdf_reportlab(docx_path, output_dir)
    if res and os.path.isfile(res):
        return res
    return render_docx_to_pdf_pure_python(docx_path, output_dir)


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
