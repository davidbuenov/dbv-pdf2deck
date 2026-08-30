// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// =============================================================================
/**
 * @fileoverview Motor de Canvas.
 * Gestiona la paginación, el formateo modular (Barra flotante), las capas de ocr y el exportador.
 */

(() => {

let globalPayload = null;
let currentActivePageIndex = 0;
let currentZoomScale = 1.0;
let _userHasZoomed = false;
let selectedBlockIndices = []; // Índices de bloques en modo multi-selección (Ctrl+Click)
let isPreviewMode = false; // Modo de vista previa limpia sin cajas, handles ni guías

// Los listeners globales se montan una sola vez. Abrir un segundo documento
// vuelve a llamar a initPagination() y mountKeyboardShortcuts() sobre el mismo
// módulo; sin este guardo, cada Ctrl+Z desharía tantos pasos como documentos
// se hubieran abierto en la sesión.
let _globalShortcutsMounted = false;
let _undoShortcutsMounted = false;

/**
 * Conmuta o establece el modo vista previa limpia (sin guías de edición, handles ni bordes).
 * @param {boolean} [forceState] Estado forzado opcional.
 */
function togglePreviewMode(forceState) {
    if (!globalPayload || !globalPayload.pages) return;
    
    if (typeof forceState === "boolean") {
        isPreviewMode = forceState;
    } else {
        isPreviewMode = !isPreviewMode;
    }

    const btnPreview = document.getElementById("btn-preview-mode");
    const floatingBadge = document.getElementById("preview-floating-badge");
    const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;

    if (isPreviewMode) {
        if (inlineEditorSession) {
            _closeInlineEditor(true);
        }
        _hideFloatingToolbar();
        selectedBlockIndices = [];
        currentTargetBlock = null;
        
        if (btnPreview) {
            btnPreview.classList.add("active");
            btnPreview.title = _t("toolbar.previewExitTitle");
        }
        if (floatingBadge) {
            floatingBadge.hidden = false;
        }
    } else {
        if (btnPreview) {
            btnPreview.classList.remove("active");
            btnPreview.title = _t("toolbar.previewTitle");
        }
        if (floatingBadge) {
            floatingBadge.hidden = true;
        }
    }

    repaintCanvas();
}

/**
 * Escribe la etiqueta de un botón de la barra sin destruir su icono SVG.
 * Los botones del chrome son `<svg>` + `<span class="btn-txt">`, así que
 * asignar `textContent` directamente se llevaría el icono por delante.
 * @param {HTMLElement|null} btn Botón de la barra superior.
 * @param {string} text Texto visible.
 */
function _setBtnLabel(btn, text) {
    if (!btn) return;
    const slot = btn.querySelector(".btn-txt");
    if (slot) slot.textContent = text;
    else btn.textContent = text;
}

/**
 * Lee la etiqueta visible de un botón de la barra.
 * @param {HTMLElement|null} btn Botón de la barra superior.
 * @returns {string} Texto visible actual.
 */
function _getBtnLabel(btn) {
    if (!btn) return "";
    const slot = btn.querySelector(".btn-txt");
    return slot ? slot.textContent : btn.textContent;
}

function updateCleanBgButtonLabel() {
    const btnCleanBg = document.getElementById("btn-clean-bg");
    if (!btnCleanBg || !globalPayload) return;
    const page = globalPayload?.pages?.[currentActivePageIndex];
    if (!page?.blocks) return;

    let count = 0;
    if (selectedBlockIndices && selectedBlockIndices.length > 0) {
        count = selectedBlockIndices.length;
    } else if (inlineEditorSession?.block) {
        count = 1;
    } else if (currentTargetBlock) {
        count = 1;
    }

    const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;

    if (count > 0) {
        _setBtnLabel(btnCleanBg, _t("toolbar.cleanBgSelection", { count }));
        btnCleanBg.title = _t("toolbar.cleanBgSelectionTitle");
    } else {
        _setBtnLabel(btnCleanBg, _t("toolbar.cleanBg"));
        btnCleanBg.title = _t("toolbar.cleanBgTitle");
    }
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const ZOOM_STEP = 0.1;
const TEXT_BOX_PADDING = 8;
const TEXT_LINE_HEIGHT_MULTIPLIER = 1.15;
const EXPORT_TARGETS_STORAGE_KEY = "dbv_export_targets_v1";
const EXPORT_DPI_STORAGE_KEY = "dbv_export_dpi_v1";
const EXPORT_DPI_CHOICES = [150, 200, 300, 400, 600];
const EXPORT_DPI_DEFAULT = 300;
const INLINE_EDIT_BG_MODE_STORAGE_KEY = "dbv_inline_edit_bg_mode_v1";
const _measurementCanvas = document.createElement("canvas");
const _measurementCtx = _measurementCanvas.getContext("2d");

// ===== Sistema de Undo/Redo =====
let undoStack = [];
let redoStack = [];
const MAX_UNDO_SIZE = 30; // Límite de estados guardados para no saturar memoria

/**
 * Actualiza el estado visual habilitado/deshabilitado de los botones Undo y Redo.
 */
function _updateUndoRedoUI() {
    const btnUndo = document.getElementById("btn-undo");
    const btnRedo = document.getElementById("btn-redo");
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

/**
 * Reemplaza la imagen de fondo del canvas activo de forma instantánea sin recrear el DOM.
 * @param {string} newBase64
 * @returns {Promise<void>}
 */
function replaceCanvasBackground(newBase64) {
    return new Promise((resolve) => {
        if (!canvasScope || !newBase64) return resolve();
        const img = new Image();
        img.onload = () => {
            canvasScope.bgImage = img;
            repaintCanvas();
            resolve();
        };
        img.onerror = () => {
            console.error("[DBV Canvas] Error cargando nuevo fondo en replaceCanvasBackground");
            resolve();
        };
        img.src = newBase64.startsWith("data:") ? newBase64 : `data:image/png;base64,${newBase64}`;
    });
}

/**
 * Crea un snapshot profundo del estado de la página actual (bloques e imagen de fondo).
 * @returns {Object|null} Estado serializable de la página activa.
 */
function createSnapshot() {
    const page = globalPayload?.pages?.[currentActivePageIndex];
    if (!page) return null;
    return {
        pageIndex: currentActivePageIndex,
        blocks: JSON.parse(JSON.stringify(page.blocks || [])),
        image_base64: page.image_base64,
        ai_cleaned_bg: !!page.ai_cleaned_bg
    };
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
    _updateUndoRedoUI();
}

/**
 * Restaura un snapshot al estado actual.
 * @param {Object} snapshot El estado a restaurar.
 */
async function restoreSnapshot(snapshot) {
    if (!snapshot || !globalPayload?.pages) return;
    
    // Cerrar cualquier edición inline activa para evitar conflictos de punteros
    if (inlineEditorSession) {
        _closeInlineEditor(false);
    }

    if (snapshot.pageIndex !== currentActivePageIndex) {
        currentActivePageIndex = snapshot.pageIndex;
    }
    
    const page = globalPayload.pages[currentActivePageIndex];
    const restoredBlocks = JSON.parse(JSON.stringify(snapshot.blocks || []));
    page.blocks = restoredBlocks;
    page.ai_cleaned_bg = !!snapshot.ai_cleaned_bg;
    
    const imageChanged = page.image_base64 !== snapshot.image_base64;
    page.image_base64 = snapshot.image_base64;
    
    if (canvasScope) {
        canvasScope.blocks = page.blocks;
        if (imageChanged) {
            await replaceCanvasBackground(page.image_base64);
        } else {
            repaintCanvas();
        }
    } else {
        cycleViewEngine();
    }
    
    currentTargetBlock = null;
    selectedBlockIndices = [];
    _hideFloatingToolbar();
    _syncEraserToolbarState();
    updateCleanBgButtonLabel();
    _updateUndoRedoUI();
}

/**
 * Deshace el último cambio (Ctrl+Z).
 */
async function performUndo() {
    if (undoStack.length === 0) return;
    
    const current = createSnapshot();
    if (current) {
        redoStack.push(current);
    }
    
    const prev = undoStack.pop();
    await restoreSnapshot(prev);
}

/**
 * Rehace el último cambio deshecho (Ctrl+Y).
 */
async function performRedo() {
    if (redoStack.length === 0) return;
    
    const current = createSnapshot();
    if (current) {
        undoStack.push(current);
    }
    
    const next = redoStack.pop();
    await restoreSnapshot(next);
}

/**
 * Elimina bloques seleccionados (multi-selección) o el bloque activo del toolbar.
 * @returns {boolean} true si se eliminó al menos un bloque.
 */
function deleteActiveBlocks() {
    if (!globalPayload?.pages?.length) return false;

    const page = globalPayload.pages[currentActivePageIndex];
    if (!page?.blocks?.length) return false;

    const blocks = page.blocks;
    let targets = [];

    if (selectedBlockIndices.length > 0) {
        targets = [...new Set(selectedBlockIndices)]
            .filter(idx => idx >= 0 && idx < blocks.length)
            .sort((a, b) => b - a);
    } else if (currentTargetBlock) {
        const singleIndex = blocks.indexOf(currentTargetBlock);
        if (singleIndex !== -1) {
            targets = [singleIndex];
        }
    }

    if (!targets.length) return false;

    saveToUndoStack();
    targets.forEach(idx => blocks.splice(idx, 1));

    selectedBlockIndices = [];
    currentTargetBlock = null;
    currentTargetInitialFontSize = null;
    currentTargetInitialFontLock = false;

    const floatingToolbar = document.getElementById("floating-toolbar");
    if (floatingToolbar) floatingToolbar.hidden = true;
    const multiToolbar = document.getElementById("multi-toolbar");
    if (multiToolbar) multiToolbar.hidden = true;

    cycleViewEngine();
    return true;
}

/**
 * Calcula el zoom óptimo para que el canvas encaje en el ancho visible
 * del #canvas-container, con un pequeño margen interno.
 * @param {HTMLCanvasElement} canvas
 * @returns {number}
 */
function _calcFitZoom(canvas) {
    const container = document.getElementById("canvas-wrapper") || document.getElementById("canvas-container");
    if (!canvas || !canvas.width || !canvas.height) return 1.0;
    const PADDING_X = 48;
    const PADDING_Y = 48;
    const containerWidth = (container && container.clientWidth > PADDING_X)
        ? container.clientWidth
        : Math.max(300, window.innerWidth - 64);
    const containerHeight = (container && container.clientHeight > PADDING_Y)
        ? container.clientHeight
        : Math.max(300, window.innerHeight - 120);

    const availW = Math.max(200, containerWidth - PADDING_X);
    const availH = Math.max(200, containerHeight - PADDING_Y);
    const fitScale = Math.min(availW / canvas.width, availH / canvas.height, 1.25);
    return _clampZoom(Math.max(0.6, fitScale));
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
    if (block.is_underline === undefined || block.is_underline === null) block.is_underline = false;
    if (block.font_size === undefined || block.font_size === null) block.font_size = 16;
    if (block.line_spacing === undefined || block.line_spacing === null) block.line_spacing = TEXT_LINE_HEIGHT_MULTIPLIER;
    if (block.text === undefined || block.text === null) block.text = "";
    if (block.font_size_locked === undefined || block.font_size_locked === null) {
        block.font_size_locked = block.source === "native";
    }
    if (block.text_align === undefined || block.text_align === null) block.text_align = "left";
    return block;
}

function loadExportTargetsPreference() {
    const defaults = { pdf: true, pptx: true, md: true };
    let targets = defaults;

    try {
        const raw = localStorage.getItem(EXPORT_TARGETS_STORAGE_KEY);
        if (!raw) return defaults;

        const parsed = JSON.parse(raw);
        targets = {
            pdf: parsed?.pdf !== false,
            pptx: parsed?.pptx !== false,
            md: parsed?.md !== false
        };
    } catch {
        targets = defaults;
    }

    return targets;
}

function saveExportTargetsPreference(targets) {
    try {
        localStorage.setItem(EXPORT_TARGETS_STORAGE_KEY, JSON.stringify(targets));
    } catch {
        // En modo privado o con storage bloqueado, se omite persistencia sin romper UX.
    }
}

/**
 * Lee el DPI de exportacion guardado, acotandolo a la lista admitida. El
 * backend vuelve a validarlo: esto es comodidad, no confianza.
 * @returns {number} DPI valido.
 */
function loadExportDpiPreference() {
    try {
        const stored = Number(localStorage.getItem(EXPORT_DPI_STORAGE_KEY));
        return EXPORT_DPI_CHOICES.includes(stored) ? stored : EXPORT_DPI_DEFAULT;
    } catch {
        return EXPORT_DPI_DEFAULT;
    }
}

function saveExportDpiPreference(dpi) {
    try {
        localStorage.setItem(EXPORT_DPI_STORAGE_KEY, String(dpi));
    } catch {
        // En modo privado o con storage bloqueado, se omite persistencia sin romper UX.
    }
}

function resolveEditableFontSize(block) {
    normalizeBlock(block);
    const [x0, y0, x1, y1] = block.bbox;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);

    if (block.font_size_locked && block.font_size) {
        return block.font_size;
    }

    const numLines = Math.max(1, (block.text || "").split("\n").filter(l => l.trim().length > 0).length);
    const lineH = height / numLines;
    const estimatedFromBox = Math.max(10, Math.min(180, Math.round(lineH * 0.72)));

    if (block.font_size && block.font_size >= estimatedFromBox * 0.7 && block.font_size <= estimatedFromBox * 1.4) {
        return block.font_size;
    }

    return estimatedFromBox;
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

// ─── Goma Mágica: representación visual de goma de nata ──────────────────────
// La zona a borrar se dibuja como una goma escolar blanca apoyada sobre el
// documento (no como un recuadro de selección), para que se lea de un vistazo
// qué hace la herramienta. Es semitransparente a propósito: el usuario tiene
// que seguir viendo lo que hay debajo antes de borrarlo.
const ERASER_BODY_ALPHA = 0.78;

function _roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, radius);
        return;
    }
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * Dibuja el bloque de goma como una goma de nata: cuerpo blanco roto con
 * esquinas redondeadas, bisel superior, brillo especular y sombra proyectada.
 * @param {CanvasRenderingContext2D} ctx Contexto de pintado.
 * @param {number[]} bbox Caja [x0, y0, x1, y1] en píxeles físicos del canvas.
 * @param {boolean} isActive Si la goma es el bloque seleccionado.
 */
let _eraserSprite = null;
let _eraserSpriteKey = "";

/**
 * Rasteriza la goma en un lienzo aparte y lo reutiliza mientras no cambien su
 * tamaño ni su estado. La sombra difuminada es lo más caro del pintado y
 * `paintCanvasLayers` se ejecuta en cada mousemove del arrastre: sin esta caché
 * WebView2 arrastra la goma a tirones aunque en Chrome vaya fluida.
 * @param {number} w Ancho de la goma en píxeles físicos.
 * @param {number} h Alto de la goma en píxeles físicos.
 * @param {boolean} isActive Si la goma es el bloque seleccionado.
 * @returns {HTMLCanvasElement} Lienzo con la goma ya dibujada (incluido el margen de sombra).
 */
function _eraserSpriteFor(w, h, isActive) {
    const key = `${w}x${h}:${isActive}`;
    if (_eraserSprite && _eraserSpriteKey === key) return _eraserSprite;

    const radius = Math.min(w, h) * 0.16;
    const bevel = Math.max(1.5, Math.min(w, h) * 0.07);
    const innerRadius = Math.max(1, radius - bevel * 0.5);
    const blur = Math.max(6, h * 0.18);
    const offsetY = Math.max(2, h * 0.06);
    const pad = Math.ceil(blur + offsetY);

    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(w + pad * 2);
    sprite.height = Math.ceil(h + pad * 2);
    const sctx = sprite.getContext("2d");

    sctx.globalAlpha = ERASER_BODY_ALPHA;

    // Sombra proyectada: hace que la goma "descanse" sobre el documento
    sctx.shadowColor = "rgba(15, 23, 42, 0.35)";
    sctx.shadowBlur = blur;
    sctx.shadowOffsetY = offsetY;

    // Cuerpo de nata: blanco roto con caída a crema en la base
    const body = sctx.createLinearGradient(0, pad, 0, pad + h);
    body.addColorStop(0, "#fffdf7");
    body.addColorStop(0.55, "#f7f3e9");
    body.addColorStop(1, "#e6dfd0");
    _roundRectPath(sctx, pad, pad, w, h, radius);
    sctx.fillStyle = body;
    sctx.fill();

    sctx.shadowColor = "transparent";
    sctx.shadowBlur = 0;
    sctx.shadowOffsetY = 0;

    // Bisel: la cara superior de la goma, más clara que el canto
    _roundRectPath(sctx, pad + bevel, pad + bevel, w - bevel * 2, h - bevel * 2, innerRadius);
    sctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    sctx.fill();

    // Brillo especular en la mitad superior
    const gloss = sctx.createLinearGradient(pad, pad, pad + w * 0.6, pad + h * 0.6);
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.75)");
    gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
    _roundRectPath(sctx, pad + bevel, pad + bevel, w - bevel * 2, (h - bevel * 2) * 0.45, innerRadius);
    sctx.fillStyle = gloss;
    sctx.fill();

    // Contorno: discreto en reposo, azul de selección cuando está activa
    sctx.globalAlpha = 1;
    _roundRectPath(sctx, pad, pad, w, h, radius);
    sctx.lineWidth = isActive ? 2 : 1.25;
    sctx.strokeStyle = isActive ? "rgba(66, 153, 225, 0.95)" : "rgba(148, 138, 118, 0.55)";
    sctx.stroke();

    sprite.dataset.pad = String(pad);
    _eraserSprite = sprite;
    _eraserSpriteKey = key;
    return sprite;
}

function drawNataEraser(ctx, bbox, isActive) {
    const [x0, y0, x1, y1] = bbox;
    const w = Math.round(x1 - x0);
    const h = Math.round(y1 - y0);
    if (w <= 0 || h <= 0) return;

    const sprite = _eraserSpriteFor(w, h, isActive);
    const pad = Number(sprite.dataset.pad);
    ctx.drawImage(sprite, x0 - pad, y0 - pad);
}
// ─────────────────────────────────────────────────────────────────────────────

function _isResizeInteractiveBlock(block) {
    if (!block) return false;
    return !!block.is_modified || !!block.is_eraser || block === currentTargetBlock || block === inlineEditorSession?.block;
}

// Variables reactivas de estado (Toolbar UI)
let currentTargetBlock = null;

/**
 * Ambito de pintado de la pagina activa: `{ canvas, ctx, bgImage, blocks }`.
 *
 * Vive en el modulo y no en el closure de `mountInteractionLayer()` porque la
 * imagen de fondo cambia en caliente (goma, limpieza de fondo) y el closure la
 * congelaba: actualizar `page.image_base64` no bastaba, el siguiente repintado
 * del arrastre volvia a dibujar la imagen antigua y deshacia visualmente el
 * borrado. Teniendola aqui, sustituir el fondo es cambiar un campo y repintar,
 * sin rehacer el canvas ni redecodificar el PNG de la pagina entera.
 */
let canvasScope = null;
let currentTargetInitialFontSize = null;
let currentTargetInitialFontLock = false;
let selectionMarquee = null;
let inlineEditorSession = null;
let inlineEditOpaqueMode = true;
let inlineToolbarPointerDown = false;
// Se pone a true en cuanto el usuario arrastra la barra inline, para que deje
// de reanclarse sola sobre el bloque. Se reinicia al abrir otra edición.
let inlineToolbarMoved = false;

function _inlineToolbarElement() {
    // El contenedor real en index.html es "inline-block-toolbar" (renombrado en
    // el rediseño del shell); esta función seguía buscando el id antiguo
    // "inline-toolbar", que ya no existe. Al no encontrarlo nunca, `toolbar`
    // era siempre null y `toolbar.hidden = false` no se llegaba a ejecutar en
    // ningún sitio: la barra de fuente/tamaño/color de la edición en sitio
    // existía en el DOM pero jamás se mostraba.
    const toolbar = document.getElementById("inline-block-toolbar");
    const wrapper = document.getElementById("canvas-wrapper");
    if (toolbar && wrapper && toolbar.parentElement !== wrapper) {
        wrapper.appendChild(toolbar);
    }
    return toolbar;
}

function _isLightHexColor(hex) {
    const safe = `${hex || ""}`.trim();
    const normalized = safe.startsWith("#") ? safe.slice(1) : safe;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return false;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    // Luminancia perceptual aproximada
    const luma = (0.299 * r) + (0.587 * g) + (0.114 * b);
    return luma >= 170;
}

function _updateInlineEditBgToggleUI() {
    const btn = document.getElementById("ib-edit-bg-mode");
    if (!btn) return;
    btn.classList.toggle("active", inlineEditOpaqueMode);
    btn.title = inlineEditOpaqueMode ? "Vista edición opaca" : "Vista edición transparente";
}

function _rectsIntersect(a, b) {
    return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
}

function _makeToolbarDraggable(toolbarId) {
    const toolbar = document.getElementById(toolbarId);
    if (!toolbar || toolbar.dataset.dragEnabled === "true") return;

    const handle = toolbar.querySelector("h4");
    if (!handle) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseMove = (evt) => {
        if (!dragging) return;
        const maxLeft = window.scrollX + window.innerWidth - toolbar.offsetWidth - 8;
        const maxTop = window.scrollY + window.innerHeight - toolbar.offsetHeight - 8;
        const nextLeft = Math.max(window.scrollX + 8, Math.min(maxLeft, evt.clientX + window.scrollX - offsetX));
        const nextTop = Math.max(window.scrollY + 8, Math.min(maxTop, evt.clientY + window.scrollY - offsetY));
        toolbar.style.transform = "none";
        toolbar.style.left = `${nextLeft}px`;
        toolbar.style.top = `${nextTop}px`;
    };

    const stopDragging = () => {
        dragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", stopDragging);
    };

    handle.addEventListener("mousedown", (evt) => {
        const interactive = evt.target.closest("button, input, textarea, select, label");
        if (interactive) return;
        dragging = true;
        const rect = toolbar.getBoundingClientRect();
        offsetX = evt.clientX - rect.left;
        offsetY = evt.clientY - rect.top;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", stopDragging);
    });

    toolbar.dataset.dragEnabled = "true";
}

/**
 * Hace arrastrable la barra de edición en sitio tirando de su asa.
 *
 * No reutiliza `_makeToolbarDraggable()` porque aquella exige un `<h4>` como
 * asa y esta barra es una fila compacta sin título. Además, aquí hay que
 * desactivar el reposicionamiento automático en cuanto el usuario la mueve: si
 * no, el siguiente `_positionInlineEditor()` la devolvería de un salto sobre el
 * bloque y el arrastre no serviría de nada.
 */
function _makeInlineToolbarDraggable() {
    const toolbar = _inlineToolbarElement();
    if (!toolbar || toolbar.dataset.dragEnabled === "true") return;

    const handle = toolbar.querySelector(".ib-grip");
    if (!handle) return;

    const wrapper = document.getElementById("canvas-wrapper");
    if (!wrapper) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseMove = (evt) => {
        if (!dragging) return;
        const wrapperRect = wrapper.getBoundingClientRect();
        const maxLeft = wrapper.clientWidth - toolbar.offsetWidth - 8;
        const maxTop = wrapper.clientHeight - toolbar.offsetHeight - 8;
        const nextLeft = Math.max(8, Math.min(maxLeft, evt.clientX - wrapperRect.left - offsetX));
        const nextTop = Math.max(8, Math.min(maxTop, evt.clientY - wrapperRect.top - offsetY));
        toolbar.style.left = `${nextLeft}px`;
        toolbar.style.top = `${nextTop}px`;
    };

    const stopDragging = () => {
        dragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", stopDragging);
    };

    handle.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
        dragging = true;
        inlineToolbarMoved = true;
        const rect = toolbar.getBoundingClientRect();
        offsetX = evt.clientX - rect.left;
        offsetY = evt.clientY - rect.top;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", stopDragging);
    });

    toolbar.dataset.dragEnabled = "true";
}

