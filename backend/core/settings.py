# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Configuración central del backend con soporte para variables de entorno y .env.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND_DIR.parent

# Primero lee .env del backend; si no existe, usa el de la raíz del proyecto.
load_dotenv(_BACKEND_DIR / ".env", override=False)
load_dotenv(_PROJECT_ROOT / ".env", override=False)


def _read_float_env(var_name: str, default: float) -> float:
    raw = os.getenv(var_name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _read_int_env(var_name: str, default: int) -> int:
    raw = os.getenv(var_name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


MAX_UPLOAD_MB = _read_int_env("DBV_MAX_UPLOAD_MB", 20)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_IMAGE_SIDE_PX = _read_int_env("DBV_MAX_IMAGE_SIDE_PX", 8000)
# ── Detección de texto nativo ────────────────────────────────────────────────
# Contar caracteres no basta para decidir si una página trae texto aprovechable:
# un PDF de infografías con un pie de página («Página 1 · Powered by …») supera
# cualquier umbral de caracteres y hace que se omita el OCR, dejando al usuario
# con tres bloques de mobiliario y todo el contenido real sin leer dentro de la
# imagen. La fracción de página cubierta por ese texto sí separa los dos casos
# por dos órdenes de magnitud: ~0,4 % un pie de página frente al 24-33 % de un
# documento de texto real.
NATIVE_TEXT_MIN_CHARS = _read_int_env("DBV_NATIVE_TEXT_MIN_CHARS", 20)
NATIVE_TEXT_MIN_COVERAGE = _read_float_env("DBV_NATIVE_TEXT_MIN_COVERAGE", 0.02)

# ── Resolución de lectura ────────────────────────────────────────────────────
# El lienzo se rasteriza a 100 DPI porque es lo que el editor necesita mover con
# soltura, pero a esa resolución el cuerpo de texto de una infografía mide ~10 px
# y EasyOCR devuelve basura: sobre una página real, confianza mediana 0,52 y
# frases como «nueslros pacientes llujo _ Hemo<». A 200 DPI la mediana sube a
# 0,71 y el párrafo se lee entero. Por eso se lee a una resolución y se dibuja a
# otra: la página se rasteriza aparte solo para el OCR y las cajas resultantes se
# escalan al lienzo, de modo que el payload y la memoria del canvas no cambian.
# Igualarlo a 100 desactiva el doble render.
OCR_DPI = _read_int_env("DBV_OCR_DPI", 200)

# Fusión de fragmentos OCR en líneas y párrafos. Apagarlo devuelve el
# comportamiento anterior: un bloque por cada fragmento de EasyOCR.
OCR_MERGE_BLOCKS = _read_int_env("DBV_OCR_MERGE_BLOCKS", 1) != 0

MAX_IMAGE_TOTAL_PIXELS = _read_int_env("DBV_MAX_IMAGE_TOTAL_PIXELS", 25000000)

# ── Calidad del fondo incrustado en el PPTX ──────────────────────────────────
# El PPTX no puede llevar la página vectorial dentro, así que su fondo es
# siempre un raster. El lienzo y el OCR trabajan a 100 DPI porque ahí manda la
# velocidad; para exportar se re-rasteriza el PDF original a esta resolución.
# 1200 DPI queda deliberadamente fuera de la lista: una página A3 son ~1 GB en
# memoria y lados de más de 20.000 px que PowerPoint no digiere.
EXPORT_DPI_CHOICES = (150, 200, 300, 400, 600)
EXPORT_DEFAULT_DPI = _read_int_env("DBV_EXPORT_DPI", 300)

# Techos del re-rasterizado. Al superarlos se baja el DPI en lugar de fallar:
# más vale una exportación algo menos nítida que un MemoryError.
EXPORT_MAX_SIDE_PX = _read_int_env("DBV_EXPORT_MAX_SIDE_PX", 14000)
EXPORT_MAX_TOTAL_PIXELS = _read_int_env("DBV_EXPORT_MAX_TOTAL_PIXELS", 120000000)

# A partir de aquí el PNG sin pérdida deja de compensar y se pasa a JPEG de
# alta calidad: un deck de fotos a 600 DPI en PNG son cientos de MB.
EXPORT_PNG_MAX_BYTES = _read_int_env("DBV_EXPORT_PNG_MAX_BYTES", 6000000)
EXPORT_JPEG_QUALITY = _read_int_env("DBV_EXPORT_JPEG_QUALITY", 92)


def resolve_export_dpi(requested: object) -> int:
    """Normaliza el DPI pedido por el cliente a uno de los valores admitidos."""
    try:
        value = int(requested)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return EXPORT_DEFAULT_DPI
    return value if value in EXPORT_DPI_CHOICES else EXPORT_DEFAULT_DPI
