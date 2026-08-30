# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
y el proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [Sin publicar]

> Los cambios en desarrollo aparecerán aquí antes de ser publicados.

---

## [2.0.0] — 2026-08-30

- Se añade **auto-actualización** por GitHub Releases con `tauri-plugin-updater`: botón «Buscar
  actualizaciones» en el modal Acerca de, con progreso de descarga y reinicio automático al terminar.
  Los artefactos van firmados con la clave minisign del proyecto.
- Se detecta la instalación desde tienda (`is_packaged_app()`, por la ruta `WindowsApps` del MSIX) para
  ocultar ahí el botón de actualizar: esos paquetes los actualiza la tienda, y ejecutar el instalador
  NSIS dentro de ese sandbox crearía una segunda instalación paralela.
- Los tres workflows de release firman los artefactos de actualización y publican el `latest.json`
  acumulado de las tres plataformas en la misma Release.

- Se rediseña el shell de escritorio: la cabecera de marketing y la «ribbon» de secciones dan paso a
  una barra superior nativa de 48 px con las herramientas dentro, iconografía SVG de trazo en lugar de
  emojis, barra de estado inferior y scrollbars tematizadas. El lienzo pasa a ocupar la ventana completa
  sin el ancho máximo heredado del diseño web.
- Se añade el botón de **chincheta** (mantener la ventana encima del resto) y el modal **«Acerca de»**
  con versión, descripción y enlaces, que en escritorio se abren en el navegador del sistema. Ambos son
  parte del baseline de `dbv-tauri-starter` que faltaba.
- Se agrupan el modo de exportación y los formatos en un menú desplegable, en lugar de ocupar
  permanentemente la barra de herramientas.
- Se añade un botón de abrir documento en la barra, de modo que cambiar de archivo ya no obliga a
  volver al panel de carga.
- La **Goma Mágica** se dibuja ahora como una goma de nata semitransparente apoyada sobre el documento
  —cuerpo redondeado, bisel y sombra— en lugar del recuadro fucsia con etiqueta. Sus acciones («Borrar
  zona» y retirar la goma) se mueven a la barra de herramientas y desaparece la cajita flotante que las
  acompañaba sobre el lienzo.
- El modo web sigue funcionando igual: la chincheta solo aparece bajo Tauri y el resto del chrome es
  común a ambos modos.

### Fixed
- El botón «Limpiar Fondo» destruía su propio icono al pulsarlo, al escribir el texto de progreso
  directamente sobre el contenido del botón.
- Los listeners globales de teclado se acumulaban al abrir un segundo documento, de modo que un solo
  `Ctrl+Z` deshacía tantos pasos como documentos se hubieran abierto en la sesión.
- La exportación clonaba en JSON las imágenes base64 de todas las páginas solo para descartar los
  bloques de goma; ahora la copia es superficial y las imágenes se comparten por referencia.
- La goma se rasteriza una sola vez y se reutiliza mientras no cambie de tamaño, en lugar de recalcular
  su sombra difuminada en cada fotograma del arrastre.
- Se sincroniza la versión de `src-tauri/Cargo.toml` (estaba en `0.1.0`) con `package.json`,
  `tauri.conf.json` y el panel «Acerca de».
- `dragDropEnabled: false` en la configuración de la ventana: con el valor por defecto, Tauri captura
  el arrastre a nivel de sistema operativo y la zona de soltar del frontend deja de recibir eventos.

- Se erradica por completo la dependencia y el código legacy de PyMuPDF (`fitz`), completando la migración del backend a librerías permisivas (`pypdfium2`, `reportlab` y `pypdf`) y asegurando la conformidad legal con la licencia MIT del proyecto.
- Se implementa el arnés oficial de pruebas unitarias y de integración en `backend/tests/` con `conftest.py`, suite de 41 tests pasando al 100% que cubren helpers geométricos, fuentes Base-14, exportadores PDF, PPTX, Markdown y renderizado/enrutado.
- Se compila y valida el binario del sidecar de Python (`dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe`) en `src-tauri/binaries/`, y se supera exitosamente `cargo check` para la integración nativa de escritorio con Tauri v2.
- Se añade método de verificación de salud `checkHealth` en `frontend/api.js` y telemetría de modo de ejecución (Tauri vs Navegador) en `frontend/main.js`.
- Se incorpora el scaffold Tauri v2 y la configuración de release multiplataforma para iniciar la
  migración de DBV PDF2Deck a escritorio nativo en modo dual.
