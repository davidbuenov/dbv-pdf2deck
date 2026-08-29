# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Módulo responsable de procesar archivos PDF, extraer información básica
como presencia de texto por página, y renderizar su lienzo a imágenes rasterizadas.
"""
from __future__ import annotations

import collections
import ctypes
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw
from PIL import Image, ImageOps

from .ocr_engine import OCRBlock
from .result import Err, Ok, Result
from .settings import (
    EXPORT_MAX_SIDE_PX,
    EXPORT_MAX_TOTAL_PIXELS,
    MAX_IMAGE_SIDE_PX,
    MAX_IMAGE_TOTAL_PIXELS,
    NATIVE_TEXT_MIN_CHARS,
    NATIVE_TEXT_MIN_COVERAGE,
)

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _clean_font_name(raw: str) -> str:
    """
    Extrae el nombre de familia limpio de los nombres internos del PDF:
    'ArialMT' -> 'Arial', 'Arial-BoldMT' -> 'Arial', 'TimesNewRoman-Bold' -> 'Times New Roman'.
    """
    import re as _re
    # Tomar solo la parte antes del primer guión (elimina -Bold, -BoldMT, -Italic, etc.)
    base = _re.split(r'[-,]', raw)[0]
    # Eliminar sufijos pegados al nombre de familia (sin guión) como MT, PS, PSMT
    base = _re.sub(r'(MT|PS)+$', '', base).strip()
    # Remapear nombres compuestos comunes a su forma legible
    _REMAP = {
        "timesnewroman": "Times New Roman",
        "couriernew": "Courier New",
    }
    return _REMAP.get(base.lower(), base) or raw


@dataclass(slots=True)
class PageRender:
    """
    Contiene la imagen renderizada y los metadatos inherentes de una página específica.

    Args:
        page_num: El índice base 0 con el que se identifica la página extraída.
        image: La instancia de la imagen rasterizada.
        has_native_text: Determina mediante una aserción básica si cuenta con texto no imagenológico.
    """
    page_num: int
    image: Image.Image
    has_native_text: bool
    native_blocks: list[OCRBlock] | None = None
    page_width_pt: float = 0.0
    page_height_pt: float = 0.0
    render_width_px: float = 0.0
    render_height_px: float = 0.0


@dataclass(slots=True)
class PDFDocumentContext:
    """
    Agrupa las características clave y aglutina las páginas renderizadas de un PDF.

    Args:
        filename: El nombre referencial del documento ingestando.
        total_pages: Cantidad absoluta de folios en el PDF.
        pages: Lista inmutable con el modelo de render procesado de casa hoja.
    """
    filename: str
    total_pages: int
    pages: list[PageRender]


def _clean_pdfium_font_name(raw: str) -> str:
    if len(raw) > 7 and raw[6] == "+":
        raw = raw[7:]
    return _clean_font_name(raw)


def _pdfium_font_info(text_page: object, char_index: int) -> tuple[str, int]:
    raw_text_page = text_page.raw
    buffer = ctypes.create_string_buffer(256)
    flags = ctypes.c_int(0)
    length = pdfium_raw.FPDFText_GetFontInfo(
        raw_text_page, char_index, buffer, 256, ctypes.byref(flags)
    )
    font_name = buffer.raw[: max(0, length - 1)].decode("utf-8", "replace") if length > 0 else ""
    return font_name, flags.value


def _pdfium_char_color(text_page: object, char_index: int) -> tuple[int, int, int] | None:
    raw_text_page = text_page.raw
    red = ctypes.c_uint()
    green = ctypes.c_uint()
    blue = ctypes.c_uint()
    alpha = ctypes.c_uint()
    success = pdfium_raw.FPDFText_GetFillColor(
        raw_text_page,
        char_index,
        ctypes.byref(red),
        ctypes.byref(green),
        ctypes.byref(blue),
        ctypes.byref(alpha),
    )
    return (red.value, green.value, blue.value) if success else None


def _pdfium_effective_font_size(text_page: object, char_index: int) -> float:
    raw_text_page = text_page.raw
    size = float(pdfium_raw.FPDFText_GetFontSize(raw_text_page, char_index))
    matrix = pdfium_raw.FS_MATRIX()
    if pdfium_raw.FPDFText_GetMatrix(raw_text_page, char_index, ctypes.byref(matrix)):
        scale = (abs(matrix.b) ** 2 + abs(matrix.d) ** 2) ** 0.5
        if scale > 0:
            size *= scale
    return size


def _pdfium_loose_char_box(text_page: object, char_index: int) -> tuple[float, float, float, float] | None:
    raw_text_page = text_page.raw
    rect = pdfium_raw.FS_RECTF()
    if not pdfium_raw.FPDFText_GetLooseCharBox(raw_text_page, char_index, ctypes.byref(rect)):
        return None
    return rect.left, rect.bottom, rect.right, rect.top


def _pdfium_native_lines(page: object, page_height_pt: float) -> list[dict[str, object]]:
    text_page = page.get_textpage()
    raw_text_page = text_page.raw
    char_count = pdfium_raw.FPDFText_CountChars(raw_text_page)
    chars: list[dict[str, object]] = []
    for char_index in range(char_count):
        unicode_value = pdfium_raw.FPDFText_GetUnicode(raw_text_page, char_index)
        char_box = _pdfium_loose_char_box(text_page, char_index)
        if char_box is None:
            continue
        font_name, font_flags = _pdfium_font_info(text_page, char_index)
        chars.append({
            "ch": chr(unicode_value) if unicode_value else "",
            "box": char_box,
            "size": _pdfium_effective_font_size(text_page, char_index),
            "weight": int(pdfium_raw.FPDFText_GetFontWeight(raw_text_page, char_index)),
            "font": font_name,
            "font_flags": font_flags,
            "color": _pdfium_char_color(text_page, char_index),
        })

    lines: list[dict[str, object]] = []

    def flush(group: list[dict[str, object]]) -> None:
        visible_group = [char for char in group if char["ch"] not in ("\r", "\n")]
        text = "".join(str(char["ch"]) for char in visible_group).strip()
        if not text:
            return
        solid = [
            char for char in visible_group
            if float(char["box"][3]) - float(char["box"][1]) > 0.0
        ] or visible_group
        x0 = min(float(char["box"][0]) for char in visible_group)
        x1 = max(float(char["box"][2]) for char in visible_group)
        y_bottom = min(float(char["box"][1]) for char in solid)
        y_top = max(float(char["box"][3]) for char in solid)
        sizes = [float(char["size"]) for char in solid if float(char["size"]) > 0]
        names = [str(char["font"]) for char in solid if char["font"]]
        raw_font = collections.Counter(names).most_common(1)[0][0] if names else "system-ui"
        max_weight = max((int(char["weight"]) for char in visible_group), default=0)
        has_force_bold = any(int(char["font_flags"]) & (1 << 18) for char in visible_group)
        lower_font = raw_font.lower()
        name_says_bold = any(token in lower_font for token in ("bold", "black", "heavy"))
        name_says_style = name_says_bold or any(
            token in lower_font for token in ("italic", "oblique", "regular", "light", "medium")
        )
        bold = name_says_bold or has_force_bold if name_says_style else max_weight >= 600
        italic = any(int(char["font_flags"]) & (1 << 6) for char in visible_group)
        italic = italic or "italic" in lower_font or "oblique" in lower_font
        colors = [char["color"] for char in visible_group if char["color"]]
        text_color = "#000000"
        if colors:
            r = int(sum(color[0] for color in colors) / len(colors))
            g = int(sum(color[1] for color in colors) / len(colors))
            b = int(sum(color[2] for color in colors) / len(colors))
            text_color = f"#{r:02x}{g:02x}{b:02x}"
        lines.append({
            "text": text,
            "bbox": [x0, page_height_pt - y_top, x1, page_height_pt - y_bottom],
            "font": _clean_pdfium_font_name(raw_font),
            "size": sum(sizes) / len(sizes) if sizes else 12.0,
            "bold": bold,
            "italic": italic,
            "text_color": text_color,
        })

    current: list[dict[str, object]] = []
    previous_baseline: float | None = None
    previous_x1: float | None = None
    for char in chars:
        value = str(char["ch"])
        if value in ("\r", "\n"):
            flush(current)
            current = []
            previous_baseline = None
            previous_x1 = None
            continue
        char_box = char["box"]
        char_height = float(char_box[3]) - float(char_box[1])
        if char_height <= 0.0:
            current.append(char)
            continue
        baseline = float(char_box[1])
        size = float(char["size"])
        split = previous_baseline is not None and abs(baseline - previous_baseline) > max(1.0, size * 0.4)
        if not split and previous_x1 is not None:
            split = float(char_box[0]) - previous_x1 > max(2.0, size)
        if split:
            flush(current)
            current = []
        current.append(char)
        previous_baseline = baseline
        previous_x1 = float(char_box[2])
    flush(current)
    return lines



def _native_text_coverage(
    native_lines: list[dict], page_width_pt: float, page_height_pt: float
) -> float:
    """
    Fracción de la página cubierta por las cajas de texto nativo.

    Es el discriminador entre «documento de texto» y «imagen con pie de
    página»: medido sobre PDFs reales, un pie de página cubre ~0,4 % de la
    página y un documento de texto entre el 24 % y el 33 %.

    Args:
        native_lines (list[dict]): Líneas devueltas por `_pdfium_native_lines()`.
        page_width_pt (float): Ancho de la página en puntos.
        page_height_pt (float): Alto de la página en puntos.

    Returns:
        float: Cobertura entre 0.0 y 1.0. Las cajas solapadas suman dos veces,
        lo cual solo puede empujar hacia «nativo», nunca a omitir OCR de más.
    """
    page_area = max(1.0, float(page_width_pt) * float(page_height_pt))
    covered = 0.0
    for line in native_lines:
        x0, y0, x1, y1 = (float(value) for value in line["bbox"])
        covered += abs(x1 - x0) * abs(y1 - y0)
    return min(1.0, covered / page_area)


def clamp_export_dpi(page_width_pt: float, page_height_pt: float, requested_dpi: int) -> int:
    """
    Baja el DPI pedido hasta que la página quepa en los techos de exportación.

    Rasterizar sin mirar el tamaño de la página es la vía rápida al MemoryError:
    600 DPI sobre una página A3 apaisada son más de 300 millones de píxeles. Se
    prefiere degradar la nitidez a reventar la exportación entera.

    Args:
        page_width_pt (float): Ancho de la página en puntos tipográficos.
        page_height_pt (float): Alto de la página en puntos tipográficos.
        requested_dpi (int): Resolución solicitada por el usuario.

    Returns:
        int: DPI efectivo, nunca por debajo de 72.
    """
    width_in = max(0.01, float(page_width_pt) / 72.0)
    height_in = max(0.01, float(page_height_pt) / 72.0)

    dpi_by_side = min(EXPORT_MAX_SIDE_PX / width_in, EXPORT_MAX_SIDE_PX / height_in)
    dpi_by_area = (EXPORT_MAX_TOTAL_PIXELS / (width_in * height_in)) ** 0.5

    return max(72, int(min(float(requested_dpi), dpi_by_side, dpi_by_area)))


def render_pdf_page_at_dpi(file_path: Path, page_index: int, dpi: int) -> Result[Image.Image]:
    """
    Rasteriza una única página del PDF original a la resolución indicada.

    Se usa solo al exportar a PPTX, que no admite páginas vectoriales y necesita
    un fondo de mapa de bits. El DPI se acota con `clamp_export_dpi()`.

    Args:
        file_path (Path): Ruta del PDF original conservado en `DOCUMENT_STORE`.
        page_index (int): Índice de página en base cero.
        dpi (int): Resolución solicitada.

    Returns:
        Result[Image.Image]: Imagen RGB de la página, o el motivo del fallo.
    """
    resultado: Result[Image.Image]
    if not file_path.exists() or file_path.suffix.lower() != ".pdf":
        return Err(f"No hay PDF original utilizable en: {file_path}")

    document = None
    try:
        document = pdfium.PdfDocument(str(file_path))
        if page_index < 0 or page_index >= len(document):
            return Err(f"La página {page_index} no existe en el PDF original.")

        page = document[page_index]
        effective_dpi = clamp_export_dpi(float(page.get_width()), float(page.get_height()), dpi)
        rendered = page.render(scale=effective_dpi / 72.0).to_pil().convert("RGB")
        resultado = Ok(rendered)
    except Exception as error:
        resultado = Err(f"Fallo al rasterizar la página {page_index} a {dpi} DPI: {error!s}")
    finally:
        if document is not None:
            document.close()
    return resultado


def process_image_file(file_path: Path, dpi: int = 150) -> Result[PDFDocumentContext]:
    """
    Procesa una imagen individual como si fuera un documento de una sola página,
    para reutilizar el mismo pipeline OCR/Canvas/export sin bifurcar lógica.

    Args:
        file_path (Path): Ruta física de la imagen a procesar.
        dpi (int, opcional): Resolución de referencia para convertir píxeles a puntos.

    Returns:
        Result[PDFDocumentContext]: Contexto de documento con una única página renderizada.
    """
    resultado: Result[PDFDocumentContext]

    if not file_path.exists():
        resultado = Err(f"El archivo especificado no existe o la ruta es inválida: {file_path}")
    elif not file_path.is_file() or file_path.suffix.lower() not in SUPPORTED_IMAGE_EXTENSIONS:
        resultado = Err(f"La ruta no apunta a una imagen soportada válida: {file_path}")
    else:
        try:
            with Image.open(file_path) as raw_image:
                # Respeta orientación embebida de cámara/móvil y normaliza modo para OCR estable.
                normalized = ImageOps.exif_transpose(raw_image)
                page_image = normalized.convert("RGB")

            pixel_count = int(page_image.width) * int(page_image.height)
            if int(page_image.width) > MAX_IMAGE_SIDE_PX or int(page_image.height) > MAX_IMAGE_SIDE_PX:
                resultado = Err(
                    
                        f"La imagen excede el tamaño máximo permitido "
                        f"({page_image.width}x{page_image.height}px). "
                        f"Límite por lado: {MAX_IMAGE_SIDE_PX}px."
                    
                )
                return resultado
            if pixel_count > MAX_IMAGE_TOTAL_PIXELS:
                resultado = Err(
                    
                        f"La imagen excede el máximo de píxeles permitidos "
                        f"({pixel_count:,} px). Límite: {MAX_IMAGE_TOTAL_PIXELS:,} px."
                    
                )
                return resultado

            page_width_pt = float(page_image.width) * 72.0 / float(max(1, dpi))
            page_height_pt = float(page_image.height) * 72.0 / float(max(1, dpi))

            page = PageRender(
                page_num=0,
                image=page_image,
                has_native_text=False,
                native_blocks=None,
                page_width_pt=page_width_pt,
                page_height_pt=page_height_pt,
                render_width_px=float(page_image.width),
                render_height_px=float(page_image.height)
            )

            context = PDFDocumentContext(
                filename=file_path.name,
                total_pages=1,
                pages=[page]
            )
            resultado = Ok(context)
        except Exception as e:
            resultado = Err(f"Fallo inesperado del sistema al transformar la imagen: {e!s}")

    return resultado


def process_pdf_file(file_path: Path, dpi: int = 150) -> Result[PDFDocumentContext]:
    """Lee y rasteriza un PDF usando PDFium, preservando el contrato del pipeline."""
    resultado: Result[PDFDocumentContext]
    if not file_path.exists():
        resultado = Err(f"El archivo especificado no existe o la ruta es inválida: {file_path}")
    elif not file_path.is_file() or file_path.suffix.lower() != ".pdf":
        resultado = Err(f"La ruta no apunta a un archivo de formato de extensión PDF válido: {file_path}")
    else:
        try:
            document = pdfium.PdfDocument(str(file_path))
            pages_data: list[PageRender] = []
            zoom_factor = dpi / 72.0
            for page_index in range(len(document)):
                page = document[page_index]
                page_width_pt = float(page.get_width())
                page_height_pt = float(page.get_height())
                text_page = page.get_textpage()
                raw_text = text_page.get_text_bounded() or ""
                native_text = re.sub(r"[\W_]+", "", raw_text)

                # Dos condiciones, no una. Los caracteres solos no distinguen un
                # documento de texto de una infografía con pie de página, y dar
                # por nativa una página que es una imagen con firma al pie omite
                # el OCR y deja todo el contenido real sin leer.
                native_lines = (
                    _pdfium_native_lines(page, page_height_pt)
                    if len(native_text) > NATIVE_TEXT_MIN_CHARS
                    else []
                )
                has_native_text = _native_text_coverage(
                    native_lines, page_width_pt, page_height_pt
                ) >= NATIVE_TEXT_MIN_COVERAGE
                if not has_native_text:
                    native_lines = []
                rendered_image = page.render(scale=zoom_factor).to_pil().convert("RGB")
                pixel_count = rendered_image.width * rendered_image.height
                if rendered_image.width > MAX_IMAGE_SIDE_PX or rendered_image.height > MAX_IMAGE_SIDE_PX:
                    resultado = Err(
                        f"La página {page_index + 1} excede el tamaño máximo permitido "
                        f"({rendered_image.width}x{rendered_image.height}px). "
                        f"Límite por lado: {MAX_IMAGE_SIDE_PX}px."
                    )
                    document.close()
                    return resultado
                if pixel_count > MAX_IMAGE_TOTAL_PIXELS:
                    resultado = Err(
                        f"La página {page_index + 1} excede el máximo de píxeles permitidos "
                        f"({pixel_count:,} px). Límite: {MAX_IMAGE_TOTAL_PIXELS:,} px."
                    )
                    document.close()
                    return resultado

                blocks: list[OCRBlock] | None = None
                if has_native_text:
                    blocks = []
                    for line in native_lines:
                        bbox_pt = tuple(float(value) for value in line["bbox"])
                        scaled_bbox = tuple(value * zoom_factor for value in bbox_pt)
                        blocks.append(OCRBlock(
                            id=str(uuid.uuid4()),
                            page=page_index,
                            bbox=scaled_bbox,
                            text=str(line["text"]),
                            confidence=1.0,
                            is_new=False,
                            font_size=float(line["size"]) * zoom_factor,
                            font_family=str(line["font"]),
                            is_bold=bool(line["bold"]),
                            is_italic=bool(line["italic"]),
                            bbox_pt=bbox_pt,
                            text_color_hex=str(line["text_color"]),
                            bg_color_hex="#ffffff"
                        ))
                pages_data.append(PageRender(
                    page_num=page_index,
                    image=rendered_image,
                    has_native_text=has_native_text,
                    native_blocks=blocks,
                    page_width_pt=page_width_pt,
                    page_height_pt=page_height_pt,
                    render_width_px=float(rendered_image.width),
                    render_height_px=float(rendered_image.height)
                ))
            document.close()
            resultado = Ok(PDFDocumentContext(file_path.name, len(pages_data), pages_data))
        except Exception as error:
            resultado = Err(f"Fallo inesperado del sistema al transformar el PDF: {error!s}")
    return resultado


def process_document_file(file_path: Path, dpi: int = 150) -> Result[PDFDocumentContext]:
    """
    Enrutador unificado para procesar PDF multi-página o imagen de página única.
    """
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return process_pdf_file(file_path, dpi=dpi)
    if suffix in SUPPORTED_IMAGE_EXTENSIONS:
        return process_image_file(file_path, dpi=dpi)
    return Err(f"Formato no soportado para procesamiento: {file_path.suffix}")
