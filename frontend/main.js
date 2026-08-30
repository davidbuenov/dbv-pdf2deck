// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// =============================================================================
/**
 * @fileoverview Entry Point Principal Frontend.
 * Gestiona interacciones de carga (File/Drag&Drop), telemetría de Terminal Visual y ruteo a Canvas.
 */

(() => {

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

function _t(key, vars) {
    return window.DBV_I18N ? window.DBV_I18N.t(key, vars) : key;
}

/**
 * Emite logs a la GUI emulando terminal nativa de consola para UX.
 * @param {string} msg Mensaje técnico representativo.
 */
function terminalPrint(msg) {
    if (logBox && logBox.hidden) logBox.hidden = false;
    const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
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
                `⏳ Procesando... ${elapsed} · ${processed}/${total} págs · ETA ~${formatDurationMMSS(etaSec)}`
            );
        } else {
            terminalPrint(`⏳ Procesando... ${elapsed}`);
        }
    }, 8000);
}

function closeServerEventSource() {
    if (serverEventSource !== null) {
        serverEventSource.close();
        serverEventSource = null;
    }
}

async function connectToServerLogs(docId) {
    closeServerEventSource();
    serverEventSource = await window.dbvApi.openProcessLogStream(docId);
    
    serverEventSource.onmessage = (event) => {
        if (event.data) {
            updateIngestProgressFromServerLog(event.data);
            terminalPrint(event.data);
        }
    };
    
    serverEventSource.onerror = () => {
        if (serverEventSource && serverEventSource.readyState === EventSource.CLOSED) {
            terminalPrint("✓ Conexión SSE cerrada.");
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

function resetToUploadPanel() {
    const uploadPanel = document.getElementById("upload-panel");
    const workspaceGate = document.getElementById("editor-workspace");
    if (uploadPanel) uploadPanel.hidden = false;
    if (workspaceGate) workspaceGate.hidden = true;
    window.dbvShell?.setDocumentState(false);
    if (fileInput) fileInput.value = "";
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
                terminalPrint("❌ Sólo se admiten .PDF, .PNG, .JPG/.JPEG o .WEBP");
            }
        }
    };
}

// Botones de la barra superior
const btnNewFile = document.getElementById("btn-new-file");
if (btnNewFile) {
    btnNewFile.onclick = () => resetToUploadPanel();
}

const btnOpenFile = document.getElementById("btn-open-file");
if (btnOpenFile) {
    btnOpenFile.onclick = () => fileInput && fileInput.click();
}

if (fileInput) {
    fileInput.addEventListener("change", (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            ingestPdfAndTriggerOcr(files[0]);
        }
    });
}

// Menú nativo de macOS (File > Nuevo/Abrir): el menú vive en Rust (no hay DOM
// ahí), así que emite estos eventos a la ventana en vez de reimplementar la
// lógica. Ver src-tauri/src/lib.rs (mod macos_menu).
if (window.dbvApi?.runningInTauri) {
    window.__TAURI__.event.listen("menu-new-file", () => resetToUploadPanel());
    window.__TAURI__.event.listen("menu-open-file", () => fileInput && fileInput.click());
}

// Atajos globales de teclado
window.addEventListener("keydown", (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    const activeEl = document.activeElement;
    const isTyping = activeEl?.isContentEditable || activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
    
    if (isCtrl && !isTyping) {
        if (e.key.toLowerCase() === "n") {
            e.preventDefault();
            resetToUploadPanel();
        } else if (e.key.toLowerCase() === "o") {
            e.preventDefault();
            if (fileInput) fileInput.click();
        }
    }
});

let lastHealthInfo = null;

async function checkAndRecordHealth() {
    try {
        const health = await window.dbvApi.checkHealth();
        if (health && health.status === "running") {
            lastHealthInfo = health;
            window.dbvShell?.setEngineStatus(true, health);
            return health;
        }
    } catch (_) {
        // En espera
    }
    lastHealthInfo = null;
    window.dbvShell?.setEngineStatus(false);
    return null;
}

async function waitForBackendReady(maxWaitMs = 35000) {
    const start = Date.now();
    let notifiedWaiting = false;

    while (Date.now() - start < maxWaitMs) {
        const health = await checkAndRecordHealth();
        if (health && health.ocr_ready !== false) {
            return health;
        }
        if (!notifiedWaiting) {
            notifiedWaiting = true;
            const isEn = window.DBV_I18N?.getLang?.() === "en";
            terminalPrint(isEn
                ? "⏳ Waiting for local OCR engine to finish initializing..."
                : "⏳ Esperando a que el motor OCR termine de inicializarse...");
        }
        await new Promise(r => setTimeout(r, 600));
    }
    throw new Error("El motor OCR no respondió a tiempo durante el arranque. Por favor, reintenta.");
}

