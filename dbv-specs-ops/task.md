# Backlog - DBV PDF2Deck

> Adoptado el 2026-08-28 desde `docs_david/TASKS.md` (última actualización 2026-04-01) y
> `MIGRACION_ESCRITORIO.md`. **Este fichero es ahora la única fuente de verdad.**
> `docs_david/` queda como histórico y está fuera de git.

## Contexto del Proyecto (Context Snapshot)

* **Objetivo**: DBV PDF2Deck en modo dual (web + escritorio nativo con Tauri v2) con OCR local (EasyOCR + GPU CUDA), sustitución completa de PyMuPDF (AGPL-3.0) por PDFium/ReportLab/pypdf (licencias permisivas MIT-compatibles), y motor de Inpainting local con OpenCV.
* **Estado actual**: 
  - **PyMuPDF 100% erradicado**: Backend migrado a `pypdfium2`, `reportlab` y `pypdf`. Arnés de 41 tests unitarios pasando al 100% (`41 passed`).
  - **EasyOCR + GPU CUDA activo**: Entorno oficial `backend/venv` configurado con todas las librerías necesarias y funcionando a pleno rendimiento.
  - **Limpieza de fondo selectiva + Goma Mágica (Inpaint Eraser)**: Implementada limpieza quirúrgica sobre bloques seleccionados y herramienta interactiva `🧹 Goma` con inpainting reiterativo local de OpenCV.
  - **Tauri v2 Sidecar**: reescrito el 2026-08-30 tras descubrir que nunca había funcionado en ejecución real (ver Fase 6). Viaja como carpeta `--onedir` en `src-tauri/sidecar/` (recurso de Tauri), no como `.exe` único. Verificado de extremo a extremo en Windows local.
  - **Shell de escritorio rediseñado (2026-08-29)**: barra superior nativa de 48 px con las herramientas
    dentro (mismo esqueleto que DBV Markdown Reader), chincheta *always-on-top*, modal «Acerca de» con
    versión, menú de exportación, barra de estado y scrollbars tematizadas. La Goma Mágica se dibuja
    como una goma de nata sobre el documento y sus acciones viven en la barra. Diseño previo aprobado en
    el lienzo `PDF2Deck Escritorio`. El modo web sigue intacto: lo único exclusivo de escritorio es la
    chincheta.
  - **Auto-actualización cableada (2026-08-29)**: `tauri-plugin-updater` + clave minisign propia,
    botón «Buscar actualizaciones» en Acerca de, `is_packaged_app()` para ocultarlo en instalaciones de
    tienda. Detalle completo en «🔄 Auto-actualización y canales de distribución» más abajo — **sin
    ejercitar todavía**: faltan los secretos en GitHub y un tag de prueba.
  - **Corrección de Canvas en Blanco / ReferenceError `bindDualPage` y dimensiones `safeCanvas` (2026-08-29)**: Se eliminó el error tipográfico `bindDualPage` en `canvas_engine.js` que abortaba la inicialización de paginación antes de pintar el lienzo, y se asignaron dimensiones explícitas al clon del canvas para respetar el tamaño natural de la imagen en lugar del default de 300×150 px.
  - **Internacionalización ES/EN implementada (2026-08-29)**: Creado `frontend/i18n.js` con el patrón probado de `dbv-md-reader` (Vanilla JS + IIFE + `data-i18n` + `window.DBV_I18N`), selector de idioma `EN | ES` en la barra superior y persistencia en `localStorage`.
  - **Simplificación de Barra Superior, Espera Resiliente de Arranque OCR y Modo GPU/CPU (2026-08-30)**:
    - *Barra superior*: Se eliminó el texto redundante `DBV PDF2Deck` y el botón superfluo `Abrir` para dejar un espacio limpio y despejado. Se blindó el layout con `flex-shrink: 0` y espaciados dinámicos para evitar que *"Vista previa"* y *"Exportar"* puedan solaparse jamás.
    - *Espera resiliente de arranque OCR*: Ahora el usuario puede arrastrar o abrir documentos en el segundo cero sin bloqueos ni errores `Failed to fetch`. El cliente espera automáticamente con `waitForBackendReady()` a que el servidor termine de inicializar el modelo OCR antes de lanzar el análisis, informando en la consola en tiempo real.
    - *Telemetría de Aceleración*: El endpoint `/health` y la barra de estado inferior ahora detectan e informan explícitamente si el motor OCR está operando en `Modo Turbo GPU` (aceleración CUDA) o `Modo CPU`.
  - **Corrección de Sincronización de Punteros en Deshacer y Calibración WYSIWYG de Fuentes OCR (2026-08-30)**:
    - *Causa del desajuste visual de fuentes*: En el backend (`ocr_engine.py`), la función `_estimate_font_size_from_bbox` tenía un tope artificial fijo de `min(96.0, ...)`. En títulos grandes escaneados a 200 DPI con altura de línea de ~276px, el cálculo tipográfico real (~215px) quedaba capado a 96px, que al trasladarse al espacio del lienzo a 100 DPI (`scale = 0.50`) se convertía en apenas `48.012 px`. Al abrir el editor inline, el input mostraba `48`, el editor se renderizaba a la mitad del tamaño visual original y, si el usuario subía un punto a `49`, el texto se bloqueaba a ese tamaño diminuto, encogiéndose en el lienzo final.
    - *Solución*:
      1. Se eliminó el tope artificial de 96px en `_estimate_font_size_from_bbox` elevando el rango admitido hasta 400px (soporte de tipografías de gran formato, carteles y títulos destacados). Para *"El Director de IA"*, el backend ahora calcula `font_size = 107.67 px` (78% de la altura de la caja de 138px).
      2. Se unificó `resolveEditableFontSize` en `frontend/canvas_engine.js` para usar el mismo tamaño visual exacto en el editor inline (`_positionInlineEditor`), en el input numérico (`_syncInlineToolbarFromBlock` redondeado) y en el renderizado del lienzo (`paintCanvasLayers`). Ahora el tamaño original, el tamaño de edición inline y el resultado tras editar coinciden de forma 100% WYSIWYG.
  - **Protección y Guía de Exportación (Modo Avanzado Desaconsejado con Confirmación) (2026-08-30)**:
    - Se fijó como estándar activo por defecto `Solo bloques modificados (Recomendado)` para garantizar máxima nitidez y fidelidad original pixel-perfect.
    - La opción `all_editable` se transformó en un checkbox opt-in claramente etiquetado como `Exportar todo el texto editable (Desaconsejado)`. Al marcarlo, se despliega un diálogo modal de confirmación advirtiendo del riesgo de solapamiento OCR y se muestra una nota visual ámbar de aviso en el menú.
  - **Corrección y Soporte Completo de Deshacer (Undo / Redo) con Goma y Limpieza de Fondo (2026-08-30)**:
    - *Causa*: `saveToUndoStack()` se llamaba *después* de que la API de inpainting ya hubiera limpiado la imagen, por lo que el snapshot guardado contenía la imagen ya borrada. Además, la función `replaceCanvasBackground()` no estaba implementada, lo que impedía restaurar el buffer gráfico del lienzo tras deshacer una limpieza ráster.
    - *Solución*: Se implementó el sistema de snapshots profundos por página (`blocks` + `image_base64` + `ai_cleaned_bg`), asegurando que `saveToUndoStack()` se invoque estrictamente *antes* de cualquier llamada de inpainting, borrado de goma, redimensionado, movimiento o edición de texto. Se añadió `replaceCanvasBackground()` para hot-swapping instantáneo de fondos de canvas y sincronización de estado de botones `btn-undo` y `btn-redo`.
  - **Funcionalidad de Vista Previa Limpia / Preview Mode (2026-08-30)**:
    - Diseñado e implementado el botón de vista previa `👁️ Vista previa` (`#btn-preview-mode` / atajo `P`) en la barra de herramientas y badge flotante interactivo (`#preview-floating-badge`).
    - En modo preview se ocultan todas las cajas de detección azules, bordes verdes, tiradores de redimensión, gomas de borrar y herramientas flotantes, permitiendo ver el documento o diapositiva exactamente con su aspecto final de exportación (WYSIWYG puro). Al hacer clic o pulsar `P` se regresa al modo de edición.
    - Soporte bilingüe ES / EN en `frontend/i18n.js`.
    - *Causa*: En `_build_pdf_export_from_original_reportlab`, cuando una página no tenía modificaciones en modo `only_modified` y no tenía fondo IA, `_reportlab_image_overlay` no emitía página al canvas de ReportLab, produciendo un buffer vacío y un `IndexError` al intentar fusionar `overlay.pages[0]`.
    - *Solución*: Se añadió `canvas.showPage()` garantizado en `_reportlab_image_overlay`, validación `if overlay_reader.pages:`, y un bypass directo que preserva la página original intacta sin tocarla si no tiene modificaciones. Test añadido en `test_exporter_pipeline.py` (45 tests pasando al 100%).
  - **Corrección de Fusión Horizontal OCR y Etiqueta Invasiva de Canvas (2026-08-30)**:
    1. *Fusión OCR (Causa Raíz Resuelta)*: Se identificó y resolvió el bug donde `fragment.x0 - line.x1 <= gap` producía números negativos grandes cuando los fragmentos llegaban con ligeras variaciones de $Y$ (fragmento derecho procesado antes que el izquierdo), provocando que una línea absorbiera todo el ancho de la pantalla (`-604px <= gap`). Se introdujo validación direccional estricta (`fragment.x0 >= line.x1` o `fragment.x1 <= line.x0`) y restricción de disparidad de anchos en párrafos (`width_ratio <= 2.0`). Validado sobre `ICU-Storytelia.pdf` pasando de 43 bloques fusionados erróneamente a 64 bloques atómicos limpios por columna/tarjeta. Suite de 44 tests pasando al 100% (`backend/tests/test_ocr_fusion.py`).
    2. *Posicionamiento de Edición con Scroll*: Corregido `_blockCssRect` en `frontend/canvas_engine.js` sumando `wrapper.scrollTop` y `wrapper.scrollLeft`, eliminando el desfase donde el editor `#inline-block-editor` saltaba a la parte superior de la ventana al editar bloques con scroll vertical activo.
    3. *UI Canvas*: Eliminada la franja superior oscura invasiva `_drawDetectionLabel` al seleccionar bloques en `frontend/canvas_engine.js`.
  - **Flujo Nuevo / Abrir Documento (2026-08-29)**: Botón «Nuevo» (`#btn-new-file` / `Ctrl+N`) para volver al panel de carga/drag & drop y botón «Abrir» (`#btn-open-file` / `Ctrl+O`) para abrir el selector de archivos del sistema directamente.
  - **Capturas Oficiales y Material Gráfico de Tienda Completados (2026-08-30)**:
    - Generadas portadas Hero Banner promocionales de alta resolución en `docs/assets/store/` (`hero_featured_banner_es.jpg` y `hero_featured_banner_en.jpg`) integrando título `DBV PDF2Deck`, subtítulo de propuesta de valor y badge *«100% Local OCR · Zero-Cloud Privacy»*.
    - Automatizada la captura directa de la **aplicación de escritorio nativa (Tauri v2 / WebView2)** a 1920×1080 (Full HD Pixel-Perfect) tanto en español como en inglés:
      1. `01_hero_welcome_*.png`: Bienvenida, dropzone y barra de estado con detección Turbo GPU (CUDA).
      2. `02_canvas_editor_wysiwyg_*.png`: Editor visual en canvas con bloques OCR inteligentes y editor inline activo.
      3. `03_magic_eraser_inpainting_*.png`: Herramienta interactiva Goma Mágica e Inpainting local de OpenCV.
      4. `04_preview_mode_clean_*.png`: Modo Vista Previa limpio (WYSIWYG puro sin rectángulos de selección).
      5. `05_export_modal_powerpoint_*.png`: Menú de exportación desplegado con opciones PPTX (150–600 DPI), PDF vectorial y Markdown.
    - Sincronizadas las fichas `descripcionStore_es.md`, `descripcionStore_en.md`, `descripcionStoreUptoDown_es.md`, `descripcionStoreUptoDown_en.md` y `README.md` a la versión **2.0.0** con la galería de assets completa.
    - Generadas versiones PNG sin pérdidas de los banners promocionales (`hero_featured_banner_*.png` en 1376×768 y 1920×1080) para Microsoft Store.
    - Creados los documentos oficiales de política de privacidad bilingües (`privacidad.html` y `privacy.html`) con diseño responsivo oscuro Zero-Cloud Privacy y desplegados en GitHub Pages.
  - **🚀 Envío a la Tienda Completado (2026-08-30)**: Paquete MSIX v2.0.0, metadatos, assets promocionales, capturas nativas y directivas de privacidad enviados con éxito a **Microsoft Partner Center** para su certificación y publicación en Microsoft Store.
  - **📦 v2.0.0 publicada en GitHub Releases (2026-08-30/31, borrador `v2.0.0`)**: los tres workflows de
    release corrieron de verdad por primera vez y revelaron (y se corrigieron) varios fallos que ningún
    `cargo check` ni build de CI sin ejecución podía detectar — detalle completo en «🖥️ Migración a
    escritorio» (Fase 6/8) y en `memory.md`. Estado por plataforma:
    - **Windows**: `.exe` (NSIS) y `.msi` firmados, publicados. Verificado de extremo a extremo en local
      (la app real arranca, EasyOCR carga, `/health` responde).
    - **macOS**: `.dmg`/`.app.tar.gz` (solo Apple Silicon, `aarch64-apple-darwin`) publicados. Build
      verde en CI, **sin verificar en un Mac real todavía** — ni el sidecar en ejecución ni el menú
      nativo (`mod macos_menu`).
    - **Linux**: pendiente de re-lanzar tras arreglar un `.rpm` que se quedaba colgado 30-40 min sin
      log (ver Fase 8). `.deb`/`.AppImage` sin verificar en ejecución real.
    - **Siguiente hito de esta zona**: pruebas reales de usuario en macOS y Linux (instalar el paquete
      publicado, no solo compilarlo) antes de anunciar la v2.0.0 como estable en esas dos plataformas.

