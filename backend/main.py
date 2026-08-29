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

from api.endpoints import router as api_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Eventos clave en el ciclo de vida del servidor."""
    print("\n[INIT] Pre-calentando Motor OCR en CPU...")
    print("[INIT] (Si es la primera vez, descargará los modelos de EasyOCR aquí para evitar colgar la red luego)")
    try:
        from core.ocr_engine import _get_reader
        _get_reader()
        print("[INIT] Motor OCR Cargado exitosamente. Servidor operativo.\n")
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
def health_check() -> dict[str, str]:
    """
    Ruta básica para comprobar el estado de salud y arranque del servidor.

    Returns:
        dict[str, str]: Estado actual del servidor y API.
    """
    status: dict[str, str] = {"status": "running"}
    return status

if __name__ == "__main__":
    import argparse
    import os

    import uvicorn

    parser = argparse.ArgumentParser(description="DBV PDF2Deck local API")
    parser.add_argument("--port", type=int, default=None)
    arguments = parser.parse_args()
    backend_port = arguments.port or int(os.getenv("DBV_BACKEND_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=backend_port, reload=False)
