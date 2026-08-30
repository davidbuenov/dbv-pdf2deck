// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// =============================================================================
// Diccionarios ES/EN + helper t(). Sin dependencias (vanilla, patrón IIFE)
// Cargar este script ANTES de los demás scripts en index.html.
// =============================================================================

(() => {
    'use strict';

    const DICT = {
        es: {
            'app.title': 'DBV PDF2Deck | Convierte PDFs en PPTX editables',
            'app.name': 'DBV PDF2Deck',
            'toolbar.newFile': 'Nuevo',
            'toolbar.newFileTitle': 'Cerrar documento actual y volver al panel de carga (Ctrl+N)',
            'toolbar.openFile': 'Abrir',
            'toolbar.openFileTitle': 'Abrir un PDF o una imagen (Ctrl+O)',
            'toolbar.noDoc': 'Sin documento',
            'toolbar.addBox': 'Texto',
            'toolbar.addBoxTitle': 'Añadir un cuadro de texto nuevo',
            'toolbar.eraser': 'Goma',
            'toolbar.eraserTitle': 'Coloca una goma sobre el documento para borrar fondos, marcas de agua o logos',
            'toolbar.eraserClean': 'Borrar zona',
            'toolbar.eraserCleanTitle': 'Borra lo que hay bajo la goma (púlsalo varias veces para refinar)',
            'toolbar.eraserDelete': 'Retirar goma',
            'toolbar.eraserDeleteTitle': 'Retirar la goma del documento',
            'toolbar.undo': 'Deshacer (Ctrl+Z)',
            'toolbar.redo': 'Rehacer (Ctrl+Y)',
            'toolbar.cleanBg': 'Limpiar Fondo',
            'toolbar.cleanBgTitle': 'Limpia el fondo de todos los cuadros de la página actual',
            'toolbar.cleanBgSelection': 'Limpiar selección ({count})',
            'toolbar.cleanBgSelectionTitle': 'Limpia el fondo exclusivamente de los cuadros seleccionados',
            'toolbar.cleanBgCleaning': 'Limpiando fondo…',
            'toolbar.cleanBgCleaningSel': 'Limpiando selección…',
            'toolbar.exportMenu': 'Exportar',
            'toolbar.exportMenuTitle': 'Elegir formatos y descargar',
            'toolbar.alwaysOnTop': 'Fijar la ventana encima del resto',
            'toolbar.alwaysOnTopActive': 'Ventana fijada encima — clic para quitar',
            'toolbar.help': 'Ayuda y guía de uso',
            'help.title': 'Ayuda',
            'help.subtitle': 'Guía completa de DBV PDF2Deck',
            'toolbar.about': 'Acerca de DBV PDF2Deck',
            'toolbar.langToggle': 'EN',
            'toolbar.langToggleTitle': 'Switch to English / Cambiar a inglés',

            'export.title': 'Qué se exporta',
            'export.onlyModified': 'Solo los bloques modificados',
            'export.allEditable': 'Todo el documento editable',
            'export.formats': 'Formatos',
            'export.dpiLabel': 'Calidad del fondo (PPTX)',
            'export.dpiTitle': 'Resolución a la que se re-rasteriza el PDF original para el fondo de cada diapositiva',
            'export.dpiHint': 'Solo afecta al .pptx de documentos PDF. Más DPI = más nitidez y más peso.',
            'export.download': 'Descargar',
            'export.generating': 'Generando {labels}…',
            'export.done': 'Presentacion_Editada_DBV.zip',

            'hint.editor': 'Doble clic en un bloque para editarlo en sitio · <strong>Ctrl</strong>+clic para selección múltiple · arrastra sobre una zona vacía para seleccionar por rectángulo.',

            'upload.heading': 'Carga tu documento o imagen',
            'upload.desc': 'Arrastra una exportación de NotebookLM, una transparencia o una infografía (PDF/PNG/JPG/WEBP). Todo el procesamiento ocurre <strong>100% offline</strong> en tu ordenador.',
            'upload.dropzoneTitle': 'Arrastra aquí tu PDF o tu imagen',
            'upload.dropzoneSubtitle': 'o haz clic para explorar — PDF · PNG · JPG · WEBP',
            'upload.progressHeader': 'Progreso',

            'zoom.out': 'Reducir',
            'zoom.in': 'Ampliar',
            'zoom.reset': 'Ajustar a la ventana',
            'page.indicator': 'Página {current} de {total}',
            'page.prev': 'Página anterior',
            'page.next': 'Página siguiente',
            'page.noBlocks': '⚠️ 0 Bloques OCR en Pág {num}',

            'floating.title': '✏️ Edición Visual',
            'floating.bold': 'Negrita (Ctrl+B)',
            'floating.italic': 'Cursiva (Ctrl+I)',
            'floating.underline': 'Subrayado (Ctrl+U)',
            'floating.fontSize': 'Tamaño',
            'floating.alignLeft': 'Izquierda',
            'floating.alignCenter': 'Centro',
            'floating.alignRight': 'Derecha',
            'floating.textColor': 'Color de texto',
            'floating.bgColor': 'Color de fondo',
            'floating.bgTransparent': 'Fondo transparente',
            'floating.lineSpacing': 'Interlineado',
            'floating.delete': 'Eliminar bloque (Supr)',

            'multi.title': '📐 Multi-Selección ({count} bloques)',
            'multi.alignLeft': 'Alinear Izquierda',
            'multi.alignHCenter': 'Centrar Horiz.',
            'multi.alignRight': 'Alinear Derecha',
            'multi.alignTop': 'Alinear Arriba',
            'multi.alignVCenter': 'Centrar Vert.',
            'multi.alignBottom': 'Alinear Abajo',
            'multi.distribH': 'Distribuir H',
            'multi.distribV': 'Distribuir V',
            'multi.sameWidth': 'Igualar Ancho',
            'multi.sameHeight': 'Igualar Alto',
            'multi.textColor': 'Color texto',
            'multi.bgColor': 'Color fondo',
            'multi.bgTransparent': 'Fondo transparente',
            'multi.merge': '🔗 Fusionar bloques',
            'multi.mergeTitle': 'Fusionar los bloques seleccionados en uno solo',
            'multi.delete': 'Eliminar seleccionados (Supr)',

            'about.title': 'Acerca de DBV PDF2Deck',
            'about.version': 'Versión {version}',
            'about.versionPlaceholder': 'Versión —',
            'about.desc': 'Convierte PDFs e infografías en presentaciones PPTX totalmente editables, con OCR local acelerado por GPU y limpieza de fondos sin salir de tu equipo.',
            'about.checkUpdate': 'Buscar actualizaciones',
            'about.checking': 'Buscando actualizaciones…',
            'about.upToDate': 'Ya tienes la última versión.',
            'about.available': 'Nueva versión {version} disponible.',
            'about.updateBtn': 'Actualizar',
            'about.downloading': 'Descargando e instalando…',
            'about.installed': 'Instalada. Reiniciando…',
            'about.installFailed': 'No se pudo instalar la actualización. Inténtalo de nuevo.',
            'about.checkFailed': 'No se pudo comprobar: revisa tu conexión.',
            'about.store': 'Las actualizaciones se instalan automáticamente desde Microsoft Store.',
            'about.authorLine': 'David Bueno Vallejo · Licencia MIT',
            'about.close': 'Cerrar (Esc)',

            'terminal.uplink': 'Iniciando Uplink. Transfiriendo archivo \'{name}\' (Tamaño: {size} MB)...',
            'terminal.waitingOcr': 'Red conectada. Esperando a motor Offline OCR (Modo Turbo GPU si está disponible)...',
            'terminal.success': '¡ÉXITO TOTAL! {total} páginas recibidas desde el microservicio backend.',
            'terminal.building': 'Módulos cargados exitosamente. Construyendo UI HTML5 Canvas e instanciando motor Exportador...',
            'terminal.fatalCanvas': '[FATAL] El motor Canvas no está disponible.',
            'terminal.abort': '❌ ABORTO DE OPERACIÓN HTTP: {msg}',
            'terminal.backendReady': '✓ Microservicio OCR local listo y respondiendo en el puerto {port}',
            'terminal.backendWait': 'Esperando a que el backend local inicie...',
            'terminal.backendTimeout': 'No se pudo conectar con el microservicio OCR local tras {seconds}s.',

            'alerts.noValidBoxes': 'No hay bloques con coordenadas válidas para limpiar.',
            'alerts.cleanBgError': 'Error al limpiar fondo: {msg}',
            'alerts.eraserError': 'Error al aplicar goma de borrar: {msg}',
            'alerts.exportSaved': 'Exportación guardada en:\n{path}',
            'alerts.exportError': '[Error API]: {msg}'
        },
        en: {
            'app.title': 'DBV PDF2Deck | Convert PDFs to editable PPTX',
            'app.name': 'DBV PDF2Deck',
            'toolbar.newFile': 'New',
            'toolbar.newFileTitle': 'Close current document and return to upload panel (Ctrl+N)',
            'toolbar.openFile': 'Open',
            'toolbar.openFileTitle': 'Open a PDF or an image (Ctrl+O)',
            'toolbar.noDoc': 'No document',
            'toolbar.addBox': 'Text',
            'toolbar.addBoxTitle': 'Add a new text box',
            'toolbar.eraser': 'Eraser',
            'toolbar.eraserTitle': 'Place an eraser over the document to remove backgrounds, watermarks or logos',
            'toolbar.eraserClean': 'Erase area',
            'toolbar.eraserCleanTitle': 'Erase what is under the eraser (click multiple times to refine)',
            'toolbar.eraserDelete': 'Remove eraser',
            'toolbar.eraserDeleteTitle': 'Remove eraser from document',
            'toolbar.undo': 'Undo (Ctrl+Z)',
            'toolbar.redo': 'Redo (Ctrl+Y)',
            'toolbar.cleanBg': 'Clean Background',
            'toolbar.cleanBgTitle': 'Clean background of all boxes on current page',
            'toolbar.cleanBgSelection': 'Clean selection ({count})',
            'toolbar.cleanBgSelectionTitle': 'Clean background exclusively of selected boxes',
            'toolbar.cleanBgCleaning': 'Cleaning background…',
            'toolbar.cleanBgCleaningSel': 'Cleaning selection…',
            'toolbar.exportMenu': 'Export',
            'toolbar.exportMenuTitle': 'Choose formats and download',
            'toolbar.alwaysOnTop': 'Keep window on top',
            'toolbar.alwaysOnTopActive': 'Window pinned on top — click to unpin',
            'toolbar.help': 'Help and user guide',
            'help.title': 'Help',
            'help.subtitle': 'Complete DBV PDF2Deck guide',
            'toolbar.about': 'About DBV PDF2Deck',
            'toolbar.langToggle': 'ES',
            'toolbar.langToggleTitle': 'Cambiar a español / Switch to Spanish',

            'export.title': 'What to export',
            'export.onlyModified': 'Only modified blocks',
            'export.allEditable': 'Entire document editable',
            'export.formats': 'Formats',
            'export.dpiLabel': 'Background quality (PPTX)',
            'export.dpiTitle': 'Resolution used to re-rasterise the original PDF for each slide background',
            'export.dpiHint': 'Only affects .pptx from PDF documents. More DPI = sharper and heavier.',
            'export.download': 'Download',
            'export.generating': 'Generating {labels}…',
            'export.done': 'Edited_Presentation_DBV.zip',

            'hint.editor': 'Double-click a block to edit in place · <strong>Ctrl</strong>+click for multi-selection · drag on an empty area for rectangle selection.',

            'upload.heading': 'Upload your document or image',
            'upload.desc': 'Drag a NotebookLM export, slide or infographic (PDF/PNG/JPG/WEBP). All processing happens <strong>100% offline</strong> on your computer.',
            'upload.dropzoneTitle': 'Drag your PDF or image here',
            'upload.dropzoneSubtitle': 'or click to browse — PDF · PNG · JPG · WEBP',
            'upload.progressHeader': 'Progress',

            'zoom.out': 'Zoom out',
            'zoom.in': 'Zoom in',
            'zoom.reset': 'Fit to window',
            'page.indicator': 'Page {current} of {total}',
            'page.prev': 'Previous page',
            'page.next': 'Next page',
            'page.noBlocks': '⚠️ 0 OCR Blocks on Page {num}',

            'floating.title': '✏️ Visual Editing',
            'floating.bold': 'Bold (Ctrl+B)',
            'floating.italic': 'Italic (Ctrl+I)',
            'floating.underline': 'Underline (Ctrl+U)',
            'floating.fontSize': 'Size',
            'floating.alignLeft': 'Left',
            'floating.alignCenter': 'Center',
            'floating.alignRight': 'Right',
            'floating.textColor': 'Text color',
            'floating.bgColor': 'Background color',
            'floating.bgTransparent': 'Transparent bg',
            'floating.lineSpacing': 'Line spacing',
            'floating.delete': 'Delete block (Del)',

            'multi.title': '📐 Multi-Selection ({count} blocks)',
            'multi.alignLeft': 'Align Left',
            'multi.alignHCenter': 'Center Horiz.',
            'multi.alignRight': 'Align Right',
            'multi.alignTop': 'Align Top',
            'multi.alignVCenter': 'Center Vert.',
            'multi.alignBottom': 'Align Bottom',
            'multi.distribH': 'Distribute H',
            'multi.distribV': 'Distribute V',
            'multi.sameWidth': 'Match Width',
            'multi.sameHeight': 'Match Height',
            'multi.textColor': 'Text color',
            'multi.bgColor': 'Background color',
            'multi.bgTransparent': 'Transparent bg',
            'multi.merge': '🔗 Merge blocks',
            'multi.mergeTitle': 'Merge the selected blocks into one',
            'multi.delete': 'Delete selected (Del)',

            'about.title': 'About DBV PDF2Deck',
            'about.version': 'Version {version}',
            'about.versionPlaceholder': 'Version —',
            'about.desc': 'Converts PDFs and infographics into fully editable PPTX presentations, with GPU-accelerated local OCR and background cleaning directly on your device.',
            'about.checkUpdate': 'Check for updates',
            'about.checking': 'Checking for updates…',
            'about.upToDate': 'You have the latest version.',
            'about.available': 'New version {version} available.',
            'about.updateBtn': 'Update',
            'about.downloading': 'Downloading and installing…',
            'about.installed': 'Installed. Restarting…',
            'about.installFailed': 'Could not install the update. Please try again.',
            'about.checkFailed': 'Could not check: check your connection.',
            'about.store': 'Updates are installed automatically from Microsoft Store.',
            'about.authorLine': 'David Bueno Vallejo · MIT License',
            'about.close': 'Close (Esc)',

            'terminal.uplink': 'Starting Uplink. Transferring file \'{name}\' (Size: {size} MB)...',
            'terminal.waitingOcr': 'Network connected. Waiting for Offline OCR engine (Turbo GPU mode if available)...',
            'terminal.success': 'SUCCESS! {total} pages received from the backend microservice.',
            'terminal.building': 'Modules loaded successfully. Building HTML5 Canvas UI and instantiating Exporter engine...',
            'terminal.fatalCanvas': '[FATAL] Canvas engine is not available.',
            'terminal.abort': '❌ HTTP OPERATION ABORTED: {msg}',
            'terminal.backendReady': '✓ Local OCR microservice ready and responding on port {port}',
            'terminal.backendWait': 'Waiting for local backend to start...',
            'terminal.backendTimeout': 'Could not connect to local OCR microservice after {seconds}s.',

            'alerts.noValidBoxes': 'No boxes with valid coordinates to clean.',
            'alerts.cleanBgError': 'Error cleaning background: {msg}',
            'alerts.eraserError': 'Error applying eraser: {msg}',
            'alerts.exportSaved': 'Export saved to:\n{path}',
            'alerts.exportError': '[API Error]: {msg}'
        }
    };

    const STORAGE_KEY = 'dbv_pdf2deck_lang';
    let currentLang = null;

    function detectLang() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'es' || saved === 'en') return saved;
        const nav = (navigator.language || 'es').toLowerCase();
        return nav.startsWith('en') ? 'en' : 'es';
    }

    function t(key, vars) {
        const lang = currentLang || detectLang();
        let str = (DICT[lang] && DICT[lang][key]) || DICT.es[key] || key;
        if (vars && typeof vars === 'object') {
            Object.keys(vars).forEach(k => {
                str = str.replaceAll(`{${k}}`, vars[k]);
            });
        }
        return str;
    }

    function applyTranslations() {
        const lang = getLang();
        document.documentElement.setAttribute('lang', lang);

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (key) {
                // If element has inner icon/slot like .btn-txt, translate only .btn-txt
                const slot = el.querySelector('.btn-txt');
                if (slot) {
                    slot.textContent = t(key);
                } else {
                    el.textContent = t(key);
                }
            }
        });

        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (key) el.innerHTML = t(key);
        });

        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (key) el.title = t(key);
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (key) el.placeholder = t(key);
        });

        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            if (key) el.setAttribute('aria-label', t(key));
        });

        // Update document title if present
        if (DICT[lang] && DICT[lang]['app.title']) {
            document.title = DICT[lang]['app.title'];
        }
    }

    function setLang(lang) {
        if (lang !== 'es' && lang !== 'en') return;
        currentLang = lang;
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            // ignore storage restrictions
        }
        applyTranslations();
        document.dispatchEvent(new CustomEvent('dbv-lang-changed', { detail: { lang } }));
    }

    function toggleLang() {
        const next = getLang() === 'es' ? 'en' : 'es';
        setLang(next);
        return next;
    }

    function getLang() {
        return currentLang || detectLang();
    }

    // Auto-inicializar al cargar
    currentLang = detectLang();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyTranslations);
    } else {
        applyTranslations();
    }

    window.DBV_I18N = {
        t,
        setLang,
        getLang,
        toggleLang,
        applyTranslations
    };
})();