---

## ✅ Bug crítico cerrado — exportación OCR ilegible

> Heredado de `docs_david/TASKS.md` (2026-04-01). Cerrado el 2026-08-28 con exportación basada en
> reportlab+pypdf y pruebas de texto extraíble.

**Contexto**: con un PDF de NotebookLM (solo imagen), EasyOCR detecta ~50 bloques correctamente y la
edición en canvas funciona bien. **El fallo es exclusivamente en la exportación.**

**Síntomas**:
- **PPTX**: texto muy pequeño, rectángulos blancos opacos tapando la imagen de fondo, texto truncado.
- **PDF**: texto invisible — `insert_textbox` de PyMuPDF no renderiza nada cuando el texto no cabe
  en el rect, y lo descarta **en silencio**.

**Causa raíz**: se dibuja rectángulo opaco + texto reinsertado para CADA bloque OCR. Eso (1) tapa la
imagen de fondo que ya muestra el texto correctamente, (2) usa un `font_size` estimado impreciso
(`ocr_engine.py:105`, `bbox_height * 0.76` acotado a [10, 96] — nunca fue el tamaño real), y (3) no
verifica el retorno de `insert_textbox`.

- [x] Cerrar el bug de exportación OCR en `backend/core/exporter_engine.py`: PDF vectorial con ajuste
  automático de tamaño, reporte de sobrante y texto verificablemente extraíble.
