# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Punto de entrada principal para el backend de DBV PDF2Deck.
Gobernado por FastAPI y construido bajo reglas estrictas de código localizadas en STYLEGUIDE.md.
"""

from contextlib import asynccontextmanager
import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.endpoints import router as api_router

# Protección para subprocesos y pipes anónimos de Windows (evita OSError 22 al hacer flush)
if sys.platform == "win32":
    try:
        if sys.stdout is not None:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        if sys.stderr is not None:
            sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass


class SafeStreamHandler(logging.StreamHandler):
    """Handler tolerante a pipes anónimos de Windows donde flush() puede lanzar OSError 22."""
    def flush(self) -> None:
        try:
            super().flush()
        except OSError:
            pass


logging.StreamHandler = SafeStreamHandler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Eventos clave en el ciclo de vida del servidor."""
    from core.ocr_engine import get_ocr_device_info, _get_reader
    info = get_ocr_device_info()
    print(f"\n[INIT] Pre-calentando Motor OCR en modo {info['label']} ({info['name']})...")
    print("[INIT] (Si es la primera vez, descargará los modelos de EasyOCR aquí para evitar colgar la red luego)")
    try:
        _get_reader()
        print(f"[INIT] Motor OCR Cargado exitosamente ({info['label']}). Servidor operativo.\n")
    except Exception as e:
        print(f"[ERR] Falla preventiva al cargar OCR central: {e}")
    yield

app = FastAPI(
    title="DBVPDFEditor API",
    description="Motor OCR y Procesamiento de Documentos Reactivo",
    version="0.1.0",
    lifespan=lifespan
)

# Permitir CORS para clientes Web locales y Tauri WebView2
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health_check() -> dict[str, object]:
    """
    Ruta básica para comprobar el estado de salud y arranque del servidor.

    Returns:
        dict[str, object]: Estado actual del servidor, inicialización de OCR y aceleración de hardware.
    """
    import core.ocr_engine as ocr_mod
    info = ocr_mod.get_ocr_device_info()
    return {
        "status": "running",
        "ocr_ready": ocr_mod._reader is not None,
        "ocr_device": info["device"],
        "ocr_label": info["label"],
        "device_name": info["name"]
    }

if __name__ == "__main__":
    import argparse
    import os

    import uvicorn

    parser = argparse.ArgumentParser(description="DBV PDF2Deck local API")
    parser.add_argument("--port", type=int, default=None)
    arguments = parser.parse_args()
    backend_port = arguments.port or int(os.getenv("DBV_BACKEND_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=backend_port, reload=False)
