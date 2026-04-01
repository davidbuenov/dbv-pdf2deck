// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// =============================================================================
/**
 * @fileoverview Motor de Canvas.
 * Gestiona la paginación, el formateo modular (Barra flotante), las capas de ocr y el exportador.
 */

let globalPayload = null;
let currentActivePageIndex = 0;
let currentZoomScale = 1.0;
let _userHasZoomed = false;
let selectedBlockIndices = []; // Índices de bloques en modo multi-selección (Ctrl+Click)

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;
const TEXT_BOX_PADDING = 8;
const TEXT_LINE_HEIGHT_MULTIPLIER = 1.15;
const _measurementCanvas = document.createElement("canvas");
const _measurementCtx = _measurementCanvas.getContext("2d");

// ===== Sistema de Undo/Redo =====
let undoStack = [];
let redoStack = [];
const MAX_UNDO_SIZE = 50; // Límite de estados guardados para no saturar memoria

/**
 * Crea un snapshot profundo de todos los bloques en el documento actual.
 * @returns {Object} Estado serializable del documento.
 */
function createSnapshot() {
    if (!globalPayload || !globalPayload.pages) return null;
    return JSON.parse(JSON.stringify({
        pages: globalPayload.pages,
        activePageIndex: currentActivePageIndex
    }));
}

/**
 * Guarda el estado actual en la pila de undo.
 * Limpia la pila redo cuando se hace un nuevo cambio.
 */
function saveToUndoStack() {
    const snapshot = createSnapshot();
    if (!snapshot) return;
    
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO_SIZE) {
        undoStack.shift(); // Remover el más antiguo
    }
    
    // Limpiar redo al hacer un nuevo cambio
    redoStack = [];
}

/**
 * Restaura un snapshot al estado actual.
 * @param {Object} snapshot El estado a restaurar.
 */
function restoreSnapshot(snapshot) {
    if (!snapshot || !snapshot.pages) return;
    
    globalPayload.pages = snapshot.pages;
    currentActivePageIndex = snapshot.activePageIndex || 0;
    cycleViewEngine();
}

/**
 * Deshace el último cambio (Ctrl+Z).
 */
function performUndo() {
    if (undoStack.length === 0) {
        console.log("No hay cambios para deshacer");
        return;
    }
    
    // Guardar el estado actual en redo
    const currentSnapshot = createSnapshot();
    if (currentSnapshot) {
        redoStack.push(currentSnapshot);
    }
    
    // Restaurar el estado anterior
    const previousSnapshot = undoStack.pop();
    restoreSnapshot(previousSnapshot);
}

/**
 * Rehace el último cambio deshecho (Ctrl+Y).
 */
function performRedo() {
    if (redoStack.length === 0) {
        console.log("No hay cambios para rehacer");
        return;
    }
    
    // Guardar el estado actual en undo
    const currentSnapshot = createSnapshot();
    if (currentSnapshot) {
        undoStack.push(currentSnapshot);
    }
    
    // Restaurar el estado siguiente
    const nextSnapshot = redoStack.pop();
    restoreSnapshot(nextSnapshot);
}

/**
 * Calcula el zoom óptimo para que el canvas encaje en el ancho visible
 * del #canvas-container, con un pequeño margen interno.
 * @param {HTMLCanvasElement} canvas
 * @returns {number}
 */
function _calcFitZoom(canvas) {
    const container = document.getElementById("canvas-container");
    if (!container || !canvas.width) return 1.0;
    const PADDING = 32; // px de margen a cada lado
    const available = container.clientWidth - PADDING * 2;
    const fitZoom = available / canvas.width;
    return _clampZoom(fitZoom);
}

function calculateOptimalFontSize(text, width, height) {
    if (!text || text.length === 0) return 16;
    const area = width * height;
    const charArea = area / Math.max(1, text.length);
    const size = Math.sqrt(charArea) * 0.95; 
    return Math.min(200, Math.max(12, Math.floor(size)));
}

function buildFontDeclaration(size, family, isBold, isItalic) {
    const safeSize = Math.max(8, Math.round(size || 16));
    const safeFamily = family || "system-ui";
    const boldStr = isBold ? "bold " : "";
    const italicStr = isItalic ? "italic " : "";
    return `${italicStr}${boldStr}${safeSize}px ${safeFamily}`;
}

function measureWrappedTextLayout(ctx, text, maxWidth) {
    const safeText = `${text || ""}`;
    const safeMaxWidth = Math.max(10, maxWidth);
    const lines = [];

    safeText.split("\n").forEach(rawLine => {
        const words = rawLine.split(" ");
        let line = "";

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testLine = line ? `${line}${word} ` : `${word} `;
            const testWidth = ctx.measureText(testLine).width;

            if (testWidth > safeMaxWidth && line.trim().length > 0) {
                lines.push(line.trimEnd());
                line = `${word} `;
            } else {
                line = testLine;
            }
        }

        lines.push(line.trimEnd());
        if (rawLine.length === 0) {
            lines.push("");
        }
    });

    if (lines.length === 0) {
        lines.push("");
    }

    const maxLineWidth = lines.reduce((acc, line) => Math.max(acc, ctx.measureText(line).width), 0);
    return { lines, maxLineWidth };
}

