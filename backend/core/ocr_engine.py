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
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from .result import Err, Ok, Result
from .settings import OCR_MERGE_BLOCKS

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


# ── Fusion de fragmentos OCR ─────────────────────────────────────────────────
# EasyOCR devuelve trozos, no parrafos: en una infografia densa, 121 fragmentos
# correspondian a 46 lineas visuales, con una linea partida hasta en 8 trozos.
# Eso hace la edicion inviable (corregir un parrafo obliga a tocar ocho cajas),
# rompe la exportacion (cada trozo va al PPTX como un cuadro independiente) y
# empeora la estimacion del cuerpo de fuente, que se calcula sobre la altura de
# la caja. Se reagrupa en dos pasadas: fragmentos -> lineas -> parrafos.
#
# Los umbrales son relativos a la altura de linea, nunca en pixeles absolutos,
# de modo que valen igual a 100 DPI que a 300.

# Solape vertical minimo (fraccion de la altura menor) para considerar que dos
# fragmentos comparten linea.
LINE_MIN_VERTICAL_OVERLAP = 0.5
# Hueco horizontal maximo entre fragmentos de una misma linea. Un espacio tipografico
# entre palabras ronda 0.25-0.35x la altura; 0.40x evita saltar a columnas contiguas
# o paneles adyacentes en infografias y tablas.
LINE_MAX_GAP_FACTOR = 0.40
# Dos fragmentos con alturas muy dispares no son la misma linea (un titular y
# una nota al pie que casualmente se rozan).
LINE_MAX_HEIGHT_RATIO = 1.8

# Hueco vertical maximo entre lineas del mismo parrafo, en alturas de linea.
PARAGRAPH_MAX_GAP_FACTOR = 0.85
# Un titular y su cuerpo tienen cuerpos distintos: no deben fusionarse.
PARAGRAPH_MAX_HEIGHT_RATIO = 1.25
# Solape horizontal minimo entre lineas consecutivas. Es lo que impide fundir
# dos columnas contiguas en un unico parrafo imposible.
PARAGRAPH_MIN_X_OVERLAP = 0.50
# Desalineacion lateral admitida (sangrias, texto centrado), en anchos de linea.
PARAGRAPH_MAX_MISALIGNMENT = 0.15


@dataclass(slots=True)
class _TextGroup:
    """
    Agrupacion en construccion de fragmentos OCR contiguos.

    Mantiene dos geometrias distintas a proposito:

    - La **caja envolvente** (`x0..y1`), que es la que acaba viendo el usuario.
    - La **banda de fila** (`row_center` / `row_height`), mediana de los
      fragmentos absorbidos, que es contra la que se decide si un fragmento
      nuevo pertenece a la linea. Usar la envolvente para eso era un efecto
      bola de nieve: cada absorcion estiraba la caja en vertical, la linea se
      volvia mas alta, y con ello elegible para tragarse fragmentos del parrafo
      de debajo. La mediana no crece por absorber vecinos.
    """
    x0: float
    y0: float
    x1: float
    y1: float
    # (clave de fila, x0, texto). La clave de fila permite reconstruir el orden
    # de lectura al final: EasyOCR no devuelve los fragmentos ordenados y
    # concatenarlos segun llegan producia frases barajadas.
    parts: list[tuple[float, float, str]]
    confidences: list[float]
    line_heights: list[float]
    centers: list[float]

    @property
    def width(self) -> float:
        return max(1.0, self.x1 - self.x0)

    @property
    def line_height(self) -> float:
        """Altura de linea representativa: la mediana resiste un trozo anomalo."""
        return max(1.0, float(np.median(self.line_heights)))

    @property
    def row_center(self) -> float:
        return float(np.median(self.centers))

    @property
    def text(self) -> str:
        """Texto en orden de lectura: por filas de arriba abajo, y de izquierda a derecha."""
        return " ".join(fragment for _, _, fragment in sorted(self.parts))

    def overlaps_row(self, other: "_TextGroup") -> float:
        """Solape vertical entre bandas de fila, en pixeles."""
        half, other_half = self.line_height / 2.0, other.line_height / 2.0
        top = max(self.row_center - half, other.row_center - other_half)
        bottom = min(self.row_center + half, other.row_center + other_half)
        return bottom - top

    def absorb(self, other: "_TextGroup") -> None:
        self.x0 = min(self.x0, other.x0)
        self.y0 = min(self.y0, other.y0)
        self.x1 = max(self.x1, other.x1)
        self.y1 = max(self.y1, other.y1)
        self.parts.extend(other.parts)
        self.confidences.extend(other.confidences)
        self.line_heights.extend(other.line_heights)
        self.centers.extend(other.centers)

    def set_row_key(self, key: float) -> None:
        """Reetiqueta todos los fragmentos con la misma fila, ya cerrada la linea."""
        self.parts = [(key, x, fragment) for _, x, fragment in self.parts]


