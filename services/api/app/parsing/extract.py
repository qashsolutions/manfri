"""Resume text extraction (Phase 1, deterministic).

Bytes -> plain text, routed by content type / filename / magic bytes. PDF and DOCX
support is loaded **lazily** via :func:`importlib.import_module`, so this module and
its unit tests (which use text bytes) import without the heavy parsers; production
installs ``pypdf`` + ``python-docx`` to light up the binary formats.

Extraction is local: no network, no LLM provider call — so the redaction-before-egress
wall (invariant #4) is not crossed here. (LLM-assisted parsing, if added later, must go
through the multi-model router + Presidio.) Resumes are an untrusted prompt-injection /
malformed-input surface, so a parser that throws on a corrupt file degrades to empty
text rather than crashing the worker.
"""

from __future__ import annotations

import importlib
import io
from dataclasses import dataclass
from typing import Any

_PDF_TYPES = {"application/pdf"}
_DOCX_TYPES = {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}


class UnsupportedResumeFormat(RuntimeError):
    """A binary format was selected but its extractor package is not installed."""


@dataclass(frozen=True)
class ExtractedText:
    """Extracted plain text plus the method that produced it (``pdf``/``docx``/``text``)."""

    text: str
    method: str


def choose_method(content: bytes, *, content_type: str | None, filename: str | None) -> str:
    """Pick an extraction method from content type, filename, then magic bytes."""
    ct = (content_type or "").lower()
    name = (filename or "").lower()
    if ct in _PDF_TYPES or name.endswith(".pdf") or content[:5] == b"%PDF-":
        return "pdf"
    if ct in _DOCX_TYPES or name.endswith(".docx"):
        return "docx"
    return "text"


def _require(module: str, human: str) -> Any:
    try:
        return importlib.import_module(module)
    except ImportError as exc:  # deployment misconfig, not a bad upload
        raise UnsupportedResumeFormat(
            f"{human} extraction requires the '{module}' package"
        ) from exc


def _extract_pdf(content: bytes) -> str:
    pypdf = _require("pypdf", "PDF")
    reader = pypdf.PdfReader(io.BytesIO(content))
    return "\n".join(str(page.extract_text() or "") for page in reader.pages)


def _extract_docx(content: bytes) -> str:
    docx = _require("docx", "DOCX")
    document = docx.Document(io.BytesIO(content))
    return "\n".join(str(paragraph.text) for paragraph in document.paragraphs)


def extract_text(
    content: bytes, *, content_type: str | None, filename: str | None = None
) -> ExtractedText:
    """Extract plain text from ``content``; never raises on a malformed binary file."""
    method = choose_method(content, content_type=content_type, filename=filename)
    if method == "pdf":
        try:
            return ExtractedText(_extract_pdf(content), "pdf")
        except UnsupportedResumeFormat:
            raise
        except Exception:  # noqa: BLE001 - corrupt/encrypted PDF -> no text, keep the worker alive
            return ExtractedText("", "pdf")
    if method == "docx":
        try:
            return ExtractedText(_extract_docx(content), "docx")
        except UnsupportedResumeFormat:
            raise
        except Exception:  # noqa: BLE001 - corrupt DOCX -> no text, keep the worker alive
            return ExtractedText("", "docx")
    return ExtractedText(content.decode("utf-8", errors="replace"), "text")
