# 📋 Especificaciones: DBV PDF2Deck

> Reconstruidas el **2026-08-28** durante la adopción de dbv-specs-ops sobre un proyecto ya en
> producción (v1.5.0). Marcas de transparencia: `[CONFIRMADO]` por el usuario · `[INFERIDO]` del
> código real · `[PENDIENTE]` sin resolver.

---

## 🎯 1. Contexto y Objetivos

Convertir PDFs de solo imagen e imágenes visuales (infografías generadas por IA, documentos de
NotebookLM, escaneos) en **presentaciones de PowerPoint totalmente editables**, usando OCR local y
un editor visual en canvas. `[CONFIRMADO]`

El diferencial es que **todo ocurre en el ordenador del usuario**: sin Adobe Acrobat, sin subir
ficheros a ningún servicio en la nube, con aceleración GPU opcional. `[CONFIRMADO]`

**Objetivo actual**: convertir la app en aplicación de escritorio nativa (Tauri v2) manteniendo el
modo web, y eliminar la dependencia AGPL que impide sostener la licencia MIT. `[CONFIRMADO]`

## 👥 2. Usuarios y Escenarios

- **Docentes y formadores** que reciben material en PDF cerrado y necesitan diapositivas editables. `[INFERIDO]`
- **Usuarios de NotebookLM** cuyos documentos generados son solo imagen, sin capa de texto. `[CONFIRMADO: es el caso de uso citado explícitamente en README y TASKS.md]`
- **Usuarios no informáticos**: el repo mantiene dos guías dedicadas (`docs/GUIA_NO_INFORMATICOS.md`, `docs/GUIA_MAC_NO_INFORMATICOS.md`) y videotutoriales. `[INFERIDO: la existencia de estas guías implica que es un público objetivo real]`

**Escenario principal**: el usuario arrastra un PDF de solo imagen → el backend rasteriza y pasa OCR
→ el canvas muestra bloques de texto editables sobre la imagen → el usuario corrige, fusiona, alinea
→ exporta a PPTX, PDF y Markdown en un ZIP.

## ✨ 3. Funcionalidades Principales (Requisitos)

- **RF-01** Ingesta de `.pdf` y de imágenes sueltas (`.png`, `.jpg`, `.jpeg`, `.webp`) con corrección de orientación EXIF. `[CONFIRMADO: v1.5.0]`
- **RF-02** Detección **por página** de texto nativo vs. imagen: si hay más de 20 caracteres alfanuméricos, se extrae el texto real y **no se pasa OCR**. `[INFERIDO: pdf_renderer.py:119]`
- **RF-03** Extracción de estilo por línea en la ruta de PDF digital: texto, bbox, fuente, tamaño, negrita, cursiva, color de texto y color de fondo. `[INFERIDO: pdf_renderer.py]`
- **RF-04** OCR local con EasyOCR sobre GPU (CUDA 12.1) o CPU, con estimación **heurística** del estilo. `[INFERIDO: ocr_engine.py]`
- **RF-05** Editor visual en canvas: edición de texto, multi-selección, igualar estilos, fusionar bloques, alineación, redimensionado, Undo/Redo de 50 estados, auto-ajuste de tamaño. `[CONFIRMADO]`
- **RF-06** Exportación a **PPTX**, **PDF** y **Markdown**, empaquetados en ZIP y seleccionables por el usuario. `[INFERIDO: generate_export_zip()]`
- **RF-07** Modo de exportación `only_modified` vs. todos los bloques. `[INFERIDO]`
- **RF-08** Limpieza de fondo asistida por IA (`google-genai`) y variante local. `[INFERIDO: endpoints /clean-background y /clean-background-local]`
- **RF-09** Progreso en tiempo real por SSE durante el procesado. `[INFERIDO]`
- **RF-10** *(nuevo)* Ejecución como aplicación de escritorio nativa en **modo dual**: el mismo código debe seguir funcionando en navegador. `[CONFIRMADO]`

## 🏗️ 4. Propuesta de Solución Técnica (Resumen)