def _group_from_fragment(
    bbox: tuple[float, float, float, float], text: str, confidence: float
) -> _TextGroup:
    x0, y0, x1, y1 = bbox
    return _TextGroup(
        x0=x0, y0=y0, x1=x1, y1=y1,
        parts=[(y0, x0, text)],
        confidences=[confidence],
        line_heights=[max(1.0, y1 - y0)],
        centers=[(y0 + y1) / 2.0],
    )


def _same_line(line: _TextGroup, fragment: _TextGroup) -> bool:
    """Decide si un fragmento continua la linea abierta indicada."""
    shorter = min(line.line_height, fragment.line_height)
    if line.overlaps_row(fragment) < LINE_MIN_VERTICAL_OVERLAP * shorter:
        return False

    if max(line.line_height, fragment.line_height) / shorter > LINE_MAX_HEIGHT_RATIO:
        return False

    max_gap = LINE_MAX_GAP_FACTOR * shorter

    # Fragmento a la derecha de la linea abierta
    if fragment.x0 >= line.x1:
        return (fragment.x0 - line.x1) <= max_gap

    # Fragmento a la izquierda de la linea abierta
    if fragment.x1 <= line.x0:
        return (line.x0 - fragment.x1) <= max_gap

    # Solape horizontal entre cajas: solo tolerar leve desajuste tipografico
    overlap_x = min(line.x1, fragment.x1) - max(line.x0, fragment.x0)
    return overlap_x <= 0.35 * shorter


def _merge_into_lines(fragments: list[_TextGroup]) -> list[_TextGroup]:
    """Primera pasada: fragmentos sueltos a lineas de lectura completas."""
    lines: list[_TextGroup] = []
    for fragment in sorted(fragments, key=lambda g: ((g.y0 + g.y1) / 2.0, g.x0)):
        for line in reversed(lines):
            if _same_line(line, fragment):
                line.absorb(fragment)
                break
        else:
            lines.append(fragment)

    # Con la linea ya cerrada, todos sus fragmentos comparten fila: asi el orden
    # final es por columnas dentro de la fila y no por el ruido vertical de cada
    # caja individual.
    for line in lines:
        line.set_row_key(line.row_center)
    return lines


def _same_paragraph(previous: _TextGroup, candidate: _TextGroup) -> bool:
    """Decide si dos lineas consecutivas pertenecen al mismo parrafo."""
    reference = (previous.line_height + candidate.line_height) / 2.0
    if candidate.y0 - previous.y1 > PARAGRAPH_MAX_GAP_FACTOR * reference:
        return False

    shorter = min(previous.line_height, candidate.line_height)
    if max(previous.line_height, candidate.line_height) / shorter > PARAGRAPH_MAX_HEIGHT_RATIO:
        return False

    # Disparidad de ancho: una linea muy ancha (ej. pie, titulo o banner)
    # no debe absorber una columna estrecha adyacente.
    width_ratio = max(previous.width, candidate.width) / max(1.0, min(previous.width, candidate.width))
    if width_ratio > 2.0:
        return False

    # Columnas contiguas: se rozan en vertical pero apenas comparten eje X.
    x_overlap = min(previous.x1, candidate.x1) - max(previous.x0, candidate.x0)
    if x_overlap < PARAGRAPH_MIN_X_OVERLAP * min(previous.width, candidate.width):
        return False

    # Alineado por la izquierda (parrafo corriente) o por el centro (titulares).
    tolerance = max(
        PARAGRAPH_MAX_MISALIGNMENT * min(previous.width, candidate.width),
        1.2 * reference,
    )
    aligned_left = abs(candidate.x0 - previous.x0) <= tolerance
    aligned_center = abs(
        (candidate.x0 + candidate.x1) / 2.0 - (previous.x0 + previous.x1) / 2.0
    ) <= tolerance
    return aligned_left or aligned_center


def _merge_into_paragraphs(lines: list[_TextGroup]) -> list[_TextGroup]:
    """Segunda pasada: lineas consecutivas y alineadas a un unico parrafo."""
    paragraphs: list[_TextGroup] = []
    for line in sorted(lines, key=lambda g: (g.y0, g.x0)):
        for paragraph in reversed(paragraphs):
            if _same_paragraph(paragraph, line):
                paragraph.absorb(line)
                break
        else:
            paragraphs.append(line)
    return paragraphs


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


