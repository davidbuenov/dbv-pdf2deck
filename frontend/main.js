// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// =============================================================================
/**
 * @fileoverview Entry Point Principal Frontend.
 * Gestiona interacciones de carga (File/Drag&Drop), telemetría de Terminal Visual y ruteo a Canvas.
 */

const API_BASE_URL = "http://localhost:8000/api/v1";
const SUPPORTED_UPLOAD_MIME = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
]);
const SUPPORTED_UPLOAD_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("pdf-upload");
const logBox = document.getElementById("log-container");
const logConsole = document.getElementById("log-console");
let ingestHeartbeatTimer = null;
let serverEventSource = null;
let ingestStartedAtMs = 0;
let ingestTotalPages = null;
let ingestProcessedPages = new Set();

/**
 * Emite logs a la GUI emulando terminal nativa de consola para UX.
 * @param {string} msg Mensaje técnico representativo.
 */
function terminalPrint(msg) {
    if (logBox && logBox.hidden) logBox.hidden = false;
    const time = new Date().toLocaleTimeString('es-ES', {hour12: false});
    if (logConsole) {
        logConsole.textContent += `[${time}] ${msg}\n`;
        logConsole.scrollTop = logConsole.scrollHeight;
    }
}

function stopIngestHeartbeat() {
    if (ingestHeartbeatTimer !== null) {
        window.clearInterval(ingestHeartbeatTimer);
        ingestHeartbeatTimer = null;
    }
    ingestStartedAtMs = 0;
    ingestTotalPages = null;
    ingestProcessedPages = new Set();
}

function formatElapsedMMSS(elapsedMs) {
    const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationMMSS(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateIngestProgressFromServerLog(rawMessage) {
    const msg = `${rawMessage || ""}`;

    // Ejemplo: "Render base completado. Total de páginas detectadas: 18."
    const totalMatch = msg.match(/Total de p[aá]ginas detectadas:\s*(\d+)/i);
    if (totalMatch) {
        ingestTotalPages = parseInt(totalMatch[1], 10);
    }

    // Marcador de cierre de página (ocurre una vez por página):
    // "Página 7: empaquetada para respuesta con 13 bloques."
    const packedMatch = msg.match(/P[aá]gina\s+(\d+):\s+empaquetada\s+para\s+respuesta/i);
    if (packedMatch) {
        ingestProcessedPages.add(parseInt(packedMatch[1], 10));
    }
}

function startIngestHeartbeat() {
    stopIngestHeartbeat();
    ingestStartedAtMs = Date.now();
    ingestHeartbeatTimer = window.setInterval(() => {
        const elapsed = formatElapsedMMSS(Date.now() - ingestStartedAtMs);
        const processed = ingestProcessedPages.size;
        const total = ingestTotalPages;

        if (total && processed > 0 && processed <= total) {
            const elapsedSec = (Date.now() - ingestStartedAtMs) / 1000;
            const avgSecPerPage = elapsedSec / processed;
            const remaining = Math.max(0, total - processed);
            const etaSec = remaining * avgSecPerPage;
            terminalPrint(
                `⏳ Procesando... ${elapsed} transcurridos · ${processed}/${total} páginas · ETA ~${formatDurationMMSS(etaSec)}`
            );
        } else {
            terminalPrint(`⏳ Procesando... ${elapsed} transcurridos.`);
        }
    }, 8000);
}

function closeServerEventSource() {
    if (serverEventSource !== null) {
        serverEventSource.close();
        serverEventSource = null;
    }
}

function connectToServerLogs(docId) {
    closeServerEventSource();
    const eventUrl = `${API_BASE_URL}/process-log-stream/${docId}`;
    serverEventSource = new EventSource(eventUrl);
    
    serverEventSource.onmessage = (event) => {
        if (event.data) {
            updateIngestProgressFromServerLog(event.data);
            terminalPrint(event.data);
        }
    };
    
    serverEventSource.onerror = (event) => {
        if (serverEventSource.readyState === EventSource.CLOSED) {
            terminalPrint("✓ Conexión SSE cerrada (procesamiento completado o timeout).");
        } else {
            terminalPrint("⚠ Error en la conexión SSE, reintentando...");
        }
        closeServerEventSource();
    };
}

function isSupportedUpload(file) {
    const mime = (file.type || "").toLowerCase();
    if (SUPPORTED_UPLOAD_MIME.has(mime)) return true;

    const name = (file.name || "").toLowerCase();
    const ext = name.includes(".") ? `.${name.split(".").pop()}` : "";
    return SUPPORTED_UPLOAD_EXT.has(ext);
}

// ---------- INTERFAZ DRAG & DROP ----------
if (dropzone) {
    dropzone.onclick = () => fileInput && fileInput.click();
    
    dropzone.ondragover = (e) => { 
        e.preventDefault(); 
        dropzone.classList.add("drag-over"); 
    };
    
    dropzone.ondragleave = () => { 
        dropzone.classList.remove("drag-over"); 
    };
    
    dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-over");
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (isSupportedUpload(file)) {
                ingestPdfAndTriggerOcr(file);
            } else {
                terminalPrint("❌ Error fatal: Sólo se admiten .PDF, .PNG, .JPG/.JPEG o .WEBP");
            }
        }
    };
}

if (fileInput) {
    fileInput.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            ingestPdfAndTriggerOcr(files[0]);
        }
    });
}

/**
 * Transporta el archivo binario al Backend REST y orquesta la respuesta reactiva al Canvas.
 * @param {File} pdfBlob El archivo del usuario.
 */
async function ingestPdfAndTriggerOcr(pdfBlob) {
    const clientDocId = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `doc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // Abrir SSE ANTES del POST para ver progreso en tiempo real desde la primera página.
    connectToServerLogs(clientDocId);

    const formData = new FormData();
    formData.append("file", pdfBlob);
    formData.append("doc_id", clientDocId);

    // Ocultar area de Drag para dar protagonismo a la Terminal si se prefiere
    // document.getElementById("upload-panel").hidden = true; 
    
    terminalPrint(`Iniciando Uplink. Transfiriendo archivo '${pdfBlob.name}' (Size: ${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB)...`);
    terminalPrint("Red conectada. Esperando a motor Offline OCR (Modo Turbo GPU si está disponible)...");
    startIngestHeartbeat();

    try {
        const response = await fetch(`${API_BASE_URL}/process`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Excepción Servidor Status: ${response.status}`);
        }

        const businessLogicResponse = await response.json();
        terminalPrint(`¡ÉXITO TOTAL! ${businessLogicResponse.total_pages} páginas recibidas desde el microservicio backend.`);
        terminalPrint(`Módulos cargados exitosamente. Construyendo UI HTML5 Canvas e instanciando motor Exportador...`);
        stopIngestHeartbeat();
        
        const workspaceGate = document.getElementById("editor-workspace");
        if (workspaceGate) workspaceGate.hidden = false;

        // Invocación import() asíncrona difiriendo carga masiva inicial del Motor UI
        const cacheBuster = Date.now();
        import(`./canvas_engine.js?v=${cacheBuster}`)
            .then(canvasFeature => {
                if (businessLogicResponse.pages && businessLogicResponse.pages.length > 0) {
                    canvasFeature.initPagination(businessLogicResponse);
                    canvasFeature.mountKeyboardShortcuts();
                }
            })
            .catch(errorLoad => {
                terminalPrint(`[FATAL] La importación del motor Canvas falló: ${errorLoad}`);
            });

    } catch (e) {
        stopIngestHeartbeat();
        closeServerEventSource();
        terminalPrint(`❌ ABORTO DE OPERACIÓN HTTP: ${e.message}`);
    }
}