function _ensureInlineEditorElement() {
    const wrapper = document.getElementById("canvas-wrapper");
    if (!wrapper) return null;

    let editor = document.getElementById("inline-block-editor");
    if (!editor) {
        editor = document.createElement("div");
        editor.id = "inline-block-editor";
        editor.className = "inline-block-editor";
        editor.contentEditable = "true";
        editor.spellcheck = false;
        editor.setAttribute("role", "textbox");
        editor.setAttribute("aria-multiline", "true");
        editor.hidden = true;
        wrapper.appendChild(editor);
    }

    // `_positionInlineEditor()` calcula left/top relativos a #canvas-wrapper, así
    // que el editor tiene que colgar de él. Viniendo del HTML cuelga de <main>:
    // sin reubicarlo, las coordenadas se aplican contra otro origen y el editor
    // aparece descolocado (además de heredar el `hidden` de su contenedor).
    if (editor.parentElement !== wrapper) {
        wrapper.appendChild(editor);
    }
    return editor;
}

function _blockCssRect(canvas, block) {
    const wrapper = document.getElementById("canvas-wrapper");
    if (!wrapper) return null;
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const scaleX = canvasRect.width / Math.max(1, canvas.width);
    const scaleY = canvasRect.height / Math.max(1, canvas.height);
    const [x0, y0, x1, y1] = block.bbox;

    return {
        left: (canvasRect.left - wrapperRect.left + wrapper.scrollLeft) + (x0 * scaleX),
        top: (canvasRect.top - wrapperRect.top + wrapper.scrollTop) + (y0 * scaleY),
        width: Math.max(20, (x1 - x0) * scaleX),
        height: Math.max(20, (y1 - y0) * scaleY),
        scaleY
    };
}

