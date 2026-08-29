# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""
Tests unitarios exhaustivos para helpers de geometría, fuentes Base-14 y utilidades matemáticas.
"""
from __future__ import annotations

import pytest
from core.exporter_engine import (
    _fit_reportlab_font_size,
    _hex_to_rgb,
    _page_scale_to_pdf_points,
    _page_scale_to_ppt_points,
    _reportlab_text_lines,
    _safe_line_spacing,
    _to_pdf_font,
)
from core.pdf_renderer import _clean_font_name


class TestHexToRgb:
    def test_valid_hex(self) -> None:
        assert _hex_to_rgb("#ffffff") == (255, 255, 255)
        assert _hex_to_rgb("#000000") == (0, 0, 0)
        assert _hex_to_rgb("#ff0000") == (255, 0, 0)
        assert _hex_to_rgb("#00ff00") == (0, 255, 0)
        assert _hex_to_rgb("#0000ff") == (0, 0, 255)
        assert _hex_to_rgb("102030") == (16, 32, 48)

    def test_invalid_hex_fallback(self) -> None:
        assert _hex_to_rgb("invalid") == (255, 255, 255)
        assert _hex_to_rgb("#123") == (255, 255, 255)
        assert _hex_to_rgb("") == (255, 255, 255)


class TestSafeLineSpacing:
    def test_normal_values(self) -> None:
        assert _safe_line_spacing(1.15) == 1.15
        assert _safe_line_spacing("1.5") == 1.5
        assert _safe_line_spacing(2.0) == 2.0

    def test_clamping_bounds(self) -> None:
        assert _safe_line_spacing(0.5) == 0.8  # mínimo acotado a 0.8
        assert _safe_line_spacing(5.0) == 3.0  # máximo acotado a 3.0

    def test_invalid_and_none_fallbacks(self) -> None:
        assert _safe_line_spacing(None) == 1.15
        assert _safe_line_spacing("invalid") == 1.15


class TestToPdfFontBase14:
    @pytest.mark.parametrize(
        ("family", "bold", "italic", "expected"),
        [
            # Helvetica family
            ("Helvetica", False, False, "Helvetica"),
            ("Arial", False, False, "Helvetica"),
            ("system-ui", False, False, "Helvetica"),
            ("Helvetica", True, False, "Helvetica-Bold"),
            ("Arial", False, True, "Helvetica-Oblique"),
            ("Arial", True, True, "Helvetica-BoldOblique"),
            # Times family
            ("Times", False, False, "Times-Roman"),
            ("Times New Roman", False, False, "Times-Roman"),
            ("Georgia", False, False, "Times-Roman"),
            ("Times", True, False, "Times-Bold"),
            ("Times New Roman", False, True, "Times-Italic"),
            ("Times", True, True, "Times-BoldItalic"),
            # Courier family
            ("Courier", False, False, "Courier"),
            ("Courier New", False, False, "Courier"),
            ("Courier", True, False, "Courier-Bold"),
            ("Courier New", False, True, "Courier-Oblique"),
            ("Courier", True, True, "Courier-BoldOblique"),
            # None / Empty fallback
            (None, False, False, "Helvetica"),
            ("", False, False, "Helvetica"),
        ],
    )
    def test_all_base14_variants(self, family: str | None, bold: bool, italic: bool, expected: str) -> None:
        assert _to_pdf_font(family, is_bold=bold, is_italic=italic) == expected


class TestCleanFontName:
    def test_cleaning_subsets_and_suffixes(self) -> None:
        assert _clean_font_name("ArialMT") == "Arial"
        assert _clean_font_name("Arial-BoldMT") == "Arial"
        assert _clean_font_name("TimesNewRoman-Bold") == "Times New Roman"
        assert _clean_font_name("CourierNewPSMT") == "Courier New"
        assert _clean_font_name("Calibri") == "Calibri"


class TestPageScalingHelpers:
    def test_page_scale_to_pdf_points(self) -> None:
        page_data = {
            "render_width_px": 800,
            "render_height_px": 600,
            "page_width_pt": 400,
            "page_height_pt": 300,
        }
        scale_x, scale_y = _page_scale_to_pdf_points(page_data)
        assert scale_x == 0.5
        assert scale_y == 0.5

    def test_page_scale_to_ppt_points(self) -> None:
        page_data = {
            "page_width_pt": 720,
            "page_height_pt": 540,
        }
        scale_x, scale_y = _page_scale_to_ppt_points(page_data, 1440, 1080)
        assert scale_x == 0.5
        assert scale_y == 0.5


class TestReportLabTextFitting:
    def test_text_lines_wrapping(self) -> None:
        text = "Primera linea con varias palabras para comprobar el salto de linea automatico"
        lines = _reportlab_text_lines(text, "Helvetica", 12.0, 150.0)
        assert len(lines) > 1
        assert " ".join(lines).replace("  ", " ") == text

    def test_font_size_reduction_when_tight(self) -> None:
        text = "Texto largo que no cabe en caja reducida"
        fitted_size, fitted_lines, _overflow_lines = _fit_reportlab_font_size(
            text=text,
            font_name="Helvetica",
            requested_size=24.0,
            width=60.0,
            height=20.0,
            line_spacing=1.15,
        )
        assert fitted_size < 24.0
        assert len(fitted_lines) >= 1
