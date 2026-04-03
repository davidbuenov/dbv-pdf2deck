# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Definición de rutas principales de la API para orquestar procesado PDF y OCR.
"""
from pathlib import Path
import tempfile
import uuid
from typing import Any
import asyncio
from datetime import datetime

from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.background import BackgroundTasks
from pydantic import BaseModel

from core.pdf_renderer import process_pdf_file, PDFDocumentContext
import io
import base64
import shutil
from core.ocr_engine import analyze_image, OCRBlock
from core.exporter_engine import generate_export_zip
from core.ai_cleaner import clean_image_with_ai, clean_image_with_inpaint
from core.result import Ok, Err

# Enrutador asilado para versionar la API elegantemente
router = APIRouter(prefix="/api/v1", tags=["document-processor"])
DOCS_DIR = Path(tempfile.gettempdir()) / "dbvpdfeditor_docs"
DOCS_DIR.mkdir(parents=True, exist_ok=True)

# Almacén de colas de logs por documento para SSE
LOG_QUEUES: dict[str, asyncio.Queue] = {}
DOCUMENT_STORE: dict[str, Path] = {}


def _log_processing_step(doc_id: str, message: str) -> None:
    """Emite trazas legibles del progreso y las acumula en cola SSE para el cliente."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_msg = f"[{timestamp}] {message}"
    print(f"[PROCESS][{doc_id}] {message}", flush=True)
    
    # Guardar en cola para SSE si existe
    if doc_id in LOG_QUEUES:
        try:
            LOG_QUEUES[doc_id].put_nowait(log_msg)
        except asyncio.QueueFull:
            pass  # Ignorar si la cola está llena


class PageResponse(BaseModel):
    """Contrato de respuesta por cada página del PDF inferido."""
    page_num: int
    has_native_text: bool
    image_base64: str | None = None
    page_width_pt: float | None = None
    page_height_pt: float | None = None
    render_width_px: float | None = None
    render_height_px: float | None = None
    ai_cleaned_bg: bool = False
    blocks: list[dict[str, Any]]


class ProcessResponse(BaseModel):
    """Contrato principal de la respuesta JSON para el frontend Canvas."""
    filename: str
    doc_id: str | None = None
    total_pages: int
    export_mode: str = "only_modified"
    export_targets: dict[str, bool] = {"pdf": True, "pptx": True, "md": True}
    pages: list[PageResponse]

class CleanBackgroundRequest(BaseModel):
    image_base64: str
    api_key: str


class CleanBackgroundLocalRequest(BaseModel):
    image_base64: str
    boxes: list[dict[str, Any]] = []


