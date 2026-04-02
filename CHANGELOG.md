# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
y el proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

---

## [Sin publicar]

> Los cambios en desarrollo aparecerán aquí antes de ser publicados.

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

[Sin publicar]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/davidbuenov/dbv-pdf2deck/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/davidbuenov/dbv-pdf2deck/releases/tag/v1.0.0