- [x] Bloques NO modificados: textbox de texto seleccionable **sin** rectángulo de fondo. La imagen
      ya aporta lo visual. (Estrategia híbrida, opción F del antiguo `STATUS.md`.)
- [x] Bloques `is_modified=true`: rectángulo opaco (cinta correctora) + texto nuevo con estilo editado.
- [x] Verificar el sobrante de texto y reducir el tamaño hasta que quepa, registrando cualquier sobrante
  residual en el logger en vez de descartarlo silenciosamente.
- [ ] Validar con el PDF de NotebookLM en export PDF y PPTX.

> 💡 **Se resuelve solo si se hace en el orden correcto.** El sustituto de `insert_textbox` probado en
> el spike (`docs_david/spikes_pymupdf/write_probe.py`) **dibuja lo que cabe y devuelve lo sobrante**
> en lugar de descartarlo. Medido: caja apretada → 1 línea dibujada + 4 reportadas; PyMuPDF ahí no
> dibuja nada. Es decir: **arreglar este bug y sustituir PyMuPDF son el mismo trabajo.**

---

## 🖥️ Migración a escritorio (Tauri v2) — prioridad actual

Procedimiento: `MIGRATION_PROMPT.md` de `dbv-tauri-starter`. Contexto y decisiones ya tomadas en
`MIGRACION_ESCRITORIO.md` (raíz del repo).

- [x] **Fase 0** — Clasificación: **arquetipo D** (backend Python pesado). Verificado sobre código real.
- [x] **Fase 1.1** — Auditoría de licencias: PyMuPDF es AGPL-3.0, única pieza copyleft del inventario.
- [x] **Fase 1.2** — Modo dual (web + escritorio), coherente con el resto del portfolio.
- [x] **Fase 1.3** — Backend como **sidecar** Python (no reescritura en Rust): `easyocr` es la razón de
      ser de la app y no tiene equivalente maduro en Rust.
- [x] **Fase 2.1** — Rama `feat/tauri-desktop` creada desde árbol limpio.
- [x] **Fase 2.2** — Framework dbv-specs-ops v2.7.0 adoptado (adopción nueva, no upgrade).
- [x] **Fase 3** — Artefactos de la plantilla e identidad de la app. Scaffold Tauri v2, workflows de
  release para Windows/Linux/macOS y `package.json` mínimo incorporados; identidad configurada como
  DBV PDF2Deck (`com.davidbuenov.dbv-pdf2deck`). No había tags previos que colisionasen.
- [x] **Fase 4** — Frontend, arquetipo sin bundler. `main.js` y `canvas_engine.js` encapsulados en IIFE;
  el motor expone únicamente `window.dbvCanvasEngine` y `index.html` carga los scripts clásicos en orden.
  `frontendDist` apunta a `frontend/`.
- [x] **Fase 5** — Capa de adaptación `frontend/api.js`: concentra proceso, SSE, limpieza y exportación;
  detecta Tauri mediante `runningInTauri`. El transporte sigue siendo HTTP local en ambos modos hasta
  la incorporación del sidecar y el puerto dinámico en Fase 6.
- [x] **Fase 6** — Sidecar Python (PyInstaller) + asistente de primer arranque para el entorno de OCR.
  Base preparada y ejecutada. Detección, monitor de reintentos de salud dinámico en `frontend/api.js` y
  `frontend/main.js`, CORS universal local en `backend/main.py` y streaming de logs del sidecar en
  `src-tauri/src/lib.rs`.
  - **Reescrito de raíz (2026-08-30): el sidecar nunca había funcionado en ejecución real.**
    `cargo check` solo compila Rust, nunca ejecutó el `.exe` de Python — el primer intento real de
    `/ship` de la v2.0.0 reveló que se caía al arrancar en cualquier máquina. Dos causas distintas,
    encontradas en cadena:
    1. **`--onefile` de PyInstaller no es viable aquí.** El `.exe` compilaba y "funcionaba" en CI (que
       nunca lo ejecuta), pero se caía siempre al arrancar en ejecución real. Migrado a `--onedir`: el
       sidecar ahora viaja como carpeta (`src-tauri/sidecar/`, recurso de Tauri vía `bundle.resources`),
       no como `externalBin` de un solo fichero. `src-tauri/src/lib.rs` resuelve la ruta con
       `app.path().resource_dir()` y lanza con `app.shell().command(...)` en vez de `.sidecar(...)`.
    2. **La causa raíz real** (Visor de sucesos de Windows, no el mensaje de Python): `OSError` al
       cargar `c10.dll` con código `0xc0000005` dentro de `msvcp140.dll` — alguna dependencia (torch/
       numpy/opencv...) vendoriza su propia copia del runtime de Visual C++ (v14.16.27033.0, de 2019),
       PyInstaller la coloca en `_internal/` donde el orden de búsqueda de DLL de Windows la encuentra
       **antes** que la del sistema (más nueva, v14.51, ya presente), y esa copia vieja revienta al
       inicializarse junto al resto de DLL nativas del paquete. Fix: `packaging/build_sidecar.py` borra
       `msvcp140.dll`/`vcruntime140.dll`/`vcruntime140_1.dll` del paquete tras el build, dejando que la
       resolución de DLL caiga sola al `system32`. **Verificado de extremo a extremo** con la app real
       de Tauri compilada en local (Windows): EasyOCR carga y `/health` responde `ocr_ready: true`.
       Sin verificar todavía en Linux/macOS (no hay máquinas aquí para probarlo).
