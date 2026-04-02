# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Motor de exportación a Markdown a partir del payload procesado por el editor.

Soporta dos fuentes de verdad:
- Bloques detectados por OCR o texto nativo presentes en el payload del frontend.
- Rescate opcional de enlaces ocultos del PDF original usando PyMuPDF.
"""
from __future__ import annotations

from pathlib import Path
from statistics import median
import re

import fitz


def _normalize_whitespace(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()
    return normalized


def _linkify_visible_urls(text: str) -> str:
    url_pattern = re.compile(r"(?<!\]\()(?P<url>https?://[^\s<>)]+)", re.IGNORECASE)
    linked_text = url_pattern.sub(lambda match: f"[{match.group('url')}]({match.group('url')})", text)
    return linked_text


def _page_scale_to_pdf_points(page_data: dict) -> tuple[float, float]:
    render_w = float(page_data.get("render_width_px") or 1.0)
    render_h = float(page_data.get("render_height_px") or 1.0)
    page_w = float(page_data.get("page_width_pt") or render_w)
    page_h = float(page_data.get("page_height_pt") or render_h)
    return page_w / render_w, page_h / render_h


def _block_bbox(block: dict) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = block.get("bbox", [0, 0, 0, 0])
    return float(x0), float(y0), float(x1), float(y1)


def _block_center_y(block: dict) -> float:
    _, y0, _, y1 = _block_bbox(block)
    return (y0 + y1) / 2.0


def _block_center_x(block: dict) -> float:
    x0, _, x1, _ = _block_bbox(block)
    return (x0 + x1) / 2.0


def _block_rect_to_pdf(block: dict, page_data: dict) -> fitz.Rect:
    bbox_pt = block.get("bbox_pt")
    rect: fitz.Rect

    if bbox_pt and len(bbox_pt) == 4:
        rect = fitz.Rect(tuple(float(value) for value in bbox_pt))
    else:
        scale_x, scale_y = _page_scale_to_pdf_points(page_data)
        x0, y0, x1, y1 = block.get("bbox", [0, 0, 0, 0])
        rect = fitz.Rect(
            float(x0) * scale_x,
            float(y0) * scale_y,
            float(x1) * scale_x,
            float(y1) * scale_y,
        )

    return rect


def _sort_words(words: list[tuple]) -> list[tuple]:
    sorted_words = sorted(words, key=lambda word: (round(float(word[1]), 1), float(word[0])))
    return sorted_words


def _is_probable_noise_block(block: dict, median_font_size: float) -> bool:
    text = _normalize_whitespace(str(block.get("text") or ""))
    compact_text = re.sub(r"\s+", "", text)
    compact_alnum = re.sub(r"[^0-9A-Za-z]", "", compact_text)
    font_size = float(block.get("font_size") or median_font_size or 16.0)
    x0, y0, x1, y1 = _block_bbox(block)
    width = max(1.0, x1 - x0)
    height = max(1.0, y1 - y0)

    is_noise = False
    if not text:
        is_noise = True
    elif text == "NotebookLM":
        is_noise = True
    elif len(compact_alnum) <= 3 and compact_alnum.isdigit() and font_size <= median_font_size * 1.2:
        is_noise = True
    elif len(compact_alnum) <= 2 and re.fullmatch(r"[0Oo]+", compact_alnum):
        is_noise = True
    elif len(compact_alnum) <= 2 and width <= max(28.0, median_font_size * 1.4) and height <= max(28.0, median_font_size * 1.4):
        is_noise = True

    return is_noise


def _build_rows_from_blocks(blocks: list[dict], median_font_size: float) -> list[list[dict]]:
    row_threshold = max(16.0, median_font_size * 0.9)
    rows: list[list[dict]] = []

    for block in sorted(blocks, key=lambda item: (_block_center_y(item), _block_bbox(item)[0])):
        current_center_y = _block_center_y(block)
        assigned = False

        for row in rows:
            row_center_y = sum(_block_center_y(existing) for existing in row) / len(row)
            if abs(current_center_y - row_center_y) <= row_threshold:
                row.append(block)
                assigned = True
                break

        if not assigned:
            rows.append([block])

    for row in rows:
        row.sort(key=lambda item: _block_bbox(item)[0])

    return rows


def _rows_match_grid(left_row: list[dict], right_row: list[dict], median_font_size: float) -> bool:
    max_column_delta = max(56.0, median_font_size * 3.0)
    same_count = len(left_row) == len(right_row)
    valid_count = 2 <= len(left_row) <= 4

    if not same_count or not valid_count:
        return False

    for left_block, right_block in zip(left_row, right_row):
        left_x = _block_center_x(left_block)
        right_x = _block_center_x(right_block)
        if abs(left_x - right_x) > max_column_delta:
            return False

    return True


def _reorder_blocks_for_reading(blocks: list[dict], median_font_size: float) -> list[dict]:
    rows = _build_rows_from_blocks(blocks, median_font_size)
    reordered_blocks: list[dict] = []
    index = 0

    while index < len(rows):
        current_row = rows[index]
        if len(current_row) < 2:
            reordered_blocks.extend(current_row)
            index += 1
            continue

        grid_rows = [current_row]
        next_index = index + 1
        while next_index < len(rows) and _rows_match_grid(grid_rows[-1], rows[next_index], median_font_size):
            grid_rows.append(rows[next_index])
            next_index += 1

        if len(grid_rows) >= 2:
            column_count = len(grid_rows[0])
            for column_index in range(column_count):
                for row in grid_rows:
                    reordered_blocks.append(row[column_index])
        else:
            reordered_blocks.extend(current_row)

        index = next_index if len(grid_rows) >= 2 else index + 1

    return reordered_blocks


def _extract_hidden_links(page: fitz.Page) -> list[dict]:
    page_links: list[dict] = []
    words = _sort_words(page.get_text("words"))

    for link in page.get_links():
        uri = link.get("uri")
        link_rect_raw = link.get("from")
        if not uri or not link_rect_raw:
            continue

        link_rect = fitz.Rect(link_rect_raw)
        linked_words = [
            word for word in words
            if link_rect.intersects(fitz.Rect(float(word[0]), float(word[1]), float(word[2]), float(word[3])))
        ]
        link_text = _normalize_whitespace(" ".join(str(word[4]) for word in linked_words))

        page_links.append({
            "rect": link_rect,
            "url": str(uri),
            "text": link_text,
        })

    return page_links


def _replace_first_literal(text: str, needle: str, replacement: str) -> str:
    replaced_text = text
    if needle:
        replaced_text = text.replace(needle, replacement, 1)
    return replaced_text


def _decorate_text_with_hidden_links(text: str, block_rect: fitz.Rect, page_links: list[dict]) -> str:
    decorated_text = text
    matching_links = [
        link for link in page_links
        if block_rect.intersects(link["rect"])
    ]

    for link in matching_links:
        link_text = _normalize_whitespace(str(link.get("text") or ""))
        url = str(link.get("url") or "")
        if not url:
            continue

        markdown_link = f"[{link_text}]({url})" if link_text else ""
        if link_text and link_text in decorated_text and markdown_link not in decorated_text:
            decorated_text = _replace_first_literal(decorated_text, link_text, markdown_link)

    if matching_links and decorated_text == text and text:
        fallback_url = str(matching_links[0].get("url") or "")
        if fallback_url and f"]({fallback_url})" not in decorated_text:
            decorated_text = f"[{decorated_text}]({fallback_url})"

    return decorated_text


def _looks_like_heading(text: str, font_size: float, median_font_size: float) -> bool:
    compact_text = text.strip()
    is_heading = (
        bool(compact_text)
        and len(compact_text) <= 90
        and font_size >= max(18.0, median_font_size * 1.45)
        and not compact_text.startswith(("- ", "* ", "# "))
        and not compact_text.endswith((":", ";"))
    )
    return is_heading


def _format_paragraph_as_markdown(text: str, font_size: float, median_font_size: float) -> str:
    clean_text = _linkify_visible_urls(_normalize_whitespace(text))
    markdown_line = clean_text

    if _looks_like_heading(clean_text, font_size, median_font_size):
        markdown_line = f"## {clean_text}"
    elif clean_text.startswith(("• ", "- ", "* ")):
        markdown_line = f"- {clean_text[2:].strip()}"

    return markdown_line


def _should_join_blocks(previous_block: dict, current_block: dict, median_font_size: float) -> bool:
    prev_x0, prev_y0, _, prev_y1 = [float(value) for value in previous_block.get("bbox", [0, 0, 0, 0])]
    curr_x0, curr_y0, _, _ = [float(value) for value in current_block.get("bbox", [0, 0, 0, 0])]

    vertical_gap = curr_y0 - prev_y1
    same_visual_band = abs(curr_y0 - prev_y0) <= max(10.0, median_font_size * 0.45)
    nearby_line = vertical_gap <= max(14.0, median_font_size * 0.85)
    similar_indent = abs(curr_x0 - prev_x0) <= max(40.0, median_font_size * 1.6)

    return (same_visual_band or nearby_line) and similar_indent


def _build_page_markdown(page_data: dict, page_links: list[dict], fallback_text: str = "") -> str:
    blocks = [block for block in page_data.get("blocks", []) if _normalize_whitespace(str(block.get("text") or ""))]
    initially_sorted_blocks = sorted(blocks, key=lambda block: (_block_center_y(block), _block_bbox(block)[0]))

    initial_font_sizes = [float(block.get("font_size") or 16.0) for block in initially_sorted_blocks]
    median_font_size = float(median(initial_font_sizes)) if initial_font_sizes else 16.0
    filtered_blocks = [block for block in initially_sorted_blocks if not _is_probable_noise_block(block, median_font_size)]
    sorted_blocks = _reorder_blocks_for_reading(filtered_blocks, median_font_size)

    font_sizes = [float(block.get("font_size") or 16.0) for block in sorted_blocks]
    median_font_size = float(median(font_sizes)) if font_sizes else median_font_size
    markdown_lines: list[str] = [f"# Página {int(page_data.get('page_num', 0)) + 1}", ""]

    if not sorted_blocks:
        plain_text = _linkify_visible_urls(_normalize_whitespace(fallback_text))
        markdown_lines.append(plain_text if plain_text else "_Sin texto detectado en esta página._")
        return "\n".join(markdown_lines).strip()

    paragraph_blocks: list[dict] = []
    previous_paragraph_bottom: float | None = None

    def flush_paragraph() -> None:
        nonlocal paragraph_blocks, previous_paragraph_bottom
        if not paragraph_blocks:
            return

        paragraph_texts: list[str] = []
        paragraph_font = max(float(block.get("font_size") or 16.0) for block in paragraph_blocks)
        paragraph_bottom = max(float(block.get("bbox", [0, 0, 0, 0])[3]) for block in paragraph_blocks)
        paragraph_top = min(float(block.get("bbox", [0, 0, 0, 0])[1]) for block in paragraph_blocks)

        for block in paragraph_blocks:
            text = _normalize_whitespace(str(block.get("text") or ""))
            if not text:
                continue
            text = _decorate_text_with_hidden_links(text, _block_rect_to_pdf(block, page_data), page_links)
            paragraph_texts.append(text)

        if not paragraph_texts:
            paragraph_blocks = []
            previous_paragraph_bottom = paragraph_bottom
            return

        if previous_paragraph_bottom is not None:
            vertical_gap = paragraph_top - previous_paragraph_bottom
            if vertical_gap > max(18.0, median_font_size * 1.1):
                markdown_lines.append("")

        paragraph_text = " ".join(paragraph_texts)
        markdown_lines.append(_format_paragraph_as_markdown(paragraph_text, paragraph_font, median_font_size))

        paragraph_blocks = []
        previous_paragraph_bottom = paragraph_bottom

    for block in sorted_blocks:
        if not paragraph_blocks:
            paragraph_blocks = [block]
            continue

        if _should_join_blocks(paragraph_blocks[-1], block, median_font_size):
            paragraph_blocks.append(block)
        else:
            flush_paragraph()
            paragraph_blocks = [block]

    flush_paragraph()
    return "\n".join(markdown_lines).strip()


def build_markdown_export(payload: dict, source_pdf_path: Path | None = None) -> bytes:
    markdown_sections: list[str] = []
    filename = str(payload.get("filename") or "documento")
    title = Path(filename).stem or "documento"
    markdown_sections.append(f"# {title}")
    markdown_sections.append("")

    pdf_document: fitz.Document | None = None
    if source_pdf_path and source_pdf_path.exists():
        pdf_document = fitz.open(str(source_pdf_path))

    try:
        for page_data in payload.get("pages", []):
            page_links: list[dict] = []
            fallback_text = ""
            page_num = int(page_data.get("page_num", 0))

            if pdf_document and 0 <= page_num < len(pdf_document):
                pdf_page = pdf_document[page_num]
                page_links = _extract_hidden_links(pdf_page)
                fallback_text = str(pdf_page.get_text("text") or "")

            markdown_sections.append(_build_page_markdown(page_data, page_links, fallback_text))
            markdown_sections.append("")
    finally:
        if pdf_document is not None:
            pdf_document.close()

    markdown_content = "\n".join(markdown_sections).strip() + "\n"
    return markdown_content.encode("utf-8")