function fitTextToBox(text, width, height, family, isBold, isItalic, preferredSize) {
    if (!_measurementCtx) {
        return preferredSize || calculateOptimalFontSize(text, width, height);
    }

    const availableWidth = Math.max(10, width - TEXT_BOX_PADDING);
    const availableHeight = Math.max(10, height - TEXT_BOX_PADDING);
    const fallbackSize = preferredSize || calculateOptimalFontSize(text, width, height);

    let low = 8;
    let high = Math.max(low, Math.min(200, Math.ceil(Math.max(fallbackSize, availableHeight))));
    let best = low;

    while (low <= high) {
        const candidate = Math.floor((low + high) / 2);
        _measurementCtx.font = buildFontDeclaration(candidate, family, isBold, isItalic);
        const layout = measureWrappedTextLayout(_measurementCtx, text, availableWidth);
        const requiredHeight = layout.lines.length * candidate * TEXT_LINE_HEIGHT_MULTIPLIER;
        const fits = layout.maxLineWidth <= availableWidth && requiredHeight <= availableHeight;

        if (fits) {
            best = candidate;
            low = candidate + 1;
        } else {
            high = candidate - 1;
        }
    }

    return best;
}

function normalizeBlock(block) {
    if (block.text_color === undefined || block.text_color === null) block.text_color = "#000000";
    if (block.bg_color === undefined || block.bg_color === null) block.bg_color = "#ffffff";
    if (block.font_family === undefined || block.font_family === null) block.font_family = "system-ui";
    if (block.is_bold === undefined || block.is_bold === null) block.is_bold = false;
    if (block.is_italic === undefined || block.is_italic === null) block.is_italic = false;
    if (block.font_size === undefined || block.font_size === null) block.font_size = 16;
    if (block.text === undefined || block.text === null) block.text = "";
    if (block.font_size_locked === undefined || block.font_size_locked === null) {
        block.font_size_locked = block.source === "native";
    }
    if (block.text_align === undefined || block.text_align === null) block.text_align = "left";
    return block;
}

function resolveEditableFontSize(block) {
    normalizeBlock(block);
    const [x0, y0, x1, y1] = block.bbox;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);

    return block.font_size || calculateOptimalFontSize(block.text, width, height);
}

// ─── Resize Handles ─────────────────────────────────────────────────────────
const HANDLE_SIZE = 8;   // píxeles visuales
const HANDLE_HIT  = 10;  // área de detección de clic

const HANDLE_CURSORS = {
    nw: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', se: 'nwse-resize',
    n:  'ns-resize',   s:  'ns-resize',
    w:  'ew-resize',   e:  'ew-resize'
};

function _handlePoints(bbox) {
    const [x0, y0, x1, y1] = bbox;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { nw:[x0,y0], n:[cx,y0], ne:[x1,y0], w:[x0,cy], e:[x1,cy], sw:[x0,y1], s:[cx,y1], se:[x1,y1] };
}

function getResizeHandle(physical, block) {
    for (const [dir, [hx, hy]] of Object.entries(_handlePoints(block.bbox))) {
        if (Math.abs(physical.x - hx) <= HANDLE_HIT && Math.abs(physical.y - hy) <= HANDLE_HIT)
            return dir;
    }
    return null;
}

function drawResizeHandles(ctx, bbox) {
    const half = HANDLE_SIZE / 2;
    ctx.fillStyle   = '#4299e1';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    for (const [hx, hy] of Object.values(_handlePoints(bbox))) {
        ctx.fillRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
        ctx.strokeRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
    }
}
// ─────────────────────────────────────────────────────────────────────────────

// Variables reactivas de estado (Toolbar UI)
let currentTargetBlock = null;
let currentCanvasCtx = null;
let currentTargetInitialFontSize = null;
let currentTargetInitialFontLock = false;

