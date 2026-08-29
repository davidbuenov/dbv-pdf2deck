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
* **Próximo paso**: **validar ejecutando** `npx tauri dev` (el rediseño está escrito y revisado, pero
  todavía no se ha ejecutado la app real) y cerrar los criterios pendientes de la DoD de Experiencia de
  Escritorio. Después, Fase 8 (`/ship` y release).

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
  construido en `src-tauri/binaries/`, `cargo check` verificado y superado con éxito. Detección y health check
  en `frontend/api.js` y `frontend/main.js`.
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
- **Añadir o quitar una goma dispara `cycleViewEngine()`**, que vuelve a decodificar el PNG de la página
  entera para un cambio que solo necesita un repintado. Requiere subir `{ctx, canvas, bgImage}` al ámbito
  del módulo.
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