def _estimate_font_size_from_bbox(
    bbox: tuple[float, float, float, float], line_height: float | None = None
) -> float:
    """
    Estima el cuerpo de la fuente a partir de la altura de una LÍNEA.

    Tras fusionar fragmentos en párrafos, la altura de la caja ya no es la de una
    línea sino la del bloque entero: usarla daría cuerpos disparatados, porque un
    párrafo de cinco líneas produciría una fuente cinco veces mayor. Por eso el
    llamante pasa la altura de línea representativa y la caja actúa de respaldo.

    Args:
        bbox (tuple): Caja del bloque, usada solo si no hay altura de línea.
        line_height (float | None): Altura de línea representativa en píxeles.

    Returns:
        float: Cuerpo estimado, acotado a [10, 96].
    """
    _, y0, _, y1 = bbox
    h = float(line_height) if line_height else max(1.0, float(y1 - y0))
    # Heurística: en bloques OCR el alto incluye asc/desc + margen; reducimos para que encaje
    return max(10.0, min(96.0, max(1.0, h) * 0.76))


def _estimate_bold_from_region(
    region: np.ndarray,
    bg_rgb: tuple[int, int, int],
    bbox: tuple[float, float, float, float],
    line_height: float | None = None,
) -> bool:
    if region.size == 0:
        return False

    flat = region.reshape(-1, 3).astype(np.float32)
    bg = np.array(bg_rgb, dtype=np.float32)
    dist = np.linalg.norm(flat - bg, axis=1)
    ink_threshold = max(18.0, float(np.percentile(dist, 82)))
    ink_ratio = float(np.mean(dist >= ink_threshold))

    _, y0, _, y1 = bbox
    # Igual que en el cuerpo de fuente: la referencia es la línea, no el párrafo.
    reference_height = float(line_height) if line_height else max(1.0, float(y1 - y0))

    return ink_ratio >= 0.17 or (reference_height >= 36.0 and ink_ratio >= 0.12)


def _infer_block_style(
    img_array: np.ndarray,
    bbox: tuple[float, float, float, float],
    line_height: float | None = None,
) -> tuple[str, str, float, str, bool]:
    region = _safe_crop(img_array, bbox)
    bg_rgb = _estimate_bg_color(region)
    txt_rgb = _estimate_text_color(region, bg_rgb)

    bg_hex = _rgb_to_hex(bg_rgb)
    txt_hex = _rgb_to_hex(txt_rgb)
    font_size = _estimate_font_size_from_bbox(bbox, line_height)
    is_bold = _estimate_bold_from_region(region, bg_rgb, bbox, line_height)

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


def analyze_image(page_num: int, image: Image.Image, scale: float = 1.0) -> Result[list[OCRBlock]]:
    """
    Ejecuta el escaneo OCR sobre una imagen renderizada vía EasyOCR, calculando y 
    estructurando las coordenadas de cada bloque en una caja delimitadora de frontend.

    Args:
        page_num (int): Identificador secuencial de la página analizada.
        image (Image.Image): Representación matricial de la página renderizada para OCR.
        scale (float): Factor para llevar las coordenadas del espacio de píxeles
            de la imagen leída al del lienzo. Es 1.0 cuando se lee la misma
            imagen que se dibuja, y menor que 1 cuando se lee a más resolución
            de la que se pinta. Todo el análisis (recortes, colores, alturas de
            línea) ocurre en el espacio de la imagen leída, que es donde está la
            información; la escala se aplica solo al emitir.

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
        fragments: list[_TextGroup] = []
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
                    text = str(text_info).strip()
                    if text:
                        fragments.append(_group_from_fragment(bbox, text, float(confidence)))

        # Se reagrupa ANTES de inferir estilo: así el color, el cuerpo y la
        # negrita se calculan sobre el bloque final que verá el usuario y no
        # sobre trozos sueltos de dos palabras.
        groups = fragments
        if OCR_MERGE_BLOCKS and fragments:
            groups = _merge_into_paragraphs(_merge_into_lines(fragments))

        safe_scale = float(scale) if scale and scale > 0 else 1.0
        for group in sorted(groups, key=lambda g: (g.y0, g.x0)):
            bbox = (group.x0, group.y0, group.x1, group.y1)
            # El estilo se infiere sobre la imagen leída, no sobre la escalada:
            # recortar de la imagen de alta resolución da colores y densidad de
            # tinta mucho más fiables que hacerlo del lienzo reducido.
            style = _infer_block_style(img_array, bbox, group.line_height)
            text_color_hex, bg_color_hex, font_size, font_family, is_bold = style
            blocks.append(OCRBlock(
                id=str(uuid.uuid4()),
                page=page_num,
                bbox=tuple(value * safe_scale for value in bbox),
                text=group.text,
                # La confianza del grupo es la del peor fragmento: si una palabra
                # se leyó mal, el bloque entero merece revisión.
                confidence=min(group.confidences),
                font_size=font_size * safe_scale,
                font_family=font_family,
                is_bold=is_bold,
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
