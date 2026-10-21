import hashlib
import os
import re
import shutil
import tempfile
from typing import Sequence

from app.domain.resume_tailoring.document import LOCKED_FORMAT, Block, DocumentMap
from app.domain.resume_tailoring.plan import ProposedEdit
from app.domain.resume_tailoring.ports import DocumentToolkit, GenerationOutcome
from app.infrastructure.documents.docx_editor import apply_edits
from app.infrastructure.documents.docx_map import build_docx_map
from app.infrastructure.documents.fidelity import validate_tailored_docx
from app.infrastructure.documents.renderer import render_docx_to_pdf, renderer_available


class FileDocumentToolkit(DocumentToolkit):
    def build_map(self, path: str, file_format: str, raw_text: str = "") -> DocumentMap:
        if file_format == "docx":
            return build_docx_map(path)
        # PDF and other formats cannot be edited in place: every line is read-only, used only to check evidence.
        bullet = re.compile(r"^[\uf0b7\u2022\u00b7\u25aa\u25cf\u25e6\u2013*-]+\s*")
        lines = [bullet.sub("", ln.strip()) for ln in (raw_text or "").splitlines() if ln.strip()]
        lines = [ln for ln in lines if ln]
        return DocumentMap(
            format=file_format,
            blocks=[Block(id=f"line:{i}", container="body", style="", text=ln, locked_reason=LOCKED_FORMAT) for i, ln in enumerate(lines)],
        )

    def file_hash(self, path: str) -> str:
        digest = hashlib.sha256()
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def renderer_available(self) -> bool:
        return renderer_available()

    def generate(self, master_path: str, output_dir: str, output_name: str, edits: Sequence[ProposedEdit]) -> GenerationOutcome:
        os.makedirs(output_dir, exist_ok=True)
        stem = os.path.splitext(output_name)[0]
        final_docx = os.path.join(output_dir, f"{stem}.docx")
        outcome = GenerationOutcome()
        # Work in a private temp directory; only a validated-or-reported result is moved into storage.
        with tempfile.TemporaryDirectory(prefix="tailor_work_") as tmp:
            work_docx = os.path.join(tmp, "tailored.docx")
            result = apply_edits(master_path, work_docx, edits)
            outcome.applied_ids = list(result.applied)
            outcome.skipped = list(result.skipped)
            applied = [e for e in edits if e.id in set(result.applied)]
            report = validate_tailored_docx(master_path, work_docx, applied, work_dir=tmp)
            outcome.validation = report.to_dict()
            if not result.applied:
                return outcome
            shutil.move(work_docx, final_docx)
        outcome.file_path = final_docx
        outcome.file_hash = self.file_hash(final_docx)
        pdf = render_docx_to_pdf(final_docx, output_dir)
        outcome.pdf_file_path = pdf
        return outcome
