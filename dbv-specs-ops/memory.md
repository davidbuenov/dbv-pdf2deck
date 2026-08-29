# 🧠 Memory & Context

> **Frontera de uso (Memory vs. Tasks):**
> - `task.md` → progreso **operativo**: checklist de tareas, Snapshot de Contexto (el paso exacto siguiente), y estado de la sesión.
> - `memory.md` → contexto **cualitativo y temático**: conocimiento persistente, decisiones técnicas profundas, lecciones, y el área del producto en foco (no el paso específico).
>
> Si hay info que sirva para los dos, prioriza: datos con fecha/paso exacto → `task.md`; razonamiento/por-qué/lecciones → `memory.md`.
>
> *Instrucción para la IA: Consulta este archivo al inicio de cada sesión para recuperar el hilo técnico.*

## 🎯 Contexto Activo

- **Estado actual del desarrollo:** DBV PDF2Deck v1.5.0 está publicado y en producción. En curso: migración a escritorio nativo con Tauri v2 (rama `feat/tauri-desktop`), Fase 2 completada del `MIGRATION_PROMPT.md`.
- **Foco inmediato:** Fase 3 — traer artefactos de `dbv-tauri-starter` e identidad de la app. La sustitución de PyMuPDF queda decidida pero deliberadamente aparcada hasta después de Tauri.

## 🏗️ Log de Decisiones Técnicas (ADR Ligero)

- **2026-08-28 — Arquetipo D y backend como sidecar, no reescritura en Rust.** La regla del framework es decidir por función, no por app: se reescribe en Rust cuando la dependencia es un detalle de implementación, y se mantiene Python cuando **es la razón de existir de la app**. Aquí `easyocr` es exactamente eso y no hay equivalente maduro en Rust que conserve la calidad del OCR. Python se congela con PyInstaller como `bundle.externalBin` + `tauri-plugin-shell`.

- **2026-08-28 — Modo dual (web + escritorio), no sustitución.** PDF2Deck ya era *"una app de escritorio disfrazada de web"*: arranque por `.cmd`, backend en localhost, GPU local, argumento de venta "sin nube". Tauri no le añade un canal nuevo, le da la forma correcta. El modo web sigue funcionando gratis porque el backend FastAPI no se toca. Patrón: **un único fichero** (`frontend/api.js`) sabe si estamos en Tauri; el resto del frontend no se entera.

- **2026-08-28 — Sustituir PyMuPDF (opción A), tras medirlo en vez de estimarlo.** `PyMuPDF` es AGPL-3.0 y era la única pieza copyleft del inventario, bajo un proyecto que se declara MIT. Se descartó pagar la licencia comercial de Artifex (B) y relicenciar a AGPL (C). La decisión se tomó **con datos**: dos spikes sobre los 13 PDFs reales del banco. Lectura con `pypdfium2`: 674/676 líneas recuperadas, nombre de fuente 100%, tamaño 99.3%, cursiva 100%, color 97.9%, negrita 96.9%, rasterizado indistinguible a 150 DPI. El temor de partida —que el estilo por span se degradaría— **no se confirmó**.

- **2026-08-28 — El escritor necesita TRES librerías, no dos.** El análisis previo decía "reportlab" y se quedaba corto: `build_pdf_export_from_original()` **abre y modifica el PDF original in-place**, y reportlab solo sabe crear PDFs nuevos. Hace falta `pypdf` (BSD-3) para fusionar la capa de reportlab sobre las páginas existentes. Probado de extremo a extremo. Efecto colateral bueno: `page.clean_contents()` deja de ser necesario, porque el overlay se añade después de todo el contenido original y el problema de Z-order que motivaba esa llamada desaparece por construcción.

- **2026-08-28 — Orden (b): Tauri primero, sustitución de PyMuPDF después.** Decisión del usuario. La migración a escritorio no se bloquea con la reescritura del exportador. **Consecuencia que hay que tener presente:** no se pueden publicar instaladores hasta que la sustitución aterrice, porque empaquetar en un binario hace la contradicción de licencia insoslayable. `LICENSE` (MIT) ya existe, pero no cierra nada mientras PyMuPDF siga en `requirements.txt`.

- **2026-08-28 — Modo pro: se añaden tests.** Decisión del usuario. La cobertura era cero (`backend/tests/` vacía). El detonante: hay que reescribir tres módulos del pipeline, y sin red de seguridad la sustitución puede degradar la fidelidad en silencio. El volcado por línea del spike se convierte en la referencia de regresión del lector.
- **2026-08-28 — Frontend clásico para Tauri sin bundler.** `main.js` y `canvas_engine.js` se encapsulan
  en IIFE y el motor expone una única API en `window.dbvCanvasEngine`. Se elimina la carga ESM dinámica
  para que el WebView nativo use scripts clásicos, manteniendo las tres operaciones públicas del canvas.

## ⚠️ Lecciones Aprendidas / Errores Evitados