- Se encapsulan los scripts del frontend en IIFE y se elimina la dependencia de módulos ES para
  compatibilidad con el WebView nativo de Tauri.
- Se centraliza el transporte del frontend en `api.js`, incluyendo procesamiento, SSE, limpieza de
  fondo y exportación, manteniendo el modo web y el escritorio preparados para el sidecar.
- Se añade la receta aislada para construir el sidecar Python con PyInstaller y conectarlo al bundler
  de Tauri sin contaminar el entorno virtual de desarrollo.
- Se prepara el arranque del sidecar con puerto libre, exposición del puerto al frontend y cierre
  explícito del proceso al salir de la aplicación Tauri.
- Se activa la lectura y rasterización PDF con PDFium, preservando los metadatos de texto nativo que
  consume el editor Canvas y dejando PyMuPDF pendiente únicamente en las rutas restantes.
- Se migran las exportaciones PDF a reportlab y pypdf, con ajuste de tamaño y reporte de líneas sobrantes;
  se añade una primera prueba de regresión para impedir que el texto desaparezca en silencio.
- Se añade una sección destacada de **videotutoriales oficiales de YouTube** en `README.md`, con enlace a la playlist y a cada video individual (instalación, NotebookLM, NotebookLM con fondos complejos e infografías).
- Se reorganizan los enlaces de videos del `README.md` en **formato tabla** para mejorar visibilidad y consulta rápida.
- Se actualizan las tablas de videos del `README.md` con **títulos oficiales de cada video** y enlaces clicables (`Ver video` / `Ver playlist`).
- Se agrega una subsección de **casos de uso en video** dentro de `README.md` (sección Uso) para acceso directo a los tutoriales prácticos.
- Se incorpora el **video directo de instalación en Windows** dentro de la guía para no informáticos (`docs/GUIA_NO_INFORMATICOS.md`).
- Se añade **menú de aplicación nativo en macOS** (`src-tauri/src/lib.rs`, `mod macos_menu`): App/File/Edit/View/Window/Help con localización ES/EN automática según el idioma del sistema, acciones propias (Nuevo, Abrir, Exportar, Deshacer, Rehacer, Alternar vista previa) reenviadas al frontend por eventos.
- Se añade una **puerta de build** (`scripts/check-tauri-globals.mjs`) que aborta `tauri dev`/`tauri build` si algún `.js` del frontend declara un identificador que colisiona con los globales que Tauri inyecta (p. ej. `isTauri`) — la misma clase de fallo que dejó la interfaz de escritorio muerta en un proyecto hermano ya publicado.
- El `README.md` se reorganiza con **índice, instalación de escritorio priorizada sobre la web y enlace a este Changelog** en vez de listar novedades por versión; se añade `README.en.md` con la traducción completa.
- Se muestran los **logotipos oficiales de la marca** en los modales «Acerca de» y «Ayuda».

---

## [1.5.0] — 2026-04-04

### Añadido en 1.5.0

- **Entrada flexible de documentos visuales** en `POST /api/v1/process`: además de `.pdf`, ahora soporta `.png`, `.jpg`, `.jpeg` y `.webp`.
- **Procesamiento de imagen como documento de una página** para reutilizar el mismo pipeline de OCR, edición Canvas y exportación.
- **Corrección de orientación EXIF** y normalización a RGB para imágenes de cámara/móvil antes del OCR.
- **Soporte de configuración por `.env`** centralizado en backend con carga automática de `.env` en raíz o `backend/.env`.
- **Plantilla de configuración** `.env.example` para ajustes rápidos por entorno.

### Cambiado en 1.5.0