function _clampZoom(value) {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

function applyZoomToCanvas(canvas) {
    if (!canvas) return;
    const zoom = _clampZoom(currentZoomScale);
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.width = `${Math.round(canvas.width * zoom)}px`;
    canvas.style.height = `${Math.round(canvas.height * zoom)}px`;

    const indicators = [document.getElementById("zoom-indicator"), document.getElementById("zoom-indicator-top")];
    indicators.forEach(ind => { 
        if (ind) ind.textContent = `${Math.round(zoom * 100)}%`; 
    });
}

function bindCanvasZoomControls() {
    const bindDualZoom = (baseId, handler) => {
        const els = [document.getElementById(baseId), document.getElementById(`${baseId}-top`)];
        els.forEach(el => { if (el) el.onclick = handler; });
    };

    bindDualZoom("btn-zoom-in", () => {
        _userHasZoomed = true;
        currentZoomScale = _clampZoom(currentZoomScale + ZOOM_STEP);
        applyZoomToCanvas(document.getElementById("pdf-canvas"));
    });

    bindDualZoom("btn-zoom-out", () => {
        _userHasZoomed = true;
        currentZoomScale = _clampZoom(currentZoomScale - ZOOM_STEP);
        applyZoomToCanvas(document.getElementById("pdf-canvas"));
    });

    bindDualZoom("btn-zoom-reset", () => {
        _userHasZoomed = false;
        const canvas = document.getElementById("pdf-canvas");
        currentZoomScale = _calcFitZoom(/** @type {HTMLCanvasElement} */ (canvas));
        applyZoomToCanvas(canvas);
    });

    applyZoomToCanvas(document.getElementById("pdf-canvas"));
}

export function initPagination(fullData) {
    globalPayload = fullData;
    currentActivePageIndex = 0;

    globalPayload.pages.forEach(page => {
        page.blocks.forEach(block => normalizeBlock(block));
    });
    
    const paginators = [document.getElementById("pagination-controls"), document.getElementById("pagination-controls-top")];
    paginators.forEach(p => { if (p) p.hidden = false; });
    
    const bindDualPage = (baseId, handler) => {
        const els = [document.getElementById(baseId), document.getElementById(`${baseId}-top`)];
        els.forEach(el => { if (el) el.onclick = handler; });
    };

    bindDualPage("btn-prev", () => {
        if (currentActivePageIndex > 0) {
            currentActivePageIndex--;
            cycleViewEngine();
        }
    });
    
    bindDualPage("btn-next", () => {
        if (currentActivePageIndex < globalPayload.pages.length - 1) {
            currentActivePageIndex++;
            cycleViewEngine();
        }
    });
    
    // Feature Adicional: Despliegue de caja vacía arbitraria
    const btnAddBox = document.getElementById("btn-add-box");
    if (btnAddBox) {
        btnAddBox.onclick = () => {
            const currentBlocks = globalPayload.pages[currentActivePageIndex].blocks;
            currentBlocks.push({
                bbox: [50, 50, 300, 100], 
                text: "Texto personalizado...",
                text_color: "#000000",
                bg_color: "#ffffff",
                font_size: 20,
                font_family: "system-ui",
                font_size_locked: true,
                is_bold: false,
                is_italic: false,
                is_modified: true,
                source: "ocr",
                lock_position: false
            });
            saveToUndoStack(); // Guardar nuevo bloque
            cycleViewEngine(); 
        };
    }
    
    // Listener para Ctrl+Z (Undo) y Ctrl+Y (Redo)
    document.addEventListener("keydown", (evt) => {
        if ((evt.ctrlKey || evt.metaKey) && evt.key === 'z' && !evt.shiftKey) {
            evt.preventDefault();
            performUndo();
        } else if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'y' || (evt.shiftKey && evt.key === 'z'))) {
            evt.preventDefault();
            performRedo();
        }
    });
    
    // Lógica para Nano Banana API Key
    const apiKeyInput = document.getElementById("ai-api-key");
    const btnSaveKey = document.getElementById("btn-save-key");
    if (apiKeyInput && btnSaveKey) {
        apiKeyInput.value = localStorage.getItem("dbv_nano_banana_key") || "";
        btnSaveKey.onclick = () => {
            localStorage.setItem("dbv_nano_banana_key", apiKeyInput.value);
            btnSaveKey.textContent = "¡Guardada ✓!";
            setTimeout(() => btnSaveKey.textContent = "Guardar Local", 2000);
        };
    }
    
    // Lógica para ✨ Limpiar Fondo con IA
    const btnCleanBg = document.getElementById("btn-clean-bg");
    if (btnCleanBg) {
        btnCleanBg.onclick = async () => {
            const key = document.getElementById("ai-api-key")?.value?.trim();
            if (!key) {
                alert("Por favor, introduce tu API Key de Google AI Studio arriba para usar Nano Banana.");
                return;
            }
            
            const originalText = btnCleanBg.textContent;
            btnCleanBg.textContent = "⏳ Procesando en AI Studio...";
            btnCleanBg.disabled = true;
            
            const currentPage = globalPayload.pages[currentActivePageIndex];
            
            try {
                const resp = await fetch("http://localhost:8000/api/v1/clean-background", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        image_base64: currentPage.image_base64,
                        api_key: key
                    })
                });
                
                if (!resp.ok) {
                    const err = await resp.json().catch(()=>({}));
                    throw new Error(err.detail || `Error HTTP ${resp.status}`);
                }
                
                const data = await resp.json();
                
                // Guardar rollback
                saveToUndoStack();
                
                // Actualizar imagen y re-renderizar
                currentPage.image_base64 = "data:image/png;base64," + data.image_base64;
                currentPage.ai_cleaned_bg = true;
                
                // Convertir todos los textos a editables con fondo transparente para que se vean sobre el nuevo fondo
                currentPage.blocks.forEach(block => {
                    block.is_modified = true;
                    block.bg_transparent = true;
                });
                
                cycleViewEngine();
                
            } catch (err) {
                alert(`Error al limpiar fondo con IA: ${err.message}`);
            } finally {
                btnCleanBg.textContent = originalText;
                btnCleanBg.disabled = false;
            }
        };
    }
    
    // Vinculación definitiva de herramientas MVC
    bindFloatingToolbarEvents();
    bindCanvasZoomControls();
    mountExportControls(globalPayload);
    
    cycleViewEngine();
}

function cycleViewEngine() {
    const indicators = [document.getElementById("page-indicator"), document.getElementById("page-indicator-top")];
    indicators.forEach(indicator => {
        if (indicator) {
            indicator.textContent = `Página ${currentActivePageIndex + 1} de ${globalPayload.total_pages}`;
        }
    });
    // Ocultar barra flotante al ciclar la página para evitar solapamientos
    document.getElementById("floating-toolbar").hidden = true;
    document.getElementById("multi-toolbar").hidden = true;
    selectedBlockIndices = []; // Limpiar multi-selección al cambiar de página
    
    renderNativeCanvasEditor(globalPayload.pages[currentActivePageIndex]);
}