- **[Verificar, no creer al documento]**: en agosto se detectaron dos casos de lecciones que un ADR daba por escritas en el framework y que nunca habían llegado allí. La regla: *un documento que declara algo no es prueba de que sea cierto*. Se aplicó aquí y valió la pena — el `TASKS.md` de abril citaba números de línea que ya no existían, y el `STATUS.md` apuntaba a v1.3.0 con el proyecto en v1.5.0.

- **[PDFium: tres trampas no evidentes]** — sin ellas los resultados del spike no se reproducen:
  1. `FPDFText_GetFontSize` devuelve el tamaño **sin escalar por la matriz de texto**; MuPDF devuelve el efectivo. Hay que multiplicar por la escala vertical de `FPDFText_GetMatrix`. Coincidencia de tamaño: 82.6% → 99.3%.
  2. Los espacios generados por PDFium traen **caja de altura 0**; si participan en el agrupado por baseline, parten la línea en cada palabra (296 "líneas" donde MuPDF ve 46).
  3. El **peso declarado no es fiable** en subconjuntos embebidos: visto 645 en la regular y 380 en la negrita del *mismo* documento. Manda el nombre de fuente, luego el flag `ForceBold`, y el peso solo como último recurso. Negrita: 84.3% → 96.9%.

- **[El bug crítico y la deuda legal son el mismo trabajo]**: `insert_textbox` de PyMuPDF descarta el texto **en silencio** cuando no cabe, y por eso el PDF exportado sale sin texto. El sustituto probado dibuja lo que cabe y **devuelve el sobrante**. Arreglar el bug por separado sería trabajo tirado.

- **[Frontend sin bundler: dos trampas caras]**: los scripts clásicos comparten ámbito global, así que `main.js` y `canvas_engine.js` deben ir **cada uno en su IIFE** antes de tocar Tauri — una colisión de nombres da un `SyntaxError` de parseo que mata el fichero entero y deja la interfaz muerta con la app renderizando bien. Y **nunca declarar `const isTauri`**: con `withGlobalTauri: true` Tauri v2 ya inyecta ese global; usar `runningInTauri`.
- **2026-08-28 — Adaptador único de transporte frontend.** `frontend/api.js` concentra las operaciones
  HTTP y SSE en `window.dbvApi`, con detección `runningInTauri`. La ruta Tauri conserva HTTP local hasta
  que la Fase 6 aporte el sidecar y la negociación de puerto; ningún consumidor conoce las URLs del backend.
- **2026-08-28 — Empaquetado Python aislado.** PyInstaller no se instala en `backend/venv`; la receta usa
  `.venv-sidecar` y genera el ejecutable target-specific en `src-tauri/binaries/`, ignorado por Git.
- **[Licencia antes del binario]**: la receta de sidecar queda preparada, pero no se ejecuta mientras
  `backend/requirements.txt` incluya PyMuPDF AGPL. El primer build distribuible debe ocurrir después de
  completar la sustitución por `pypdfium2`, `reportlab` y `pypdf`.
- **2026-08-28 — Lector PDFium activo.** `process_pdf_file` conserva `PDFDocumentContext`, `PageRender` y
  `OCRBlock`; aplica la escala efectiva de fuente, ignora cajas degeneradas de espacios y convierte el
  sistema de coordenadas inferior de PDFium al superior del canvas. PyMuPDF queda como legado temporal.
- **2026-08-28 — Escritura PDF migrada.** `reportlab` crea overlays vectoriales y `pypdf` los fusiona con
  el original. El tamaño de fuente se reduce hasta que el texto cabe y se registra cualquier sobrante;
  así se elimina el descarte silencioso de `insert_textbox`.
- **2026-08-28 — Limpieza definitiva y erradicación de PyMuPDF.** Se eliminaron todos los cuerpos legacy inalcanzables en `pdf_renderer.py` y `exporter_engine.py`. El backend opera 100% libre de dependencias AGPL con `pypdfium2`, `reportlab` y `pypdf`.
- **2026-08-28 — Sidecar target-specific y validación de Tauri v2.** Binario `dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe` compilado y ubicado en `src-tauri/binaries/`. `src-tauri/src/lib.rs` consume el sidecar con puerto dinámico y `cargo check` compila limpiamente sin errores ni warnings.
- **2026-08-28 — Goma Mágica y Limpieza de Fondo Selectiva (OpenCV Telea Inpainting).** En lugar de limpiar forzosamente la página entera y obligar al usuario a reajustar textos intactos, el motor aplica inpainting exclusivamente sobre los cuadros seleccionados. Además, se creó la herramienta `🧹 Goma` (caja efímera redimensionable y desplazable) con soporte de ejecución reiterativa local sobre la misma área para refinar texturas. Los bloques de goma se sanitizan y filtran antes de cualquier exportación (PPTX/PDF/MD) para evitar shapes espurios.
- **2026-08-29 — Conectividad de motor OCR en escritorio (CORS + Polling de Salud + Observabilidad de Sidecar).**
  1. *CORS*: FastAPI restringía orígenes a `localhost:5500`, bloqueando a Tauri WebView2 (`http://tauri.localhost`). Se abrió `allow_origins=["*"]` en el backend local.
  2. *Polling de salud*: El arranque de Python + PyTorch + EasyOCR toma varios segundos. Se sustituyó el chequeo único en `DOMContentLoaded` por un monitor de reintentos continuos (1s durante arranque, 10s en reposo) que conmuta dinámicamente el estado del motor a verde en `desktop_shell.js`.
  3. *Sidecar vs Dev*: `src-tauri/src/lib.rs` implementa gestión dual (`BackendChild`): en modo desarrollo (`debug_assertions`) arranca directamente el `backend/venv` local sobre el puerto dinámico asignado sin necesidad de congelar binarios pesados en cada cambio; en producción (`release`) ejecuta el binario sidecar empaquetado. En ambos casos lee `stdout`/`stderr` asíncronamente y limpia el proceso al salir (`kill`).
