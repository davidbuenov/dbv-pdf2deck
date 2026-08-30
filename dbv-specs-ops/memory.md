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

- **2026-08-30 — macOS: solo Apple Silicon, contradice el default del framework (`NATIVE_APPS_RELEASE_CI.md`
  §5, build `universal-apple-darwin`).** Primera ejecución real de `release-macos.yml` (tag `v2.0.0`)
  reveló que el sidecar Python no se puede compilar "universal": PyInstaller no compila cruzado, empaqueta
  el intérprete que lo ejecuta, así que haría falta un segundo build completo (torch, easyocr...) bajo
  Rosetta para `x86_64-apple-darwin`, sin garantía de que las dependencias sigan publicando wheels de
  macOS Intel. Decisión del usuario: `aarch64-apple-darwin` únicamente — Apple no vende Macs Intel desde
  2023. `release-macos.yml` actualizado (target de Tauri, target de Rust, `--target-triple` del sidecar);
  el patrón "universal" del framework sigue siendo el default correcto para proyectos sin esta pieza
  Python nativa.

- **2026-08-30 — El sidecar Python nunca se había ejecutado de verdad; `cargo check` no lo prueba.**
  Primer intento real de `/ship` (tag `v2.0.0`) reveló que el `.exe` del sidecar se caía al arrancar en
  cualquier máquina. Causa raíz (Visor de sucesos de Windows, no el mensaje de Python): una copia vieja
  y vendorizada de `msvcp140.dll` (v14.16, de 2019) embebida por alguna dependencia (torch/numpy/
  opencv), que el orden de búsqueda de DLL de Windows encuentra antes que la del sistema (más nueva) y
  revienta al inicializarse. Fix en `packaging/build_sidecar.py`: borrar esa DLL vendorizada del
  paquete tras el build. De paso, `--onefile` tampoco era viable (compilaba pero no arrancaba en
  ejecución real) — el sidecar pasó a `--onedir`, empaquetado como recurso de Tauri
  (`bundle.resources`) en vez de `externalBin`. Lección para cualquier binario nativo empaquetado con
  PyInstaller: **verificar arrancándolo de verdad, no solo compilándolo** — ni `cargo check` ni un CI
  que solo construye (sin ejecutar) habrían detectado esto nunca.

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

- **2026-08-29 — El DPI de exportación se desacopla del DPI de OCR.** El lienzo y el OCR rasterizan a
  100 DPI porque ahí manda la velocidad de EasyOCR, pero ese mismo raster acababa siendo el fondo de cada
  diapositiva del PPTX: todo lo no editado se veía blando junto al texto editado, que sí es vectorial. El
  PDF no sufría el problema porque `_build_pdf_export_from_original_reportlab()` superpone un overlay
  sobre el PDF original y conserva el vectorial. Ahora `build_pptx_export()` recibe `source_pdf_path` y
  re-rasteriza cada página desde el PDF original a `payload["export_dpi"]` (150/200/300/400/600, por
  defecto 300), seleccionable en el menú de exportación.
  - **Trampa que casi se cuela**: las bboxes de los bloques están en píxeles del lienzo, y `ratio_x/ratio_y`
    se calculaban con el ancho de la imagen de fondo. Al meter un fondo 3x mayor, cada cuadro de texto
    habría aterrizado a un tercio de su posición. Las ratios se calculan **siempre** con el tamaño del
    lienzo; el fondo solo se estira al tamaño del slide. Verificado comparando la geometría de todos los
    shapes antes y después: idéntica.
  - **1200 DPI descartado con números**, no por intuición: sobre una página de 19x12 in son 23008x14411 px,
    331 Mpx y ~1 GB de RAM por página (medido con pypdfium2), por encima del umbral de decompression bomb
    de Pillow y de lo que PowerPoint maneja. 600 DPI se queda como techo (249 MB/página).
  - Dos exclusiones deliberadas: las entradas que son **imagen** (el raster del lienzo ya son los píxeles
    originales, no hay nitidez que recuperar) y las páginas con `ai_cleaned_bg` (los píxeles corregidos por
    la goma solo existen en el lienzo; volver al original los perdería).

- **[La ayuda larga no va en el diccionario de i18n]**: `i18n.js` es para etiquetas de interfaz. La guía de
  uso vive en `frontend/help_content.js` como **dos documentos completos e independientes** (ES/EN).
  Trocear prosa larga en claves obliga a redactar cada idioma con la sintaxis del otro y produce textos
  que se leen como una traducción automática.