@router.get("/process-log-stream/{doc_id}")
async def stream_process_logs(doc_id: str):
    """
    Server-Sent Events endpoint que streamea logs de procesamiento en vivo.
    El cliente se conecta con EventSource(url) para recibir actualizaciones.
    """
    # Crear cola si no existe
    if doc_id not in LOG_QUEUES:
        LOG_QUEUES[doc_id] = asyncio.Queue(maxsize=100)
    
    queue = LOG_QUEUES[doc_id]
    
    async def event_generator():
        try:
            while True:
                try:
                    # Esperar hasta 35 segundos por un nuevo log (después cierra la conexión)
                    msg = await asyncio.wait_for(queue.get(), timeout=35)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    # Si no hay logs en 35 segundos, cerrar la conexión
                    break
        finally:
            # Limpiar la cola cuando el cliente se desconecte
            if doc_id in LOG_QUEUES:
                del LOG_QUEUES[doc_id]
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/process", response_model=ProcessResponse)
def process_document(file: UploadFile = File(...), doc_id: str | None = Form(None)) -> ProcessResponse:
    """
    Ingesta un archivo PDF del formulario cliente, lo guarda temporalmente mediante
    context managers de Python, lo rasteriza resolviendo las páginas como imágenes
    y ejecuta inteligencia OCR únicamente en aquellas que carecen de texto nativo.
    
    Args:
        file (UploadFile): Archivo binario enviado por HTTP POST temporal en memoria RAM.

    Returns:
        ProcessResponse: Modelo validable Pydantic conteniendo listas dinámicas de 
        bboxes (bloques calculados de texto).
        
    Raises:
        HTTPException: Errores insalvables 400 (Mal formato) y 500 (Quiebre lectura PyMuPDF).
    """
    response: ProcessResponse
    
    # 1. Guard clause de extensión validando la entrada plana sin pirámide de ifs
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(
            status_code=400, 
            detail="Petición errónea: El archivo proveído debe poseer sin excepción formato .pdf"
        )
        
    # Escritura atómica a FS local. Se destruirá en el bloque `finally` para evitar fugas.
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        tmp_file.write(file.file.read())
        tmp_path = Path(tmp_file.name)
        
    # Permitir que el frontend suministre doc_id para abrir SSE antes del POST /process.
    # Si no se recibe, se genera uno nuevo (compatibilidad retroactiva).
    doc_id = (doc_id or "").strip() or str(uuid.uuid4())

    # Crear cola desde el inicio para no perder logs tempranos aunque el SSE conecte tarde.
    if doc_id not in LOG_QUEUES:
        LOG_QUEUES[doc_id] = asyncio.Queue(maxsize=200)

    persisted_pdf_path = DOCS_DIR / f"{doc_id}.pdf"

    try:
        shutil.copy2(tmp_path, persisted_pdf_path)
        DOCUMENT_STORE[doc_id] = persisted_pdf_path
        _log_processing_step(doc_id, f"Documento persistido temporalmente como '{persisted_pdf_path.name}'.")
        _log_processing_step(doc_id, "Iniciando inspección estructural y renderizado de páginas...")

        # Procesamos con resolución 100DPI para no asfixiar a localizadores pesados en el MVP
        render_result = process_pdf_file(tmp_path, dpi=100)
        
        match render_result:
            case Err(msg):
                raise HTTPException(status_code=500, detail=msg)
            case Ok(context):
                pages_out: list[PageResponse] = []
                _log_processing_step(doc_id, f"Render base completado. Total de páginas detectadas: {context.total_pages}.")
                
                # Iterativa de acoplo PyMuPDF img -> Paddle OCR logic
                for render in context.pages:
                    human_page_num = render.page_num + 1
                    _log_processing_step(
                        doc_id,
                        (
                            f"Página {human_page_num}/{context.total_pages}: "
                            f"canvas={int(render.render_width_px)}x{int(render.render_height_px)} px | "
                            f"texto_nativo={'sí' if render.has_native_text else 'no'}"
                        )
                    )
                    blocks_out: list[dict[str, Any]] = []
                    
                    if render.has_native_text and render.native_blocks:
                        _log_processing_step(
                            doc_id,
                            f"Página {human_page_num}: reutilizando {len(render.native_blocks)} bloques nativos; OCR omitido."
                        )
                        blocks_out = [
                            {
                                "id": b.id, "page": b.page,
                                "bbox": b.bbox, "text": b.text,
                                "confidence": b.confidence, "is_new": b.is_new,
                                "font_size": getattr(b, "font_size", None),
                                "font_family": getattr(b, "font_family", "system-ui"),
                                "is_bold": getattr(b, "is_bold", False),
                                "is_italic": getattr(b, "is_italic", False),
                                "bbox_pt": getattr(b, "bbox_pt", None),
                                "text_color": getattr(b, "text_color_hex", "#000000"),
                                "bg_color": getattr(b, "bg_color_hex", "#ffffff"),
                                "source": "native",
                                "lock_position": True,
                                "is_modified": False,
                                "bg_transparent": False
                            } 
                            for b in render.native_blocks
                        ]
                    else:
                        _log_processing_step(doc_id, f"Página {human_page_num}: ejecutando OCR EasyOCR sobre imagen renderizada.")
                        ocr_res = analyze_image(render.page_num, render.image)
                        match ocr_res:
                            case Ok(ocr_blocks):
                                _log_processing_step(
                                    doc_id,
                                    f"Página {human_page_num}: OCR finalizado con {len(ocr_blocks)} bloques detectados."
                                )
                                blocks_out = [
                                    {
                                        "id": b.id, "page": b.page,
                                        "bbox": b.bbox, "text": b.text,
                                        "confidence": b.confidence, "is_new": b.is_new,
                                        "font_size": getattr(b, "font_size", None),
                                        "font_family": getattr(b, "font_family", "system-ui"),
                                        "text_color": getattr(b, "text_color_hex", "#000000"),
                                        "bg_color": getattr(b, "bg_color_hex", "#ffffff"),
                                        "is_bold": getattr(b, "is_bold", False),
                                        "is_italic": getattr(b, "is_italic", False),
                                        "source": "ocr",
                                        "lock_position": False,
                                        "is_modified": False,
                                        "bg_transparent": False
                                    } 
                                    for b in ocr_blocks
                                ]
                            case Err(ocr_err):
                                # Logs transparentes; el PDF se renderizará en blanco / sin texto
                                print(f"[WARN] Inferencia OCR aborrtada en Pág {render.page_num}: {ocr_err}")
                                _log_processing_step(doc_id, f"Página {human_page_num}: OCR abortado. Motivo: {ocr_err}")
                                
                    img_b64 = None
                    if render.image:
                        buffered = io.BytesIO()
                        # Salida optimizada a PNG
                        render.image.save(buffered, format="PNG")
                        img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                        
                    pages_out.append(PageResponse(
                        page_num=render.page_num,
                        has_native_text=render.has_native_text,
                        image_base64=f"data:image/png;base64,{img_b64}" if img_b64 else None,
                        page_width_pt=render.page_width_pt,
                        page_height_pt=render.page_height_pt,
                        render_width_px=render.render_width_px,
                        render_height_px=render.render_height_px,
                        blocks=blocks_out
                    ))
                    _log_processing_step(doc_id, f"Página {human_page_num}: empaquetada para respuesta con {len(blocks_out)} bloques.")
                    
                response = ProcessResponse(
                    filename=context.filename,
                    doc_id=doc_id,
                    total_pages=context.total_pages,
                    pages=pages_out
                )
                _log_processing_step(doc_id, "Documento procesado completamente. Respuesta JSON lista para el frontend.")
    finally:
        tmp_path.unlink(missing_ok=True)
        
    return response  # Único retorno estricto cumpliendo la regla de la Styleguide