- **2026-08-29 — Dos fallos gemelos de «el frontend cree que ha hecho algo y no lo ha hecho».**
  1. *Goma Mágica que resucitaba lo borrado.* `mountInteractionLayer()` captura la imagen de fondo en su
     closure. «Borrar zona» actualizaba `page.image_base64` y repintaba una sola vez con una `Image` local,
     dejando la capa de interacción apuntando a la imagen sucia: el primer `mousemove` del arrastre
     repintaba el fondo antiguo y el borrado parecía deshacerse (los datos estaban bien; mentía el lienzo).
     «Limpiar selección» nunca falló porque pasaba por `cycleViewEngine()`. Corregido usando también
     `cycleViewEngine()`. **Deuda asumida a sabiendas**: eso vuelve a decodificar el PNG entero de la
     página, agravando la deuda ya anotada en `task.md`; la solución definitiva sigue siendo subir
     `{ctx, canvas, bgImage}` al ámbito del módulo para poder refrescar la imagen sin re-render completo.
  2. *Exportar no guardaba nada.* El export usaba `<a download>` sobre una blob URL. WebView2 no tiene
     gestor de descargas: dentro de Tauri ese clic se ignora **en silencio**, sin diálogo del sistema, sin
     error y sin fichero. Es el mismo fallo que ya se sufrió en eer-studio. Corregido con
     `tauri-plugin-dialog` (`dialog.save`) + el comando Rust `save_binary_file`, que escribe los bytes en
     la ruta elegida; el contenido viaja en base64 porque el IPC serializa a JSON y un array de bytes
     crudo triplicaría el mensaje. Se descartó `tauri-plugin-fs` para no abrir un scope de escritura `**`.
  **Regla general**: toda API web de descarga o de sistema de ficheros hay que darla por muerta bajo Tauri
  hasta demostrar lo contrario — falla sin excepción y sin ruido.

- **[Posicionamiento de toolbars flotantes hijas del Canvas]**: Cualquier toolbar contextual flotante asociada a coordenadas de bloques de canvas debe insertarse dentro de `#canvas-wrapper` (que tiene posicionamiento relativo) y no en el `body`/`main`, para evitar desalineaciones con el zoom y scroll del lienzo.

- **[El pack de OCR no es un extra para minorías]**: el README vende como caso de uso principal los PDFs de solo imagen y las infografías de IA — justo las rutas que pasan por OCR. Un instalador pequeño que deje al usuario sin la función que fue a buscar es peor que uno grande. El asistente de primer arranque es alcance obligatorio.

- **[Dirección de la adopción, no negociable]**: la plantilla viaja **hacia** este repo, nunca al revés. Clonar `dbv-tauri-starter` para meter dentro PDF2Deck destruiría historial, issues y la URL del proyecto.

## 🗺️ Mapa de Relaciones

- **`backend/main.py`**: arranca FastAPI, expone `/health`, monta el router de `api/endpoints.py`.
- **`backend/api/endpoints.py`**: superficie HTTP (`/process`, `/export`, `/clean-background`, SSE de progreso). Mantiene `DOCUMENT_STORE` para preservar el PDF original hasta la exportación. **Fija el DPI de renderizado a 100.** Enruta OCR vs texto nativo según `render.native_blocks`.
- **`backend/core/pdf_renderer.py`**: lee y rasteriza el PDF, extrae los bloques de texto nativo con estilo. Depende de PyMuPDF (en sustitución) y Pillow. Alimenta a todo lo demás.
- **`backend/core/ocr_engine.py`**: EasyOCR. Importa `easyocr` en `try/except` y lo deja en `None` si falta — de ahí que la app pueda arrancar sin el stack de OCR. Estima el estilo por heurística, no con datos reales de fuente.
- **`backend/core/exporter_engine.py`**: reensambla a PDF y PPTX. `build_pptx_export()` depende solo de `python-pptx`; las dos rutas de PDF dependen de PyMuPDF.
- **`backend/core/markdown_exporter.py`**: exporta a Markdown y rescata enlaces ocultos del PDF original.
- **`backend/core/result.py`**: tipo `Result`/`Ok`/`Err` usado en todo el core en lugar de excepciones.
- **`frontend/canvas_engine.js`**: el editor visual (78 KB). Envía los bloques al backend en el export.
- **`frontend/main.js`**: orquestación de la UI y llamadas al backend. **Será el punto donde entre `api.js`** en la Fase 5.

---

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** — libre y gratuito · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