- Se refuerza el posicionamiento del producto para **infografías generadas por IA**, donde son frecuentes errores tipográficos y de maquetación.
- La validación del frontend en carga/drag&drop ahora acepta formatos de imagen además de PDF.
- El texto de la interfaz de carga comunica explícitamente soporte para documentos e imágenes.

### Corregido en 1.5.0

- **Modo no invasivo de estabilidad**: límites de tamaño para evitar bloqueos por archivos excesivos sin reescalado automático.
  - Límite de subida por archivo (`DBV_MAX_UPLOAD_MB`, por defecto 20 MB).
  - Límite de lado por imagen/página (`DBV_MAX_IMAGE_SIDE_PX`, por defecto 8000 px).
  - Límite de píxeles totales (`DBV_MAX_IMAGE_TOTAL_PIXELS`, por defecto 25.000.000 px).
- Mensajes de rechazo más claros cuando un archivo excede límites de tamaño o resolución.

---

## [1.4.0] — 2026-04-03

### Añadido en 1.4.0

- **Instalador 1 clic para Windows**: `instalar_y_ejecutar.cmd`.
- **Lanzador diario simplificado**: `ejecutar_dbv.cmd`.
- **Scripts `.cmd` oficiales**: `start_dev.cmd`, `stop_dev.cmd`.
- **Aliases legacy `.bat`** que delegan en `.cmd` para compatibilidad retroactiva.
- **Limpieza local de fondo con OpenCV Inpainting** (`/api/v1/clean-background-local`) sin API key.
- **Selector de modo de limpieza** en UI: `Auto / Local (OpenCV) / Cloud (AI Studio)`.
- **Indicador de modo activo** en la barra de inteligencia artificial.
- **Botón de eliminar bloque** en la barra de edición visual (`🗑`).
- **Consola asíncrona con ETA**: heartbeat con tiempo transcurrido y estimación restante basada en páginas procesadas.

### Cambiado en 1.4.0

- El flujo de logs SSE se conecta **antes** de `POST /process` para mostrar progreso en tiempo real desde el inicio.
- `POST /process` acepta `doc_id` suministrado por frontend para alinear procesamiento y stream de logs.
- Rediseño de la sección **Inteligencia Artificial** en el toolbar superior para aprovechar mejor el ancho horizontal.
- El botón `✨ Limpiar Fondo` ahora respeta estrictamente el modo elegido (Auto/Local/Cloud).

### Corregido en 1.4.0

- Se elimina el efecto de "volcado final" de logs de páginas al terminar: ahora el progreso llega incrementalmente.
- Corregido cierre prematuro del editor inline al interactuar con su barra de controles (foco/blur).
- Mensajes de error más claros cuando falta OpenCV en modo local.

---

## [1.3.0] — 2026-04-02

### Añadido en 1.3.0

- **Edición inline tipo Office** en el bloque seleccionado, sin depender del modal clásico.
- **Toolbar contextual blanca estilo PowerPoint** con controles de fuente, tamaño, color, alineación, negrita, cursiva, subrayado e interlineado.
- **Subrayado (`is_underline`) e interlineado (`line_spacing`)** en el modelo de bloque del frontend.
- **Controles W/H** en la barra inline para redimensionar el rectángulo durante edición.
- **Toggle de vista de edición opaca/transparente** para mejorar legibilidad en bloques transparentes tras limpieza con IA.
- **Selección por rectángulo (marquee)** arrastrando en zona vacía del canvas.
- **Barras flotantes movibles** (arrastrables) para evitar bloqueos de interacción sobre el contenido.
- **Smoke tests de exportación** para validar subrayado/interlineado y matriz de estilos en PDF/PPTX.
- **Calibración de tamaño tipográfico** consolidada en `docs_david/test_files`.

### Cambiado en 1.3.0

- Se prioriza el flujo de **edición inline** para uso diario; la experiencia se aproxima a herramientas tipo PowerPoint.
- Los **handles de resize** ahora también aparecen en bloques seleccionados aunque aún no estén marcados como modificados.
- Mejora visual en edición sobre fondos transparentes: se evita el efecto de doble texto subyacente.
- Se corrigen advertencias de tipado en exportador y scripts de pruebas internas sin alterar comportamiento runtime.

