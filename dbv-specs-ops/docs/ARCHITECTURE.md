# 🏗 Arquitectura Técnica: DBV PDF2Deck

> Documenta la arquitectura **tal como está hoy (2026-08-28, v1.5.0)**, no como debería ser.
> Los cambios en curso (Tauri v2, sustitución de PyMuPDF) se marcan como *en migración*.

---

## 🛠 Stack Tecnológico

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Backend | **FastAPI** 0.110+ / **uvicorn** 0.29+ | Servidor local en `localhost`, arrancado por `.cmd` |
| Runtime | **Python 3.12** (recomendado 3.12.10) | venv en `backend/venv/` |
| Lectura PDF | **PyMuPDF** 1.27.2.2 (`fitz`) | ⚠️ **AGPL-3.0 — en sustitución** por `pypdfium2` |
| Escritura PDF | **PyMuPDF** | ⚠️ **En sustitución** por `reportlab` + `pypdf` |
| OCR | **EasyOCR** 1.7.2 + **PyTorch** 2.5.1+cu121 | GPU CUDA 12.1 opcional, CPU como alternativa |
| Presentaciones | **python-pptx** | Sin dependencia de PyMuPDF |
| Imagen | **Pillow**, **opencv-python-headless** | |
| IA generativa | **google-genai** | Limpieza de fondo ("Nano Banana") |
| Frontend | **JS clásico, sin bundler y sin `package.json`** | `canvas_engine.js` (78 KB) + `main.js` (9 KB) |
| Render UI | **Canvas 2D** nativo | Sin framework de UI |
| Escritorio | **Tauri v2** | *En migración* — rama `feat/tauri-desktop` |

## 📂 Estructura de Directorios

```text
dbv-pdf2deck/
├── backend/
│   ├── main.py                 # Arranque FastAPI, /health, monta el router
│   ├── requirements.txt
│   ├── api/
│   │   └── endpoints.py        # Superficie HTTP. Fija DPI=100. Enruta OCR vs nativo
│   ├── core/
│   │   ├── pdf_renderer.py     # Lee/rasteriza PDF, extrae bloques nativos con estilo
│   │   ├── ocr_engine.py       # EasyOCR + heurísticas de estilo
│   │   ├── exporter_engine.py  # Reensamblado a PDF y PPTX
│   │   ├── markdown_exporter.py# Exportación a MD + rescate de enlaces
│   │   ├── ai_cleaner.py       # Limpieza de fondo con google-genai
│   │   ├── settings.py         # Config por entorno (.env)
│   │   └── result.py           # Tipo Result/Ok/Err
│   ├── tests/                  # ⚠️ VACÍA — cobertura cero (ver task.md, modo pro)
│   └── venv/                   # Ignorado
├── frontend/
│   ├── index.html
│   ├── canvas_engine.js        # Editor visual (78 KB)
│   ├── main.js                 # Orquestación UI ← aquí entrará api.js (Fase 5)
│   └── styles.css
├── docs/                       # Guías públicas (no informáticos, CUDA, styleguide)
├── docs_david/                 # ⚠️ IGNORADO por git — notas internas + banco de PDFs
├── dbv-specs-ops/              # Framework SDD (esta carpeta)
├── MIGRACION_ESCRITORIO.md     # Contexto y decisiones de la migración a escritorio
└── start_dev.cmd / ejecutar_dbv.cmd / instalar_y_ejecutar.cmd
```

## 🔑 Decisiones Técnicas Clave

### Seguridad

- **Procesamiento 100% local.** Ningún documento sale del equipo. Es la propuesta de valor, no un detalle.
- Límites de ingesta configurables por entorno (`settings.py`): `DBV_MAX_UPLOAD_MB` (20 por defecto),
  `DBV_MAX_IMAGE_SIDE_PX` (8000), `DBV_MAX_IMAGE_TOTAL_PIXELS` (25 000 000). Se validan **antes** de
  rasterizar, para no agotar memoria con una página maliciosa.
- La clave de `google-genai` vive en `.env`, nunca en el código.

### Estilo de Código