/**
 * Transporta el archivo binario al Backend REST y orquesta la respuesta reactiva al Canvas.
 * @param {File} pdfBlob El archivo del usuario.
 */
async function ingestPdfAndTriggerOcr(pdfBlob) {
    const uploadPanel = document.getElementById("upload-panel");
    const workspaceGate = document.getElementById("editor-workspace");
    if (uploadPanel) uploadPanel.hidden = false;
    if (workspaceGate) workspaceGate.hidden = true;
    window.dbvShell?.setDocumentState(false);

    const sizeMb = (pdfBlob.size / 1024 / 1024).toFixed(2);
    terminalPrint(_t('terminal.uplink', { name: pdfBlob.name, size: sizeMb }));

    // Asegurar que el backend y el modelo OCR estén 100% listos antes de enviar el archivo
    try {
        const health = await waitForBackendReady();
        const modeLabel = health?.ocr_label ? ` (${health.ocr_label})` : "";
        const isEn = window.DBV_I18N?.getLang?.() === "en";
        terminalPrint(isEn
            ? `✓ Local OCR engine ready${modeLabel}. Starting analysis...`
            : `✓ Motor OCR local listo${modeLabel}. Iniciando análisis...`);
    } catch (waitErr) {
        terminalPrint(_t('terminal.abort', { msg: waitErr.message }));
        return;
    }

    const clientDocId = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `doc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    // Abrir SSE ANTES del POST para ver progreso en tiempo real desde la primera página.
    await connectToServerLogs(clientDocId);

    terminalPrint(_t('terminal.waitingOcr'));
    startIngestHeartbeat();

    try {
        const businessLogicResponse = await window.dbvApi.processDocument(pdfBlob, clientDocId);
        terminalPrint(_t('terminal.success', { total: businessLogicResponse.total_pages }));
        terminalPrint(_t('terminal.building'));
        stopIngestHeartbeat();
        
        if (workspaceGate) workspaceGate.hidden = false;
        if (uploadPanel) uploadPanel.hidden = true;
        window.dbvShell?.setDocumentState(true, pdfBlob.name, businessLogicResponse.total_pages);

        const canvasFeature = window.dbvCanvasEngine;
        console.log("[DBV DIAG main.js] canvasFeature?", !!canvasFeature, "pages:", businessLogicResponse.pages?.length);
        if (!canvasFeature) {
            terminalPrint(_t('terminal.fatalCanvas'));
            return;
        }
        if (businessLogicResponse.pages && businessLogicResponse.pages.length > 0) {
            console.log("[DBV DIAG main.js] Calling initPagination...");
            canvasFeature.initPagination(businessLogicResponse);
            console.log("[DBV DIAG main.js] initPagination done, calling mountKeyboardShortcuts...");
            canvasFeature.mountKeyboardShortcuts();
            console.log("[DBV DIAG main.js] mountKeyboardShortcuts done.");
        }
    } catch (e) {
        stopIngestHeartbeat();
        closeServerEventSource();
        console.error("[DBV DIAG main.js] CAUGHT ERROR:", e);
        terminalPrint(_t('terminal.abort', { msg: e.message }));
    }
}

// Monitor de disponibilidad de motor backend con reintentos para arranque en frío
async function startBackendHealthMonitor() {
    let connected = false;
    let attempts = 0;
    const maxFastAttempts = 40;

    async function poll() {
        const health = await checkAndRecordHealth();
        if (health) {
            if (!connected) {
                connected = true;
                const isEn = window.DBV_I18N?.getLang?.() === "en";
                const modeLabel = health.ocr_label ? ` [${health.ocr_label}]` : "";
                terminalPrint(isEn
                    ? `✓ Local OCR backend connected${modeLabel}.`
                    : `✓ Motor OCR local conectado y listo${modeLabel}.`);
            }
            setTimeout(poll, 10000);
            return;
        }

        attempts++;
        if (connected) {
            connected = false;
            window.dbvShell?.setEngineStatus(false);
        }

        if (attempts <= maxFastAttempts) {
            setTimeout(poll, 1000);
        } else {
            setTimeout(poll, 5000);
        }
    }

    poll();
}

window.addEventListener("DOMContentLoaded", () => {
    startBackendHealthMonitor();
});
})();