### Corregido en 1.3.0

- Ajustes de escala y consistencia tipográfica en exportación PDF/PPTX validados con calibración automática.
- Errores de tipado estático en `exporter_engine.py` y en scripts de pruebas de `docs_david/test_files`.

---

## [1.2.0] — 2026-04-02

### Añadido en 1.2.0

- **Exportación a Markdown (`.md`)** incluida dentro del ZIP de salida junto con PowerPoint y PDF.
- **Reconstrucción de Markdown para PDFs de imagen** usando los bloques OCR ya procesados por el editor.
- **Preservación de hipervínculos ocultos** en la exportación Markdown cuando el PDF original contiene enlaces embebidos.
- **Detección de URLs visibles** para convertirlas automáticamente a formato Markdown (`[texto](url)`).
- **Heurística de orden de lectura visual** para mejorar slides con columnas, tarjetas o rejillas simples.
- **Filtrado de ruido OCR** para descartar artefactos cortos como marcas numéricas aisladas o la firma `NotebookLM` en el Markdown exportado.
- **Selector de formatos de exportación en UI** con checkboxes para `.pdf`, `.pptx` y `.md`.
- **Campo AI aclarado** como clave específica de Google AI Studio, con enlace de ayuda directo.
- **Tip visible de multi-selección** en el editor para recordar el uso de `Ctrl+Click`.
- **Guía paso a paso para usuarios no informáticos en Windows** con instalación desde cero, alternativa a `git clone` y configuración de AI Studio.
- **Guía paso a paso para usuarios no informáticos en macOS** con instalación desde cero y arranque manual del proyecto.
- **Índice y navegación cruzada** entre las guías de Windows y macOS.

### Cambiado en 1.2.0

- El botón principal de exportación pasa a generar **PPTX + PDF + Markdown**.
- El backend evita generar formatos no seleccionados por el usuario, reduciendo tiempo de exportación.
- El `README` ahora documenta la nueva exportación múltiple y enlaza las guías para usuarios no técnicos al inicio de la instalación.

---

## [1.1.0] — 2026-04-01

### Añadido en 1.1.0

- **Multi-selección de bloques** (`Ctrl+Click`): selección múltiple de cajas de texto resaltadas en naranja con badge numerado.
- **Toolbar de multi-selección** flotante: se abre automáticamente al seleccionar ≥2 bloques con `Ctrl+Click`.
  - ⚖️ **Igualar Estilos**: aplica tamaño de fuente, color de texto, color de fondo, transparencia y alineación a todos los bloques seleccionados.
  - 🔗 **Fusionar**: une los bloques seleccionados en uno solo, con el texto concatenado por saltos de línea y el bbox envolvente. Hereda todas las propiedades del bloque más alto verticalmente.
- **Alineación de texto** (izquierda / centro / derecha) en ambos toolbars (edición individual y multi-selección), con control visual tipo segmented button.
- La alineación se aplica correctamente en el canvas (`ctx.textAlign`), en la exportación PDF (`PyMuPDF align=0/1/2`) y en PowerPoint (`PP_ALIGN.LEFT/CENTER/RIGHT`).
- Todas las operaciones son reversibles con `Ctrl+Z`.

---

## [1.0.0] — 2026-04-01

Primera versión pública del proyecto. Editor visual de PDFs de solo imagen con OCR local,
exportación a PowerPoint y PDF, e interfaz Canvas interactiva en el navegador.

### Añadido en 1.0.0

#### Backend (Python / FastAPI)