function renderNativeCanvasEditor(pageData) {
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("pdf-canvas"));
    if (!canvas || !pageData.image_base64) return;
    
    const renderSourceImage = new Image();
    
    renderSourceImage.onload = () => {
        canvas.width = renderSourceImage.width;
        canvas.height = renderSourceImage.height;
        canvas.setAttribute("aria-label", `Área de Pág ${pageData.page_num} con ${pageData.blocks.length} bloques.`);
        
        // Desterramos fugas de memoria y listeners solapados de la página anterior
        const safeCanvas = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(safeCanvas, canvas);
        const freshCtx = safeCanvas.getContext("2d", { willReadFrequently: true });

        // Auto-fit al cargar: si el usuario no ha interactuado con el zoom,
        // calculamos el zoom que ajusta la página al ancho disponible del contenedor.
        if (!_userHasZoomed) {
            currentZoomScale = _calcFitZoom(safeCanvas);
        }
        applyZoomToCanvas(safeCanvas);
        
        paintCanvasLayers(freshCtx, safeCanvas, renderSourceImage, pageData.blocks);
        mountInteractionLayer(safeCanvas, freshCtx, renderSourceImage, pageData.blocks);
        
        if (!pageData.blocks || pageData.blocks.length === 0) {
            freshCtx.fillStyle = "rgba(255, 0, 0, 0.85)";
            freshCtx.fillRect(0, 0, safeCanvas.width, 100);
            freshCtx.fillStyle = "white";
            freshCtx.font = "bold 24px system-ui";
            freshCtx.fillText(`⚠️ 0 Bloques OCR en Pág ${pageData.page_num}`, 30, 50);
        }
    };
    
    renderSourceImage.src = pageData.image_base64;
}

function paintCanvasLayers(ctx, canvas, background, blocks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    
    blocks.forEach(block => {
        normalizeBlock(block);
        const [x0, y0, x1, y1] = block.bbox;
        const width = x1 - x0;
        const height = y1 - y0;
        
        if (block.is_modified) {
            // Fondo Sobreescrito (Color inyectable guiado del Front o blanco estricto MVP)
            if (!block.bg_transparent) {
                ctx.fillStyle = block.bg_color || "#ffffff"; 
                ctx.fillRect(x0, y0, width, height);
            }
            
            // Texto mutado de custom formatting
            ctx.fillStyle = block.text_color || "#000000"; 
            const calcDynamicSize = calculateOptimalFontSize(block.text, width, height); 
            const finalSize = resolveEditableFontSize(block) || block.font_size || calcDynamicSize;
            const finalFont = block.font_family || "system-ui";
            
            // Respetar negrita e itálica del bloque (no forzar bold siempre)
            ctx.font = buildFontDeclaration(finalSize, finalFont, block.is_bold, block.is_italic);
            ctx.textBaseline = "top";
            
            // Clipear al bbox para que el texto nunca desborde visualmente sobre otros bloques
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, y0, width, height);
            ctx.clip();

            // Alineación de texto: izquierda, centro o derecha
            const textAlign = block.text_align || "left";
            ctx.textAlign = textAlign;
            const lineHeight = finalSize * TEXT_LINE_HEIGHT_MULTIPLIER;
            const drawX = textAlign === "right" ? x1 - 4 :
                          textAlign === "center" ? (x0 + x1) / 2 :
                          x0 + 4;
            let currentY = y0 + 4;
            const maxWidth = width - 8 > 0 ? width - 8 : 10;
            
            (block.text || "").split('\n').forEach(rawLine => {
                const words = rawLine.split(' ');
                let line = '';
                for (let n = 0; n < words.length; n++) {
                    const testLine = line + words[n] + ' ';
                    const metrics = ctx.measureText(testLine);
                    if (metrics.width > maxWidth && n > 0) {
                        ctx.fillText(line, drawX, currentY);
                        line = words[n] + ' ';
                        currentY += lineHeight;
                    } else {
                        line = testLine;
                    }
                }
                ctx.fillText(line, drawX, currentY);
                currentY += lineHeight;
            });
            
            ctx.restore();
            
            // Borde verde OK + handles de redimensión
            ctx.strokeStyle = "rgba(40, 167, 69, 0.9)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x0, y0, width, height);
            drawResizeHandles(ctx, block.bbox);
        } else {
            if (block.source === "native") {
                return;
            }
            // Guia inicial de detección raw
            ctx.strokeStyle = "rgba(49, 130, 206, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(x0, y0, width, height);
            
            ctx.font = "bold 14px system-ui";
            ctx.textBaseline = "bottom";
            const singleLineText = (block.text || "").replace(/\n/g, ' ');
            const measurements = ctx.measureText(singleLineText);
            
            ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
            ctx.fillRect(x0, y0 - 24, Math.min(width, measurements.width + 12), 24);
            ctx.fillStyle = "#1a202c";
            ctx.fillText(singleLineText, x0 + 6, y0 - 6);
        }
    });

    // ── Resaltado visual de multi-selección (segunda pasada, sobre todo lo demás) ──
    selectedBlockIndices.forEach((selIdx, order) => {
        if (selIdx >= blocks.length) return;
        const [sx0, sy0, sx1, sy1] = blocks[selIdx].bbox;
        const sw = sx1 - sx0, sh = sy1 - sy0;
        // Overlay naranja semitransparente
        ctx.fillStyle = 'rgba(251, 146, 60, 0.18)';
        ctx.fillRect(sx0, sy0, sw, sh);
        // Borde naranja punteado
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(sx0 - 1, sy0 - 1, sw + 2, sh + 2);
        ctx.setLineDash([]);
        // Badge numerado
        ctx.fillStyle = '#f97316';
        ctx.fillRect(sx0 + 2, sy0 + 2, 20, 20);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px system-ui';
        ctx.textBaseline = 'top';
        ctx.fillText(`${order + 1}`, sx0 + 7, sy0 + 6);
    });
}