- [ ] **Fase 7** — Verificación ejecutando el binario real + DoD de Experiencia de Escritorio (6 criterios).
  Estado por criterio (§7 de `docs/NATIVE_DESKTOP_APPS.md`):
  - [ ] 1 · **Diálogos de archivo nativos**. Sigue usándose `<input type="file">` para abrir y el truco
        del `<a download>` para guardar. Falta `tauri-plugin-dialog` + `tauri-plugin-fs`: ni están en
        `Cargo.toml` ni tienen permisos en `capabilities/default.json`. Hasta entonces, el botón del menú
        de exportación dice «Descargar» y no «Guardar como…», para no prometer un diálogo que no existe.
  - [ ] 2 · **Iconografía de marca** desde un `app-icon.svg` único con `npx tauri icon`. Sin verificar.
  - [ ] 3 · **Atajos universales** (`Ctrl+S`, `Ctrl+O`, `Escape`) con el foco dentro de un input. Solo
        hay `Ctrl+Z` / `Ctrl+Y`; `Escape` cierra el modal «Acerca de» y el menú de exportación.
  - [x] 4 · **Menú de aplicación nativo en macOS**. Implementado (2026-08-30) portando literalmente el
        patrón ya probado por un usuario real de macOS en `dbv-md-reader` (`src-tauri/src/lib.rs`,
        `mod macos_menu`), no inventado desde cero: `sys-locale = "0.3"` añadido a `Cargo.toml`, módulo
        `#[cfg(target_os = "macos")] mod macos_menu` en `src-tauri/src/lib.rs` con submenús
        App/File/Edit/View/Window/Help, registrado en `.setup()` vía `app.handle().set_menu(menu)?`.
        File/View adaptados a acciones reales de PDF2Deck (Nuevo/Abrir/Exportar/Deshacer/Rehacer/Alternar
        vista previa), reenviadas al frontend con `.on_menu_event()` → `window.emit("menu-xxx", ())`,
        escuchadas con `window.__TAURI__.event.listen(...)` en `main.js`, `desktop_shell.js` y
        `canvas_engine.js` (cada listener junto a la función real que ya existía). Compilación verificada
        para Windows (`cargo check`) y las firmas de `tauri::menu` verificadas contra el código fuente del
        crate `tauri-2.11.5`; **pendiente compilar y probar en una Mac real** — aquí no hay toolchain de C
        para completar el build cruzado (`objc2-exception-helper` falla al enlazar sin `cc`).
        `.on_menu_event()` revisado con `/simplify`: usa `app.emit(...)` (no una ventana "main" por
        etiqueta) y deriva `"menu-" + id` en vez de una tabla de 6 pares codificados a mano.
  - [x] **Puerta de build contra colisión de globales de Tauri (2026-08-30)**: portada de
        `dbv-teleprompter` (incidente real: `const isTauri` mató la interfaz de escritorio publicada en
        v0.2.0, en las tres plataformas). `scripts/check-tauri-globals.mjs` instancia cada `.js` de
        `frontend/` en un contexto `node:vm` con los globales que Tauri inyecta y aborta con
        `SyntaxError` si hay colisión; enganchada como `npm run check:tauri-globals` en
        `build.beforeDevCommand`/`beforeBuildCommand` de `tauri.conf.json`. Probada: detecta la
        colisión inyectada a propósito y el frontend actual pasa limpio.
  - [x] 5 · **Scrollbars tematizadas y layout fluido**. Hecho en el rediseño: fuera el `max-width: 1400px`
        heredado de la web, el lienzo ocupa la ventana entera y las scrollbars van con la paleta.
  - [ ] 6 · **Tooltips con los atajos**. Solo deshacer y rehacer los anuncian.
  - [x] **Versión sincronizada en los cuatro sitios**: `package.json`, `tauri.conf.json`, `Cargo.toml`
        (estaba desincronizado en `0.1.0`) y el panel «Acerca de».
- [x] **Fase 8** — `/ship` ejecutado (2026-08-30/31): tag `v2.0.0` publicada, los tres workflows de
  release corridos (con reintentos — ver abajo), MSIX enviado a Partner Center. Documentación
  actualizada el 2026-08-31 para reflejar el estado real tras el primer ciclo de release completo.
  Bugs de infraestructura encontrados y corregidos en el camino (ninguno existía antes de intentar
  publicar de verdad):
  - **Permisos del repo en solo lectura**: `default_workflow_permissions: "read"` a nivel de
    repositorio impedía que CUALQUIER workflow creara la Release, sin importar su propio
    `permissions: contents: write` — es un techo que el YAML no puede superar. Corregido vía
    `gh api PUT .../actions/permissions/workflow` a `"write"`.
  - **`tqdm` ausente de `backend/requirements.txt`**: `packaging/build_sidecar.py` pedía
    `--copy-metadata tqdm` pero nunca era una dependencia directa — solo estaba en el venv local por
    casualidad, transitiva de un paquete ausente en la resolución limpia de CI. PyInstaller fallaba en
    los tres sistemas operativos exactamente ahí. Añadido explícito.
  - **`.rpm` de Linux se cuelga sin log** (`release-linux.yml`): con `bundle.targets: "all"`, Tauri
    intenta generar `.deb` (bien, ~3 min) y `.rpm` — este último se queda colgado 30-40 min sin ninguna
    línea de log hasta el timeout, dos veces seguidas. `.rpm` nunca fue un canal de distribución
    planeado (el proyecto solo distribuye `.deb`/`.AppImage` en Linux). Corregido con
    `src-tauri/tauri.linux.conf.json` → `bundle.targets: ["deb", "appimage"]` (merge de config
    específico de plataforma, mecanismo nativo de Tauri v2, no algo inventado).
  - **Clave de firma minisign regenerada**: la que había (ver «🔄 Auto-actualización» abajo) no tenía
    contraseña y su privada no estaba respaldada de forma verificable. Se generó un par nuevo con
    contraseña, se subió como secretos de GitHub (`TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD`) y se entregó
    al usuario para guardar en su repositorio de claves personal — la nota anterior de este fichero
    sobre `~/.tauri/dbv-pdf2deck.key` queda obsoleta.
  - Ver también, en la sección de la migración a escritorio más abajo: el sidecar reescrito de raíz
    (Fase 6), el build de macOS restringido a Apple Silicon, y el pipeline de MSIX con fichero de
    mapeo (`packaging/build_msix.mjs`).

### ⚠️ Riesgos conocidos de la Fase 4 (no descubrir por las malas)

