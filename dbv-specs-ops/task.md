# Backlog - DBV PDF2Deck

> Adoptado el 2026-08-28 desde `docs_david/TASKS.md` (última actualización 2026-04-01) y
> `MIGRACION_ESCRITORIO.md`. **Este fichero es ahora la única fuente de verdad.**
> `docs_david/` queda como histórico y está fuera de git.

## Contexto del Proyecto (Context Snapshot)

* **Objetivo**: Migrar DBV PDF2Deck (v1.5.0, publicado y en producción) a aplicación de escritorio
  nativa con Tauri v2 en modo dual (web + escritorio), y sustituir PyMuPDF (AGPL-3.0) para que la
  licencia MIT del proyecto se sostenga.
* **Estado actual**: Fase 2 de `MIGRATION_PROMPT.md`. Rama `feat/tauri-desktop` creada, framework
  dbv-specs-ops v2.7.0 adoptado. Spikes de PyMuPDF hechos y decisión tomada.
* **Última decisión técnica**: **Orden (b): Tauri primero, sustitución de PyMuPDF después.** La
  migración a escritorio no se bloquea con la reescritura del exportador. Ver `memory.md`.
* **Próximo paso**: Fase 3 de `MIGRATION_PROMPT.md` — traer los artefactos de la plantilla
  `dbv-tauri-starter` e identidad de la app.

---

## 🔴 Bug crítico abierto — exportación OCR ilegible

> Heredado de `docs_david/TASKS.md` (2026-04-01). **Verificado el 2026-08-28: sigue vivo.**
> `exporter_engine.py` no se toca desde el 2026-04-02 y `grep` confirma que no existe ninguna
> comprobación del retorno de `insert_textbox`.

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

- [ ] Cerrar el bug de exportación OCR en `backend/core/exporter_engine.py` (3 funciones).
- [ ] Bloques NO modificados: textbox de texto seleccionable **sin** rectángulo de fondo. La imagen
      ya aporta lo visual. (Estrategia híbrida, opción F del antiguo `STATUS.md`.)
- [ ] Bloques `is_modified=true`: rectángulo opaco (cinta correctora) + texto nuevo con estilo editado.
- [ ] Verificar el sobrante de texto y reducir el tamaño hasta que quepa, en vez de descartarlo.
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
- [ ] **Fase 3** — Artefactos de la plantilla e identidad de la app. ← **SIGUIENTE**
- [ ] **Fase 4** — Frontend, arquetipo sin bundler. **IIFE primero** (ver riesgos abajo).
- [ ] **Fase 5** — Capa de adaptación `frontend/api.js` (un único fichero sabe si estamos en Tauri).
- [ ] **Fase 6** — Sidecar Python (PyInstaller) + asistente de primer arranque para el entorno de OCR.
- [ ] **Fase 7** — Verificación ejecutando el binario real + DoD de Experiencia de Escritorio (6 criterios).
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

## ⚖️ Sustitución de PyMuPDF — decidida, pendiente de ejecutar

Decisión **(A)**: sustituir por `pypdfium2` (lectura/rasterizado) + `reportlab` (escritura) + `pypdf`
(fusión sobre PDF existente). Las tres permisivas. Resultados completos en `MIGRACION_ESCRITORIO.md`
§5bis; implementación de referencia en `docs_david/spikes_pymupdf/` (fuera de git, solo en este equipo).

- [ ] `backend/core/pdf_renderer.py` (7 usos) — empezar aquí: es el único con datos de validación
      (674/676 líneas sobre 13 PDFs). **Portar las tres trampas de PDFium o los resultados no se reproducen.**
- [ ] `backend/core/exporter_engine.py` (18 usos) — primitivas triviales, luego `build_pdf_export()`,
      y `build_pdf_export_from_original()` al final (el único que necesita `pypdf`).
      **No tocar `build_pptx_export()`: no usa fitz, coste cero.**
- [ ] `backend/core/markdown_exporter.py` (11 usos) — el último. **Conseguir antes un PDF con
      anotaciones de enlace reales**: ninguno del banco actual las tiene y esa ruta quedaría sin verificar.
- [ ] Quitar `PyMuPDF` de `backend/requirements.txt` y añadir las tres nuevas.
      **Ese es el commit que cierra de verdad el problema de licencia.**

> ⚠️ **`LICENSE` (MIT) ya está creado, pero la contradicción NO está cerrada.** Mientras PyMuPDF siga
> en `requirements.txt`, MIT sobre el conjunto no se sostiene. **No publicar instaladores hasta entonces.**

---

## 🧪 Tests — modo pro (nuevo, 2026-08-28)

> **Decisión del usuario**: se entra en modo profesional. Hoy la cobertura es **cero**:
> `backend/tests/` existe y está vacía; los scripts de `docs_david/test_files/` son smoke tests
> ad-hoc fuera de git. Con la reescritura del exportador encima, es cuando más caro sale no tenerlos.

- [ ] Montar el arnés: `pytest` + `pytest-cov` en `requirements.txt`, `backend/tests/conftest.py`.
- [ ] **Tests de regresión del lector** — el activo más valioso que dejó el spike: fijar como
      referencia el volcado por línea (texto, bbox, fuente, tamaño, negrita, cursiva, color) para que
      la sustitución de PyMuPDF no pueda degradar nada en silencio.
- [ ] **Tests del exportador** sobre `build_pptx_export()` y `build_pdf_export()`: que el texto se
      escriba de verdad y que el sobrante se reporte. Es el test que habría cazado el bug crítico.
- [ ] **Tests de geometría**: `_page_scale_to_pdf_points()`, `_page_scale_to_ppt_points()`,
      `_hex_to_rgb()`, `_to_pdf_font()` (12 combinaciones Base-14), `_safe_line_spacing()`.
- [ ] **Tests del enrutado**: `has_native_text` decide OCR vs texto nativo. Idéntico en los 13 PDFs
      del banco entre MuPDF y PDFium — conviene fijarlo antes de tocar nada.
- [ ] **Resolver el banco de pruebas**: los 13 PDFs de validación están fuera de git (`docs_david/`
      + regla `*.pdf`). Sin ellos los tests no son reproducibles en otra máquina ni en CI.
      `[PENDIENTE: decidir si se versiona un subconjunto mínimo o se generan PDFs sintéticos.]`

---

## 📌 Backlog heredado (menor prioridad)

- [ ] **Fuentes no Base-14**: incrustar la fuente original. Con reportlab es `pdfmetrics.registerFont`
      + `TTFont`, ya no `fitz.Font`.
- [ ] **Rasterizado parcial OCR/logo**: solo la región del bloque modificado.
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
```