function mountInteractionLayer(canvas, ctx, bgImage, blocks) {
    let isDragging   = false;
    let isResizing   = false;
    let dragHasMoved = false;

    let dragTargetIndex   = -1;
    let resizeTargetIndex = -1;
    let clickTargetIndex  = -1;
    let resizeHandle      = null;

    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const MIN_BLOCK = 20; // tamaño mínimo en px al redimensionar

    function getPhysicalCoords(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top)  * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener("mousedown", (evt) => {
        const physical = getPhysicalCoords(evt);
        dragHasMoved = false;

        // ── Ctrl+Click: modo multi-selección ──
        if (evt.ctrlKey) {
            const clickedIdx = blocks.findIndex(b => {
                const [x0, y0, x1, y1] = b.bbox;
                return physical.x >= x0 && physical.x <= x1 && physical.y >= y0 && physical.y <= y1;
            });
            if (clickedIdx !== -1) {
                const pos = selectedBlockIndices.indexOf(clickedIdx);
                if (pos === -1) {
                    selectedBlockIndices.push(clickedIdx);
                } else {
                    selectedBlockIndices.splice(pos, 1);
                }
                paintCanvasLayers(ctx, canvas, bgImage, blocks);
                if (selectedBlockIndices.length >= 2) {
                    triggerMultiSelectToolbar(blocks, selectedBlockIndices, evt.clientX, evt.clientY);
                } else {
                    document.getElementById("multi-toolbar").hidden = true;
                }
            }
            return;
        }

        // Clic normal: si hay multi-selección activa, limpiarla
        if (selectedBlockIndices.length > 0) {
            selectedBlockIndices = [];
            document.getElementById("multi-toolbar").hidden = true;
            paintCanvasLayers(ctx, canvas, bgImage, blocks);
            return;
        }

        // 1. Comprobar handles de resize (solo en bloques modificados)
        for (let i = 0; i < blocks.length; i++) {
            if (!blocks[i].is_modified) continue;
            const h = getResizeHandle(physical, blocks[i]);
            if (h) {
                isResizing        = true;
                resizeHandle      = h;
                resizeTargetIndex = i;
                clickTargetIndex  = -1;
                return;
            }
        }

        // 2. Comprobar si el clic cae dentro de un bloque
        dragTargetIndex = blocks.findIndex(block => {
            const [x0, y0, x1, y1] = block.bbox;
            return (physical.x >= x0 && physical.x <= x1 &&
                    physical.y >= y0 && physical.y <= y1);
        });

        if (dragTargetIndex !== -1) {
            const block = blocks[dragTargetIndex];
            clickTargetIndex = dragTargetIndex;

            if (block.lock_position) {
                isDragging = false;
                return;
            }

            isDragging  = true;
            dragOffsetX = physical.x - block.bbox[0];
            dragOffsetY = physical.y - block.bbox[1];
        } else {
            clickTargetIndex = -1;
            document.getElementById("floating-toolbar").hidden = true;
        }
    });

    canvas.addEventListener("mousemove", (evt) => {
        const physical = getPhysicalCoords(evt);

        // ── Redimensionando ──
        if (isResizing && resizeTargetIndex !== -1) {
            dragHasMoved = true;
            document.getElementById("floating-toolbar").hidden = true;
            const block = blocks[resizeTargetIndex];
            let [x0, y0, x1, y1] = block.bbox;

            if (resizeHandle.includes('e')) x1 = Math.max(x0 + MIN_BLOCK, physical.x);
            if (resizeHandle.includes('w')) x0 = Math.min(x1 - MIN_BLOCK, physical.x);
            if (resizeHandle.includes('s')) y1 = Math.max(y0 + MIN_BLOCK, physical.y);
            if (resizeHandle.includes('n')) y0 = Math.min(y1 - MIN_BLOCK, physical.y);

            block.bbox = [x0, y0, x1, y1];
            block.is_modified = true;
            paintCanvasLayers(ctx, canvas, bgImage, blocks);
            return;
        }

        // ── Desplazando bloque ──
        if (isDragging && dragTargetIndex !== -1) {
            dragHasMoved = true;
            document.getElementById("floating-toolbar").hidden = true;

            const block = blocks[dragTargetIndex];
            const w = block.bbox[2] - block.bbox[0];
            const h = block.bbox[3] - block.bbox[1];
            const newX0 = physical.x - dragOffsetX;
            const newY0 = physical.y - dragOffsetY;

            block.bbox = [newX0, newY0, newX0 + w, newY0 + h];
            block.is_modified = true;
            paintCanvasLayers(ctx, canvas, bgImage, blocks);
            return;
        }

        // ── Solo hover: ajustar cursor ──
        for (const b of blocks) {
            if (!b.is_modified) continue;
            const h = getResizeHandle(physical, b);
            if (h) { canvas.style.cursor = HANDLE_CURSORS[h]; return; }
        }
        const hovers = blocks.some(b => {
            const [x0, y0, x1, y1] = b.bbox;
            return physical.x >= x0 && physical.x <= x1 &&
                   physical.y >= y0 && physical.y <= y1;
        });
        canvas.style.cursor = hovers ? "move" : "crosshair";
    });

    canvas.addEventListener("mouseup", (evt) => {
        // Fin de resize
        if (isResizing) {
            isResizing        = false;
            resizeHandle      = null;
            resizeTargetIndex = -1;
            saveToUndoStack(); // Guardar cambio de tamaño
            return;
        }

        // Fin de drag con movimiento
        if (isDragging && dragHasMoved) {
            isDragging       = false;
            dragTargetIndex  = -1;
            clickTargetIndex = -1;
            saveToUndoStack(); // Guardar cambio de posición
            return;
        }

        // Clic limpio → abrir toolbar de edición
        if (clickTargetIndex !== -1) {
            triggerVisualEditModal(blocks, clickTargetIndex,
                {ctx, canvas, bgImage}, evt.clientX, evt.clientY);
        }

        isDragging       = false;
        dragTargetIndex  = -1;
        clickTargetIndex = -1;
    });

    canvas.addEventListener("mouseleave", () => {
        isDragging        = false;
        isResizing        = false;
        resizeHandle      = null;
        dragTargetIndex   = -1;
        resizeTargetIndex = -1;
        clickTargetIndex  = -1;
    });

    canvas.addEventListener("wheel", (evt) => {
        if (!evt.ctrlKey) return;
        evt.preventDefault();

        _userHasZoomed = true;
        const prevZoom = currentZoomScale;
        const direction = evt.deltaY < 0 ? 1 : -1;
        currentZoomScale = _clampZoom(currentZoomScale + (direction * ZOOM_STEP));
        if (currentZoomScale === prevZoom) return;

        applyZoomToCanvas(canvas);

        const container = document.getElementById("canvas-container");
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const pointerX = evt.clientX - containerRect.left + container.scrollLeft;
        const pointerY = evt.clientY - containerRect.top + container.scrollTop;
        const zoomRatio = currentZoomScale / prevZoom;

        container.scrollLeft = pointerX * zoomRatio - (evt.clientX - containerRect.left);
        container.scrollTop = pointerY * zoomRatio - (evt.clientY - containerRect.top);
    }, { passive: false });
}