# Helper preventivo para liberación de SSD
def cleanup_temp_dir(dir_path: Path):
    if dir_path.exists() and dir_path.is_dir():
        shutil.rmtree(dir_path, ignore_errors=True)


@router.post("/clean-background")
def clean_background_endpoint(payload: CleanBackgroundRequest):
    """
    Ruta para la limpieza con IA generativa de Google AI Studio.
    Retorna la imagen limpiada.
    """
    try:
        new_b64 = clean_image_with_ai(payload.image_base64, payload.api_key)
        return {"image_base64": new_b64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean-background-local")
def clean_background_local_endpoint(payload: CleanBackgroundLocalRequest):
    """
    Limpieza local de fondo con OpenCV inpainting a partir de los bboxes.
    No requiere API key ni servicios externos.
    """
    try:
        new_b64 = clean_image_with_inpaint(payload.image_base64, payload.boxes)
        return {"image_base64": new_b64}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/export", tags=["document-processor"])
async def export_document(payload: ProcessResponse, bg_tasks: BackgroundTasks):
    """
    Ruta Final: Recibe la alteración humana reflejada en el frontend de forma Reactiva,
    re-combina el texto nuevo ocultando el viejo base64 y escupe el ZIP consolidado.
    """
    try:
        dict_payload = payload.model_dump()
        export_targets = payload.export_targets
        has_any_target = bool(export_targets.get("pdf", False) or export_targets.get("pptx", False) or export_targets.get("md", False))
        if not has_any_target:
            raise HTTPException(status_code=400, detail="Debes seleccionar al menos un formato de exportación (PDF, PPTX o Markdown).")

        source_pdf_path = None
        if payload.doc_id and payload.doc_id in DOCUMENT_STORE:
            source_pdf_path = DOCUMENT_STORE[payload.doc_id]

        zip_path, temp_dir = generate_export_zip(dict_payload, source_pdf_path)

        if payload.doc_id and payload.doc_id in DOCUMENT_STORE:
            bg_tasks.add_task(Path.unlink, DOCUMENT_STORE[payload.doc_id], True)
            del DOCUMENT_STORE[payload.doc_id]
        
        # Tarea de fondo ejecutada tras Response (Evitar acopio pesado por descargas)
        bg_tasks.add_task(cleanup_temp_dir, Path(temp_dir))
        
        return FileResponse(
            path=str(zip_path),
            media_type="application/zip",
            filename="Presentacion_Editada_DBV.zip"
        )
    except Exception as general_err:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Excepción nativa construyendo el PPTX/PDF: {general_err!s}")
