from docx import Document

from app.infrastructure.resume_text import extract_resume_text


def test_reads_plain_text(tmp_path):
    path = tmp_path / "cv.txt"
    path.write_text("Python developer with FastAPI experience")
    assert "FastAPI" in extract_resume_text(str(path))


def test_reads_docx(tmp_path):
    path = tmp_path / "cv.docx"
    doc = Document()
    doc.add_paragraph("Senior Data Engineer, Spark and Airflow")
    doc.save(path)
    assert "Airflow" in extract_resume_text(str(path))


def test_unreadable_or_unknown_files_give_empty_text(tmp_path):
    broken = tmp_path / "broken.pdf"
    broken.write_bytes(b"not a pdf")
    assert extract_resume_text(str(broken)) == ""
    assert extract_resume_text(str(tmp_path / "x.png")) == ""