function _positionInlineEditor() {
    if (!inlineEditorSession) return;
    const { editor, canvas, block } = inlineEditorSession;
    const rect = _blockCssRect(canvas, block);
    if (!rect) return;

    editor.style.left = `${rect.left}px`;
    editor.style.top = `${rect.top}px`;
    editor.style.width = `${rect.width}px`;
    editor.style.height = `${rect.height}px`;
    editor.style.fontSize = `${Math.max(8, (block.font_size || 16) * rect.scaleY)}px`;

    const toolbar = _inlineToolbarElement();
    if (toolbar && !toolbar.hidden && !inlineToolbarMoved) {
        const wrapper = document.getElementById("canvas-wrapper");
        if (wrapper) {
            const desiredTop = rect.top - toolbar.offsetHeight - 8;
            const topFallback = rect.top + rect.height + 8;
            const maxLeft = wrapper.clientWidth - toolbar.offsetWidth - 8;
            const left = Math.max(8, Math.min(rect.left, maxLeft));
            const top = desiredTop >= 8 ? desiredTop : topFallback;
            toolbar.style.left = `${left}px`;
            toolbar.style.top = `${top}px`;
        }
    }
}

/**
 * Sincroniza los botones de la Goma Mágica, que viven en la barra de
 * herramientas superior: solo se habilitan si hay una goma seleccionada.
 * Sustituye a la antigua cajita flotante sobre el canvas.
 */
/**
 * Oculta la barra flotante de edición sin reescribir el atributo en cada frame:
 * escribirlo ensucia el estilo y fuerza un recálculo de layout en el
 * `getBoundingClientRect()` del siguiente mousemove.
 */
function _hideFloatingToolbar() {
    const toolbar = document.getElementById("floating-toolbar");
    if (toolbar && !toolbar.hidden) toolbar.hidden = true;
}

function _syncEraserToolbarState() {
    window.dbvShell?.setGate("eraser", !!currentTargetBlock?.is_eraser);
}

function _bindEraserActions() {
    const btnClean = document.getElementById("btn-eraser-clean");
    const btnDelete = document.getElementById("btn-eraser-delete");

    if (btnClean && btnClean.dataset.bound !== "true") {
        btnClean.dataset.bound = "true";
        btnClean.onclick = async () => {
            if (!currentTargetBlock || !currentTargetBlock.is_eraser) return;
            const currentPage = globalPayload?.pages?.[currentActivePageIndex];
            if (!currentPage) return;

            const originalText = _getBtnLabel(btnClean);
            _setBtnLabel(btnClean, "Borrando…");
            btnClean.disabled = true;

            try {
                saveToUndoStack();
                const payload = {
                    image_base64: currentPage.image_base64,
                    boxes: [{ bbox: currentTargetBlock.bbox }]
                };

                const data = await window.dbvApi.cleanBackground(payload, false);
                currentPage.image_base64 = "data:image/png;base64," + data.image_base64;
                currentPage.ai_cleaned_bg = true;

                // Solo cambia el fondo: la goma sigue seleccionada y en su sitio,
                // asi que se puede reiterar el borrado sobre la misma zona.
                await replaceCanvasBackground(currentPage.image_base64);
            } catch (err) {
                const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
                alert(_t("alerts.eraserError", { msg: err.message }));
            } finally {
                _setBtnLabel(btnClean, originalText);
                _syncEraserToolbarState();
            }
        };
    }

    if (btnDelete && btnDelete.dataset.bound !== "true") {
        btnDelete.dataset.bound = "true";
        btnDelete.onclick = () => {
            if (!currentTargetBlock || !currentTargetBlock.is_eraser) return;
            const currentPage = globalPayload?.pages?.[currentActivePageIndex];
            if (!currentPage?.blocks) return;

            const idx = currentPage.blocks.indexOf(currentTargetBlock);
            if (idx !== -1) {
                saveToUndoStack();
                currentPage.blocks.splice(idx, 1);
            }
            currentTargetBlock = null;
            _hideFloatingToolbar();
            _syncEraserToolbarState();
            repaintCanvas();
        };
    }
}

function _applyInlineEditorVisuals() {
    if (!inlineEditorSession) return;
    const { editor, block } = inlineEditorSession;
    editor.style.fontFamily = block.font_family || "system-ui";
    editor.style.fontWeight = block.is_bold ? "700" : "400";
    editor.style.fontStyle = block.is_italic ? "italic" : "normal";
    editor.style.textDecoration = block.is_underline ? "underline" : "none";
    editor.style.lineHeight = `${Math.max(0.8, Math.min(3.0, Number(block.line_spacing) || TEXT_LINE_HEIGHT_MULTIPLIER))}`;
    editor.style.color = block.text_color || "#000000";
    editor.style.textAlign = block.text_align || "left";
    // UX: durante edición usamos fondo opaco temporal para máxima legibilidad,
    // especialmente en bloques transparentes tras limpieza con IA.
    if (block.bg_transparent) {
        const textIsLight = _isLightHexColor(block.text_color || "#000000");
        if (inlineEditOpaqueMode) {
            editor.style.background = textIsLight ? "#0f172a" : "#ffffff";
        } else {
            editor.style.background = textIsLight ? "rgba(15, 23, 42, 0.45)" : "rgba(255, 255, 255, 0.45)";
        }
    } else {
        editor.style.background = block.bg_color || "#ffffff";
    }
    _positionInlineEditor();
}