- Motor OCR local con **EasyOCR + PyTorch** para extracción de texto de PDFs de imagen.
- Soporte de **aceleración GPU CUDA** (NVIDIA) — reduce el tiempo de OCR de ~40s a ~4s por página.
- Detección automática de PDFs con texto nativo (vectorial) vs. solo imagen (rasterizado).
- Extracción de bloques de texto nativos con **PyMuPDF** (`fitz`), preservando posición, fuente y tamaño original.
- Exportación dual simultánea: **PowerPoint (`.pptx`)** y **PDF modificado** empaquetados en un `.zip`.
- Modo de exportación `only_modified`: solo los bloques editados se re-renderizan; el resto preserva los vectores originales.
- Modo de exportación `all_editable`: todos los bloques se convierten a texto editable en la presentación.
- Estrategia de exportación híbrida: texto modificado se renderiza sobre la imagen original sin rasterizar el PDF completo.
- Patrón `Result[T, E]` (Ok/Err) en todo el backend para manejo de errores sin excepciones no controladas.
- Endpoint REST `/api/v1/process` — subida de PDF, OCR y devolución de bloques + imágenes en Base64.
- Endpoint REST `/api/v1/export` — recepción del payload editado y generación del ZIP de salida.
- Endpoint REST `/api/v1/clean-background` — limpieza de fondos con IA generativa (Gemini, opcional).
- Scripts de arranque y parada rápida (`start_dev.bat`, `stop_dev.bat`) para Windows.
- Script de diagnóstico de GPU (`test_cuda.py`).

#### Frontend (Vanilla JS / HTML5 Canvas)

- **Editor visual Canvas** en el navegador: renderizado de la imagen de fondo con capas de texto superpuestas.
- **Drag & Drop** de archivo PDF en la zona de carga, con fallback a selector de archivos.
- **Consola de progreso asíncrono** (streaming SSE) con log en tiempo real del procesamiento OCR.
- **Sistema de paginación** dual (controles superiores e inferiores) para navegar entre páginas del PDF.
- **Barra flotante de edición** (`floating-toolbar`) con:
  - Edición de texto en `textarea`.
  - Selector de tipografía (6 familias de fuentes).
  - Control de tamaño de fuente (con paso de 0.01).
  - Estilos Negrita e Itálica.
  - Color de texto y color de fondo (color pickers nativos).
  - Opción de fondo transparente.
  - Advertencia visual para bloques rasterizados (no nativos).
- **Drag & Resize** de cajas de texto directamente en el canvas:
  - Arrastre libre para reposicionar bloques.
  - 8 handles de redimensionado (esquinas y lados).
  - Cursor contextual según la acción disponible.
- **Zoom** con controles +/−/Auto y soporte de `Ctrl+Scroll` del ratón con zoom centrado en el puntero.
- **Undo / Redo** (Ctrl+Z / Ctrl+Y) con historial de hasta 50 estados, implementado con snapshots profundos.
- **Añadir caja de texto manual** (`➕ Texto`) para insertar bloques nuevos en cualquier posición.
- **Bloques nativos** (texto vectorial del PDF) visible en modo solo-lectura; no se rasteriza salvo edición.
- **Función IA — Limpiar Fondo** (`✨`): envía la imagen de la página a Gemini para eliminar el texto original y dejar el fondo limpio; la API Key se guarda en `localStorage`.
- Selector de modo de exportación integrado en la barra superior.

#### Diseño e Interfaz

- Diseño **Glassmorphism dark mode** con variables CSS, gradientes y efectos de desenfoque.
- Tipografía `system-ui` con jerarquía de estilos coherente.
- Disposición responsive con barra de herramientas superior fija (Top Ribbon).
- Indicadores de estado duales (paginación y zoom en top y bottom del canvas).

#### Documentación

- `README.md` bilingüe (ES/EN) con instrucciones de instalación, uso y estructura.
- `docs/instalar_cuda.md` — guía detallada de instalación de PyTorch con CUDA.
- `docs/STYLEGUIDE.md` — guía de estilo y estándares de calidad del código.
- `CHANGELOG.md` — este archivo.
- `LICENSE` — MIT.
- `.gitignore` completo para Python / Node / VS Code / entornos virtuales.

---

## Tipos de cambios utilizados

- **Añadido** — nuevas funcionalidades.
- **Cambiado** — cambios en funcionalidades existentes.
- **Obsoleto** — funcionalidades que serán eliminadas en el futuro.
- **Eliminado** — funcionalidades eliminadas en esta versión.
- **Corregido** — corrección de errores.
- **Seguridad** — correcciones de vulnerabilidades.

[Sin publicar]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/davidbuenov/dbv-pdf2deck/releases/tag/v1.0.0
