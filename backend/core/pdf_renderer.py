# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Módulo responsable de procesar archivos PDF, extraer información básica
como presencia de texto por página, y renderizar su lienzo a imágenes rasterizadas.
"""
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
from PIL import Image, ImageOps
import uuid

from .result import Err, Ok, Result
from .ocr_engine import OCRBlock
from .settings import MAX_IMAGE_SIDE_PX, MAX_IMAGE_TOTAL_PIXELS


SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


def _clean_font_name(raw: str) -> str:
    """
    Extrae el nombre de familia limpio de los nombres internos del PDF:
    'ArialMT' -> 'Arial', 'Arial-BoldMT' -> 'Arial', 'TimesNewRoman-Bold' -> 'Times New Roman'.
    """
    import re as _re
    # Tomar solo la parte antes del primer guión (elimina -Bold, -BoldMT, -Italic, etc.)
    base = _re.split(r'[-,]', raw)[0]
    # Eliminar sufijos pegados al nombre de familia (sin guión)
    base = _re.sub(r'(MT|PS)$', '', base).strip()
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


def process_pdf_file(file_path: Path, dpi: int = 150) -> Result[PDFDocumentContext]:
    """
    Toma un archivo PDF alojado en sistema, averigua sus características
    e intenta renderizar por lotes sus páginas con la resolución exigida.

    Este proceso está sujeto a la integridad estructural del documento analizado.

    Args:
        file_path (Path): Ruta física objetiva hacia el archivo PDF a leer.
        dpi (int, opcional): Resolución (Dots Per Inch) de la imagen resultante final. Por defecto 150.

    Returns:
        Result[PDFDocumentContext]: Objeto contenedor con el esquema renderizado validado,
        o una justificación de error contextualmente atrapada en caso de fallo crítico de lectura.
    """
    resultado: Result[PDFDocumentContext]

    if not file_path.exists():
        resultado = Err(f"El archivo especificado no existe o la ruta es inválida: {file_path}")
    elif not file_path.is_file() or file_path.suffix.lower() != ".pdf":
        resultado = Err(f"La ruta no apunta a un archivo de formato de extensión PDF válido: {file_path}")
    else:
        try:
            pages_data: list[PageRender] = []
            
            # Context manager imperativo para librerar de forma segura los punteros en C de PyMuPDF
            with fitz.open(str(file_path)) as pdf_document:
                total_pages: int = len(pdf_document)
                
                import re
                
                # Iteramos todas las páginas, determinamos si hay texto nativo del formato y generamos canvas
                for page_index in range(total_pages):
                    page: fitz.Page = pdf_document[page_index]
                    
                    raw_text_content = page.get_text()
                    text_content: str = raw_text_content if isinstance(raw_text_content, str) else ""
                    # NotebookLM a veces deja espacios o metadatos vectoriales. Solo saltamos el OCR
                    # si hay más de 20 letras o números sólidos, asegurando que valga la pena no usar OCR.
                    caracteres_puros = re.sub(r'[\W_]+', '', text_content)
                    has_native_text: bool = len(caracteres_puros) > 20
                    
                    zoom_factor: float = dpi / 72.0
                    matrix = fitz.Matrix(zoom_factor, zoom_factor)
                    pixmap: fitz.Pixmap = page.get_pixmap(matrix=matrix, alpha=False)
                    pixel_count = int(pixmap.width) * int(pixmap.height)
                    if int(pixmap.width) > MAX_IMAGE_SIDE_PX or int(pixmap.height) > MAX_IMAGE_SIDE_PX:
                        resultado = Err(
                            (
                                f"La página {page_index + 1} excede el tamaño máximo permitido "
                                f"({pixmap.width}x{pixmap.height}px). "
                                f"Límite por lado: {MAX_IMAGE_SIDE_PX}px."
                            )
                        )
                        return resultado
                    if pixel_count > MAX_IMAGE_TOTAL_PIXELS:
                        resultado = Err(
                            (
                                f"La página {page_index + 1} excede el máximo de píxeles permitidos "
                                f"({pixel_count:,} px). Límite: {MAX_IMAGE_TOTAL_PIXELS:,} px."
                            )
                        )
                        return resultado
                    
                    native_blocks_list = None
                    if has_native_text:
                        native_blocks_list = []
                        import collections
                        
                        # Obtener todas las formas (rectangles, líneas, etc.) para mapear colores de fondo
                        all_shapes = page.get_drawings()
                        shape_rects = []  # [(rect, fill_color), ...]
                        for shape in all_shapes:
                            if shape.get("type") == "f" and shape.get("fill"):  # tipo 'f' = filled
                                rect = shape.get("rect")
                                fill = shape.get("fill")
                                if rect and fill:
                                    shape_rects.append((rect, fill))
                        
                        raw_data_any = page.get_text("dict")
                        raw_data: dict[str, Any] = raw_data_any if isinstance(raw_data_any, dict) else {}
                        for b in raw_data.get("blocks", []):
                            if b.get("type", -1) != 0:
                                continue
                            # Una línea = un bloque editable: preserva x0 de cada línea (sangría)
                            for line in b.get("lines", []):
                                font_sizes: list[float] = []
                                font_names: list[str] = []
                                text_colors: list[tuple[int, int, int]] = []
                                bg_colors: list[tuple[int, int, int]] = []
                                line_is_bold = False
                                line_is_italic = False
                                line_text = ""

                                for span in line.get("spans", []):
                                    line_text += span.get("text", "")
                                    font_sizes.append(float(span.get("size", 12.0)))
                                    font_names.append(span.get("font", "system-ui"))
                                    # PyMuPDF flags: bit 4 (16) = bold, bit 1 (2) = italic
                                    flags = int(span.get("flags", 0))
                                    if flags & 16:
                                        line_is_bold = True
                                    if flags & 2:
                                        line_is_italic = True
                                    
                                    # Extraer color del texto (PyMuPDF devuelve como int o tupla)
                                    color_raw = span.get("color", None)
                                    if color_raw is not None:
                                        if isinstance(color_raw, int):
                                            # Color como entero hexadecimal
                                            r = (color_raw >> 16) & 0xFF
                                            g = (color_raw >> 8) & 0xFF
                                            b = color_raw & 0xFF
                                            text_colors.append((r, g, b))
                                        elif isinstance(color_raw, (list, tuple)) and len(color_raw) >= 3:
                                            r = int(color_raw[0] * 255) if isinstance(color_raw[0], float) else int(color_raw[0])
                                            g = int(color_raw[1] * 255) if isinstance(color_raw[1], float) else int(color_raw[1])
                                            b = int(color_raw[2] * 255) if isinstance(color_raw[2], float) else int(color_raw[2])
                                            text_colors.append((r, g, b))
                                    
                                    # Extraer color de fondo (bgcolor) si existe
                                    bgcolor_raw = span.get("bgcolor", None)
                                    if bgcolor_raw is not None:
                                        if isinstance(bgcolor_raw, int):
                                            r = (bgcolor_raw >> 16) & 0xFF
                                            g = (bgcolor_raw >> 8) & 0xFF
                                            b = bgcolor_raw & 0xFF
                                            bg_colors.append((r, g, b))
                                        elif isinstance(bgcolor_raw, (list, tuple)) and len(bgcolor_raw) >= 3:
                                            r = int(bgcolor_raw[0] * 255) if isinstance(bgcolor_raw[0], float) else int(bgcolor_raw[0])
                                            g = int(bgcolor_raw[1] * 255) if isinstance(bgcolor_raw[1], float) else int(bgcolor_raw[1])
                                            b = int(bgcolor_raw[2] * 255) if isinstance(bgcolor_raw[2], float) else int(bgcolor_raw[2])
                                            bg_colors.append((r, g, b))

                                line_text = line_text.strip()
                                if not line_text:
                                    continue

                                bbox = line.get("bbox", [0, 0, 0, 0])
                                scaled_bbox = (
                                    float(bbox[0]) * zoom_factor,
                                    float(bbox[1]) * zoom_factor,
                                    float(bbox[2]) * zoom_factor,
                                    float(bbox[3]) * zoom_factor
                                )

                                avg_size = sum(font_sizes) / len(font_sizes) if font_sizes else 12.0
                                scaled_font_size = avg_size * zoom_factor
                                raw_font = collections.Counter(font_names).most_common(1)[0][0] if font_names else "system-ui"
                                primary_font = _clean_font_name(raw_font)
                                
                                # Calcular color de texto predominante (en hexadecimal)
                                text_color_hex = "#000000"  # default negro
                                if text_colors:
                                    avg_r = int(sum(c[0] for c in text_colors) / len(text_colors))
                                    avg_g = int(sum(c[1] for c in text_colors) / len(text_colors))
                                    avg_b = int(sum(c[2] for c in text_colors) / len(text_colors))
                                    text_color_hex = f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"
                                
                                # Calcular color de fondo predominante (en hexadecimal)
                                bg_color_hex = "#ffffff"  # default blanco
                                if bg_colors:
                                    avg_r = int(sum(c[0] for c in bg_colors) / len(bg_colors))
                                    avg_g = int(sum(c[1] for c in bg_colors) / len(bg_colors))
                                    avg_b = int(sum(c[2] for c in bg_colors) / len(bg_colors))
                                    bg_color_hex = f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"
                                else:
                                    # Si no hay bgcolor en spans, buscar formas (rectangles) que intersecten
                                    for shape_rect, shape_fill in shape_rects:
                                        # Verificar si la forma intersecta con el bbox del texto
                                        line_bbox = fitz.Rect(bbox)
                                        if line_bbox.intersects(shape_rect):
                                            # Convertir el color de la forma a RGB (0-255)
                                            r = int(shape_fill[0] * 255)
                                            g = int(shape_fill[1] * 255)
                                            b = int(shape_fill[2] * 255)
                                            bg_color_hex = f"#{r:02x}{g:02x}{b:02x}"
                                            break  # Usar la primera forma que intersecta

                                # bbox_pt guarda las coords originales del PDF (sin escalar)
                                # para que el exportador las use como zona de cobertura precisa.
                                raw_bbox_pt = (
                                    float(bbox[0]),
                                    float(bbox[1]),
                                    float(bbox[2]),
                                    float(bbox[3])
                                )

                                native_blocks_list.append(OCRBlock(
                                    id=str(uuid.uuid4()),
                                    page=page_index,
                                    bbox=scaled_bbox,
                                    text=line_text,
                                    confidence=1.0,
                                    is_new=False,
                                    font_size=scaled_font_size,
                                    font_family=primary_font,
                                    is_bold=line_is_bold,
                                    is_italic=line_is_italic,
                                    bbox_pt=raw_bbox_pt,
                                    text_color_hex=text_color_hex,
                                    bg_color_hex=bg_color_hex
                                ))
                    
                    img_mode: str = "RGB" if pixmap.n < 4 else "RGBA"
                    pil_image: Image.Image = Image.frombytes(
                        img_mode,
                        (pixmap.width, pixmap.height),
                        pixmap.samples
                    )
                    
                    pages_data.append(PageRender(
                        page_num=page_index,
                        image=pil_image,
                        has_native_text=has_native_text,
                        native_blocks=native_blocks_list,
                        page_width_pt=float(page.rect.width),
                        page_height_pt=float(page.rect.height),
                        render_width_px=float(pixmap.width),
                        render_height_px=float(pixmap.height)
                    ))
                    
                context = PDFDocumentContext(
                    filename=file_path.name,
                    total_pages=total_pages,
                    pages=pages_data
                )
                resultado = Ok(context)
                
        except fitz.FileDataError as e:
            resultado = Err(f"El analizador reporta archivo PDF corrupto o con error profundo interno: {e!s}")
        except Exception as e:
            resultado = Err(f"Fallo inesperado del sistema al transformar el PDF: {e!s}")

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
                    (
                        f"La imagen excede el tamaño máximo permitido "
                        f"({page_image.width}x{page_image.height}px). "
                        f"Límite por lado: {MAX_IMAGE_SIDE_PX}px."
                    )
                )
                return resultado
            if pixel_count > MAX_IMAGE_TOTAL_PIXELS:
                resultado = Err(
                    (
                        f"La imagen excede el máximo de píxeles permitidos "
                        f"({pixel_count:,} px). Límite: {MAX_IMAGE_TOTAL_PIXELS:,} px."
                    )
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
