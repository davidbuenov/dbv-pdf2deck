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

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("pdf-upload");
const logBox = document.getElementById("log-container");
const logConsole = document.getElementById("log-console");
let ingestHeartbeatTimer = null;
let serverEventSource = null;

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
            if (file.type === "application/pdf") {
                ingestPdfAndTriggerOcr(file);
            } else {
                terminalPrint("❌ Error fatal: Sólo se admiten documentos .PDF");
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
    const formData = new FormData();
    formData.append("file", pdfBlob);

    // Ocultar area de Drag para dar protagonismo a la Terminal si se prefiere
    // document.getElementById("upload-panel").hidden = true; 
    
    terminalPrint(`Iniciando Uplink. Transfiriendo archivo '${pdfBlob.name}' (Size: ${(pdfBlob.size / 1024 / 1024).toFixed(2)} MB)...`);
    terminalPrint("Red conectada. Esperando a motor Offline OCR (Modo Turbo GPU si está disponible)...");

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
        
        // Conectar a SSE ahora que tenemos el doc_id
        if (businessLogicResponse.doc_id) {
            connectToServerLogs(businessLogicResponse.doc_id);
        }
        
        terminalPrint(`¡ÉXITO TOTAL! ${businessLogicResponse.total_pages} páginas recibidas desde el microservicio backend.`);
        if (Array.isArray(businessLogicResponse.pages)) {
            businessLogicResponse.pages.forEach((page, index) => {
                const pageMode = page.has_native_text ? "texto nativo" : "OCR";
                terminalPrint(`Página ${index + 1}/${businessLogicResponse.total_pages}: ${pageMode}, ${page.blocks.length} bloques listos.`);
            });
        }
        terminalPrint(`Módulos cargados exitosamente. Construyendo UI HTML5 Canvas e instanciando motor Exportador...`);
        
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
        closeServerEventSource();
        terminalPrint(`❌ ABORTO DE OPERACIÓN HTTP: ${e.message}`);
    }
}