- **IIFE obligatoria**: `main.js` y `canvas_engine.js` son scripts clásicos que comparten ámbito
  global. Cada uno en su propia IIFE **antes** de añadir cualquier puente de Tauri. Una colisión de
  nombres produce un `SyntaxError` de parseo que mata el fichero entero: la app renderiza y la
  interfaz queda completamente muerta.
- **Nunca declarar `const isTauri`**: con `withGlobalTauri: true`, Tauri v2 ya inyecta ese global.
  Usar `runningInTauri`.

### ⚠️ Tamaño del instalador

`torch` + CUDA congelados con PyInstaller son **2–5 GB**. La app ya está preparada
arquitectónicamente para arrancar sin OCR (`ocr_engine.py` importa `easyocr` en un `try/except`;
`endpoints.py:237` solo llama a `analyze_image()` en la rama `else`). Estrategia: instalador base
pequeño + asistente de primer arranque que provisiona el entorno de OCR.

> El asistente **es alcance obligatorio, no pulido posterior**: el README vende como caso de uso
> principal los PDFs de solo imagen y las infografías de IA, que son justo las rutas que pasan por OCR.

---

## ⚖️ Sustitución de PyMuPDF — completada y verificada

Decisión **(A)**: sustituir por `pypdfium2` (lectura/rasterizado) + `reportlab` (escritura) + `pypdf`
(fusión sobre PDF existente). Las tres permisivas. Resultados completos en `MIGRACION_ESCRITORIO.md`
§5bis.

- [x] `backend/core/pdf_renderer.py` (7 usos) — ruta PDFium activa y validada; cuerpos legacy eliminados.
- [x] `backend/core/exporter_engine.py` — PDF nuevo y fusión sobre original migrados a reportlab+pypdf;
  el ajuste de tamaño evita el descarte silencioso de texto. `build_pptx_export()` preservado sin fitz.
- [x] `backend/core/markdown_exporter.py` — lectura migrada a pypdf; anotaciones y layout preservados.
- [x] Limpieza final de cuerpos legacy: cero referencias o imports de PyMuPDF/fitz en todo el backend.
- [x] Quitar `PyMuPDF` de `backend/requirements.txt` y añadir `pypdfium2`, `reportlab` y `pypdf`.
  La dependencia AGPL ha sido erradicada por completo; el proyecto cumple 100% su licencia MIT.

---

## 🧪 Tests — modo pro (completado y verificado)

> **Decisión del usuario**: se entra en modo profesional. Cobertura automatizada implementada y 41 tests pasando al 100%.

### `/code-simplify` — revisión 2026-08-28

- [x] Revisión de secretos y dependencias: no hay secretos hardcodeados; la API key cloud procede del
  payload del usuario. PyMuPDF no aparece en `backend/requirements.txt` ni en ningún módulo.
- [x] Limpiar los cuerpos legacy inalcanzables de `pdf_renderer.py` y `exporter_engine.py`.

- [x] Montar el arnés: `pytest` + `pytest-cov` en `requirements.txt`, `backend/tests/conftest.py`.
- [x] **Tests de regresión del lector**: extracción de texto nativo, dimensiones, bboxes y estilos con PDFium.
- [x] **Tests del exportador** sobre `build_pptx_export()`, `build_pdf_export()`, `build_pdf_export_from_original()`,
  `build_markdown_export()` y `generate_export_zip()` con validación de extracción de texto y reporte de sobrante.
- [x] **Tests de geometría**: `_page_scale_to_pdf_points()`, `_page_scale_to_ppt_points()`,
      `_hex_to_rgb()`, `_to_pdf_font()` (18 combinaciones Base-14), `_safe_line_spacing()`, ajuste de tamaño de fuente.
- [x] **Tests del enrutado**: `process_document_file`, `process_pdf_file` e `process_image_file` con validación de errores controlados.

---

## 📌 Backlog heredado (menor prioridad)

- [x] **Rasterizado parcial / Goma Mágica OpenCV**: limpieza selectiva de fondo sobre cajas elegidas y herramienta interactiva `🧹 Goma Mágica` con reiteración de inpaint en caliente.
- [ ] **Fuentes no Base-14**: incrustar la fuente original. Con reportlab es `pdfmetrics.registerFont`
      + `TTFont`, ya no `fitz.Font`.
- [ ] Internacionalizar nombres de fuente en el selector.
- [ ] Modo oscuro / estilos del toolbar.
- [ ] `frontend/` no tiene `package.json` ni gestión de dependencias.

---

## ✅ Completado antes de la adopción (histórico condensado)

De `docs_david/TASKS.md`, para no perder el rastro de lo que ya funciona:

- Arquitectura FastAPI + JS Canvas operativa end-to-end; detección por página de texto nativo vs imagen.
- Extractor línea a línea con `is_bold`, `is_italic`, `font_family`, `font_size`, `bbox_pt`;
  `_clean_font_name()` (ArialMT → Arial).
- Canvas: `ctx.clip()`, resize handles, multi-selección `Ctrl+Click`, igualar estilos, fusionar
  bloques, alineación de texto, Undo/Redo (50 estados), auto-fit de tamaño por búsqueda binaria.
- Export PDF desde el original con `cover_rect` sobre `bbox_pt`; export PPTX con DPI 100 y bloques
  nativos como `add_textbox` sin rect de fondo.
- `doc_id` + `DOCUMENT_STORE` para preservar el PDF original hasta el export; SSE de progreso.
- v1.5.0: entrada flexible (`.png`, `.jpg`, `.jpeg`, `.webp`) con corrección EXIF.

---

## 🔄 Auto-actualización y canales de distribución

Configurado el 2026-08-29. Canal self-hosted por GitHub Releases con
`tauri-plugin-updater`; las tiendas gestionan sus propias actualizaciones.

- **Clave de firma minisign regenerada el 2026-08-30** (la anterior no tenía contraseña y no estaba
  respaldada de forma verificable). La pública vive en `src-tauri/tauri.conf.json` →
  `plugins.updater.pubkey`. La privada (con contraseña) se entregó al usuario en el chat para guardar
  en su repositorio de claves personal — **no vive en ningún sitio de este equipo ni de este repo**.
  Si se pierde, ninguna instalación existente podrá volver a auto-actualizarse nunca; habría que
  publicar una clave nueva y pedir a todo el mundo que reinstale a mano.
- **Secretos ya dados de alta en GitHub** (2026-08-30, Settings → Secrets and variables → Actions):
  - `TAURI_SIGNING_PRIVATE_KEY` — el contenido del fichero `.key`, no la ruta.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
  Subidos vía `gh secret set`. Sin ellos, los tres workflows de release fallan al construir
  (`bundle.createUpdaterArtifacts` está activo).
- **`latest.json` lo genera CI**, no se mantiene a mano: `includeUpdaterJson: true`
  en los tres workflows lo escribe y lo acumula en la misma Release borrador,
  con las tres plataformas dentro.