Backend FastAPI local (`localhost`) + frontend JS clásico sin bundler, envuelto en Tauri v2 con el
backend Python como **sidecar** congelado con PyInstaller. Ver `ARCHITECTURE.md`.

### 4.1. Agent Readiness Checklist (Proyectos Web)

**No aplica.** Es una aplicación local sin superficie web pública ni consumidores automatizados.

## 🚫 5. Fuera de Alcance (Out of Scope)

- Procesamiento en la nube o envío de documentos a servidores propios. Es contrario a la propuesta de valor. `[CONFIRMADO]`
- Edición de PDF de propósito general (formularios, firmas, anotaciones). `[INFERIDO]`
- OCR de escritura manuscrita. `[INFERIDO]`
- Reescritura del backend en Rust: `easyocr` es la razón de ser de la app. `[CONFIRMADO]`
- Eliminar el modo web al migrar a escritorio. `[CONFIRMADO]`

## ⚠️ 6. Riesgos y Mitigación

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| **Contradicción de licencia**: PyMuPDF es AGPL-3.0 bajo un proyecto MIT | 🔴 Bloqueante para distribuir | Sustitución por `pypdfium2`+`reportlab`+`pypdf` decidida y medida. **No publicar instaladores hasta que aterrice** |
| **Bug crítico de exportación OCR** abierto desde abril | 🔴 Rompe el caso de uso estrella | Se resuelve con la misma sustitución: el sustituto reporta el sobrante en vez de descartarlo |
| **Tamaño del instalador**: torch+CUDA con PyInstaller son 2–5 GB | 🟠 Descarta Microsoft Store tal cual | Instalador base pequeño + asistente de primer arranque que provisiona el OCR |
| **Cobertura de tests cero** sobre un pipeline con lógica geométrica densa | 🟠 La reescritura puede degradar en silencio | Modo pro: arnés `pytest` y tests de regresión del lector antes de sustituir |
| **Frontend sin bundler**: colisión de identificadores globales al añadir Tauri | 🟠 Interfaz muerta sin error visible | IIFE por fichero antes de tocar Tauri; nunca declarar `const isTauri` |
| **Banco de validación fuera de git** (13 PDFs en `docs_david/`) | 🟡 Tests no reproducibles en CI | `[PENDIENTE: versionar un subconjunto mínimo o generar PDFs sintéticos]` |

## ❓ 7. Preguntas Abiertas

- `[PENDIENTE]` ¿Se versiona un subconjunto del banco de PDFs para que los tests sean reproducibles fuera de este equipo?
- `[PENDIENTE]` ¿Cómo se distribuye el pack de OCR (2–5 GB)? Asistente de descarga vs. CPU-only con modelo pequeño embebido.
- `[PENDIENTE]` El rescate de enlaces ocultos (`markdown_exporter.py`) no tiene ningún PDF de prueba con anotaciones de enlace. Hace falta uno antes de portarlo.
- `[PENDIENTE]` ¿`google-genai` (limpieza de fondo con IA) sigue siendo funcionalidad de primera línea o es accesoria? Afecta a si la clave de API es requisito de instalación.

## 🧪 8. Criterios de Evaluación y Evals (No Deterministas)

La calidad del OCR y de la limpieza de fondo con IA no son deterministas. Criterios de aceptación:

- **Fidelidad del lector (determinista, ya medido)**: sobre el banco de 13 PDFs, la sustitución de
  PyMuPDF debe mantener ≥99% de líneas recuperadas, ≥99% de coincidencia de texto y tamaño, y 100%
  de nombre de fuente. Línea base establecida el 2026-08-28.
- **Exportación legible (el bug crítico)**: en un PDF de NotebookLM con ~50 bloques OCR, el texto
  exportado debe ser visible y seleccionable en PDF y PPTX, y **ningún bloque puede desaparecer en
  silencio**. El sobrante debe reportarse siempre.
- **DoD de Experiencia de Escritorio**: los 6 criterios de `NATIVE_DESKTOP_APPS.md` §7, verificados
  ejecutando el binario real, no en `tauri dev`.

---

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** — libre y gratuito · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