function _syncInlineToolbarFromBlock(block) {
    const font = document.getElementById("ib-font");
    const size = document.getElementById("ib-size");
    const lineSpacing = document.getElementById("ib-line-spacing");
    const width = document.getElementById("ib-width");
    const height = document.getElementById("ib-height");
    const bold = document.getElementById("ib-bold");
    const italic = document.getElementById("ib-italic");
    const underline = document.getElementById("ib-underline");
    const color = document.getElementById("ib-color");
    const bg = document.getElementById("ib-bg");
    const transp = document.getElementById("ib-bg-transparent");

    if (font) {
        const hasOption = Array.from(font.options).some(opt => opt.value === block.font_family);
        if (!hasOption && block.font_family) {
            const custom = document.createElement("option");
            custom.value = block.font_family;
            custom.textContent = block.font_family;
            font.appendChild(custom);
        }
        font.value = block.font_family || "system-ui";
    }
    if (size) size.value = `${block.font_size || 16}`;
    if (lineSpacing) lineSpacing.value = `${Math.max(0.8, Math.min(3.0, Number(block.line_spacing) || TEXT_LINE_HEIGHT_MULTIPLIER))}`;
    if (width) width.value = `${Math.round(Math.max(20, block.bbox[2] - block.bbox[0]))}`;
    if (height) height.value = `${Math.round(Math.max(20, block.bbox[3] - block.bbox[1]))}`;
    if (bold) bold.classList.toggle("active", !!block.is_bold);
    if (italic) italic.classList.toggle("active", !!block.is_italic);
    if (underline) underline.classList.toggle("active", !!block.is_underline);
    if (color) color.value = block.text_color || "#000000";
    if (bg) bg.value = block.bg_color || "#ffffff";
    if (transp) transp.checked = !!block.bg_transparent;

    ["left", "center", "right"].forEach(align => {
        const btn = document.getElementById(`ib-align-${align}`);
        if (btn) btn.classList.toggle("active", (block.text_align || "left") === align);
    });
}

function _bindInlineToolbarEvents() {
    const toolbar = _inlineToolbarElement();
    if (!toolbar || toolbar.dataset.bound === "true") return;

    toolbar.addEventListener("mousedown", () => {
        inlineToolbarPointerDown = true;
    });
    toolbar.addEventListener("mouseup", () => {
        // Dejar un pequeño margen para que onblur (setTimeout 0) detecte interacción de toolbar
        window.setTimeout(() => {
            inlineToolbarPointerDown = false;
        }, 0);
    });

    try {
        const rawMode = localStorage.getItem(INLINE_EDIT_BG_MODE_STORAGE_KEY);
        if (rawMode === "opaque") inlineEditOpaqueMode = true;
        if (rawMode === "transparent") inlineEditOpaqueMode = false;
    } catch {
        // ignore storage failures
    }
    _updateInlineEditBgToggleUI();

    const applyCurrentControls = () => {
        if (!inlineEditorSession) return;
        const block = inlineEditorSession.block;
        const font = document.getElementById("ib-font");
        const size = document.getElementById("ib-size");
        const lineSpacing = document.getElementById("ib-line-spacing");
        const width = document.getElementById("ib-width");
        const height = document.getElementById("ib-height");
        const color = document.getElementById("ib-color");
        const bg = document.getElementById("ib-bg");
        const transp = document.getElementById("ib-bg-transparent");

        if (font) block.font_family = font.value;
        if (size) {
            const parsed = parseFloat(size.value);
            if (!Number.isNaN(parsed) && parsed > 0) {
                block.font_size = parsed;
                block.font_size_locked = true;
            }
        }
        if (lineSpacing) {
            const parsedLS = parseFloat(lineSpacing.value);
            if (!Number.isNaN(parsedLS)) {
                block.line_spacing = Math.max(0.8, Math.min(3.0, parsedLS));
            }
        }
        if (width || height) {
            const [x0, y0, x1, y1] = block.bbox;
            const currentW = Math.max(20, x1 - x0);
            const currentH = Math.max(20, y1 - y0);
            const parsedW = width ? parseFloat(width.value) : currentW;
            const parsedH = height ? parseFloat(height.value) : currentH;
            const nextW = (!Number.isNaN(parsedW) && parsedW >= 20) ? parsedW : currentW;
            const nextH = (!Number.isNaN(parsedH) && parsedH >= 20) ? parsedH : currentH;
            block.bbox = [x0, y0, x0 + nextW, y0 + nextH];
        }
        if (color) block.text_color = color.value;
        if (bg) block.bg_color = bg.value;
        if (transp) block.bg_transparent = !!transp.checked;
        block.is_modified = true;
        _applyInlineEditorVisuals();
        // El lienzo también refleja el cambio al momento: sin esto, tocar W/H
        // movía el editor pero dejaba la caja pintada con el tamaño anterior
        // hasta cerrar y volver a abrir la edición.
        repaintCanvas();
        _positionInlineEditor();
    };

    ["ib-font", "ib-size", "ib-line-spacing", "ib-width", "ib-height", "ib-color", "ib-bg", "ib-bg-transparent"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventName = (id === "ib-size" || id === "ib-line-spacing" || id === "ib-width" || id === "ib-height") ? "input" : "change";
            el.addEventListener(eventName, applyCurrentControls);
        }
    });

    const toggleProp = (id, prop) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener("click", () => {
            if (!inlineEditorSession) return;
            inlineEditorSession.block[prop] = !inlineEditorSession.block[prop];
            inlineEditorSession.block.is_modified = true;
            btn.classList.toggle("active", !!inlineEditorSession.block[prop]);
            _applyInlineEditorVisuals();
        });
    };

    toggleProp("ib-bold", "is_bold");
    toggleProp("ib-italic", "is_italic");
    toggleProp("ib-underline", "is_underline");

    ["left", "center", "right"].forEach(align => {
        const btn = document.getElementById(`ib-align-${align}`);
        if (!btn) return;
        btn.addEventListener("click", () => {
            if (!inlineEditorSession) return;
            inlineEditorSession.block.text_align = align;
            inlineEditorSession.block.is_modified = true;
            ["left", "center", "right"].forEach(a => {
                const other = document.getElementById(`ib-align-${a}`);
                if (other) other.classList.toggle("active", a === align);
            });
            _applyInlineEditorVisuals();
        });
    });

    const done = document.getElementById("ib-done");
    if (done) {
        done.addEventListener("click", () => {
            _closeInlineEditor(true);
        });
    }

    const editBgModeBtn = document.getElementById("ib-edit-bg-mode");
    if (editBgModeBtn) {
        editBgModeBtn.addEventListener("click", () => {
            inlineEditOpaqueMode = !inlineEditOpaqueMode;
            try {
                localStorage.setItem(INLINE_EDIT_BG_MODE_STORAGE_KEY, inlineEditOpaqueMode ? "opaque" : "transparent");
            } catch {
                // ignore storage failures
            }
            _updateInlineEditBgToggleUI();
            _applyInlineEditorVisuals();
        });
    }

    toolbar.dataset.bound = "true";
}

function _closeInlineEditor(saveChanges) {
    if (!inlineEditorSession) return;

    const { editor, block, originalText } = inlineEditorSession;
    const nextText = (editor.innerText || "").replace(/\r/g, "");

    if (saveChanges && nextText !== originalText) {
        saveToUndoStack();
        block.text = nextText;
        block.is_modified = true;
    }

    editor.onblur = null;
    editor.onkeydown = null;
    editor.hidden = true;
    editor.textContent = "";

    const toolbar = _inlineToolbarElement();
    if (toolbar) {
        toolbar.hidden = true;
    }

    inlineEditorSession = null;
    updateCleanBgButtonLabel();

    repaintCanvas();
}

function startInlineBlockEdit(blocks, targetIndex, ctxScope) {
    const block = blocks[targetIndex];
    if (!block) return;
    currentTargetBlock = block;
    updateCleanBgButtonLabel();
    _syncEraserToolbarState();
    _hideFloatingToolbar();
    const multiToolbar = document.getElementById("multi-toolbar");
    if (multiToolbar) multiToolbar.hidden = true;

    if (block.is_eraser) {
        _closeInlineEditor(true);
        return;
    }

    const editor = _ensureInlineEditorElement();
    if (!editor) return;

    if (inlineEditorSession) {
        _closeInlineEditor(true);
    }

    _bindInlineToolbarEvents();
    // Cada bloque nuevo reancla la barra sobre él; si el usuario la había
    // arrastrado, esa posición solo valía para la edición anterior.
    inlineToolbarMoved = false;
    const toolbar = _inlineToolbarElement();
    if (toolbar) {
        toolbar.hidden = false;
        _makeInlineToolbarDraggable();
    }

    editor.hidden = false;
    editor.textContent = block.text || "";

    inlineEditorSession = {
        editor,
        block,
        originalText: block.text || "",
        canvas: ctxScope.canvas
    };

    _syncInlineToolbarFromBlock(block);
    const fontSelect = document.getElementById("ib-font");
    if (fontSelect && fontSelect.dataset.previewReady !== "true") {
        Array.from(fontSelect.options).forEach(opt => {
            opt.style.fontFamily = opt.value;
        });
        fontSelect.dataset.previewReady = "true";
    }
    _applyInlineEditorVisuals();
    _positionInlineEditor();

    editor.onkeydown = (evt) => {
        if (evt.key === "Escape") {
            evt.preventDefault();
            _closeInlineEditor(false);
            return;
        }
        if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") {
            evt.preventDefault();
            _closeInlineEditor(true);
        }
    };

    editor.onblur = () => {
        window.setTimeout(() => {
            if (!inlineEditorSession) return;
            if (inlineToolbarPointerDown) return;
            const active = document.activeElement;
            const toolbar = _inlineToolbarElement();
            if (toolbar && active && toolbar.contains(active)) {
                return;
            }
            _closeInlineEditor(true);
        }, 0);
    };

    editor.focus();
    const selection = window.getSelection();
    if (selection) {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

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

    const indicator = document.getElementById("zoom-indicator");
    if (indicator) indicator.textContent = `${Math.round(zoom * 100)}%`;

    _positionInlineEditor();
}

function bindCanvasZoomControls() {
    const bindZoom = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    };

    bindZoom("btn-zoom-in", () => {
        _userHasZoomed = true;
        currentZoomScale = _clampZoom(currentZoomScale + ZOOM_STEP);
        applyZoomToCanvas(document.getElementById("pdf-canvas"));
    });

    bindZoom("btn-zoom-out", () => {
        _userHasZoomed = true;
        currentZoomScale = _clampZoom(currentZoomScale - ZOOM_STEP);
        applyZoomToCanvas(document.getElementById("pdf-canvas"));
    });

    bindZoom("btn-zoom-reset", () => {
        _userHasZoomed = false;
        const canvas = document.getElementById("pdf-canvas");
        currentZoomScale = _calcFitZoom(/** @type {HTMLCanvasElement} */ (canvas));
        applyZoomToCanvas(canvas);
    });

    applyZoomToCanvas(document.getElementById("pdf-canvas"));
}

