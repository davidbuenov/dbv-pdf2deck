# =============================================================================
# DBV PDF2Deck - Local OCR, Visual Canvas and PPTX Export
# Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================

from __future__ import annotations

import base64
import io

from core.exporter_engine import _hex_to_rgb, _safe_line_spacing, build_pdf_export
from PIL import Image
from pypdf import PdfReader


def _image_base64() -> str:
    image = Image.new("RGB", (400, 200), "white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def test_geometry_helpers_validate_values() -> None:
    assert _hex_to_rgb("#102030") == (16, 32, 48)
    assert _hex_to_rgb("invalid") == (255, 255, 255)
    assert _safe_line_spacing(None) == 1.15
    assert _safe_line_spacing(8) == 3.0


def test_pdf_export_contains_text_from_a_narrow_block() -> None:
    payload = {
        "export_mode": "only_modified",
        "pages": [{
            "image_base64": _image_base64(),
            "render_width_px": 400,
            "render_height_px": 200,
            "page_width_pt": 400,
            "page_height_pt": 200,
            "blocks": [{
                "bbox": [20, 20, 380, 80],
                "text": "Texto exportado y visible",
                "font_size": 24,
                "font_family": "Arial",
                "text_color": "#000000",
                "bg_transparent": True,
                "is_modified": True,
            }],
        }],
    }

    reader = PdfReader(io.BytesIO(build_pdf_export(payload)))

    assert len(reader.pages) == 1
    assert "Texto exportado y visible" in (reader.pages[0].extract_text() or "")