- **Qué se auto-actualiza por canal**: NSIS (Windows) y AppImage (Linux) sí; el
  `.deb` lo gestiona el gestor de paquetes; el `.dmg` de macOS se actualiza vía
  el `.app.tar.gz` firmado. Las instalaciones desde tienda quedan fuera: el
  comando `is_packaged_app()` de `src-tauri/src/lib.rs` detecta la ruta
  `...\WindowsApps\...` del MSIX y oculta el botón, porque ejecutar el
  instalador NSIS dentro de ese sandbox crearía una segunda instalación
  paralela y desconectada.

### Pendiente para las tiendas

- [x] Secretos de firma dados de alta y **tag `v2.0.0` lanzada de verdad** (2026-08-30/31) — ciclo
      completo build → `latest.json` ejercitado en Windows y macOS (assets firmados publicados en el
      borrador de Release). Pendiente el mismo ciclo para Linux (ver Fase 8, fix del `.rpm` colgado) y
      pendiente comprobar en un cliente real que el botón «Buscar actualizaciones» encuentra esta
      versión — de momento solo se ha verificado que el build y la firma se generan.
- [x] **Empaquetado MSIX** para Microsoft Store, wireado y verificado de extremo a extremo (2026-08-30)
      con `@choochmeque/tauri-windows-bundle` (validado antes en `dbv-md-reader`, no inventado):
      `src-tauri/gen/windows/bundle.config.json` con `identifier: "davidbuenov.DBVPDF2Deck"`,
      `publisher: "CN=13EE2A5D-F49E-48C9-8873-941069B15D63"`, `publisherDisplayName: "davidbuenov"` —
      coinciden exactamente con lo reservado en Partner Center (PFN esperado
      `davidbuenov.DBVPDF2Deck_ze9zfmg3hs4tt`). `displayName` se fija a `"dbv-pdf2deck"` (no
      `"DBV PDF2Deck"`) porque `tauri-windows-bundle` deriva el nombre del `.exe` a empaquetar quitando
      solo espacios de `displayName` — con espacio buscaría `DBVPDF2Deck.exe` y el binario real de Cargo
      es `dbv-pdf2deck.exe`; mismo truco que ya usa `dbv-md-reader`.
      - **Dos rondas de fallos reales tras el primer build "exitoso" (que en realidad generaba un
        `.msixbundle` vacío, sin avisar):**
        1. `MakeAppx.exe` en modo directorio (`/d`) no sigue los *reparse points*: el propio copiado de
           recursos de Tauri deja `Assets/`, `sidecar/` y `AppxManifest.xml` como symlinks de Windows, no
           como carpetas/ficheros normales. Reproducido invocando `MakeAppx.exe` directamente, sin pasar
           por ninguna herramienta de terceros — no es un bug de `tauri-windows-bundle`.
        2. De paso, las licencias vendorizadas de PyTorch (`torch-2.13.0.dist-info/licenses/third_party/
           kineto/.../third_party/...`) rozaban el límite de 260 caracteres de Windows. Podadas en
           `packaging/build_sidecar.py` junto con `torch/include/` (62 MB de cabeceras C++ nunca usadas
           en tiempo de ejecución) — reduce el sidecar de 870 MB a ~790 MB y de paso evita ese límite.
      - **Solución definitiva**: `packaging/build_msix.mjs` (nuevo, `npm run tauri:windows:msix`) genera
        un fichero de mapeo (`MakeAppx.exe pack /f mapping.txt`) recorriendo el `AppxContent` con
        `fs.statSync` (que sigue symlinks) en vez de depender del recorrido de directorio de MakeAppx.
        Flujo completo: `npm run tauri:windows:build` (prepara `src-tauri/target/appx/x64`) → `npm run
        tauri:windows:msix` (empaqueta con mapeo + genera el `.msixbundle`).
      - **Verificado de extremo a extremo, no solo "compila":** `.msixbundle` de 309 MB (el vacío de
        antes eran 5,8 MB), `Identity Name`/`Publisher` confirmados byte a byte contra el manifiesto,
        y — la prueba real — el `.msix` se desempaquetó (`MakeAppx unpack`) y el sidecar extraído de ahí
        arrancó y `/health` respondió `ocr_ready: true`.
      - Sin workflow de CI para esto — igual que en `dbv-md-reader`, es un build local que se sube a mano
        a Partner Center.
- [x] **macOS: descartado Mac App Store.** El canal de macOS es **Uptodown**, igual que el resto del
      portfolio — decisión del usuario en la conversación del 2026-08-29. Sin certificado Apple
      Developer, sin notarización, sin revisión de tienda para esta plataforma.
- [x] **macOS: build solo Apple Silicon, no universal (2026-08-30).** El primer intento real de
      `release-macos.yml` (tag `v2.0.0`) falló: el sidecar Python no admite `--target-triple
      universal-apple-darwin` de un solo build (PyInstaller no compila cruzado). `release-macos.yml`
      cambiado a `aarch64-apple-darwin` únicamente. Detalle y alternativa descartada (Rosetta + build
      x86_64 duplicado) en `dbv-specs-ops/memory.md`.
- [x] ⚠️ **Bloqueo del tamaño del sidecar, anulado a propósito (2026-08-30).** `torch` + CUDA
      congelados con PyInstaller son 2–5 GB. La estrategia decidida el 2026-08-29 —instalador base
      pequeño + asistente de primer arranque que provisiona el entorno de OCR— **sigue sin construirse**,
      pero el usuario decidió explícitamente enviar igualmente el instalador completo (sin el asistente)
      al wireado de MSIX de hoy, en vez de esperar a construirlo. El tamaño en sí no es el bloqueo de
      política: el límite MSIX es 25 GB por paquete, muy por encima de lo que hace falta. **Resuelto**:
      la anulación se mantuvo también para el envío real — el paquete completo (sin el asistente) se
      envió a Partner Center el 2026-08-30, a la espera de certificación. El asistente de primer
      arranque sigue sin construirse; queda como mejora futura, ya no como bloqueante de esta versión.
- [x] **Fichas de contenido para las dos tiendas redactadas (2026-08-30)**: `descripcionStore_es.md` /
      `_en.md` (Microsoft Store) y `descripcionStoreUptoDown_es.md` / `_en.md` (Uptodown, canal de
      macOS), en la raíz del repo, siguiendo el patrón validado en `dbv-md-reader`. **No enviar
      todavía** — cada fichero lleva su propio bloque de aviso con los bloqueantes reales: no existe
      empaquetado MSIX ni build de macOS, `gh release list` no devuelve nada, y falta el asistente de
      primer arranque del punto anterior. Son ficha de contenido lista para copiar, no confirmación de
      que ya se puede certificar.
- [x] **Versión sincronizada a 2.0.0 (2026-08-30)** en los cuatro sitios de la DoD de §7 de
      `NATIVE_DESKTOP_APPS.md`: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y
      `APP_VERSION` en `frontend/desktop_shell.js` (panel "Acerca de"). Bump a mayor, no a minor: motor
      de OCR nuevo, exportación con DPI configurable, Goma Mágica, interfaz de escritorio completa y
      disponibilidad como app nativa — no es una entrega incremental sobre 1.x.

