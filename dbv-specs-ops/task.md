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
  - **Tauri v2 Sidecar**: Binario `dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe` compilado y ubicado en `src-tauri/binaries/`. `cargo check` completado con 0 errores y 0 warnings.
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
  - **Corrección de Sincronización de Punteros en Deshacer y Escalado de Fuentes de Título (2026-08-30)**:
    - *Causa*: `restoreSnapshot` creaba una nueva referencia de array para `page.blocks`, pero los event listeners de `mountInteractionLayer` en el canvas mantenían capturada en su closure la referencia antigua del array de bloques. Al editar un bloque tras hacer Undo, se modificaba el objeto huérfano del array anterior y el canvas (que leía el nuevo array) no reflejaba ningún cambio hasta cambiar de página.
    - *Solución*: Se refactorizó `mountInteractionLayer` para consultar dinámicamente `getActiveBlocks()` en tiempo de ejecución en lugar de cerrar sobre el parámetro inicial. Se cerró cualquier sesión inline activa al restaurar y se mejoró `resolveEditableFontSize` para estimar el tamaño proporcional a la altura de la caja contenedora cuando el bloque no tiene fuente bloqueada.
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
* **Próximo paso — retomar aquí**: ver «📍 Snapshot de contexto — 2026-08-29, conversación sobre tiendas»
  justo debajo del backlog de escritorio.

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
  Base preparada y ejecutada: binario target-specific `dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe`
  construido en `src-tauri/binaries/`, `cargo check` verificado y superado con éxito. Detección, monitor de reintentos
  de salud dinámico en `frontend/api.js` y `frontend/main.js`, CORS universal local en `backend/main.py` y streaming
  de logs del sidecar en `src-tauri/src/lib.rs`.
- [ ] **Fase 7** — Verificación ejecutando el binario real + DoD de Experiencia de Escritorio (6 criterios).
  Estado por criterio (§7 de `docs/NATIVE_DESKTOP_APPS.md`):
  - [ ] 1 · **Diálogos de archivo nativos**. Sigue usándose `<input type="file">` para abrir y el truco
        del `<a download>` para guardar. Falta `tauri-plugin-dialog` + `tauri-plugin-fs`: ni están en
        `Cargo.toml` ni tienen permisos en `capabilities/default.json`. Hasta entonces, el botón del menú
        de exportación dice «Descargar» y no «Guardar como…», para no prometer un diálogo que no existe.
  - [ ] 2 · **Iconografía de marca** desde un `app-icon.svg` único con `npx tauri icon`. Sin verificar.
  - [ ] 3 · **Atajos universales** (`Ctrl+S`, `Ctrl+O`, `Escape`) con el foco dentro de un input. Solo
        hay `Ctrl+Z` / `Ctrl+Y`; `Escape` cierra el modal «Acerca de» y el menú de exportación.
  - [ ] 4 · **Menú de aplicación nativo en macOS**. No abordado.
  - [x] 5 · **Scrollbars tematizadas y layout fluido**. Hecho en el rediseño: fuera el `max-width: 1400px`
        heredado de la web, el lienzo ocupa la ventana entera y las scrollbars van con la paleta.
  - [ ] 6 · **Tooltips con los atajos**. Solo deshacer y rehacer los anuncian.
  - [x] **Versión sincronizada en los cuatro sitios**: `package.json`, `tauri.conf.json`, `Cargo.toml`
        (estaba desincronizado en `0.1.0`) y el panel «Acerca de».
- [ ] **Fase 8** — Documentar, `/ship` y primer instalador.

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

- **Clave de firma minisign** generada para el proyecto. La pública vive en
  `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`. La privada está en
  `~/.tauri/dbv-pdf2deck.key` (fuera del repo, sin contraseña) y **hay que
  respaldarla**: si se pierde, ninguna instalación existente podrá volver a
  auto-actualizarse nunca; habría que publicar una clave nueva y pedir a todo
  el mundo que reinstale a mano.
- **Secretos que faltan por dar de alta en GitHub** (Settings → Secrets and
  variables → Actions):
  - `TAURI_SIGNING_PRIVATE_KEY` — el **contenido** del fichero `.key`, no la ruta.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — cadena vacía.
  Sin ellos, los tres workflows de release fallan al construir.
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

- [ ] Dar de alta los dos secretos de firma y **lanzar un tag de prueba** para
      verificar el ciclo completo: build → `latest.json` → botón «Buscar
      actualizaciones» encontrando la versión nueva.
