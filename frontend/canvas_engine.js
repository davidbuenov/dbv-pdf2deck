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
const EXPORT_TARGETS_STORAGE_KEY = "dbv_export_targets_v1";
const INLINE_EDIT_BG_MODE_STORAGE_KEY = "dbv_inline_edit_bg_mode_v1";
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

function _isResizeInteractiveBlock(block) {
    if (!block) return false;
    return !!block.is_modified || block === currentTargetBlock || block === inlineEditorSession?.block;
}

// Variables reactivas de estado (Toolbar UI)
let currentTargetBlock = null;
let currentCanvasCtx = null;
let currentTargetInitialFontSize = null;
let currentTargetInitialFontLock = false;
let selectionMarquee = null;
let inlineEditorSession = null;
let inlineEditOpaqueMode = true;
let inlineToolbarPointerDown = false;

function _inlineToolbarElement() {
    const toolbar = document.getElementById("inline-toolbar");
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

function _ensureInlineEditorElement() {
    const wrapper = document.getElementById("canvas-wrapper");
    if (!wrapper) return null;

    let editor = document.getElementById("inline-block-editor");
    if (!editor) {
        editor = document.createElement("div");
        editor.id = "inline-block-editor";
        editor.className = "inline-block-editor";
        editor.contentEditable = "true";
        editor.hidden = true;
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
        left: (canvasRect.left - wrapperRect.left) + (x0 * scaleX),
        top: (canvasRect.top - wrapperRect.top) + (y0 * scaleY),
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
    if (toolbar && !toolbar.hidden) {
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

    const { editor, block, originalText, ctxScope } = inlineEditorSession;
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

    paintCanvasLayers(ctxScope.ctx, ctxScope.canvas, ctxScope.bgImage, ctxScope.blocks);
}

function startInlineBlockEdit(blocks, targetIndex, ctxScope) {
    const block = blocks[targetIndex];
    if (!block) return;
    currentTargetBlock = block;

    const editor = _ensureInlineEditorElement();
    if (!editor) return;

    if (inlineEditorSession) {
        _closeInlineEditor(true);
    }

    document.getElementById("floating-toolbar").hidden = true;
    document.getElementById("multi-toolbar").hidden = true;

    _bindInlineToolbarEvents();
    const toolbar = _inlineToolbarElement();
    if (toolbar) {
        toolbar.hidden = false;
    }

    editor.hidden = false;
    editor.textContent = block.text || "";

    inlineEditorSession = {
        editor,
        block,
        originalText: block.text || "",
        canvas: ctxScope.canvas,
        ctxScope: {
            ctx: ctxScope.ctx,
            canvas: ctxScope.canvas,
            bgImage: ctxScope.bgImage,
            blocks
        }
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

    const indicators = [document.getElementById("zoom-indicator"), document.getElementById("zoom-indicator-top")];
    indicators.forEach(ind => { 
        if (ind) ind.textContent = `${Math.round(zoom * 100)}%`; 
    });

    _positionInlineEditor();
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
    
    // Lógica para ✨ Limpiar Fondo
    const btnCleanBg = document.getElementById("btn-clean-bg");
    if (btnCleanBg) {
        btnCleanBg.onclick = async () => {
            const key = document.getElementById("ai-api-key")?.value?.trim();
            const selectedMode = cleanModeSelect?.value || "auto";
            const useCloud = selectedMode === "cloud" || (selectedMode === "auto" && !!key);

            if (selectedMode === "cloud" && !key) {
                alert("Modo Cloud seleccionado, pero no hay API Key. Añádela o cambia a Local/Auto.");
                return;
            }
            
            const originalText = btnCleanBg.textContent;
            btnCleanBg.textContent = useCloud ? "⏳ Limpiando en AI Studio..." : "⏳ Limpiando localmente...";
            btnCleanBg.disabled = true;
            
            const currentPage = globalPayload.pages[currentActivePageIndex];
            
            try {
                const endpoint = useCloud
                    ? "http://localhost:8000/api/v1/clean-background"
                    : "http://localhost:8000/api/v1/clean-background-local";

                const localBoxes = (currentPage.blocks || [])
                    .filter(b => Array.isArray(b.bbox) && b.bbox.length === 4)
                    .map(b => ({ bbox: b.bbox }));

                if (!useCloud && localBoxes.length === 0) {
                    throw new Error("No hay bloques con coordenadas para limpiar en modo local.");
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

                const resp = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
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
                alert(`Error al limpiar fondo: ${err.message}`);
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
    _closeInlineEditor(true);

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
    selectionMarquee = null;
    
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
        const isInlineEditingBlock = inlineEditorSession?.block === block;
        const [x0, y0, x1, y1] = block.bbox;
        const width = x1 - x0;
        const height = y1 - y0;
        
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
            
            if (!isInlineEditingBlock) {
                ctx.font = "bold 14px system-ui";
                ctx.textBaseline = "bottom";
                const singleLineText = (block.text || "").replace(/\n/g, ' ');
                const measurements = ctx.measureText(singleLineText);
                
                ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
                ctx.fillRect(x0, y0 - 24, Math.min(width, measurements.width + 12), 24);
                ctx.fillStyle = "#1a202c";
                ctx.fillText(singleLineText, x0 + 6, y0 - 6);
            }

            // Bloque no modificado pero seleccionado: mostrar handles para facilitar resize.
            if (_isResizeInteractiveBlock(block)) {
                ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
                ctx.lineWidth = 1;
                ctx.strokeRect(x0, y0, width, height);
                drawResizeHandles(ctx, block.bbox);
            }
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

function mountInteractionLayer(canvas, ctx, bgImage, blocks) {
    let isDragging   = false;
    let isResizing   = false;
    let isMarqueeSelecting = false;
    let dragHasMoved = false;

    let dragTargetIndex   = -1;
    let resizeTargetIndex = -1;
    let clickTargetIndex  = -1;
    let resizeHandle      = null;

    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    const MIN_BLOCK = 20; // tamaño mínimo en px al redimensionar

    function getPhysicalCoords(evt) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (canvas.width / rect.width),
            y: (evt.clientY - rect.top)  * (canvas.height / rect.height)
        };
    }

    canvas.addEventListener("dblclick", (evt) => {
        if (evt.button !== 0) return;
        const physical = getPhysicalCoords(evt);
        const clickedIdx = blocks.findIndex(block => {
            const [x0, y0, x1, y1] = block.bbox;
            return (physical.x >= x0 && physical.x <= x1 && physical.y >= y0 && physical.y <= y1);
        });
        if (clickedIdx !== -1) {
            startInlineBlockEdit(blocks, clickedIdx, { ctx, canvas, bgImage });
        }
    });

    canvas.addEventListener("mousedown", (evt) => {
        if (evt.button !== 0) return;

        if (inlineEditorSession) {
            _closeInlineEditor(true);
        }

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

        // Clic normal: si hay multi-selección activa, limpiarla y continuar evaluación
        if (selectedBlockIndices.length > 0 && !evt.ctrlKey) {
            selectedBlockIndices = [];
            document.getElementById("multi-toolbar").hidden = true;
            paintCanvasLayers(ctx, canvas, bgImage, blocks);
        }

        // 1. Comprobar handles de resize (bloques modificados o bloque seleccionado)
        for (let i = 0; i < blocks.length; i++) {
            if (!_isResizeInteractiveBlock(blocks[i])) continue;
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
        const physical = getPhysicalCoords(evt);

        if (isMarqueeSelecting) {
            dragHasMoved = true;
            selectionMarquee = {
                x0: Math.min(marqueeStartX, physical.x),
                y0: Math.min(marqueeStartY, physical.y),
                x1: Math.max(marqueeStartX, physical.x),
                y1: Math.max(marqueeStartY, physical.y)
            };
            paintCanvasLayers(ctx, canvas, bgImage, blocks);
            canvas.style.cursor = "crosshair";
            return;
        }

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

            paintCanvasLayers(ctx, canvas, bgImage, blocks);

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

        // Clic limpio: abrir edición inline (si no hubo arrastre)
        if (clickTargetIndex !== -1) {
            currentTargetBlock = blocks[clickTargetIndex] || null;
            document.getElementById("floating-toolbar").hidden = true;
            startInlineBlockEdit(blocks, clickTargetIndex, { ctx, canvas, bgImage });
        }

        isDragging       = false;
        dragTargetIndex  = -1;
        clickTargetIndex = -1;
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

    document.getElementById("tb-close").onclick = () => {
        document.getElementById("floating-toolbar").hidden = true;
    };

    const tbDelete = document.getElementById("tb-delete");
    if (tbDelete) {
        tbDelete.onclick = () => {
            if (!currentTargetBlock) return;
            const ok = window.confirm("¿Eliminar este bloque de texto?");
            if (!ok) return;
            deleteActiveBlocks();
        };
    }
    
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

    const exportPdfInput = document.getElementById("export-pdf");
    const exportPptxInput = document.getElementById("export-pptx");
    const exportMdInput = document.getElementById("export-md");
    if (!exportPdfInput || !exportPptxInput || !exportMdInput) return;

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
        const originalText = btnExport.textContent;
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

        btnExport.textContent = `⏳ Generando ${selectedLabels}...`;
        btnExport.disabled = true;
        
        const exportModeSelect = document.getElementById("export-mode-select");
        if (exportModeSelect) {
            fullPayload.export_mode = exportModeSelect.value;
        }
        fullPayload.export_targets = {
            pdf: exportPdf,
            pptx: exportPptx,
            md: exportMd
        };
        saveExportTargetsPreference(fullPayload.export_targets);
        
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
            a.remove();
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
    if (btnUndo) btnUndo.onclick = performUndo;
    if (btnRedo) btnRedo.onclick = performRedo;
}