function initPagination(fullData) {
    console.log("[DBV DIAG] initPagination called with", fullData?.total_pages, "pages");
    globalPayload = fullData;
    currentActivePageIndex = 0;
    undoStack = [];
    redoStack = [];
    _updateUndoRedoUI();

    globalPayload.pages.forEach(page => {
        page.blocks.forEach(block => normalizeBlock(block));
    });
    
    const paginator = document.getElementById("pagination-controls");
    if (paginator) paginator.hidden = false;

    const bindPage = (id, handler) => {
        const el = document.getElementById(id);
        if (el) el.onclick = handler;
    };

    bindPage("btn-prev", () => {
        if (currentActivePageIndex > 0) {
            currentActivePageIndex--;
            cycleViewEngine();
        }
    });
    
    bindPage("btn-next", () => {
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

    // Feature Goma Mágica: Caja interactiva para inpaint local reiterado
    const btnAddEraser = document.getElementById("btn-add-eraser");
    if (btnAddEraser) {
        btnAddEraser.onclick = () => {
            const currentPage = globalPayload?.pages?.[currentActivePageIndex];
            if (!currentPage) return;
            const currentBlocks = currentPage.blocks;

            // Solo puede haber una goma por pagina: si ya existe (o quedaron
            // varias de sesiones anteriores) nos quedamos con la primera y la
            // reseleccionamos en lugar de sembrar el documento de gomas.
            const existing = currentBlocks.filter(b => b.is_eraser);
            if (existing.length > 0) {
                const keeper = existing[0];
                if (existing.length > 1) {
                    for (let i = currentBlocks.length - 1; i >= 0; i--) {
                        if (currentBlocks[i].is_eraser && currentBlocks[i] !== keeper) {
                            currentBlocks.splice(i, 1);
                        }
                    }
                }
                currentTargetBlock = keeper;
                repaintCanvas();
                _syncEraserToolbarState();
                return;
            }

            const canvas = document.getElementById("pdf-canvas");
            const cw = canvas ? canvas.width : 800;
            const ch = canvas ? canvas.height : 600;
            const ew = 200;
            const eh = 90;
            const x0 = Math.max(30, Math.round((cw - ew) / 2));
            const y0 = Math.max(30, Math.round((ch - eh) / 2));

            const eraserBlock = {
                id: "eraser-" + Date.now(),
                page: currentActivePageIndex,
                bbox: [x0, y0, x0 + ew, y0 + eh],
                text: "",
                confidence: 1.0,
                is_eraser: true,
                is_modified: false,
                bg_transparent: true,
                source: "eraser"
            };

            currentBlocks.push(eraserBlock);
            currentTargetBlock = eraserBlock;
            saveToUndoStack();
            _hideFloatingToolbar();
            repaintCanvas();
            _syncEraserToolbarState();
        };
    }
    _bindEraserActions();
    _syncEraserToolbarState();
    
    // Listener para Ctrl+Z (Undo) y Ctrl+Y (Redo) montado una única vez
    if (!_globalShortcutsMounted) {
        _globalShortcutsMounted = true;
        document.addEventListener("keydown", (evt) => {
            if ((evt.ctrlKey || evt.metaKey) && evt.key === 'z' && !evt.shiftKey) {
                evt.preventDefault();
                performUndo();
            } else if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'y' || (evt.shiftKey && evt.key === 'z'))) {
                evt.preventDefault();
                performRedo();
            }
        });
    }
    
    // Lógica para Nano Banana API Key
    const apiKeyInput = document.getElementById("ai-api-key");
    const cleanModeSelect = document.getElementById("clean-mode");
    const cleanModeIndicator = document.getElementById("clean-mode-indicator");
    const btnSaveKey = document.getElementById("btn-save-key");

    const refreshCleanModeIndicator = () => {
        if (!cleanModeIndicator) return;
        const mode = cleanModeSelect?.value || "auto";
        const hasKey = !!apiKeyInput?.value?.trim();
        if (mode === "local") {
            cleanModeIndicator.textContent = "Modo activo: Local (OpenCV)";
        } else if (mode === "cloud") {
            cleanModeIndicator.textContent = "Modo activo: Cloud (AI Studio)";
        } else {
            cleanModeIndicator.textContent = hasKey
                ? "Modo activo: Auto → Cloud"
                : "Modo activo: Auto → Local";
        }
    };

    if (apiKeyInput && btnSaveKey) {
        apiKeyInput.value = localStorage.getItem("dbv_nano_banana_key") || "";
        if (cleanModeSelect) {
            cleanModeSelect.value = localStorage.getItem("dbv_clean_bg_mode") || "auto";
            cleanModeSelect.onchange = () => {
                localStorage.setItem("dbv_clean_bg_mode", cleanModeSelect.value);
                refreshCleanModeIndicator();
            };
        }
        apiKeyInput.addEventListener("input", refreshCleanModeIndicator);
        refreshCleanModeIndicator();
        btnSaveKey.onclick = () => {
            localStorage.setItem("dbv_nano_banana_key", apiKeyInput.value);
            btnSaveKey.textContent = "¡Guardada ✓!";
            setTimeout(() => btnSaveKey.textContent = "Guardar Local", 2000);
            refreshCleanModeIndicator();
        };
    }
    
    // Lógica para Limpiar Fondo (Selectivo o Página Completa con OpenCV)
    const btnCleanBg = document.getElementById("btn-clean-bg");
    if (btnCleanBg) {
        btnCleanBg.onclick = async () => {
            const key = document.getElementById("ai-api-key")?.value?.trim();
            const selectedMode = cleanModeSelect?.value || "local";
            const useCloud = selectedMode === "cloud" && !!key;

            const currentPage = globalPayload?.pages?.[currentActivePageIndex];
            if (!currentPage || !currentPage.blocks) return;

            const blocks = currentPage.blocks;

            // Determinar bloques objetivo (selectivos o toda la página)
            let targetBlocks = [];
            let isSelective = false;

            if (selectedBlockIndices.length > 0) {
                targetBlocks = selectedBlockIndices
                    .filter(idx => idx >= 0 && idx < blocks.length)
                    .map(idx => blocks[idx]);
                isSelective = true;
            } else if (inlineEditorSession?.block) {
                targetBlocks = [inlineEditorSession.block];
                isSelective = true;
            } else if (currentTargetBlock) {
                targetBlocks = [currentTargetBlock];
                isSelective = true;
            } else {
                targetBlocks = blocks;
            }

            const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
            _setBtnLabel(btnCleanBg, isSelective ? _t("toolbar.cleanBgCleaningSel") : _t("toolbar.cleanBgCleaning"));
            btnCleanBg.disabled = true;

            try {
                const localBoxes = targetBlocks
                    .filter(b => Array.isArray(b.bbox) && b.bbox.length === 4)
                    .map(b => ({ bbox: b.bbox }));

                if (!useCloud && localBoxes.length === 0) {
                    throw new Error(_t("alerts.noValidBoxes"));
                }

                const payload = useCloud
                    ? {
                        image_base64: currentPage.image_base64,
                        api_key: key
                    }
                    : {
                        image_base64: currentPage.image_base64,
                        boxes: localBoxes
                    };

                // Guardar rollback ANTES de mutar
                saveToUndoStack();

                const data = await window.dbvApi.cleanBackground(payload, useCloud);

                // Actualizar imagen y re-renderizar
                currentPage.image_base64 = "data:image/png;base64," + data.image_base64;
                currentPage.ai_cleaned_bg = true;

                // Convertir ÚNICAMENTE los bloques objetivo a editables con fondo transparente
                targetBlocks.forEach(block => {
                    block.is_modified = true;
                    block.bg_transparent = true;
                });

                if (canvasScope) {
                    canvasScope.blocks = currentPage.blocks;
                    await replaceCanvasBackground(currentPage.image_base64);
                } else {
                    cycleViewEngine();
                }
            } catch (err) {
                alert(_t("alerts.cleanBgError", { msg: err.message }));
            } finally {
                btnCleanBg.disabled = false;
                updateCleanBgButtonLabel();
            }
        };
    }
    
    // Vinculación definitiva de herramientas MVC
    bindFloatingToolbarEvents();
    bindCanvasZoomControls();
    mountExportControls(globalPayload);
    
    // Escuchar cambios de idioma para actualizar textos dinámicos
    document.addEventListener("dbv-lang-changed", () => {
        updateCleanBgButtonLabel();
        const indicator = document.getElementById("page-indicator");
        if (indicator && globalPayload) {
            const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
            indicator.textContent = _t("page.indicator", {
                current: currentActivePageIndex + 1,
                total: globalPayload.total_pages
            });
        }
    });

    cycleViewEngine();
}

function cycleViewEngine() {
    console.log("[DBV DIAG] cycleViewEngine called, pageIndex=", currentActivePageIndex, "totalPages=", globalPayload?.total_pages);
    _closeInlineEditor(true);

    const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
    const indicator = document.getElementById("page-indicator");
    if (indicator && globalPayload) {
        indicator.textContent = _t("page.indicator", {
            current: currentActivePageIndex + 1,
            total: globalPayload.total_pages
        });
    }
    window.dbvShell?.setPage(currentActivePageIndex + 1, globalPayload.total_pages);
    // Ocultar barra flotante al ciclar la página para evitar solapamientos
    document.getElementById("floating-toolbar").hidden = true;
    document.getElementById("multi-toolbar").hidden = true;
    selectedBlockIndices = []; // Limpiar multi-selección al cambiar de página
    selectionMarquee = null;
    updateCleanBgButtonLabel();
    
    renderNativeCanvasEditor(globalPayload.pages[currentActivePageIndex]);
}

