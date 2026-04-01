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

import fitz
try:
    from pptx import Presentation
    from pptx.util import Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    PPTX_AVAILABLE = True
except ImportError:
    PPTX_AVAILABLE = False


ALIGN_MAP_PDF = {"left": 0, "center": 1, "right": 2}
ALIGN_MAP_PPTX = {"left": None, "center": None, "right": None}  # se rellena tras import


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
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


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
        
        # Mapeamos dimensiones naturales desde los pixeles netos (Evita desviación de DPI de PyMuPDF)
        from PIL import Image
        img_pil = Image.open(io.BytesIO(img_bytes))
        width_px = float(img_pil.width)
        height_px = float(img_pil.height)
        
        new_page = pdf_out.new_page(width=width_px, height=height_px)
        new_page.insert_image(fitz.Rect(0, 0, width_px, height_px), stream=img_bytes)
        
        # Superposición de todos los bloques detectados como cajas editables
        for block in page_data.get("blocks", []):
            x0, y0, x1, y1 = block["bbox"]
            box_rect = fitz.Rect(list(map(float, [x0, y0, x1, y1])))
            
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

            new_page.insert_textbox(
                expanded_rect, 
                texto, 
                fontsize=current_font_size,
                fontname=pdf_font, 
                color=t_color_norm,
                align=pdf_align
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
            
            # Dibujado definitivo en la página real con el tamaño ideal calculado del usuario
            page.insert_textbox(
                final_rect,
                texto,
                fontsize=current_font_size,
                fontname=font_name,
                color=text_color,
                overlay=True,
                align=pdf_align,
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
            
        if page_index == 0:
            # La imagen fue rasterizada a 100 DPI: usar ese factor para escalar a EMU
            prs.slide_width = int((width_px / 100.0) * 914400)
            prs.slide_height = int((height_px / 100.0) * 914400)
        
        # Tapizado del Background completo Slide -> Slide
        slide.shapes.add_picture(img_stream, 0, 0, width=prs.slide_width, height=prs.slide_height)
        
        # Ecuación de Escalado y Mapeo Posicional del texto
        ratio_x = prs.slide_width / width_px
        ratio_y = prs.slide_height / height_px
        
        for block in page_data.get("blocks", []):
            x0, y0, x1, y1 = block["bbox"]
            
            shape_left = int(x0 * ratio_x)
            shape_top = int(y0 * ratio_y)
            shape_width = int((x1 - x0) * ratio_x)
            shape_height = int((y1 - y0) * ratio_y)
            
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
            text_frame.word_wrap = False
            text_frame.vertical_anchor = 1  # 1 = Centrado verticalmente
            
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
            
            # Factor de conversión Pixel a Puntos PPTX
            # Nota: En PPTX el factor 0.72 es crítico para que la fuente no desborde el layout
            real_pt = max(8, fsize * 0.72)
            p.font.size = Pt(real_pt)
            p.font.name = font_fam
            p.font.color.rgb = RGBColor(*_hex_to_rgb(txt_hex))
            p.font.bold = bool(block.get("is_bold", False))
            p.font.italic = bool(block.get("is_italic", False))
            
            # Line spacing para mejor espaciado
            p.line_spacing = 1.1

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


def generate_export_zip(payload_dict: dict, source_pdf_path: Path | None = None) -> tuple[Path, str]:
    """
    Rutea la producción de ambos documentos solicitados al Core
    y los envuelve en un Zip FileResponse para FastAPI.
    """
    temp_dir = Path(tempfile.mkdtemp())
    zip_path = temp_dir / "export.zip"
    
    if source_pdf_path and source_pdf_path.exists():
        pdf_bytes = build_pdf_export_from_original(payload_dict, source_pdf_path)
    else:
        pdf_bytes = build_pdf_export(payload_dict)
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.writestr("Presentacion_Editada_Impresa.pdf", pdf_bytes)
        
        if PPTX_AVAILABLE:
            pptx_bytes = build_pptx_export(payload_dict)
            zipf.writestr("Presentacion_Editada_DBV.pptx", pptx_bytes)
            
    return zip_path, temp_dir