- **2026-08-29 — Detectar «texto nativo» contando caracteres es un falso positivo garantizado.**
  `process_pdf_file()` decidía con `len(re.sub(r"[\W_]+", "", raw_text)) > 20`. Un PDF de infografías
  (`ICU-Storytelia.pdf`) trae por página una sola imagen y 51 caracteres de mobiliario: `"Página 1 ·
  Powered by Storytelling Nexthealth · 1 / 10"`. 41 alfanuméricos superan el umbral, la página se da por
  nativa, **el OCR no se ejecuta nunca** y el usuario recibe 3 bloques de pie de página con todo el
  contenido real encerrado en la imagen. El patrón es comunísimo: Canva, NotebookLM, cualquier
  exportación con numeración automática.
  - **El discriminador correcto es la cobertura de área**, no el recuento: medido sobre PDFs reales, un
    pie de página cubre el 0,43 % de la página y un documento de texto entre el 24 % y el 33 %. Dos
    órdenes de magnitud de separación, así que el umbral (2 %, `DBV_NATIVE_TEXT_MIN_COVERAGE`) no es
    delicado. Se exigen ambas condiciones: caracteres suficientes **y** cobertura mínima.
  - Verificado de punta a punta: la página pasaba de 0 bloques a **121 bloques** de OCR en 3,8 s, y los
    cuatro PDFs de `docs_david/pruebas/` se enrutan correctamente.
  - **Ojo con `get_objects()` de pypdfium2**: no desciende a los XObjects anidados, así que medir áreas
    con él da 0 % de texto en páginas que sí lo tienen. La medida fiable sale de las líneas que ya
    extrae `_pdfium_native_lines()`, que es además el mismo dato que luego consume el pipeline.

- **2026-08-29 — EasyOCR devuelve trozos, no párrafos; y el DPI de proceso pesa más que cualquier heurística.**
  En una infografía densa, 121 fragmentos correspondían a 46 líneas visuales, con una línea partida hasta
  en 8 trozos. Eso hacía la edición inviable, rompía la exportación (cada trozo, un cuadro de texto suelto
  en el PPTX) y estropeaba la estimación de cuerpo de fuente. Se añadió una fusión en dos pasadas en
  `ocr_engine.py`: fragmentos → líneas → párrafos, con umbrales relativos a la altura de línea (nunca en
  píxeles absolutos, para que valgan igual a 100 que a 300 DPI) y desactivable con `DBV_OCR_MERGE_BLOCKS=0`.
  - **Tres trampas encontradas al afinar, todas del mismo tipo: usar la geometría equivocada como referencia.**
    1. *Bola de nieve vertical.* Decidir la pertenencia a una línea comparando contra su caja envolvente
       hace que cada absorción estire la línea, que así se vuelve elegible para tragarse el párrafo de
       debajo. La referencia debe ser una **banda de fila** (mediana de centros y alturas), que no crece.
    2. *Orden de lectura barajado.* EasyOCR no devuelve los fragmentos ordenados, y concatenarlos según
       llegan producía «Como profesionalesinmersos Hola cdlegas». Hay que guardar la posición de cada
       fragmento y emitir el texto ordenado por (fila, x) al final, no al absorber.
    3. *Tolerancia de alineación escalada con la línea más ancha.* Un fragmento de dos palabras encajaba
       en cualquier titular largo por pura holgura. Debe escalarse con la **más estrecha**, con un suelo
       de dos alturas de línea para la sangría legítima.
  - **El hallazgo mayor: el DPI de proceso domina.** El pipeline rasteriza a 100 DPI «para no asfixiar al
    OCR», pero a esa resolución el cuerpo de texto de una infografía mide 10 px y EasyOCR devuelve basura
    (confianza mediana 0,52; «nueslros pacientes llujo _ Hemo<»). A 200 DPI la misma página da confianza
    mediana 0,71 y el párrafo se lee entero y correcto. Medido en bloques finales: 121→57 fusionando a
    100 DPI, frente a 136→**38** fusionando a 200 DPI. Coste: +1,5 s por página y el payload de un
    documento de 10 páginas pasa de 15,5 MB a 44,2 MB en base64.
  - **Corolario, ya implementado**: el DPI de OCR y el del lienzo son decisiones distintas y se han
    desacoplado, igual que antes el de exportación. `CANVAS_DPI` sigue en 100 y `OCR_DPI` (200 por defecto,
    `DBV_OCR_DPI`) rige un render aparte que se lee y **se descarta en la misma iteración**: mantener las
    dos resoluciones de las diez páginas a la vez duplicaría de largo la memoria del proceso.
    `analyze_image()` recibe una `scale` y hace todo el análisis —recortes, colores, alturas de línea— en
    el espacio de la imagen leída, que es donde está la información, aplicando la escala solo al emitir.
    Resultado sobre la página de prueba: 38 bloques, ninguno fuera del lienzo, `"Página 1"` leído entero y
    el párrafo de cuerpo correcto y de una pieza, con el payload y la memoria del canvas intactos.
  - **La escala se mide sobre los píxeles obtenidos, nunca sobre los DPI pedidos**: `render_pdf_page_at_dpi()`
    recorta la resolución en páginas enormes, y dar por hecho el ratio teórico dejaría todas las cajas
    desplazadas justo en los documentos más grandes.
  - **Dónde está el techo de la fusión, para no volver a intentarlo**: en la infografía, las cuatro
    etiquetas bajo los iconos tienen huecos de 0,54-0,58 alturas de línea, y las palabras de un párrafo
    real 0,19-0,65. Son indistinguibles por geometría de hueco; separarlas exigiría detección de columnas
    por valles de blanco en toda la página. Cualquier umbral que las separe romperá párrafos legítimos.

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
