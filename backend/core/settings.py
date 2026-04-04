# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Configuración central del backend con soporte para variables de entorno y .env.
"""
from pathlib import Path
import os

from dotenv import load_dotenv


_BACKEND_DIR = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND_DIR.parent

# Primero lee .env del backend; si no existe, usa el de la raíz del proyecto.
load_dotenv(_BACKEND_DIR / ".env", override=False)
load_dotenv(_PROJECT_ROOT / ".env", override=False)


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
MAX_IMAGE_TOTAL_PIXELS = _read_int_env("DBV_MAX_IMAGE_TOTAL_PIXELS", 25000000)