function renderNativeCanvasEditor(pageData) {
    console.log("[DBV DIAG] renderNativeCanvasEditor called.",
        "canvas?", !!document.getElementById("pdf-canvas"),
        "pageData?", !!pageData,
        "image_base64 length:", pageData?.image_base64?.length ?? 0,
        "blocks:", pageData?.blocks?.length ?? 0);
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("pdf-canvas"));
    if (!canvas) {
        console.error("[DBV Canvas] Elemento #pdf-canvas no encontrado.");
        return;
    }
    if (!pageData || !pageData.image_base64) {
        console.error("[DBV Canvas] pageData o image_base64 ausente:", pageData);
        return;
    }
    
    const renderSourceImage = new Image();
    
    renderSourceImage.onload = () => {
        try {
            const imgWidth = renderSourceImage.naturalWidth || renderSourceImage.width;
            const imgHeight = renderSourceImage.naturalHeight || renderSourceImage.height;
            console.log("[DBV DIAG] Image loaded! dimensions:", imgWidth, "x", imgHeight);

            const currentCanvas = document.getElementById("pdf-canvas") || canvas;
            console.log("[DBV DIAG] currentCanvas found?", !!currentCanvas, "parentNode?", !!currentCanvas?.parentNode);
            const safeCanvas = currentCanvas.cloneNode(true);
            safeCanvas.width = imgWidth;
            safeCanvas.height = imgHeight;
            safeCanvas.setAttribute("width", imgWidth.toString());
            safeCanvas.setAttribute("height", imgHeight.toString());
            safeCanvas.setAttribute("aria-label", `Área de Pág ${pageData.page_num} con ${(pageData.blocks || []).length} bloques.`);
            if (currentCanvas.parentNode) {
                currentCanvas.parentNode.replaceChild(safeCanvas, currentCanvas);
            }

            const freshCtx = safeCanvas.getContext("2d", { willReadFrequently: true });

            if (!_userHasZoomed) {
                currentZoomScale = _calcFitZoom(safeCanvas);
            }
            applyZoomToCanvas(safeCanvas);
            
            canvasScope = {
                canvas: safeCanvas,
                ctx: freshCtx,
                bgImage: renderSourceImage,
                blocks: pageData.blocks || []
            };

            repaintCanvas();
            mountInteractionLayer(safeCanvas, freshCtx, canvasScope.blocks);
            
            if (!pageData.blocks || pageData.blocks.length === 0) {
                const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
                freshCtx.fillStyle = "rgba(255, 0, 0, 0.85)";
                freshCtx.fillRect(0, 0, safeCanvas.width, 100);
                freshCtx.fillStyle = "white";
                freshCtx.font = "bold 24px system-ui";
                freshCtx.fillText(_t("page.noBlocks", { num: pageData.page_num }), 30, 50);
            }
        } catch (err) {
            console.error("[DBV Canvas] Error durante render de canvas:", err);
        }
    };
    
    renderSourceImage.onerror = (err) => {
        console.error("[DBV Canvas] Error cargando renderSourceImage:", err);
    };

    const src = pageData.image_base64.startsWith("data:")
        ? pageData.image_base64
        : `data:image/png;base64,${pageData.image_base64}`;
    renderSourceImage.src = src;
}

/**
 * Dibuja la etiqueta con el texto reconocido de un bloque de deteccion.
 *
 * Se reserva al bloque seleccionado. Va encima de la caja salvo que no quepa
 * (bloques pegados al borde superior), en cuyo caso baja: la version anterior
 * la pintaba siempre arriba y en la primera fila se salia del lienzo.
 *
 * @param {CanvasRenderingContext2D} ctx Contexto de dibujo.
 * @param {HTMLCanvasElement} canvas Lienzo, para acotar la etiqueta a su ancho.
 * @param {Object} block Bloque detectado.
 * @param {number} x0 Borde izquierdo del bloque.
 * @param {number} y0 Borde superior del bloque.
 * @param {number} width Ancho del bloque.
 * @param {number} height Alto del bloque.
 */
function _drawDetectionLabel(ctx, canvas, block, x0, y0, width, height) {
    const LABEL_HEIGHT = 22;
    const text = (block.text || "").replace(/\n/g, " ").trim();
    if (!text) return;

    ctx.save();
    ctx.font = "bold 13px system-ui";
    ctx.textBaseline = "middle";

    const labelWidth = Math.min(canvas.width - x0, ctx.measureText(text).width + 14);
    const fitsAbove = y0 - LABEL_HEIGHT >= 0;
    const labelY = fitsAbove ? y0 - LABEL_HEIGHT : y0 + height;

    // Oscura y opaca: sobre una infografia de colores, un chip blanco al 95%
    // se confunde con el propio documento.
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.fillRect(x0, labelY, labelWidth, LABEL_HEIGHT);
    ctx.beginPath();
    ctx.rect(x0, labelY, labelWidth, LABEL_HEIGHT);
    ctx.clip();
    ctx.fillStyle = "#f8fafc";
    ctx.fillText(text, x0 + 7, labelY + LABEL_HEIGHT / 2);
    ctx.restore();
}

function paintCanvasLayers(ctx, canvas, background, blocks) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    
    blocks.forEach(block => {
        normalizeBlock(block);
        const isInlineEditingBlock = inlineEditorSession?.block === block;
        const [x0, y0, x1, y1] = block.bbox;
        const width = x1 - x0;
        const height = y1 - y0;

        if (block.is_eraser) {
            if (!isPreviewMode) {
                drawNataEraser(ctx, block.bbox, block === currentTargetBlock);
                drawResizeHandles(ctx, block.bbox);
            }
            return;
        }

        if (block.is_modified) {
            // Fondo Sobreescrito (Color inyectable guiado del Front o blanco estricto MVP)
            if (!block.bg_transparent) {
                ctx.fillStyle = block.bg_color || "#ffffff"; 
                ctx.fillRect(x0, y0, width, height);
            }
            
            // Mientras editamos inline ocultamos el texto subyacente del bloque
            // para evitar efecto de doble texto bajo el contenteditable.
            if (!isInlineEditingBlock) {
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
                const lineSpacing = Math.max(0.8, Math.min(3.0, Number(block.line_spacing) || TEXT_LINE_HEIGHT_MULTIPLIER));
                const lineHeight = finalSize * lineSpacing;
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
                            const lineText = line.trimEnd();
                            ctx.fillText(lineText, drawX, currentY);
                            if (block.is_underline) {
                                const width = ctx.measureText(lineText).width;
                                const baseY = currentY + lineHeight - 2;
                                const startX = textAlign === "right" ? drawX - width : (textAlign === "center" ? drawX - (width / 2) : drawX);
                                ctx.beginPath();
                                ctx.moveTo(startX, baseY);
                                ctx.lineTo(startX + width, baseY);
                                ctx.lineWidth = Math.max(1, finalSize * 0.06);
                                ctx.strokeStyle = block.text_color || "#000000";
                                ctx.stroke();
                            }
                            line = words[n] + ' ';
                            currentY += lineHeight;
                        } else {
                            line = testLine;
                        }
                    }
                    const finalLine = line.trimEnd();
                    ctx.fillText(finalLine, drawX, currentY);
                    if (block.is_underline) {
                        const width = ctx.measureText(finalLine).width;
                        const baseY = currentY + lineHeight - 2;
                        const startX = textAlign === "right" ? drawX - width : (textAlign === "center" ? drawX - (width / 2) : drawX);
                        ctx.beginPath();
                        ctx.moveTo(startX, baseY);
                        ctx.lineTo(startX + width, baseY);
                        ctx.lineWidth = Math.max(1, finalSize * 0.06);
                        ctx.strokeStyle = block.text_color || "#000000";
                        ctx.stroke();
                    }
                    currentY += lineHeight;
                });
                
                ctx.restore();
            }
            
            // En modo vista previa limpia no dibujamos bordes verdes ni tiradores
            if (!isPreviewMode) {
                ctx.strokeStyle = "rgba(40, 167, 69, 0.9)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x0, y0, width, height);
                drawResizeHandles(ctx, block.bbox);
            }
        } else {
            if (isPreviewMode || block.source === "native") {
                return;
            }
            // Guia inicial de deteccion: solo el recuadro.
            ctx.strokeStyle = "rgba(49, 130, 206, 0.8)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x0, y0, width, height);

            // Bloque no modificado pero seleccionado: mostrar handles para facilitar resize.
            if (_isResizeInteractiveBlock(block)) {
                ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x0, y0, width, height);
                drawResizeHandles(ctx, block.bbox);
            }
        }
    });

    if (isPreviewMode) return;

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

    if (selectionMarquee) {
        const { x0, y0, x1, y1 } = selectionMarquee;
        const w = x1 - x0;
        const h = y1 - y0;
        ctx.save();
        ctx.fillStyle = "rgba(14, 165, 233, 0.14)";
        ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeRect(x0, y0, w, h);
        ctx.restore();
    }
}

/**
 * Repinta la pagina activa a partir del ambito de modulo. Es el unico camino de
 * repintado: nadie deberia volver a capturar la imagen de fondo en un closure.
 */
function repaintCanvas() {
    if (!canvasScope) return;
    paintCanvasLayers(canvasScope.ctx, canvasScope.canvas, canvasScope.bgImage, canvasScope.blocks);
}

/**
 * Sustituye la imagen de fondo de la pagina activa y repinta, sin rehacer el
 * canvas ni volver a montar la capa de interaccion.
 * @param {string} dataUrl Imagen en data URI.
 * @returns {Promise<void>}
 */
function replaceCanvasBackground(dataUrl) {
    return new Promise((resolve, reject) => {
        if (!canvasScope) {
            resolve();
            return;
        }
        const image = new Image();
        image.onload = () => {
            canvasScope.bgImage = image;
            repaintCanvas();
            resolve();
        };
        image.onerror = () => reject(new Error("No se pudo cargar la imagen procesada."));
        image.src = dataUrl;
    });
}