---

## 📍 Snapshot de contexto — 2026-08-31, tras el primer `/ship` real de v2.0.0

**Retomar la conversación desde aquí.** La v2.0.0 se publicó de verdad por primera vez el 2026-08-30/31
(tag `v2.0.0`, borrador de GitHub Release) y se envió el MSIX a Microsoft Partner Center. Este primer
intento real de release reveló varios bugs de infraestructura que ningún build-sin-ejecutar podía
detectar (sidecar roto, permisos del repo, `.rpm` colgado — detalle completo en Fase 6/8 arriba y en
`memory.md`). **Nada de esto estaba planificado como trabajo pendiente el 29 de agosto** — apareció al
intentar publicar de verdad por primera vez, que es justo la lección a recordar: compilar en CI no es
lo mismo que ejecutar.

### Qué está resuelto y verificado (con confianza alta)

- Sidecar Python reescrito (`--onedir` + recurso de Tauri) y **verificado de extremo a extremo en
  Windows local**: la app real arranca, EasyOCR carga, `/health` responde.
- MSIX empaquetado y **verificado de extremo a extremo**: desempaquetado del `.msixbundle` real,
  sidecar extraído arrancado, `/health` responde. Enviado a Partner Center, a la espera de
  certificación.
- Menú nativo de macOS, puerta de build contra colisión de globales de Tauri, permisos del repo,
  clave de firma minisign — todos aplicados y en el árbol.

### Qué está publicado pero SIN verificar en ejecución real (confianza baja — solo "compila en CI")

- **macOS**: `.dmg`/`.app.tar.gz` de la Release. Ni el sidecar ni el menú nativo se han probado en un
  Mac de verdad. El bug de Windows (DLL vendorizada) es específico de Windows — macOS podría no tener
  ningún problema análogo, o podría tener uno distinto (firma de código, `dyld`, notarización) que solo
  aparecería al ejecutarlo.
- **Linux**: build de `.deb`/`.AppImage` pendiente de relanzar tras quitar `.rpm` de los targets (se
  quedaba colgado sin log). Tampoco se ha ejecutado el binario real todavía.

### Próximos pasos, en orden

1. **Relanzar el workflow de Linux** (`gh workflow run release-linux.yml`, sin retaguear — los assets
   de Windows/macOS ya están bien en el borrador `v2.0.0`) y confirmar que `.deb`/`.AppImage` se
   publican sin colgarse.
2. **Pruebas reales de usuario en macOS y Linux**: instalar el paquete publicado (no solo compilarlo) y
   comprobar que el sidecar arranca, el OCR funciona y (en macOS) el menú nativo responde. Es el paso
   que falta para tener la misma confianza que ya hay en Windows.
3. **Esperar la certificación de Microsoft Partner Center** del MSIX enviado — sin acción nuestra
   mientras tanto, salvo responder a lo que pida el equipo de certificación.
4. **Uptodown (canal de macOS)**: decidido como canal desde el 2026-08-29, pero **todavía no se ha
   enviado nada** — pendiente de tener el `.dmg` verificado en un Mac real primero.
5. Asistente de primer arranque que provisiona el entorno de OCR: sigue sin construirse, ya no es
   bloqueante de esta versión (ver «Pendiente para las tiendas» arriba), pero sigue siendo la mejora de
   distribución más importante a medio plazo (instalador base pequeño en vez de los 2-5 GB actuales).

---

## 🩹 Regresiones de UI del rediseño del shell — corregidas el 2026-08-30

**Causa raíz única para las cuatro.** En `b329ca2` se rediseñó el marcado de las barras flotantes y se
renombraron sus identificadores, pero no se actualizaron ni el CSS ni el JavaScript que los
referenciaban. En HTML/CSS/JS un identificador que no existe **no lanza error**: `getElementById()`
devuelve `null` y el `if (elemento)` de guarda lo traga; un selector CSS sin elemento simplemente no
aplica. Resultado: funcionalidad que desaparece en silencio y sobrevive tres commits sin que nada falle
en consola.

- [x] **La barra de edición en sitio no aparecía nunca.** `_inlineToolbarElement()` buscaba
      `"inline-toolbar"`; el elemento pasó a llamarse `"inline-block-toolbar"`. Al devolver siempre
      `null`, el `toolbar.hidden = false` no se ejecutaba en ningún punto del código: la barra con
      fuente, tamaño, negrita, cursiva, subrayado, color y alineación existía en el DOM pero jamás se
      mostraba. Se percibió como «se han eliminado todas las opciones de edición».
- [x] **La barra salía sin estilo y descolocada.** Las reglas de `styles.css` seguían escritas para
      `.inline-toolbar` mientras el elemento usaba `.inline-block-toolbar`. Sin `position: absolute`,
      las asignaciones `style.left/top` que sí hacía el JS no tenían ningún efecto — un elemento
      estático las ignora — y la barra caía en el flujo del documento. Llevaba además `glass-panel`,
      que la pinta oscura y translúcida contra un diseño pensado en claro.
- [x] **No se podía editar el texto.** El editor `contenteditable` quedó envuelto en un
      `<div id="inline-editor-container" hidden>` que **nada en el código quitaba nunca**, y además
      fuera de `#canvas-wrapper`, que es el origen contra el que `_positionInlineEditor()` calcula sus
      coordenadas. El editor se mostraba, pero dentro de un padre oculto. Se eliminó el contenedor y
      `_ensureInlineEditorElement()` reubica el editor dentro del wrapper al abrir la edición.
- [x] **El contador de multi-selección mostraba `{count}` sin sustituir.** El `<h4>` llevaba
      `data-i18n="multi.title"`, así que `applyTranslations()` lo reescribía con la plantilla cruda en
      cada cambio de idioma. La interpolación con el recuento real solo la puede hacer
      `triggerMultiSelectToolbar()`, que es quien lo conoce: se le quitó el `data-i18n`.
- [x] **«Fusionar» y «Eliminar seleccionados» no hacían nada.** `mergeSelectedBlocks()` seguía viva pero
      el HTML rediseñado no incluyó botón equivalente a `mt-merge`; y `mtb-btn-delete` nunca llegó a
      cablearse (solo funcionaba la tecla Supr, por un atajo global independiente). Se añadió
      `mtb-btn-merge` con sus claves i18n y se conectaron ambos.

**Mejoras añadidas de paso** (no eran regresiones, verificado en el histórico — nunca existieron):

- [x] La barra de edición en sitio es **arrastrable** por un asa `⠿`. No reutiliza
      `_makeToolbarDraggable()` porque aquella exige un `<h4>` como asa y esta barra es una fila
      compacta. Al arrastrarla se activa `inlineToolbarMoved`, que desactiva el reanclado automático
      sobre el bloque; se reinicia al abrir la edición de otro bloque.
