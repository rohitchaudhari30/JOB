"""Pulls plain text out of an uploaded resume (PRF-02)."""
import logging
import os

logger = logging.getLogger("app.resume_text")

MAX_CHARS = 20000


def extract_resume_text(file_path: str) -> str:
    """Returns the resume text, or "" when it cannot be read. Never raises."""
    extension = os.path.splitext(file_path)[1].lower()
    try:
        if extension == ".pdf":
            from pypdf import PdfReader

            pages = [page.extract_text() or "" for page in PdfReader(file_path).pages]
            text = "\n".join(pages)
        elif extension == ".docx":
            from docx import Document

            text = "\n".join(paragraph.text for paragraph in Document(file_path).paragraphs)
        elif extension in (".txt", ".md"):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
        else:
            return ""
    except Exception as error:
        logger.warning("Could not read resume text from %s: %s", os.path.basename(file_path), error)
        return ""
    return text.strip()[:MAX_CHARS]
