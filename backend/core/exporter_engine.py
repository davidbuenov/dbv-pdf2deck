# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Motor de re-ensamblaje y exportación hacia ecosistema Office (PPTX) y estándar PDF.
Dependencias principales: python-pptx, PyMuPDF
"""
import io
import base64
import zipfile
import tempfile
from pathlib import Path
from typing import Any, cast

import fitz
from .markdown_exporter import build_markdown_export
try:
    from pptx import Presentation
    from pptx.util import Pt, Emu
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
    PPTX_AVAILABLE = True
except ImportError:
    Presentation = None
    Pt = None
    Emu = None
    RGBColor = None
    PP_ALIGN = None
    MSO_ANCHOR = None
    PPTX_AVAILABLE = False


ALIGN_MAP_PDF = {"left": 0, "center": 1, "right": 2}
ALIGN_MAP_PPTX = {"left": None, "center": None, "right": None}  # se rellena tras import
EMU_PER_PT = 12700


def _decode_image(b64_string: str) -> bytes:
    """Extrae la trama binaria en crudo eliminando cabeceras Web."""
    if "," in b64_string:
        b64_string = b64_string.split(",")[1]
    return base64.b64decode(b64_string)


def _hex_to_rgb(hex_code: str) -> tuple[int, int, int]:
    """Parseador simple Hex a RGB de 3 Tuplas enteras para PPTX/PDF"""
    h = hex_code.lstrip('#')
    if len(h) != 6:
        return (255, 255, 255) # Fallback Blanco puro
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _to_pdf_font(font_name: str | None, is_bold: bool = False, is_italic: bool = False) -> str:
    """
    Mapea nombres de fuentes variadas hacia Base-14 de PDF con soporte para Bold e Italic.
    Retorna nombres estándar de PDF que PyMuPDF reconoce.
    """
    if not font_name:
        base_name = "Helvetica"
    else:
        name = font_name.lower()
        if "cour" in name:
            base_name = "Courier"
        elif "times" in name or "georgia" in name or "serif" in name:
            base_name = "Times-Roman"
        else:
            base_name = "Helvetica"
    
    # Construir nombre con sufijos de estilo según estándar PDF Base-14
    if is_bold and is_italic:
        if base_name.startswith("Times"):
            return "Times-BoldItalic"
        elif base_name.startswith("Courier"):
            return "Courier-BoldOblique"
        else:  # Helvetica
            return "Helvetica-BoldOblique"
    elif is_bold:
        if base_name.startswith("Times"):
            return "Times-Bold"
        elif base_name.startswith("Courier"):
            return "Courier-Bold"
        else:  # Helvetica
            return "Helvetica-Bold"
    elif is_italic:
        if base_name.startswith("Times"):
            return "Times-Italic"
        elif base_name.startswith("Courier"):
            return "Courier-Oblique"
        else:  # Helvetica
            return "Helvetica-Oblique"
    else:
        return base_name


def _page_scale_to_pdf_points(page_data: dict) -> tuple[float, float]:
    render_w = float(page_data.get("render_width_px") or 1.0)
    render_h = float(page_data.get("render_height_px") or 1.0)
    page_w = float(page_data.get("page_width_pt") or render_w)
    page_h = float(page_data.get("page_height_pt") or render_h)

    return page_w / render_w, page_h / render_h


def _page_scale_to_ppt_points(page_data: dict, width_px: float, height_px: float) -> tuple[float, float]:
    """Convierte coordenadas del canvas (px) a puntos tipográficos para PPTX según metadatos de página."""
    page_w_pt = float(page_data.get("page_width_pt") or width_px)
    page_h_pt = float(page_data.get("page_height_pt") or height_px)
    safe_w = max(1.0, float(width_px or 1.0))
    safe_h = max(1.0, float(height_px or 1.0))
    return page_w_pt / safe_w, page_h_pt / safe_h


def _safe_line_spacing(raw_value: float | int | str | None) -> float:
    try:
        parsed = float(raw_value) if raw_value is not None else 1.15
    except (TypeError, ValueError):
        parsed = 1.15
    return max(0.8, min(3.0, parsed))


def _wrap_pdf_text_lines(text: str, fontname: str, fontsize: float, max_width: float) -> list[str]:
    """Envuelve texto en líneas para replicar subrayado/line-height al exportar PDF."""
    safe_text = str(text or "")
    width_limit = max(1.0, float(max_width))

    def text_width(sample: str) -> float:
        try:
            return float(fitz.get_text_length(sample, fontname=fontname, fontsize=fontsize))
        except Exception:
            return float(len(sample)) * fontsize * 0.5

    lines: list[str] = []
    for raw_line in safe_text.split("\n"):
        words = raw_line.split(" ")
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip() if current else word
            if current and text_width(candidate) > width_limit:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
        if raw_line == "":
            lines.append("")

    if not lines:
        lines.append("")
    return lines


def _draw_pdf_underlines(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontsize: float,
    fontname: str,
    color: tuple[float, float, float],
    align: int,
    line_spacing: float,
    overlay: bool = False,
) -> None:
    lines = _wrap_pdf_text_lines(text, fontname, fontsize, rect.width)
    line_h = fontsize * line_spacing

    def text_width(sample: str) -> float:
        try:
            return float(fitz.get_text_length(sample, fontname=fontname, fontsize=fontsize))
        except Exception:
            return float(len(sample)) * fontsize * 0.5

    for idx, line in enumerate(lines):
        if not line:
            continue
        text_w = min(rect.width, text_width(line))
        if align == 1:  # center
            x0 = rect.x0 + (rect.width - text_w) / 2.0
        elif align == 2:  # right
            x0 = rect.x1 - text_w
        else:  # left
            x0 = rect.x0

        baseline_y = rect.y0 + ((idx + 1) * line_h)
        underline_y = baseline_y + max(0.6, fontsize * 0.08)
        page.draw_line(
            fitz.Point(x0, underline_y),
            fitz.Point(x0 + text_w, underline_y),
            color=color,
            width=max(0.6, fontsize * 0.05),
            overlay=overlay,
        )


def _insert_pdf_text_with_style(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontsize: float,
    fontname: str,
    color: tuple[float, float, float],
    align: int,
    line_spacing: float,
    underline: bool,
    overlay: bool = False,
) -> None:
    insert_kwargs = {
        "fontsize": fontsize,
        "fontname": fontname,
        "color": color,
        "align": align,
    }

    try:
        page.insert_textbox(rect, text, lineheight=line_spacing, overlay=overlay, **insert_kwargs)
    except TypeError:
        # Compatibilidad con versiones de PyMuPDF sin argumento lineheight.
        if overlay:
            page.insert_textbox(rect, text, overlay=True, **insert_kwargs)
        else:
            page.insert_textbox(rect, text, **insert_kwargs)

    if underline and text:
        _draw_pdf_underlines(page, rect, text, fontsize, fontname, color, align, line_spacing, overlay=overlay)


def _apply_hidden_pdf_signature(pdf_doc: fitz.Document) -> None:
    """Inyecta firma oculta en metadatos del PDF sin alterar el contenido visual."""
    metadata = pdf_doc.metadata or {}
    metadata["creator"] = "Generador por davidbuenov.com"
    metadata["producer"] = "DBVPDFEditor"
    metadata["subject"] = "Documento generado con DBVPDFEditor"
    metadata["keywords"] = "DBVPDFEditor, davidbuenov.com"
    pdf_doc.set_metadata(metadata)


def build_pdf_export(payload: dict) -> bytes:
    """
    Restaura la estructura original repintando las alteraciones visuales sobre el lienzo virtual
    cerrándolo nativamente en formato .PDF
    """
    pdf_out = fitz.open()

    for page_data in payload.get("pages", []):
        b64_img = page_data.get("image_base64")
        if not b64_img:
            continue
            
        img_bytes = _decode_image(b64_img)
        
        # Mapeamos dimensiones naturales desde los pixeles netos
        from PIL import Image
        img_pil = Image.open(io.BytesIO(img_bytes))
        width_px = float(img_pil.width)
        height_px = float(img_pil.height)
        
        # Usar dimensiones reales en puntos PDF (no píxeles) para mantener el tamaño de página correcto
        page_w_pt = float(page_data.get("page_width_pt") or width_px)
        page_h_pt = float(page_data.get("page_height_pt") or height_px)
        scale_x, scale_y = _page_scale_to_pdf_points(page_data)
        
        new_page = pdf_out.new_page(width=page_w_pt, height=page_h_pt)
        new_page.insert_image(fitz.Rect(0, 0, page_w_pt, page_h_pt), stream=img_bytes)
        
        # Superposición de todos los bloques detectados como cajas editables
        for block in page_data.get("blocks", []):
            x0, y0, x1, y1 = block["bbox"]
            # Convertir coordenadas del canvas (px) a puntos PDF
            box_rect = fitz.Rect(
                float(x0) * scale_x, float(y0) * scale_y,
                float(x1) * scale_x, float(y1) * scale_y
            )
            
            # Extraemos Variables Inyectadas por Usuario desde GUI
            bg_hex = block.get("bg_color", "#ffffff")
            txt_hex = block.get("text_color", "#000000")
            fsize = block.get("font_size", 16)
            font_fam = block.get("font_family", "system-ui")
            
            # Extraer flags de estilo
            is_bold = bool(block.get("is_bold", False))
            is_italic = bool(block.get("is_italic", False))
            pdf_font = _to_pdf_font(font_fam, is_bold=is_bold, is_italic=is_italic)
            
            br, bg, bb = _hex_to_rgb(bg_hex)
            tr, tg, tb = _hex_to_rgb(txt_hex)
            
            # Inserción Inmutable de Fuente nativa
            t_color_norm = (tr/255.0, tg/255.0, tb/255.0)
            b_color_norm = (br/255.0, bg/255.0, bb/255.0)
            
            is_modified = bool(block.get("is_modified", False))
            export_mode = payload.get("export_mode", "only_modified")
            
            if export_mode == "only_modified" and not is_modified:
                continue

                
            # Expandir generosamente la altura para evitar clipping vertical (PyMuPDF cancela el renderizado si la caja es corta en y)
            extra_h = 200.0
            expanded_rect = fitz.Rect(box_rect.x0, box_rect.y0, box_rect.x1, box_rect.y1 + extra_h)
            
            # Solo pintar el fondo si no es transparente.
            # Pintamos sobre el rect original (no expandido) para no manchar visualmente el fondo excesivamente
            if not block.get("bg_transparent", False):
                new_page.draw_rect(box_rect, color=b_color_norm, fill=b_color_norm)

            texto = block.get("text", "")
            align_str = block.get("text_align", "left")
            pdf_align = ALIGN_MAP_PDF.get(align_str, 0)
            line_spacing = _safe_line_spacing(block.get("line_spacing", 1.15))
            is_underline = bool(block.get("is_underline", False))
            # Convertir font_size de píxeles canvas a puntos PDF
            current_font_size = max(6.0, float(fsize) * scale_y)
            
            # Los bloques transparentes siempre requieren overlay=True para que el texto sea visible
            # encima de la imagen rasterizada (caso NanoBanana: limpieza sobre fondo claro).
            use_overlay = block.get("bg_transparent", False)

            _insert_pdf_text_with_style(
                new_page,
                expanded_rect,
                texto,
                current_font_size,
                pdf_font,
                t_color_norm,
                pdf_align,
                line_spacing,
                is_underline,
                overlay=use_overlay,
            )

    _apply_hidden_pdf_signature(pdf_out)

    buffer = io.BytesIO()
    pdf_out.save(buffer)
    pdf_out.close()
    return buffer.getvalue()


def build_pdf_export_from_original(payload: dict, source_pdf_path: Path) -> bytes:
    """
    Estrategia unificada para exportar PDF con ediciones preservando calidad máxima
    en páginas no tocadas:

    - Páginas SIN ediciones  → se copian del PDF original sin ningún cambio.
    - Páginas CON ediciones  → se inserta la imagen rasterizada del canvas como capa
      base (overlay) y se superponen los bloques modificados como vectores (rect +
      textbox). Esta estrategia es idéntica a la del exportador PPTX, que ya funciona
      correctamente, y evita todos los problemas de Z-order de content-streams en PDFs
      existentes (draw_rect, redact_annot, etc.).
    """
    pdf_out = fitz.open(str(source_pdf_path))

    for page_data in payload.get("pages", []):
        page_num = int(page_data.get("page_num", 0))
        if page_num < 0 or page_num >= len(pdf_out):
            continue

        # Recopilar TODOS los bloques para exportar como editables
        all_blocks = page_data.get("blocks", [])

        # Caso 1: Sin bloques detectados → preservar página original intacta
        if not all_blocks:
            continue

        page = pdf_out[page_num]
        scale_x, scale_y = _page_scale_to_pdf_points(page_data)

        # Normalizamos la estructura interna de la página (estado gráfico / Z-order)
        # Esto es vital en PDFs originarios (NotebookLM) para evitar que elementos dibujados 
        # en background eclipsen la inyección del `draw_rect` con overlay.
        page.clean_contents()

        # Preservamos íntegro el PDF nativo (sin insertar la imagen canvas encima).
        # Esto permite que los vectores y textos originales sigan siendo puros en el PDF exportado.

        if page_data.get("ai_cleaned_bg"):
            # Si el usuario utilizó IA para limpiar meticulosamente el fondo, esa es la "funte de la verdad".
            # Es necesario tapar todos los vectores originales subyacentes con esta imagen de fondo.
            b64_img = page_data.get("image_base64")
            if b64_img:
                img_bytes = _decode_image(b64_img)
                # Capa de seguridad: rectángulo blanco opaco para anular cualquier vector rebelde
                page.draw_rect(page.rect, color=(1,1,1), fill=(1,1,1), overlay=True)
                # overlay=True tapa todo lo original de esa capa pero debajo de nuestro nuevo texto
                page.insert_image(page.rect, stream=img_bytes, overlay=True)

        # Paso 3: superponer SOLAMENTE los bloques modificados como vector puro.
        for block in all_blocks:
            is_modified = bool(block.get("is_modified", False))
            export_mode = payload.get("export_mode", "only_modified")
            
            if export_mode == "only_modified" and not is_modified:
                continue
                
            font_size_px = float(block.get("font_size") or 16.0)
            # Mapeo directo de píxeles de renderizado (del canvas) a puntos PDF
            font_size_pt = max(6.0, font_size_px * scale_y)
            is_bold   = bool(block.get("is_bold", False))
            is_italic = bool(block.get("is_italic", False))
            font_name = _to_pdf_font(block.get("font_family"), is_bold=is_bold, is_italic=is_italic)

            bg_hex = block.get("bg_color", "#ffffff")
            br, bg_r, bb = _hex_to_rgb(bg_hex)
            fill_color = (br / 255.0, bg_r / 255.0, bb / 255.0)

            text_hex = block.get("text_color", "#000000")
            tr, tg, tb = _hex_to_rgb(text_hex)
            text_color = (tr / 255.0, tg / 255.0, tb / 255.0)

            # Rect de coordenadas PDF
            ix0 = float(block["bbox"][0]) * scale_x
            iy0 = float(block["bbox"][1]) * scale_y
            ix1 = float(block["bbox"][2]) * scale_x
            iy1 = float(block["bbox"][3]) * scale_y
            
            # Expandir solo un 5% de la altura para evitar clipping sin afectar layout
            extra_height = (iy1 - iy0) * 0.05
            insert_rect = fitz.Rect(ix0, iy0, ix1, iy1 + extra_height)

            # Rect de COBERTURA en coordenadas PDF (tapa el texto antiguo de la imagen subyacente o PDF)
            if not block.get("bg_transparent", False):
                cover_rect = fitz.Rect(ix0, iy0, ix1, iy1)
                page.draw_rect(cover_rect, color=fill_color, fill=fill_color, overlay=True)
            
            # Expandir generosamente la altura del rectángulo de texto para que textos en múltiples líneas no desaparezcan
            extra_h = 200.0
            final_rect = fitz.Rect(ix0, iy0, ix1, iy1 + extra_h)

            current_font_size = font_size_pt
            texto = block.get("text", "")
            align_str = block.get("text_align", "left")
            pdf_align = ALIGN_MAP_PDF.get(align_str, 0)
            line_spacing = _safe_line_spacing(block.get("line_spacing", 1.15))
            is_underline = bool(block.get("is_underline", False))
            
            # Dibujado definitivo en la página real con el tamaño ideal calculado del usuario
            _insert_pdf_text_with_style(
                page,
                final_rect,
                texto,
                current_font_size,
                font_name,
                text_color,
                pdf_align,
                line_spacing,
                is_underline,
                overlay=True,
            )

    _apply_hidden_pdf_signature(pdf_out)

    buffer = io.BytesIO()
    pdf_out.save(buffer)
    pdf_out.close()
    return buffer.getvalue()


def build_pptx_export(payload: dict) -> bytes:
    """
    Clona la arquitectura PDF exportándola transparentemente a slides de PowerPoint (.pptx).
    Escala BBoxes usando EMU equivalentes para retener integridad sin importar el DPI de fondo.
    """
    if not PPTX_AVAILABLE:
        raise RuntimeError("La librería python-pptx no se encuentra instalada.")

    assert Presentation is not None
    assert Pt is not None
    assert Emu is not None
    assert RGBColor is not None
    assert PP_ALIGN is not None
    assert MSO_ANCHOR is not None

    prs = Presentation()
    
    # 914400 EMUs dictaminan 1 pulgada geométrica según la Open XML Specification
    for page_index, page_data in enumerate(payload.get("pages", [])):
        b64_img = page_data.get("image_base64")
        if not b64_img:
            continue
            
        img_bytes = _decode_image(b64_img)
        img_stream = io.BytesIO(img_bytes)
        
        # Invocamos el Slide Master "Vacio"
        blank_layout = prs.slide_layouts[6]
        slide = prs.slides.add_slide(blank_layout)
        
        # Calibrador Dinámico de Presentaciones atadas al Canvas
        from PIL import Image
        img_pil = Image.open(img_stream)
        width_px = float(img_pil.width)
        height_px = float(img_pil.height)
        img_stream.seek(0)
            
        page_w_pt = float(page_data.get("page_width_pt") or width_px)
        page_h_pt = float(page_data.get("page_height_pt") or height_px)
        if page_index == 0:
            # Usar puntos reales del PDF evita depender del DPI de rasterizado.
            prs.slide_width = Emu(int(max(1.0, page_w_pt) * EMU_PER_PT))
            prs.slide_height = Emu(int(max(1.0, page_h_pt) * EMU_PER_PT))

        slide_width_emu = int(cast(Any, prs.slide_width))
        slide_height_emu = int(cast(Any, prs.slide_height))
        
        # Tapizado del Background completo Slide -> Slide
        slide.shapes.add_picture(img_stream, Emu(0), Emu(0), width=Emu(slide_width_emu), height=Emu(slide_height_emu))
        
        # Ecuación de Escalado y Mapeo Posicional del texto
        ratio_x = slide_width_emu / max(1.0, width_px)
        ratio_y = slide_height_emu / max(1.0, height_px)
        _, px_to_pt_y = _page_scale_to_ppt_points(page_data, width_px, height_px)
        
        for block in page_data.get("blocks", []):
            x0, y0, x1, y1 = block["bbox"]
            
            shape_left = Emu(int(x0 * ratio_x))
            shape_top = Emu(int(y0 * ratio_y))
            shape_width = Emu(int((x1 - x0) * ratio_x))
            shape_height = Emu(int((y1 - y0) * ratio_y))
            
            # Recuperar de JSON
            bg_hex = block.get("bg_color", "#ffffff")
            txt_hex = block.get("text_color", "#000000")
            fsize = block.get("font_size", 16)
            font_fam = block.get("font_family", "Arial")

            is_modified = bool(block.get("is_modified", False))
            export_mode = payload.get("export_mode", "only_modified")
            if export_mode == "only_modified" and not is_modified:
                continue

            from pptx.enum.shapes import MSO_SHAPE
            from pptx.util import Inches

            bg_shape = slide.shapes.add_shape(
                MSO_SHAPE.RECTANGLE, shape_left, shape_top, shape_width, shape_height
            )
            if not block.get("bg_transparent", False):
                bg_shape.fill.solid()
                bg_shape.fill.fore_color.rgb = RGBColor(*_hex_to_rgb(bg_hex))
            else:
                bg_shape.fill.background()
                
            # Remover borde azul por default en Powerpoint
            bg_shape.line.fill.background()
            # Remover sombra del rectángulo
            bg_shape.shadow.inherit = False
            text_frame = bg_shape.text_frame
            
            # Cúpula de TextFrame - MEJORADO para alineación perfecta
            text_frame.clear() 
            text_frame.margin_top = Inches(0.02)     # Margen superior mínimo
            text_frame.margin_bottom = Inches(0.02)  # Margen inferior mínimo
            text_frame.margin_left = Inches(0.03)    # Margen izquierdo mínimo
            text_frame.margin_right = Inches(0.03)   # Margen derecho mínimo
            # Mantener el ajuste al ancho del bloque como en el editor canvas.
            text_frame.word_wrap = True
            text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
            
            p = text_frame.paragraphs[0]
            p.text = block.get("text", "")

            # Alineación de párrafo
            align_str = block.get("text_align", "left")
            if align_str == "center":
                p.alignment = PP_ALIGN.CENTER
            elif align_str == "right":
                p.alignment = PP_ALIGN.RIGHT
            else:
                p.alignment = PP_ALIGN.LEFT
            
            # Conversión tipográfica exacta según proporción real canvas->página.
            # Se usa el eje Y para preservar altura visual de línea.
            real_pt = max(1.0, float(fsize) * px_to_pt_y)
            p.font.size = Pt(real_pt)
            p.font.name = font_fam
            p.font.color.rgb = RGBColor(*_hex_to_rgb(txt_hex))
            p.font.bold = bool(block.get("is_bold", False))
            p.font.italic = bool(block.get("is_italic", False))
            p.font.underline = bool(block.get("is_underline", False))
            
            # Line spacing para mejor espaciado
            p.line_spacing = _safe_line_spacing(block.get("line_spacing", 1.15))

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


def generate_export_zip(payload_dict: dict, source_pdf_path: Path | None = None) -> tuple[Path, Path]:
    """
    Rutea la producción de ambos documentos solicitados al Core
    y los envuelve en un Zip FileResponse para FastAPI.
    """
    temp_dir = Path(tempfile.mkdtemp())
    zip_path = temp_dir / "export.zip"

    raw_targets = payload_dict.get("export_targets") or {}
    export_pdf = bool(raw_targets.get("pdf", True))
    export_pptx = bool(raw_targets.get("pptx", True))
    export_md = bool(raw_targets.get("md", True))

    # Guard rail por robustez: evitar ZIP vacío cuando el cliente no define nada explícito.
    if not (export_pdf or export_pptx or export_md):
        export_pdf = True
        export_pptx = True
        export_md = True
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        if export_pdf:
            if source_pdf_path and source_pdf_path.exists():
                pdf_bytes = build_pdf_export_from_original(payload_dict, source_pdf_path)
            else:
                pdf_bytes = build_pdf_export(payload_dict)
            zipf.writestr("Presentacion_Editada_Impresa.pdf", pdf_bytes)

        if export_md:
            zipf.writestr("Presentacion_Editada_DBV.md", build_markdown_export(payload_dict, source_pdf_path))

        if export_pptx and PPTX_AVAILABLE:
            pptx_bytes = build_pptx_export(payload_dict)
            zipf.writestr("Presentacion_Editada_DBV.pptx", pptx_bytes)
            
    return zip_path, temp_dir
