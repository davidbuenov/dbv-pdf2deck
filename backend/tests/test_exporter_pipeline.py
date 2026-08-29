# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""
Tests unitarios y de integración para el pipeline de exportación (PDF, PPTX, Markdown y ZIP).
"""
from __future__ import annotations

import base64
import io
import zipfile
from pathlib import Path

import pytest
from core.exporter_engine import (
    PPTX_AVAILABLE,
    build_pdf_export,
    build_pdf_export_from_original,
    build_pptx_export,
    generate_export_zip,
)
from core.markdown_exporter import build_markdown_export
from PIL import Image
from pypdf import PdfReader
from reportlab.pdfgen.canvas import Canvas


def _generate_test_image_base64(width: int = 400, height: int = 300, color: str = "white") -> str:
    image = Image.new("RGB", (width, height), color)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def _generate_synthetic_pdf(path: Path, pages_count: int = 2) -> None:
    canvas = Canvas(str(path), pagesize=(600, 400))
    for page_idx in range(pages_count):
        canvas.setFont("Helvetica-Bold", 18)
        canvas.drawString(50, 350, f"Documento Base - Pagina {page_idx + 1}")
        canvas.setFont("Helvetica", 12)
        canvas.drawString(50, 300, f"Contenido original inalterado en pagina {page_idx + 1}")
        canvas.showPage()
    canvas.save()


class TestPdfExport:
    def test_build_pdf_export_creates_valid_extractable_pdf(self) -> None:
        payload = {
            "export_mode": "all",
            "pages": [
                {
                    "page_num": 0,
                    "image_base64": _generate_test_image_base64(500, 300),
                    "render_width_px": 500,
                    "render_height_px": 300,
                    "page_width_pt": 500,
                    "page_height_pt": 300,
                    "blocks": [
                        {
                            "bbox": [50, 50, 450, 100],
                            "text": "Titulo Exportado ReportLab",
                            "font_size": 20,
                            "font_family": "Arial",
                            "is_bold": True,
                            "text_color": "#000000",
                            "bg_color": "#ffffff",
                            "bg_transparent": False,
                            "is_modified": True,
                        },
                        {
                            "bbox": [50, 120, 450, 200],
                            "text": "Parrafo secundario con texto seleccionable",
                            "font_size": 14,
                            "font_family": "Times New Roman",
                            "is_italic": True,
                            "text_color": "#333333",
                            "bg_transparent": True,
                            "is_modified": False,
                        },
                    ],
                }
            ],
        }

        pdf_bytes = build_pdf_export(payload)
        reader = PdfReader(io.BytesIO(pdf_bytes))

        assert len(reader.pages) == 1
        extracted = reader.pages[0].extract_text() or ""
        assert "Titulo Exportado ReportLab" in extracted
        assert "Parrafo secundario" in extracted

        # Validar metadatos de firma oculta
        metadata = reader.metadata
        assert metadata is not None
        assert "/Producer" in metadata
        assert metadata["/Producer"] == "DBVPDFEditor"

    def test_build_pdf_export_from_original_merges_pages(self, tmp_path: Path) -> None:
        source_pdf = tmp_path / "original.pdf"
        _generate_synthetic_pdf(source_pdf, pages_count=2)

        payload = {
            "export_mode": "only_modified",
            "pages": [
                {
                    "page_num": 0,
                    "render_width_px": 600,
                    "render_height_px": 400,
                    "page_width_pt": 600,
                    "page_height_pt": 400,
                    "blocks": [
                        {
                            "bbox": [50, 50, 400, 100],
                            "text": "Modificacion superpuesta en p1",
                            "font_size": 16,
                            "font_family": "Helvetica",
                            "is_modified": True,
                        }
                    ],
                }
            ],
        }

        merged_bytes = build_pdf_export_from_original(payload, source_pdf)
        reader = PdfReader(io.BytesIO(merged_bytes))

        assert len(reader.pages) == 2
        page1_text = reader.pages[0].extract_text() or ""
        page2_text = reader.pages[1].extract_text() or ""

        assert "Modificacion superpuesta en p1" in page1_text
        assert "Contenido original inalterado en pagina 2" in page2_text


class TestPptxExport:
    def test_build_pptx_export_structure(self) -> None:
        if not PPTX_AVAILABLE:
            pytest.skip("python-pptx no instalado")

        payload = {
            "export_mode": "all",
            "pages": [
                {
                    "page_num": 0,
                    "image_base64": _generate_test_image_base64(800, 600),
                    "render_width_px": 800,
                    "render_height_px": 600,
                    "page_width_pt": 720,
                    "page_height_pt": 540,
                    "blocks": [
                        {
                            "bbox": [50, 50, 500, 150],
                            "text": "Diapositiva 1 - Titulo PPTX",
                            "font_size": 28,
                            "font_family": "Calibri",
                            "text_color": "#112233",
                            "bg_color": "#ffffff",
                            "text_align": "center",
                            "is_bold": True,
                            "is_modified": True,
                        }
                    ],
                }
            ],
        }

        pptx_bytes = build_pptx_export(payload)
        assert len(pptx_bytes) > 0

        # Validar que es un archivo zip OpenXML valido
        with zipfile.ZipFile(io.BytesIO(pptx_bytes)) as pptx_zip:
            file_list = pptx_zip.namelist()
            assert "[Content_Types].xml" in file_list
            assert any(name.startswith("ppt/slides/slide") for name in file_list)


class TestMarkdownExport:
    def test_build_markdown_export_reconstruction(self) -> None:
        payload = {
            "filename": "demo_doc.pdf",
            "pages": [
                {
                    "page_num": 0,
                    "render_width_px": 600,
                    "render_height_px": 400,
                    "blocks": [
                        {
                            "bbox": [50, 20, 550, 60],
                            "text": "Encabezado Principal",
                            "font_size": 26,
                        },
                        {
                            "bbox": [50, 110, 550, 160],
                            "text": "Este es un parrafo explicativo con un enlace a https://davidbuenov.com dentro del texto.",
                            "font_size": 14,
                        },
                        {
                            "bbox": [50, 200, 550, 230],
                            "text": "• Primer punto de lista",
                            "font_size": 14,
                        },
                    ],
                }
            ],
        }

        md_bytes = build_markdown_export(payload)
        md_text = md_bytes.decode("utf-8")

        assert "# demo_doc" in md_text
        assert "## Encabezado Principal" in md_text
        assert "[https://davidbuenov.com](https://davidbuenov.com)" in md_text
        assert "- Primer punto de lista" in md_text


class TestZipExport:
    def test_generate_export_zip_contains_selected_files(self) -> None:
        payload = {
            "filename": "presentacion.pdf",
            "export_targets": {"pdf": True, "pptx": True, "md": True},
            "pages": [
                {
                    "page_num": 0,
                    "image_base64": _generate_test_image_base64(400, 300),
                    "render_width_px": 400,
                    "render_height_px": 300,
                    "blocks": [
                        {
                            "bbox": [20, 20, 300, 60],
                            "text": "Bloque en ZIP",
                            "font_size": 16,
                            "is_modified": True,
                        }
                    ],
                }
            ],
        }

        zip_path, temp_dir = generate_export_zip(payload)
        try:
            assert zip_path.exists()
            with zipfile.ZipFile(zip_path, "r") as zf:
                names = zf.namelist()
                assert "Presentacion_Editada_Impresa.pdf" in names
                assert "Presentacion_Editada_DBV.md" in names
                if PPTX_AVAILABLE:
                    assert "Presentacion_Editada_DBV.pptx" in names
        finally:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