function bindFloatingToolbarEvents() {
    document.getElementById("tb-close").onclick = () => {
        document.getElementById("floating-toolbar").hidden = true;
    };
    
    document.getElementById("tb-save").onclick = () => {
        if (!currentTargetBlock) return;
        
        // Leer DIRECTAMENTE del DOM sin validación compleja
        currentTargetBlock.text = document.getElementById("tb-text").value || "";
        currentTargetBlock.text_color = document.getElementById("tb-color").value;  // El color picker SIEMPRE retorna válido
        currentTargetBlock.bg_color = document.getElementById("tb-bg").value;        // El color picker SIEMPRE retorna válido
        const tpCheckbox = document.getElementById("tb-bg-transparent");
        if (tpCheckbox) {
            currentTargetBlock.bg_transparent = !!tpCheckbox.checked;
        }
        
        const nextFontSize = parseFloat(document.getElementById("tb-size").value) || 16;
        currentTargetBlock.font_size = nextFontSize;
        currentTargetBlock.is_bold = !!document.getElementById("tb-bold").checked;
        currentTargetBlock.is_italic = !!document.getElementById("tb-italic").checked;
        const fontSizeChanged = nextFontSize !== currentTargetInitialFontSize;
        currentTargetBlock.font_size_locked = currentTargetInitialFontLock || fontSizeChanged || currentTargetBlock.source === "native";
        
        const fontSelector = document.getElementById("tb-font");
        if (fontSelector) {
            currentTargetBlock.font_family = fontSelector.value;
        }
        
        currentTargetBlock.is_modified = true;
        
        // Alineación
        const alignKeys = ["left", "center", "right"];
        const activeAlign = alignKeys.find(a => document.getElementById(`tb-align-${a}`)?.classList.contains("active")) || "left";
        currentTargetBlock.text_align = activeAlign;
        
        // DEBUG: Log para verificar que se guardó
        console.log("Bloque guardado:", {
            text: currentTargetBlock.text,
            text_color: currentTargetBlock.text_color,
            bg_color: currentTargetBlock.bg_color
        });
        
        // Guardar en el historial de undo
        saveToUndoStack();
        
        // Ocultar modal y redibujar
        document.getElementById("floating-toolbar").hidden = true;
        cycleViewEngine();
    };

    // ── Multi-toolbar bindings ──
    const mtClose = document.getElementById("mt-close");
    if (mtClose) mtClose.onclick = () => {
        document.getElementById("multi-toolbar").hidden = true;
        selectedBlockIndices = [];
        cycleViewEngine();
    };

    const mtEqualize = document.getElementById("mt-equalize");
    if (mtEqualize) mtEqualize.onclick = () => {
        const alignKeys = ["left", "center", "right"];
        const activeAlign = alignKeys.find(a => document.getElementById(`mt-align-${a}`)?.classList.contains("active")) || "left";
        const styles = {
            font_size:     parseFloat(document.getElementById("mt-size")?.value) || 16,
            text_color:    document.getElementById("mt-color")?.value,
            bg_color:      document.getElementById("mt-bg")?.value,
            bg_transparent: !!document.getElementById("mt-bg-transparent")?.checked,
            text_align:    activeAlign
        };
        equalizeSelectedFontSize(globalPayload.pages[currentActivePageIndex].blocks, [...selectedBlockIndices], styles);
    };

    const mtMerge = document.getElementById("mt-merge");
    if (mtMerge) mtMerge.onclick = () => {
        mergeSelectedBlocks(globalPayload.pages[currentActivePageIndex].blocks, [...selectedBlockIndices]);
    };

    // ── Alignment buttons — toolbar individual ──
    ["left", "center", "right"].forEach(align => {
        const tbBtn = document.getElementById(`tb-align-${align}`);
        if (tbBtn) tbBtn.onclick = () => {
            document.querySelectorAll("#floating-toolbar .align-btn").forEach(b => b.classList.remove("active"));
            tbBtn.classList.add("active");
        };
        const mtBtn = document.getElementById(`mt-align-${align}`);
        if (mtBtn) mtBtn.onclick = () => {
            document.querySelectorAll("#multi-toolbar .align-btn").forEach(b => b.classList.remove("active"));
            mtBtn.classList.add("active");
        };
    });
}

