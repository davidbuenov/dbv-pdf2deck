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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.endpoints import router as api_router

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

# Permitir CORS de forma estricta para el puerto del Frontend (5500)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
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
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