- **Manejo de errores por `Result`, no por excepciones**: `core/result.py` define `Ok`/`Err` y todo el
  core devuelve `Result[T]`. Las excepciones se capturan en el borde y se convierten en `Err`.
- Cabecera de copyright MIT en todos los ficheros de `backend/core/`.
- Linters declarados: `ruff` y `mypy` (en `requirements.txt`); `pyrightconfig.json` en la raíz.
- Docstrings en español, descriptivos por función.
- Minimizar el uso de returns dentro de un método o función.

### Gestión de Estado

- **Backend sin estado persistente.** `DOCUMENT_STORE` en `endpoints.py` es un almacén **en memoria**
  que conserva el PDF original asociado a un `doc_id` hasta que se exporta. Se pierde al reiniciar.
- **Frontend**: el estado del canvas (bloques, selección, historial Undo/Redo de 50 estados) vive
  íntegro en memoria del navegador. No hay persistencia entre sesiones.

## 🔗 Integraciones Externas

| Integración | Uso | Criticidad |
| --- | --- | --- |
| **google-genai** | Limpieza de fondo con IA | Opcional — la app funciona sin clave |
| **PyTorch + CUDA 12.1** | Aceleración GPU del OCR | Opcional — hay ruta CPU |
| **EasyOCR** | OCR local | **Crítica** para el caso de uso estrella. Importada en `try/except`: si falta, queda en `None` y solo funciona la ruta de PDF digital |

## ⚠️ Restricciones y Riesgos Técnicos

- **`PyMuPDF` es AGPL-3.0** bajo un proyecto MIT. Bloquea la distribución de binarios. Sustitución
  decidida y medida; ver `task.md`.
- **`build_pdf_export_from_original()` modifica el PDF original in-place**, cosa que reportlab no sabe
  hacer. Por eso el reemplazo necesita además `pypdf`.
- **Doble fuente de verdad del DPI**: `pdf_renderer.py` tiene `dpi=150` por defecto pero
  `endpoints.py:189` llama con `dpi=100`. **Manda el endpoint.** Trampa clásica al tocar escalas.
- **El estilo OCR es heurístico, no real**: `ocr_engine.py:105` estima `bbox_height * 0.76` acotado a
  [10, 96]. Nunca fue el tamaño tipográfico real, y es una de las causas del bug crítico.
- **Frontend sin bundler**: los scripts comparten ámbito global. Requiere IIFE por fichero antes de
  introducir Tauri, y está prohibido declarar `const isTauri`.
- **Cobertura de tests cero**: `backend/tests/` está vacía.
- **El banco de validación está fuera de git** (`docs_david/` ignorado + regla `*.pdf`).

## 🤖 Agent Harness (Arnés del Agente)

### 1. Gestión de Contexto (Context Engineering)

`dbv-specs-ops/task.md` es la fuente de verdad operativa y `memory.md` la cualitativa.
`MIGRACION_ESCRITORIO.md` (raíz) conserva el detalle de los spikes y las decisiones de la migración.
`docs_david/` es **histórico**: está desactualizado (su `STATUS.md` apunta a v1.3.0 con el proyecto en
v1.5.0) y fuera de git — no usarlo como estado actual.

### 2. Herramientas y MCP (Model Context Protocol)

No hay servidores MCP configurados para este proyecto.

### 3. Entorno de Ejecución (Sandboxing)

Desarrollo local en Windows. Python del proyecto en `backend/venv/Scripts/python.exe`.
**No instalar dependencias experimentales en ese venv**: los spikes usan un venv aparte.

### 4. Guardrails Deterministas de Seguridad

- Validación de tamaño y extensión antes de procesar (`settings.py` + `pdf_renderer.py`).
- Extensiones permitidas restringidas por lista blanca (`SUPPORTED_IMAGE_EXTENSIONS`).
- **No publicar instaladores mientras PyMuPDF siga en `requirements.txt`** (restricción legal, no técnica).

### 5. Interfaz Externa para Agentes (Agent Readiness)

No aplica: aplicación local sin superficie web pública.

---

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** — libre y gratuito · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