function triggerVisualEditModal(blocks, targetIndex, ctxScope, domX, domY) {
    const block = blocks[targetIndex];
    normalizeBlock(block);
    currentTargetBlock = block;
    currentCanvasCtx = ctxScope;
    currentTargetInitialFontLock = !!block.font_size_locked;

    const nonNativeWarning = document.getElementById("tb-warning-non-native");
    if (nonNativeWarning) {
        nonNativeWarning.hidden = block.source === "native";
    }

    const suggestedFontSize = resolveEditableFontSize(block);
    block.font_size = suggestedFontSize;
    currentTargetInitialFontSize = suggestedFontSize;
    
    const toolbar = document.getElementById("floating-toolbar");
    toolbar.hidden = false;
    
    // Posicionar el toolbar
    toolbar.style.transform = "none";
    toolbar.style.left = `${Math.min(domX + window.scrollX + 15, window.innerWidth - 270)}px`;
    toolbar.style.top = `${Math.min(domY + window.scrollY, window.innerHeight + window.scrollY - 250)}px`;
    
    // IMPORTANTE: Leer los valores ACTUALES del bloque (ya inicializados arriba)
    // Esto asegura que si el usuario editó los colores antes, se mostrarán aquí
    document.getElementById("tb-text").value = block.text;
    document.getElementById("tb-color").value = block.text_color;  // Si lo editó, estará aquí
    document.getElementById("tb-bg").value = block.bg_color;        // Si lo editó, estará aquí
    const tpCheckbox = document.getElementById("tb-bg-transparent");
    if (tpCheckbox) {
        tpCheckbox.checked = !!block.bg_transparent;
    }
    document.getElementById("tb-size").value = suggestedFontSize;
    
    const boldChk = document.getElementById("tb-bold");
    if (boldChk) boldChk.checked = block.is_bold;
    
    const italicChk = document.getElementById("tb-italic");
    if (italicChk) italicChk.checked = block.is_italic;

    // Actualizar botones de alineación
    const blockAlign = block.text_align || "left";
    ["left", "center", "right"].forEach(a => {
        const btn = document.getElementById(`tb-align-${a}`);
        if (btn) btn.classList.toggle("active", a === blockAlign);
    });
    
    const fontSelect = document.getElementById("tb-font");
    if (fontSelect) {
        const hasOption = Array.from(fontSelect.options).some(opt => opt.value === block.font_family);
        if (!hasOption) {
            const customOption = document.createElement("option");
            customOption.value = block.font_family;
            customOption.textContent = block.font_family;
            fontSelect.appendChild(customOption);
        }
        fontSelect.value = block.font_family;
    }
}

/**
 * Muestra el panel flotante de multi-selección con las acciones disponibles.
 * Se activa automáticamente al seleccionar ≥2 bloques con Ctrl+Click.
 * @param {Array} blocks - Array de bloques de la página actual.
 * @param {number[]} selectedIndices - Índices seleccionados actualmente.
 * @param {number} domX - Posición X del puntero (clientX).
 * @param {number} domY - Posición Y del puntero (clientY).
 */
function triggerMultiSelectToolbar(blocks, selectedIndices, domX, domY) {
    const toolbar = document.getElementById("multi-toolbar");
    if (!toolbar) return;

    const countEl = document.getElementById("mt-count");
    if (countEl) countEl.textContent = `${selectedIndices.length} bloques seleccionados`;

    // Calcular tamaño medio como sugerencia inicial
    const sizes = selectedIndices.map(idx => blocks[idx]?.font_size || 16);
    const avgSize = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) || 16;
    const sizeInput = document.getElementById("mt-size");
    if (sizeInput) sizeInput.value = avgSize;

    // Precargar colores y alineación del primer bloque seleccionado
    const firstBlock = blocks[selectedIndices[0]];
    if (firstBlock) {
        const colorIn = document.getElementById("mt-color");
        if (colorIn) colorIn.value = firstBlock.text_color || "#000000";
        const bgIn = document.getElementById("mt-bg");
        if (bgIn) bgIn.value = firstBlock.bg_color || "#ffffff";
        const tpIn = document.getElementById("mt-bg-transparent");
        if (tpIn) tpIn.checked = !!firstBlock.bg_transparent;
        const align = firstBlock.text_align || "left";
        ["left", "center", "right"].forEach(a => {
            const btn = document.getElementById(`mt-align-${a}`);
            if (btn) btn.classList.toggle("active", a === align);
        });
    }

    toolbar.style.transform = "none";
    toolbar.style.left = `${Math.min(domX + window.scrollX + 15, window.innerWidth - 290)}px`;
    toolbar.style.top = `${Math.min(domY + window.scrollY, window.innerHeight + window.scrollY - 200)}px`;
    toolbar.hidden = false;
    document.getElementById("floating-toolbar").hidden = true;
}