- [ ] **Empaquetado MSIX** para Microsoft Store — decidido usar esta vía (ver snapshot debajo). La
      tienda firma el paquete tras certificación, sin comprar certificado. `Identity.Name` y
      `Publisher` tienen que coincidir **exactamente** con lo reservado en el Partner Center (§7 de
      `MARKETPLACE_PUBLISHING.md`). Herramienta candidata: `@choochmeque/tauri-windows-bundle`, ya
      validada en `dbv-md-reader` (`package.json` → script `tauri:windows:build`).
- [x] **macOS: descartado Mac App Store.** El canal de macOS es **Uptodown**, igual que el resto del
      portfolio — decisión del usuario en la conversación del 2026-08-29. Sin certificado Apple
      Developer, sin notarización, sin revisión de tienda para esta plataforma.
- [ ] ⚠️ **El tamaño del sidecar es el bloqueo real de las tiendas.** `torch` +
      CUDA congelados con PyInstaller son 2–5 GB. La estrategia ya decidida —instalador base
      pequeño + asistente de primer arranque que provisiona el entorno de OCR—
      **no está construida todavía**, y es prerrequisito de cualquier envío a
      tienda, no pulido posterior. El tamaño en sí **no es el bloqueo de política**: el límite MSIX es
      25 GB por paquete, muy por encima de lo que hace falta (verificado en la snapshot de abajo).
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

## 📍 Snapshot de contexto — 2026-08-29, conversación sobre tiendas

**Retomar la conversación desde aquí.** Se investigó qué exige Microsoft Store para un paquete grande
(2–5 GB por `torch`+CUDA) y se decidió la estrategia de envío, pero **no se ha implementado nada de
empaquetado de tienda todavía** — el trabajo hecho en esta conversación es solo de investigación y
decisión, más el cableado del updater (commit `e2f1627`, ya en el árbol).

### Lo que se investigó (fuentes: Microsoft Learn, agosto 2026)

- **El tamaño no es el bloqueo.** Límite MSIX: 25 GB por paquete o bundle. 2–5 GB entra sobrado.
- **Dos rutas de envío a Microsoft Store, con un matiz importante para este proyecto:**
  - **MSIX** (recomendada aquí): la Store re-firma el paquete tras certificar — no hace falta
    certificado de pago. Sin restricción sobre que la app descargue componentes después de instalada.
  - **EXE/MSI por URL directa** (política 10.2.9): exige Authenticode firmado con CA del Trusted Root
    Program (coste recurrente), URL versionada que vosotros alojáis, y —la frase clave— *"el instalador
    es autónomo y no es un stub/instalador web que descarga bits al ejecutarse"*. Esa cláusula apunta al
    *instalador*, no a que la app ya instalada ofrezca un asistente de primer arranque — pero es una
    línea difusa que MSIX evita por completo al no tener esa restricción.
- **Por qué importa para vuestra estrategia ya decidida** (instalador base pequeño + asistente de
  primer arranque que provisiona OCR): con MSIX, ese asistente es sin ambigüedad "funcionalidad de la
  app", no "instalador que hace de stub". Con la ruta EXE/MSI, tendríais que defender esa distinción
  ante certificación.
- **Requisitos de certificación que os afectan directamente:**
  - **10.2.4** — divulgar en la ficha de Partner Center que la app descarga el runtime de OCR tras
    instalar.
  - **10.3** — la app tiene que ser testable sin GPU CUDA (los certificadores probablemente no tengan
    una). Ya resuelto de facto: `ocr_engine.py` importa `easyocr` en `try/except` y la app arranca sin
    OCR.
  - **10.4.2** — el asistente de descarga del runtime tiene que mostrar progreso real y no colgar la UI
    ni la app si falla la red.
- **macOS confirmado: Uptodown, no Mac App Store.** Sin certificado Apple Developer (99 $/año) ni
  revisión de tienda para esta plataforma.

### Próximos pasos, en orden

1. **Bloqueante primero, y no es de tienda**: dar de alta `TAURI_SIGNING_PRIVATE_KEY` y
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` en GitHub Secrets (ver «🔄 Auto-actualización» arriba) y lanzar
   un tag de prueba — sin esto, los tres workflows de release fallan al construir, con o sin tienda.
2. **Construir el asistente de primer arranque** que provisiona el entorno de OCR — es prerrequisito de
   cualquier envío a tienda, no pulido posterior, y hoy no existe.
3. **Reservar identidad en el Partner Center** (`Identity.Name`, `Publisher`) — bloqueante para
   scaffoldar el empaquetado MSIX; sin esos valores exactos el manifiesto no puede generarse.
4. Empaquetar con `@choochmeque/tauri-windows-bundle` (o equivalente) siguiendo el patrón ya validado en
   `dbv-md-reader`.

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