- [x] Los controles **repintan el lienzo al momento** (`repaintCanvas()` en `applyCurrentControls()`).
      Antes, cambiar W/H movía el editor pero dejaba la caja pintada con el tamaño anterior hasta
      cerrar y reabrir la edición.

### ⚠️ Regla para no repetirlo

Renombrar un `id` o una `class` en `index.html` es un cambio de **tres ficheros**, no de uno: hay que
barrer `canvas_engine.js` (y `desktop_shell.js`) y `styles.css` en el mismo commit. La verificación es
barata y conviene repetirla tras cualquier rediseño de marcado — comparar el conjunto de `id="..."` del
HTML contra los `getElementById("...")` del JS, y las clases del HTML contra los selectores del CSS.
Tras esta corrección quedan sin pareja únicamente los `tb-*` y los `mt-close` / `mt-equalize`, que son
código muerto ya anotado en la deuda técnica de abajo.

### Pendiente de esta zona

- [ ] Los seis botones de **alineación de objetos** (`mtb-align-*`) y los cuatro de **distribución**
      (`mtb-distrib-*`, `mtb-same-*`) del panel de multi-selección están en el HTML y en el diccionario
      i18n, pero **nunca tuvieron JavaScript**: no es una regresión, es funcionalidad planificada que
      quedó a medias. Alinear/distribuir la posición de los bloques entre sí, no el texto dentro de
      ellos.
- [ ] «Igualar Estilos» (tamaño de fuente común) y el botón «Cerrar» del panel de multi-selección se
      quedaron fuera del rediseño: `equalizeSelectedFontSize()` sigue implementada y su binding
      documentado, pero no hay botón que la invoque.

---

## 🧹 Deuda técnica — detectada en la revisión `/simplify` del 2026-08-29

Encontrada al revisar el rediseño del shell, pero **anterior a él y fuera de su alcance**. Ninguna
rompe nada hoy; se dejan anotadas para no volver a descubrirlas.

- **`#floating-toolbar` es inalcanzable.** Su único activador, `triggerVisualEditModal()`
  (`frontend/canvas_engine.js`), no tiene llamadores desde que la edición en línea lo sustituyó. Arrastra
  ~80 líneas de HTML, ~68 de JS, la mitad `tb-*` de `bindFloatingToolbarEvents()` y los avisos repartidos
  que lo ocultan. Al borrarlo hay que **conservar** `.align-group`, `.align-btn`, `.checkbox-modern`,
  `.color-picker-group` y `.toolbar-row/-field`: `#multi-toolbar` sí es alcanzable y los usa.
- **`#ai-external-options` está oculto de forma permanente** y nada lo muestra, pero mantiene vivo el
  cableado de la API key, el indicador de modo y la rama *cloud* de «Limpiar Fondo». Decidir si la ruta
  cloud se retira o vuelve detrás de un interruptor de verdad.
- **Alquiler del hot path del lienzo**: `paintCanvasLayers()` llama a `normalizeBlock()` por bloque y por
  fotograma, y `_handlePoints()` reserva un objeto y ocho arrays en cada `mousemove` de hover. Con muchos
  bloques marcados como modificados esto es presión de GC pura. Normalizar al recibir el payload y hacer
  las pruebas de impacto sin objetos intermedios.
- ~~**Añadir o quitar una goma dispara `cycleViewEngine()`**, que vuelve a decodificar el PNG de la página
  entera para un cambio que solo necesita un repintado.~~ **Resuelto el 2026-08-29**: `canvasScope`
  (`{canvas, ctx, bgImage, blocks}`) vive en el ámbito del módulo y `repaintCanvas()` es el único camino
  de repintado. `replaceCanvasBackground()` cambia la imagen de fondo en caliente. Las cuatro operaciones
  de goma y el cierre del editor inline ya no re-renderizan la página.
- **La frontera `window.dbvShell` es demasiado fina.** `canvas_engine.js` todavía conoce el marcado de la
  barra (`_setBtnLabel`/`_getBtnLabel` codifican el contrato `<svg> + <span class="btn-txt">`) y
  `main.js` alterna a mano la visibilidad del panel de carga y del editor. Ese conocimiento pertenece al
  shell: `dbvShell.showUploadPanel()` / `showEditor()` / `setToolLabel()`.
- **Verificar la CSP de la IPC de Tauri.** El `<meta>` de `index.html` es la única política del build de
  escritorio (`tauri.conf.json` tiene `"csp": null`, así que Tauri no parchea nada) y su `connect-src` no
  menciona `ipc.localhost`. La app arranca hoy, así que no parece estar bloqueando, pero conviene
  confirmarlo y encadenar un `.catch(() => resolveWebBackendUrl())` al `invoke("get_backend_port")` de
  `frontend/api.js` para que un fallo de IPC degrade al escaneo de puertos en vez de dejar la app sin
  backend.
- **`formatElapsedMMSS()` y `formatDurationMMSS()`** (`frontend/main.js`) son la misma función; la
  primera es `formatDurationMMSS(ms / 1000)`.

---

## 🛠️ Notas técnicas rápidas

```
Arranque:   .\start_dev.bat  (desde la raíz)
Python:     backend/venv/Scripts/python.exe
Compilar:   backend/venv/Scripts/python.exe -m py_compile <archivo>

OJO en builds locales: bundle.createUpdaterArtifacts está activo, así que
`npx tauri build` FALLA sin las variables de firma (no las omite en silencio).
Antes de compilar en local:
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$HOME\.tauri\dbv-pdf2deck.key"
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

DPI de renderizado:  100  — fijado en endpoints.py:189 (OJO: el default de
                     pdf_renderer.py es 150; manda la llamada del endpoint)
Escala canvas→pt:    scale_x/y = page_width_pt / render_width_px
OCR font_size:       ocr_engine.py:105 → bbox_height * 0.76, acotado a [10, 96]
                     (heurística, NO es el tamaño real)

Ficheros clave:
  backend/core/exporter_engine.py   ← bug crítico, 3 funciones de exportación
  backend/core/pdf_renderer.py      ← lectura/rasterizado, primero en la sustitución
  backend/core/ocr_engine.py        ← _estimate_font_size_from_bbox(), _infer_block_style()
  backend/api/endpoints.py          ← POST /export, DOCUMENT_STORE, DPI, estructura del payload
  frontend/canvas_engine.js         ← mountExportControls(), cómo envía los bloques al backend
  frontend/desktop_shell.js         ← barra superior, chincheta, «Acerca de», compuertas de la barra
```

Compuertas de la barra superior (declarativas, sin ids en el JavaScript):

```
data-needs-doc          el control se habilita cuando hay documento cargado
data-needs-eraser       ... cuando hay una goma seleccionada
data-active-on="<x>"    el control se resalta cuando la compuerta <x> está activa

El motor llama a window.dbvShell.setGate("doc"|"eraser", bool); el shell decide
cómo se pinta. Añadir una herramienta contextual nueva no toca JavaScript.
```