/**
 * Aplica un conjunto de estilos a todos los bloques seleccionados.
 * @param {Array} blocks - Array de bloques de la página actual.
 * @param {number[]} selectedIndices - Índices de los bloques seleccionados.
 * @param {Object} styles - {font_size, text_color, bg_color, bg_transparent, text_align}
 */
function equalizeSelectedFontSize(blocks, selectedIndices, styles) {
    if (selectedIndices.length < 2) return;
    saveToUndoStack();
    selectedIndices.forEach(idx => {
        if (idx >= blocks.length) return;
        if (styles.font_size !== undefined && styles.font_size > 0) {
            blocks[idx].font_size = styles.font_size;
            blocks[idx].font_size_locked = true;
        }
        if (styles.text_color !== undefined)    blocks[idx].text_color    = styles.text_color;
        if (styles.bg_color !== undefined)      blocks[idx].bg_color      = styles.bg_color;
        if (styles.bg_transparent !== undefined) blocks[idx].bg_transparent = styles.bg_transparent;
        if (styles.text_align !== undefined)    blocks[idx].text_align    = styles.text_align;
        blocks[idx].is_modified = true;
    });
    selectedBlockIndices = [];
    document.getElementById("multi-toolbar").hidden = true;
    cycleViewEngine();
}

/**
 * Fusiona los bloques seleccionados en un único bloque.
 * El texto se concatena en orden vertical con saltos de línea.
 * El bbox resultante es el envolvente de todos los bloques.
 * @param {Array} blocks - Array de bloques de la página actual.
 * @param {number[]} selectedIndices - Índices de los bloques seleccionados.
 */
function mergeSelectedBlocks(blocks, selectedIndices) {
    if (selectedIndices.length < 2) return;
    saveToUndoStack();

    // Ordenar por posición vertical (y0) para concatenar de arriba a abajo
    const sortedIndices = [...selectedIndices].sort((a, b) => blocks[a].bbox[1] - blocks[b].bbox[1]);
    const selectedBlocks = sortedIndices.map(i => blocks[i]);

    // Bbox mínimo contenedor
    const x0 = Math.min(...selectedBlocks.map(b => b.bbox[0]));
    const y0 = Math.min(...selectedBlocks.map(b => b.bbox[1]));
    const x1 = Math.max(...selectedBlocks.map(b => b.bbox[2]));
    const y1 = Math.max(...selectedBlocks.map(b => b.bbox[3]));

    // Texto concatenado con saltos de línea, descartando vacíos
    const mergedText = selectedBlocks
        .map(b => (b.text || "").trim())
        .filter(t => t.length > 0)
        .join("\n");

    // Heredar propiedades del bloque más alto verticalmente
    const base = selectedBlocks[0];
    const newBlock = {
        bbox: [x0, y0, x1, y1],
        text: mergedText,
        text_color: base.text_color || "#000000",
        bg_color: base.bg_color || "#ffffff",
        bg_transparent: base.bg_transparent || false,
        font_size: base.font_size || 16,
        font_size_locked: true,
        font_family: base.font_family || "system-ui",
        is_bold: base.is_bold || false,
        is_italic: base.is_italic || false,
        text_align: base.text_align || "left",
        is_modified: true,
        source: "merged",
        lock_position: false
    };

    // Eliminar bloques originales de mayor a menor índice para no desplazar
    [...selectedIndices].sort((a, b) => b - a).forEach(idx => blocks.splice(idx, 1));
    blocks.push(newBlock);

    selectedBlockIndices = [];
    document.getElementById("multi-toolbar").hidden = true;
    cycleViewEngine();
}

export function mountExportControls(fullPayload) {
    const btnExport = document.getElementById("btn-export");
    if (!btnExport) return;
    
    // Sobreescritura en caso de llamadas iterativas Paginadas
    btnExport.onclick = async () => {
        const originalText = btnExport.textContent;
        btnExport.textContent = "⏳ Reconstruyendo Presentación Original...";
        btnExport.disabled = true;
        
        const exportModeSelect = document.getElementById("export-mode-select");
        if (exportModeSelect) {
            fullPayload.export_mode = exportModeSelect.value;
        }
        
        try {
            const resp = await fetch("http://localhost:8000/api/v1/export", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(fullPayload)
            });
            
            if (!resp.ok) throw new Error(`[ERR] HTTP ${resp.status}`);
            
            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = "Presentacion_Editada_DBV.zip";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch(err) {
            alert(`[Error API]: ${err.message}`);
        } finally {
            btnExport.textContent = originalText;
            btnExport.disabled = false;
        }
    };
}

/**
 * Vincula atajos de teclado globales (Ctrl+Z, Ctrl+Y).
 */
export function mountKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        
        // Ctrl + Z: Undo
        if (isCtrl && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) {
                performRedo();
            } else {
                performUndo();
            }
        }
        
        // Ctrl + Y: Redo
        if (isCtrl && e.key.toLowerCase() === "y") {
            e.preventDefault();
            performRedo();
        }
    });
    
    // Binding visual de botones UI
    const btnUndo = document.getElementById("btn-undo");
    const btnRedo = document.getElementById("btn-redo");
    if (btnUndo) btnUndo.onclick = performUndo;
    if (btnRedo) btnRedo.onclick = performRedo;
}