function mountInteractionLayer(canvas, ctx, _initialBlocks) {
    let isDragging   = false;
    let isResizing   = false;
    let isMarqueeSelecting = false;
    let dragHasMoved = false;
    let dragInitialSnapshot = null;

    let dragTargetIndex   = -1;
    let resizeTargetIndex = -1;
    let clickTargetIndex  = -1;
    let resizeHandle      = null;

    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    const MIN_BLOCK = 20; // tamaño mínimo en px al redimensionar

    function getActiveBlocks() {
        return canvasScope?.blocks || globalPayload?.pages?.[currentActivePageIndex]?.blocks || [];
    }

    function getPhysicalCoords(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top)  * (canvas.height / rect.height)
        };
    }

    function _findTopmostBlockIndex(predicate) {
        const blocks = getActiveBlocks();
        for (let i = blocks.length - 1; i >= 0; i--) {
            if (predicate(blocks[i], i, blocks)) return i;
        }
        return -1;
    }

    canvas.addEventListener("dblclick", (evt) => {
        if (evt.button !== 0) return;
        if (isPreviewMode) {
            togglePreviewMode(false);
            return;
        }
        const blocks = getActiveBlocks();
        const physical = getPhysicalCoords(evt);
        const clickedIdx = _findTopmostBlockIndex(block => {
            const [x0, y0, x1, y1] = block.bbox;
            return (physical.x >= x0 && physical.x <= x1 && physical.y >= y0 && physical.y <= y1);
        });
        if (clickedIdx !== -1) {
            startInlineBlockEdit(blocks, clickedIdx, canvasScope);
        }
    });

    canvas.addEventListener("mousedown", (evt) => {
        if (evt.button !== 0) return;

        if (isPreviewMode) {
            togglePreviewMode(false);
            return;
        }

        if (inlineEditorSession) {
            _closeInlineEditor(true);
        }

        const blocks = getActiveBlocks();
        const physical = getPhysicalCoords(evt);
        dragHasMoved = false;
        dragInitialSnapshot = null;

        // ── Ctrl+Click: modo multi-selección ──
        if (evt.ctrlKey) {
            const clickedIdx = _findTopmostBlockIndex(b => {
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
                repaintCanvas();
                if (selectedBlockIndices.length >= 2) {
                    triggerMultiSelectToolbar(blocks, selectedBlockIndices, evt.clientX, evt.clientY);
                } else {
                    document.getElementById("multi-toolbar").hidden = true;
                }
            }
            return;
        }

        // Clic normal: si hay multi-selección activa, limpiarla y continuar evaluación
        if (selectedBlockIndices.length > 0 && !evt.ctrlKey) {
            selectedBlockIndices = [];
            document.getElementById("multi-toolbar").hidden = true;
            repaintCanvas();
        }

        // 1. Comprobar handles de resize (recorrer desde el bloque superior hacia el fondo)
        for (let i = blocks.length - 1; i >= 0; i--) {
            if (!_isResizeInteractiveBlock(blocks[i])) continue;
            const h = getResizeHandle(physical, blocks[i]);
            if (h) {
                dragInitialSnapshot = createSnapshot();
                isResizing        = true;
                resizeHandle      = h;
                resizeTargetIndex = i;
                clickTargetIndex  = -1;
                return;
            }
        }

        // 2. Comprobar si el clic cae dentro de un bloque (priorizar el bloque superior)
        dragTargetIndex = _findTopmostBlockIndex(block => {
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

            dragInitialSnapshot = createSnapshot();
            isDragging  = true;
            dragOffsetX = physical.x - block.bbox[0];
            dragOffsetY = physical.y - block.bbox[1];
        } else {
            // Arrastre en zona vacía => selección por rectángulo
            isMarqueeSelecting = true;
            marqueeStartX = physical.x;
            marqueeStartY = physical.y;
            selectionMarquee = { x0: physical.x, y0: physical.y, x1: physical.x, y1: physical.y };
            clickTargetIndex = -1;
            document.getElementById("floating-toolbar").hidden = true;
            document.getElementById("multi-toolbar").hidden = true;
        }
    });

    canvas.addEventListener("mousemove", (evt) => {
        if (isPreviewMode) {
            canvas.style.cursor = "default";
            return;
        }

        const blocks = getActiveBlocks();
        const physical = getPhysicalCoords(evt);

        if (isMarqueeSelecting) {
            dragHasMoved = true;
            selectionMarquee = {
                x0: Math.min(marqueeStartX, physical.x),
                y0: Math.min(marqueeStartY, physical.y),
                x1: Math.max(marqueeStartX, physical.x),
                y1: Math.max(marqueeStartY, physical.y)
            };
            repaintCanvas();
            canvas.style.cursor = "crosshair";
            return;
        }

        // ── Redimensionando ──
        if (isResizing && resizeTargetIndex !== -1) {
            dragHasMoved = true;
            _hideFloatingToolbar();
            const block = blocks[resizeTargetIndex];
            if (!block) return;
            let [x0, y0, x1, y1] = block.bbox;

            switch (resizeHandle) {
                case "e":  x1 = Math.max(x0 + MIN_BLOCK, physical.x); break;
                case "w":  x0 = Math.min(x1 - MIN_BLOCK, physical.x); break;
                case "s":  y1 = Math.max(y0 + MIN_BLOCK, physical.y); break;
                case "n":  y0 = Math.min(y1 - MIN_BLOCK, physical.y); break;
                case "se":
                    x1 = Math.max(x0 + MIN_BLOCK, physical.x);
                    y1 = Math.max(y0 + MIN_BLOCK, physical.y);
                    break;
                case "sw":
                    x0 = Math.min(x1 - MIN_BLOCK, physical.x);
                    y1 = Math.max(y0 + MIN_BLOCK, physical.y);
                    break;
                case "ne":
                    x1 = Math.max(x0 + MIN_BLOCK, physical.x);
                    y0 = Math.min(y1 - MIN_BLOCK, physical.y);
                    break;
                case "nw":
                    x0 = Math.min(x1 - MIN_BLOCK, physical.x);
                    y0 = Math.min(y1 - MIN_BLOCK, physical.y);
                    break;
            }

            block.bbox = [x0, y0, x1, y1];
            block.is_modified = true;
            repaintCanvas();
            return;
        }

        // ── Arrastrando bloque ──
        if (isDragging && dragTargetIndex !== -1) {
            dragHasMoved = true;
            _hideFloatingToolbar();

            const block = blocks[dragTargetIndex];
            if (!block) return;
            const w = block.bbox[2] - block.bbox[0];
            const h = block.bbox[3] - block.bbox[1];
            const newX0 = physical.x - dragOffsetX;
            const newY0 = physical.y - dragOffsetY;

            block.bbox = [newX0, newY0, newX0 + w, newY0 + h];
            block.is_modified = true;
            repaintCanvas();
            return;
        }

        // ── Solo hover: ajustar cursor desde el bloque superior ──
        for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (!_isResizeInteractiveBlock(b)) continue;
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
        const blocks = getActiveBlocks();

        if (isMarqueeSelecting) {
            isMarqueeSelecting = false;
            const marquee = selectionMarquee;
            selectionMarquee = null;

            if (marquee && (marquee.x1 - marquee.x0 > 4 || marquee.y1 - marquee.y0 > 4)) {
                const intersected = [];
                blocks.forEach((block, idx) => {
                    const [x0, y0, x1, y1] = block.bbox;
                    if (_rectsIntersect(marquee, { x0, y0, x1, y1 })) {
                        intersected.push(idx);
                    }
                });
                selectedBlockIndices = intersected;
            }

            repaintCanvas();
            updateCleanBgButtonLabel();

            if (selectedBlockIndices.length >= 2) {
                triggerMultiSelectToolbar(blocks, selectedBlockIndices, evt.clientX, evt.clientY);
            } else {
                document.getElementById("multi-toolbar").hidden = true;
            }
            return;
        }

        // Fin de resize
        if (isResizing) {
            isResizing        = false;
            resizeHandle      = null;
            resizeTargetIndex = -1;
            if (dragHasMoved && dragInitialSnapshot) {
                undoStack.push(dragInitialSnapshot);
                if (undoStack.length > MAX_UNDO_SIZE) undoStack.shift();
                redoStack = [];
                _updateUndoRedoUI();
            }
            dragInitialSnapshot = null;
            return;
        }

        // Fin de drag con movimiento
        if (isDragging && dragHasMoved) {
            isDragging       = false;
            dragTargetIndex  = -1;
            clickTargetIndex = -1;
            if (dragInitialSnapshot) {
                undoStack.push(dragInitialSnapshot);
                if (undoStack.length > MAX_UNDO_SIZE) undoStack.shift();
                redoStack = [];
                _updateUndoRedoUI();
            }
            dragInitialSnapshot = null;
            return;
        }

        // Clic limpio: abrir edición inline (si no hubo arrastre)
        if (clickTargetIndex !== -1) {
            currentTargetBlock = blocks[clickTargetIndex] || null;
            document.getElementById("floating-toolbar").hidden = true;
            startInlineBlockEdit(blocks, clickTargetIndex, canvasScope);
            clickTargetIndex = -1;
            isDragging = false;
            dragInitialSnapshot = null;
            return;
        }

        // Clic en el vacío: limpiar selección
        currentTargetBlock = null;
        selectedBlockIndices = [];
        document.getElementById("floating-toolbar").hidden = true;
        document.getElementById("multi-toolbar").hidden = true;
        updateCleanBgButtonLabel();
        _syncEraserToolbarState();
        repaintCanvas();

        isDragging       = false;
        dragTargetIndex  = -1;
        clickTargetIndex = -1;
        dragInitialSnapshot = null;
    });

    canvas.addEventListener("mouseleave", () => {
        isDragging        = false;
        isResizing        = false;
        isMarqueeSelecting = false;
        selectionMarquee = null;
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
    _makeToolbarDraggable("floating-toolbar");
    _makeToolbarDraggable("multi-toolbar");

    // ── Close buttons (opcionales, pueden no existir en el HTML actual) ──
    const tbClose = document.getElementById("tb-close");
    if (tbClose) {
        tbClose.onclick = () => {
            document.getElementById("floating-toolbar").hidden = true;
        };
    }

    // Delete: puede ser "tb-delete" o "tb-btn-delete"
    const tbDelete = document.getElementById("tb-delete") || document.getElementById("tb-btn-delete");
    if (tbDelete) {
        tbDelete.onclick = () => {
            if (!currentTargetBlock) return;
            const ok = window.confirm("¿Eliminar este bloque de texto?");
            if (!ok) return;
            deleteActiveBlocks();
        };
    }
    
    // Save: puede no existir si la edición es inline
    const tbSave = document.getElementById("tb-save");
    if (tbSave) {
        tbSave.onclick = () => {
            if (!currentTargetBlock) return;
            
            // Leer DIRECTAMENTE del DOM sin validación compleja
            const tbText = document.getElementById("tb-text");
            if (tbText) currentTargetBlock.text = tbText.value || "";
            
            const tbColor = document.getElementById("tb-color") || document.getElementById("tb-text-color");
            if (tbColor) currentTargetBlock.text_color = tbColor.value;
            
            const tbBg = document.getElementById("tb-bg") || document.getElementById("tb-bg-color");
            if (tbBg) currentTargetBlock.bg_color = tbBg.value;
            
            const tpCheckbox = document.getElementById("tb-bg-transparent");
            if (tpCheckbox) {
                currentTargetBlock.bg_transparent = !!tpCheckbox.checked;
            }
            
            const tbSize = document.getElementById("tb-size") || document.getElementById("tb-font-size");
            const nextFontSize = parseFloat(tbSize?.value) || 16;
            currentTargetBlock.font_size = nextFontSize;
            
            const tbBold = document.getElementById("tb-bold");
            if (tbBold) currentTargetBlock.is_bold = !!tbBold.checked;
            
            const tbItalic = document.getElementById("tb-italic");
            if (tbItalic) currentTargetBlock.is_italic = !!tbItalic.checked;
            
            const fontSizeChanged = nextFontSize !== currentTargetInitialFontSize;
            currentTargetBlock.font_size_locked = currentTargetInitialFontLock || fontSizeChanged || currentTargetBlock.source === "native";
            
            const fontSelector = document.getElementById("tb-font") || document.getElementById("tb-font-family");
            if (fontSelector) {
                currentTargetBlock.font_family = fontSelector.value;
            }
            
            currentTargetBlock.is_modified = true;
            
            // Alineación
            const alignKeys = ["left", "center", "right"];
            const activeAlign = alignKeys.find(a => document.getElementById(`tb-align-${a}`)?.classList.contains("active")) || "left";
            currentTargetBlock.text_align = activeAlign;
            
            // Guardar en el historial de undo
            saveToUndoStack();
            
            // Ocultar modal y redibujar
            document.getElementById("floating-toolbar").hidden = true;
            cycleViewEngine();
        };
    }

    // ── Multi-toolbar bindings ──
    // `mt-close` y `mt-equalize` no tienen botón equivalente en el HTML actual
    // (`mtb-*`): "Cerrar" y "Igualar Estilos" (tamaño de fuente común) se
    // quedaron fuera del rediseño del panel. Los bindings de abajo no
    // encuentran el elemento y no hacen nada; se dejan documentados en vez de
    // borrados por si se decide reintroducir esos botones más adelante.
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
            text_color:    (document.getElementById("mt-color") || document.getElementById("mtb-text-color"))?.value,
            bg_color:      (document.getElementById("mt-bg") || document.getElementById("mtb-bg-color"))?.value,
            bg_transparent: !!(document.getElementById("mt-bg-transparent") || document.getElementById("mtb-bg-transparent"))?.checked,
            text_align:    activeAlign
        };
        equalizeSelectedFontSize(globalPayload.pages[currentActivePageIndex].blocks, [...selectedBlockIndices], styles);
    };

    // "Fusionar" y "Eliminar seleccionados" sí tienen botón en el HTML actual
    // (`mtb-btn-merge`, `mtb-btn-delete`), pero buscaban el id antiguo
    // (`mt-merge`) o no estaban conectados en absoluto.
    const mtMerge = document.getElementById("mtb-btn-merge");
    if (mtMerge) mtMerge.onclick = () => {
        mergeSelectedBlocks(globalPayload.pages[currentActivePageIndex].blocks, [...selectedBlockIndices]);
    };

    const mtbDelete = document.getElementById("mtb-btn-delete");
    if (mtbDelete) mtbDelete.onclick = () => {
        deleteActiveBlocks();
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
    currentTargetInitialFontLock = !!block.font_size_locked;

    const nonNativeWarning = document.getElementById("tb-warning-non-native");
    if (nonNativeWarning) {
        nonNativeWarning.hidden = block.source === "native";
    }

    const suggestedFontSize = resolveEditableFontSize(block);
    block.font_size = suggestedFontSize;
    currentTargetInitialFontSize = suggestedFontSize;
    
    const toolbar = document.getElementById("floating-toolbar");
    if (!toolbar) return;
    toolbar.hidden = false;
    
    // Posicionar el toolbar
    toolbar.style.transform = "none";
    toolbar.style.left = `${Math.min(domX + window.scrollX + 15, window.innerWidth - 270)}px`;
    toolbar.style.top = `${Math.min(domY + window.scrollY, window.innerHeight + window.scrollY - 250)}px`;
    
    // Rellenar campos — soportar ambos convenios de IDs
    const tbText = document.getElementById("tb-text");
    if (tbText) tbText.value = block.text;
    
    const tbColor = document.getElementById("tb-color") || document.getElementById("tb-text-color");
    if (tbColor) tbColor.value = block.text_color;
    
    const tbBg = document.getElementById("tb-bg") || document.getElementById("tb-bg-color");
    if (tbBg) tbBg.value = block.bg_color;
    
    const tpCheckbox = document.getElementById("tb-bg-transparent");
    if (tpCheckbox) {
        tpCheckbox.checked = !!block.bg_transparent;
    }
    
    const tbSize = document.getElementById("tb-size") || document.getElementById("tb-font-size");
    if (tbSize) tbSize.value = suggestedFontSize;
    
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
    
    const fontSelect = document.getElementById("tb-font") || document.getElementById("tb-font-family");
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

    // El título vive sin `data-i18n` a propósito: ese atributo hace que
    // `applyTranslations()` lo reescriba con la plantilla cruda "{count}"
    // sin sustituir en cada cambio de idioma. Aquí se interpola siempre con
    // el recuento real, que es la única fuente de verdad mientras el panel
    // está abierto.
    const titleEl = document.getElementById("mtb-title");
    if (titleEl) {
        const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
        titleEl.textContent = _t("multi.title", { count: selectedIndices.length });
    }

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

function mountExportControls(fullPayload) {
    const btnExport = document.getElementById("btn-export");
    if (!btnExport) return;

    const exportPdfInput = document.getElementById("export-pdf");
    const exportPptxInput = document.getElementById("export-pptx");
    const exportMdInput = document.getElementById("export-md");
    if (!exportPdfInput || !exportPptxInput || !exportMdInput) return;

    const exportDpiSelect = document.getElementById("export-dpi");
    if (exportDpiSelect) {
        exportDpiSelect.value = String(loadExportDpiPreference());
        exportDpiSelect.addEventListener("change", () => {
            saveExportDpiPreference(Number(exportDpiSelect.value));
        });
    }

    const chkAllEditable = document.getElementById("chk-export-all-editable");
    const warningNote = document.getElementById("export-all-warning-note");

    if (chkAllEditable) {
        chkAllEditable.checked = false;
        chkAllEditable.onchange = () => {
            const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;
            if (chkAllEditable.checked) {
                const confirmed = window.confirm(_t("export.allEditableConfirm"));
                if (!confirmed) {
                    chkAllEditable.checked = false;
                }
            }
            if (warningNote) {
                warningNote.hidden = !chkAllEditable.checked;
            }
        };
    }

    const savedTargets = loadExportTargetsPreference();
    exportPdfInput.checked = !!savedTargets.pdf;
    exportPptxInput.checked = !!savedTargets.pptx;
    exportMdInput.checked = !!savedTargets.md;

    const persistTargets = () => {
        saveExportTargetsPreference({
            pdf: !!exportPdfInput.checked,
            pptx: !!exportPptxInput.checked,
            md: !!exportMdInput.checked
        });
    };

    exportPdfInput.addEventListener("change", persistTargets);
    exportPptxInput.addEventListener("change", persistTargets);
    exportMdInput.addEventListener("change", persistTargets);
    
    // Sobreescritura en caso de llamadas iterativas Paginadas
    btnExport.onclick = async () => {
        const originalText = _getBtnLabel(btnExport);
        const exportPdf = !!exportPdfInput.checked;
        const exportPptx = !!exportPptxInput.checked;
        const exportMd = !!exportMdInput.checked;

        if (!exportPdf && !exportPptx && !exportMd) {
            alert("Selecciona al menos un formato: .pdf, .pptx o .md");
            return;
        }

        const selectedLabels = [
            exportPdf ? "PDF" : null,
            exportPptx ? "PPTX" : null,
            exportMd ? "MD" : null
        ].filter(Boolean).join("/");

        const _t = (k, v) => window.DBV_I18N ? window.DBV_I18N.t(k, v) : k;

        _setBtnLabel(btnExport, _t("export.generating", { labels: selectedLabels }));
        btnExport.disabled = true;
        
        fullPayload.export_mode = (chkAllEditable && chkAllEditable.checked) ? "all_editable" : "only_modified";
        fullPayload.export_targets = {
            pdf: exportPdf,
            pptx: exportPptx,
            md: exportMd
        };
        saveExportTargetsPreference(fullPayload.export_targets);

        const selectedDpi = Number(exportDpiSelect?.value) || EXPORT_DPI_DEFAULT;
        fullPayload.export_dpi = EXPORT_DPI_CHOICES.includes(selectedDpi) ? selectedDpi : EXPORT_DPI_DEFAULT;
        saveExportDpiPreference(fullPayload.export_dpi);
        
        try {
            // Sanitizar payload eliminando bloques de goma efímeros. Copia
            // superficial: las imágenes base64 de cada página se comparten por
            // referencia en lugar de serializarse y volverse a parsear enteras.
            const sanitizedPayload = {
                ...fullPayload,
                pages: fullPayload.pages.map(page => ({
                    ...page,
                    blocks: (page.blocks || []).filter(
                        b => !b.is_eraser && (b.text || "").trim().length > 0
                    )
                }))
            };

            const blob = await window.dbvApi.exportDocument(sanitizedPayload);
            const savedPath = await window.dbvApi.saveBlobToDisk(blob, _t("export.done"));
            if (savedPath && window.dbvApi.runningInTauri) {
                alert(_t("alerts.exportSaved", { path: savedPath }));
            }
        } catch(err) {
            alert(_t("alerts.exportError", { msg: err.message }));
        } finally {
            _setBtnLabel(btnExport, originalText);
            btnExport.disabled = false;
        }
    };
}

/**
 * Vincula atajos de teclado globales (Ctrl+Z, Ctrl+Y).
 */
function mountKeyboardShortcuts() {
    if (_undoShortcutsMounted) return;
    _undoShortcutsMounted = true;
    window.addEventListener("keydown", (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        const activeElement = document.activeElement;
        const tagName = activeElement?.tagName;
        const isTypingContext = activeElement?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA";
        
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

        // P: Alternar modo vista previa limpia (excepto mientras se escribe)
        if (!isCtrl && !e.altKey && !isTypingContext && (e.key === "p" || e.key === "P")) {
            e.preventDefault();
            togglePreviewMode();
        }

        // Supr/Delete: eliminar bloque activo o multiselección (excepto mientras se escribe)
        if (!isCtrl && !isTypingContext && e.key === "Delete") {
            const removed = deleteActiveBlocks();
            if (removed) {
                e.preventDefault();
            }
        }
    });
    
    // Binding visual de botones UI
    const btnUndo = document.getElementById("btn-undo");
    const btnRedo = document.getElementById("btn-redo");
    const btnPreview = document.getElementById("btn-preview-mode");
    const floatingBadge = document.getElementById("preview-floating-badge");

    if (btnUndo) btnUndo.onclick = performUndo;
    if (btnRedo) btnRedo.onclick = performRedo;
    if (btnPreview) btnPreview.onclick = () => togglePreviewMode();
    if (floatingBadge) floatingBadge.onclick = () => togglePreviewMode(false);
}

window.dbvCanvasEngine = {
    initPagination,
    mountKeyboardShortcuts,
    togglePreviewMode,
    performUndo,
    performRedo,
    saveToUndoStack,
    get isPreviewMode() { return isPreviewMode; }
};
})();
