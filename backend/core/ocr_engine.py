# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Motor de visión subyacente basado en EasyOCR para la extracción de texto desconectada.
Acoplado bajo normativas estrictas del proyecto: Tipado fuerte y Patrón Result.
"""
import uuid
import numpy as np
from dataclasses import dataclass, field
from PIL import Image

from .result import Result, Ok, Err

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False
    easyocr = None


@dataclass(slots=True)
class OCRBlock:
    """
    Representa una caja de texto detectada ortogonalmente en una matriz imagen.
    """
    id: str
    page: int
    bbox: tuple[float, float, float, float]          # coords escaladas al canvas (px)
    text: str
    confidence: float
    is_new: bool = field(default=False)
    font_size: float | None = field(default=None)
    font_family: str | None = field(default=None)
    is_bold: bool = field(default=False)
    is_italic: bool = field(default=False)
    bbox_pt: tuple[float, float, float, float] | None = field(default=None)  # coords originales en puntos PDF
    text_color_hex: str = field(default="#000000")  # Color del texto en hexadecimal
    bg_color_hex: str = field(default="#ffffff")    # Color de fondo en hexadecimal


# Puntero lazy global para la inferencia, evitando sobrecargar RAM constantemente
_reader = None


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    return f"#{int(max(0, min(255, r))):02x}{int(max(0, min(255, g))):02x}{int(max(0, min(255, b))):02x}"


def _safe_crop(img_array: np.ndarray, bbox: tuple[float, float, float, float]) -> np.ndarray:
    h, w = img_array.shape[:2]
    x0, y0, x1, y1 = bbox
    ix0 = max(0, min(w - 1, int(np.floor(x0))))
    iy0 = max(0, min(h - 1, int(np.floor(y0))))
    ix1 = max(ix0 + 1, min(w, int(np.ceil(x1))))
    iy1 = max(iy0 + 1, min(h, int(np.ceil(y1))))
    return img_array[iy0:iy1, ix0:ix1]


def _estimate_bg_color(region: np.ndarray) -> tuple[int, int, int]:
    if region.size == 0:
        return (255, 255, 255)

    # Tomamos bordes del bloque porque suelen contener más fondo que tinta
    top = region[0, :, :]
    bottom = region[-1, :, :]
    left = region[:, 0, :]
    right = region[:, -1, :]
    border_pixels = np.vstack((top, bottom, left, right)).astype(np.float32)

    median_rgb = np.median(border_pixels, axis=0)
    return (int(median_rgb[0]), int(median_rgb[1]), int(median_rgb[2]))


def _estimate_text_color(region: np.ndarray, bg_rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    if region.size == 0:
        # fallback por contraste clásico
        bg_luma = 0.2126 * bg_rgb[0] + 0.7152 * bg_rgb[1] + 0.0722 * bg_rgb[2]
        return (0, 0, 0) if bg_luma > 145 else (255, 255, 255)

    flat = region.reshape(-1, 3).astype(np.float32)
    bg = np.array(bg_rgb, dtype=np.float32)
    dist = np.linalg.norm(flat - bg, axis=1)

    # Consideramos "texto" los píxeles más distintos del fondo local
    threshold = max(18.0, float(np.percentile(dist, 85)))
    text_pixels = flat[dist >= threshold]

    if text_pixels.shape[0] < 20:
        bg_luma = 0.2126 * bg_rgb[0] + 0.7152 * bg_rgb[1] + 0.0722 * bg_rgb[2]
        return (0, 0, 0) if bg_luma > 145 else (255, 255, 255)

    mean_rgb = np.mean(text_pixels, axis=0)
    return (int(mean_rgb[0]), int(mean_rgb[1]), int(mean_rgb[2]))


def _estimate_font_size_from_bbox(bbox: tuple[float, float, float, float]) -> float:
    _, y0, _, y1 = bbox
    h = max(1.0, float(y1 - y0))
    # Heurística: en bloques OCR el alto incluye asc/desc + margen; reducimos para que encaje
    return max(10.0, min(96.0, h * 0.76))


def _estimate_bold_from_region(region: np.ndarray, bg_rgb: tuple[int, int, int], bbox: tuple[float, float, float, float]) -> bool:
    if region.size == 0:
        return False

    flat = region.reshape(-1, 3).astype(np.float32)
    bg = np.array(bg_rgb, dtype=np.float32)
    dist = np.linalg.norm(flat - bg, axis=1)
    ink_threshold = max(18.0, float(np.percentile(dist, 82)))
    ink_ratio = float(np.mean(dist >= ink_threshold))

    _, y0, _, y1 = bbox
    bbox_height = max(1.0, float(y1 - y0))

    return ink_ratio >= 0.17 or (bbox_height >= 36.0 and ink_ratio >= 0.12)


def _infer_block_style(img_array: np.ndarray, bbox: tuple[float, float, float, float]) -> tuple[str, str, float, str, bool]:
    region = _safe_crop(img_array, bbox)
    bg_rgb = _estimate_bg_color(region)
    txt_rgb = _estimate_text_color(region, bg_rgb)

    bg_hex = _rgb_to_hex(bg_rgb)
    txt_hex = _rgb_to_hex(txt_rgb)
    font_size = _estimate_font_size_from_bbox(bbox)
    is_bold = _estimate_bold_from_region(region, bg_rgb, bbox)

    # MVP robusto: fuente sans legible por defecto para OCR
    font_family = "Arial"
    return txt_hex, bg_hex, font_size, font_family, is_bold


def _get_reader():
    """
    Retorna la instancia singleton validada del modelo EasyOCR, instanciándolo asilado.

    Returns:
        easyocr.Reader: Referencia viva al modelo cargado.
    Raises:
        RuntimeError: Si la librería principal falla al cargar.
    """
    global _reader
    if not EASYOCR_AVAILABLE:
        raise RuntimeError(
            "La librería `easyocr` no se encuentra instalada en el entorno virtual."
        )

    if _reader is None:
        # Detección dinámica de aceleración por hardware (CUDA)
        import torch
        gpu_ready = torch.cuda.is_available()
        _reader = easyocr.Reader(['es', 'en'], gpu=gpu_ready, verbose=False)
    
    return _reader


def analyze_image(page_num: int, image: Image.Image) -> Result[list[OCRBlock]]:
    """
    Ejecuta el escaneo OCR sobre una imagen renderizada vía EasyOCR, calculando y 
    estructurando las coordenadas de cada bloque en una caja delimitadora de frontend.

    Args:
        page_num (int): Identificador secuencial de la página analizada.
        image (Image.Image): Representación matricial de la página provista por PyMuPDF.

    Returns:
        Result[list[OCRBlock]]: Lista inmutable de bloques detectados si es Ok[T],
        o el mensaje detallado de error para la UI.
    """
    resultado: Result[list[OCRBlock]]
    
    try:
        reader = _get_reader()
        
        # Volcado a uint8 robusto para prevenir que PyTorch patine con imágenes pesadas
        img_array: np.ndarray = np.array(image.convert("RGB"), dtype=np.uint8)
        
        # Inferencia con EasyOCR
        raw_result = reader.readtext(img_array)
        blocks: list[OCRBlock] = []

        # Estructura devuelta por EasyOCR: [([[x1, y1],...], 'texto', probabilidad), ...]
        if raw_result and len(raw_result) > 0:
            for line in raw_result:
                if not isinstance(line, (list, tuple)) or len(line) < 3:
                    continue
                    
                box = line[0]        # Poly de 4 puntos
                text_info = line[1]  # Transcripción reconocida string
                confidence = line[2] # Confidencia numérica
                
                # Transformamos del polígono a caja ortogonal y casteamos a float nativo secuencialmente
                # para prevenir que Pydantic v2 (Rust) crashee intentando serializar numpy.int32
                x_coords = [float(point[0]) for point in box]
                y_coords = [float(point[1]) for point in box]
                
                bbox = (min(x_coords), min(y_coords), max(x_coords), max(y_coords))
                
                # Desechamos inferencias ruidosas 
                if float(confidence) > 0.3:
                    text_color_hex, bg_color_hex, inferred_font_size, inferred_font_family, inferred_is_bold = _infer_block_style(img_array, bbox)
                    blocks.append(OCRBlock(
                        id=str(uuid.uuid4()),
                        page=page_num,
                        bbox=bbox,
                        text=str(text_info),
                        confidence=float(confidence),
                        font_size=inferred_font_size,
                        font_family=inferred_font_family,
                        is_bold=inferred_is_bold,
                        text_color_hex=text_color_hex,
                        bg_color_hex=bg_color_hex
                    ))
                
        resultado = Ok(blocks)

    except RuntimeError as run_err:
        resultado = Err(f"Configuración del motor principal ausente: {run_err!s}")
    except Exception as general_err:
        import traceback
        traceback.print_exc()
        resultado = Err(f"Fallo interno grave al invocar EasyOCR: {general_err!s}")

    return resultado
