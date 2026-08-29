# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""
Tests unitarios y de integración para el motor de renderizado y extracción PDF (pypdfium2).
"""
from __future__ import annotations

from pathlib import Path

from core.pdf_renderer import (
    process_document_file,
    process_image_file,
    process_pdf_file,
)
from core.result import Err, Ok
from PIL import Image
from reportlab.pdfgen.canvas import Canvas


def _create_synthetic_pdf(path: Path) -> None:
    canvas = Canvas(str(path), pagesize=(600, 400))
    canvas.setFont("Helvetica-Bold", 16)
    canvas.drawString(50, 350, "Este es un documento de prueba con mas de veinte caracteres nativos.")
    canvas.setFont("Helvetica", 12)
    canvas.drawString(50, 300, "Segunda linea de texto en el documento PDF para validar PDFium.")
    canvas.showPage()
    canvas.save()


def _create_synthetic_image(path: Path) -> None:
    image = Image.new("RGB", (640, 480), color="white")
    image.save(path)


class TestPdfRenderer:
    def test_process_pdf_file_extracts_native_text_and_renders(self, tmp_path: Path) -> None:
        pdf_path = tmp_path / "sample.pdf"
        _create_synthetic_pdf(pdf_path)

        result = process_pdf_file(pdf_path, dpi=100)
        assert isinstance(result, Ok)
        context = result.value

        assert context.total_pages == 1
        assert len(context.pages) == 1

        page = context.pages[0]
        assert page.page_num == 0
        assert page.has_native_text is True
        assert page.native_blocks is not None
        assert len(page.native_blocks) >= 1

        # Verificar que los bloques extraídos contienen el texto
        all_text = " ".join(block.text for block in page.native_blocks)
        assert "documento de prueba" in all_text

        # Verificar dimensiones renderizadas
        assert page.image.width > 0
        assert page.image.height > 0
        assert page.render_width_px == float(page.image.width)
        assert page.render_height_px == float(page.image.height)

    def test_process_image_file(self, tmp_path: Path) -> None:
        img_path = tmp_path / "sample.png"
        _create_synthetic_image(img_path)

        result = process_image_file(img_path, dpi=100)
        assert isinstance(result, Ok)
        context = result.value

        assert context.total_pages == 1
        page = context.pages[0]
        assert page.has_native_text is False
        assert page.native_blocks is None
        assert page.image.size == (640, 480)

    def test_process_document_file_routing(self, tmp_path: Path) -> None:
        pdf_path = tmp_path / "route_test.pdf"
        img_path = tmp_path / "route_test.jpg"
        _create_synthetic_pdf(pdf_path)
        _create_synthetic_image(img_path)

        res_pdf = process_document_file(pdf_path)
        assert isinstance(res_pdf, Ok)
        assert res_pdf.value.pages[0].has_native_text is True

        res_img = process_document_file(img_path)
        assert isinstance(res_img, Ok)
        assert res_img.value.pages[0].has_native_text is False

    def test_error_on_non_existent_file(self, tmp_path: Path) -> None:
        non_existent = tmp_path / "does_not_exist.pdf"
        result = process_pdf_file(non_existent)
        assert isinstance(result, Err)
        assert "no existe" in result.message.lower()

    def test_error_on_invalid_extension(self, tmp_path: Path) -> None:
        text_file = tmp_path / "sample.txt"
        text_file.write_text("dummy")
        result = process_document_file(text_file)
        assert isinstance(result, Err)
        assert "no soportado" in result.message.lower()
