# 🏗 Arquitectura Técnica: DBV PDF2Deck

> Documenta la arquitectura **tal como está hoy (2026-08-31, v2.0.0)**, no como debería ser.
> La migración a Tauri v2 y la sustitución de PyMuPDF, que en la versión anterior de este documento
> aparecían "en migración", están **completadas y publicadas**. Ver `task.md` para el detalle de qué
> está verificado en ejecución real por plataforma (Windows sí; macOS y Linux, publicados pero
> pendientes de probar en máquina real) y `memory.md` para el porqué de cada decisión.

---

## 🛠 Stack Tecnológico

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Backend | **FastAPI** 0.110+ / **uvicorn** 0.29+ | Servidor local en `localhost`; en escritorio corre como sidecar |
| Runtime | **Python 3.12** (recomendado 3.12.10) | venv en `backend/venv/` (dev) / `.venv-sidecar/` aparte (build del sidecar) |
| Lectura PDF | **pypdfium2** | PyMuPDF (AGPL-3.0) erradicado por completo; ver ADR 2026-08-28 en `memory.md` |
| Escritura PDF | **reportlab** + **pypdf** | reportlab genera, pypdf fusiona sobre el PDF original in-place |
| OCR | **EasyOCR** + **PyTorch** (CPU o CUDA) | GPU opcional, CPU como alternativa (`try/except` en `ocr_engine.py`) |
| Presentaciones | **python-pptx** | |
| Imagen | **Pillow**, **opencv-python-headless** | Inpainting local (Goma Mágica) |
| IA generativa | **google-genai** | Limpieza de fondo cloud — código presente pero **oculto** en la UI actual (`#ai-external-options[hidden]`); el botón real siempre usa el modo local |
| Frontend | **JS clásico, sin bundler, IIFE por fichero** | `canvas_engine.js`, `main.js`, `api.js`, `desktop_shell.js`, `i18n.js`, `help_content.js` — todos cargados como `<script>` clásico, cada uno expone su API bajo un único `window.dbv*` |
| Render UI | **Canvas 2D** nativo | Sin framework de UI |
| Escritorio | **Tauri v2** | Completo y publicado (v2.0.0) — ver sección dedicada abajo |

## 📂 Estructura de Directorios

```text
dbv-pdf2deck/
├── backend/
│   ├── main.py                 # Arranque FastAPI, /health, monta el router
│   ├── requirements.txt
│   ├── api/
│   │   └── endpoints.py        # Superficie HTTP. Fija DPI=100. Enruta OCR vs nativo
│   ├── core/
│   │   ├── pdf_renderer.py     # Lee/rasteriza PDF (pypdfium2), extrae bloques nativos con estilo
│   │   ├── ocr_engine.py       # EasyOCR + heurísticas de estilo
│   │   ├── exporter_engine.py  # Reensamblado a PDF (reportlab+pypdf) y PPTX
│   │   ├── markdown_exporter.py# Exportación a MD + rescate de enlaces
│   │   ├── ai_cleaner.py       # Limpieza de fondo (local OpenCV; rama cloud oculta)
│   │   ├── settings.py         # Config por entorno (.env)
│   │   └── result.py           # Tipo Result/Ok/Err
│   ├── tests/                  # 45+ tests, ver `/code-simplify` y Fase de tests en task.md
│   └── venv/                   # Ignorado
├── frontend/                    # Compartido entre modo web y escritorio
│   ├── index.html
│   ├── canvas_engine.js        # Editor visual Canvas
│   ├── main.js                 # Orquestación UI, carga de documentos, atajos
│   ├── api.js                  # Único fichero que sabe si estamos en Tauri (`runningInTauri`)
│   ├── desktop_shell.js        # Chrome de escritorio: barra superior, chincheta, «Acerca de», updater
│   ├── i18n.js                 # ES/EN, patrón `dbv-md-reader`
│   ├── help_content.js         # Contenido del modal de ayuda
│   └── styles.css
├── scripts/
│   └── check-tauri-globals.mjs # Puerta de build: aborta si un .js colisiona con globales de Tauri
├── packaging/
│   ├── build_sidecar.py        # PyInstaller --onedir + poda de DLL/licencias vendorizadas
│   └── build_msix.mjs          # Empaquetado MSIX con fichero de mapeo (ver sección Escritorio)
├── src-tauri/                   # Rust/Tauri v2
│   ├── src/lib.rs              # Arranque, sidecar, menú nativo de macOS, comandos IPC
│   ├── sidecar/                 # Generado — salida de build_sidecar.py, recurso de Tauri
│   ├── gen/windows/             # bundle.config.json + manifiesto para el MSIX
│   ├── tauri.conf.json          # Config base
│   └── tauri.linux.conf.json    # Override: targets Linux limitados a deb+appimage (sin rpm)
├── docs/                       # Guías públicas (no informáticos, CUDA, styleguide) + assets de tienda
├── docs_david/                 # ⚠️ IGNORADO por git — notas internas + banco de PDFs
├── dbv-specs-ops/              # Framework SDD (esta carpeta)
├── MIGRACION_ESCRITORIO.md     # Contexto y decisiones de la migración a escritorio
├── README.md / README.en.md    # Bilingüe, instalación de escritorio priorizada sobre la web
└── start_dev.cmd / ejecutar_dbv.cmd / instalar_y_ejecutar.cmd
```

## 🖥️ Escritorio (Tauri v2) — completo y publicado

- **Modo dual, no sustitución**: el mismo backend FastAPI y el mismo frontend sirven tanto al modo web
  como al escritorio. `frontend/api.js` es el único fichero que sabe si está corriendo bajo Tauri
  (`runningInTauri`); el resto del frontend no se entera.
- **Backend como sidecar Python**, no reescrito en Rust: `easyocr` es la razón de ser de la app y no
  tiene equivalente maduro en Rust. Empaquetado con PyInstaller `--onedir` (no `--onefile` — ver
  `memory.md`, `--onefile` no arranca en ejecución real con esta combinación de dependencias) y
  bundleado como **recurso de Tauri** (`bundle.resources`), no como `externalBin` de un solo fichero.
  `src-tauri/src/lib.rs` resuelve la ruta con `app.path().resource_dir()` y lo lanza con
  `app.shell().command(...)`.
- **`packaging/build_sidecar.py`** también poda del paquete: la DLL vendorizada de Visual C++ que
  colisiona con la del sistema (Windows), `torch/include/` (cabeceras C++ nunca usadas en runtime) y
  `licenses/` de cada `.dist-info` (rutas anidadísimas que rozan el límite de 260 caracteres de
  Windows).
- **Menú de aplicación nativo de macOS** (`#[cfg(target_os = "macos")] mod macos_menu` en `lib.rs`),
  portado del patrón ya probado en `dbv-md-reader` — localización ES/EN según el idioma del sistema,
  acciones reales (Nuevo/Abrir/Exportar/Deshacer/Rehacer/Alternar vista previa) reenviadas al frontend
  por eventos. Sin verificar en un Mac real todavía.
- **Puerta de build contra colisión de globales de Tauri** (`scripts/check-tauri-globals.mjs`,
  enganchada en `beforeDevCommand`/`beforeBuildCommand`): instancia cada `.js` del frontend en un
  contexto `node:vm` con los globales que Tauri inyecta (`isTauri`, `__TAURI__`...) y aborta el build
  si algún fichero colisiona — el mismo incidente real que dejó la interfaz de escritorio muerta en
  `dbv-teleprompter` (v0.2.0, publicado).
- **Empaquetado MSIX para Microsoft Store** (`packaging/build_msix.mjs`): genera el `.msixbundle` con
  un fichero de mapeo para `MakeAppx.exe` en vez de su modo directorio — el modo directorio no sigue
  los *reparse points* (symlinks) que deja el copiado de recursos de Tauri, y silenciosamente empaqueta
  solo un puñado de ficheros de miles. Verificado de extremo a extremo (desempaquetado real +
  sidecar arrancado). Enviado a Partner Center, a la espera de certificación.
- **Distribución multiplataforma** vía GitHub Releases (`.github/workflows/release-{windows,linux,macos}.yml`):
  Windows (NSIS + MSI), Linux (`.deb` + `.AppImage` — `.rpm` deliberadamente excluido, ver `memory.md`),
  macOS (`.dmg`, solo `aarch64-apple-darwin` — Apple no vende Macs Intel desde 2023, y un build
  universal exigiría compilar el sidecar Python dos veces sin garantía de wheels para macOS Intel).
- **Auto-actualización** con `tauri-plugin-updater` + clave minisign propia (con contraseña, custodiada
  fuera del repo). Las instalaciones de tienda (MSIX) se detectan con `is_packaged_app()` y ocultan el
  botón — las actualiza la tienda, no el updater propio.

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

- **`build_pdf_export_from_original()` modifica el PDF original in-place**, cosa que reportlab no sabe
  hacer por sí solo — de ahí que el exportador necesite además `pypdf` para fusionar sobre el original.
- **Doble fuente de verdad del DPI**: `pdf_renderer.py` tiene `dpi=150` por defecto pero
  `endpoints.py:189` llama con `dpi=100`. **Manda el endpoint.** Trampa clásica al tocar escalas.
- **El estilo OCR es heurístico, no real**: `ocr_engine.py` estima el tamaño a partir del alto del
  bbox (rango ampliado a [10, 400] tras el bug WYSIWYG de 2026-08-30). Nunca es el tamaño tipográfico
  real de origen.
- **Frontend sin bundler**: los scripts comparten ámbito global. IIFE obligatoria por fichero (ya
  aplicada a los seis ficheros de `frontend/`) y prohibido declarar `const isTauri` (o cualquier
  identificador que colisione con los globales que Tauri inyecta) — hay una puerta de build
  (`scripts/check-tauri-globals.mjs`) que lo comprueba automáticamente, pero sigue siendo la trampa más
  fácil de reintroducir sin darse cuenta al añadir un `.js` nuevo.
- **macOS y Linux publicados sin verificar en ejecución real** (solo Windows lo está, de extremo a
  extremo). Ver `task.md`, snapshot 2026-08-31.
- **El banco de validación está fuera de git** (`docs_david/` ignorado + regla `*.pdf`).
- **Instalador pesado (2-5 GB)**: torch+easyocr congelados con PyInstaller. Decisión consciente —
  ver `memory.md` — de enviar el paquete completo tal cual en vez de esperar a un asistente de primer
  arranque que provisione el OCR bajo demanda; ese asistente sigue sin construirse.

## 🤖 Agent Harness (Arnés del Agente)

### 1. Gestión de Contexto (Context Engineering)

`dbv-specs-ops/task.md` es la fuente de verdad operativa y `memory.md` la cualitativa.
`MIGRACION_ESCRITORIO.md` (raíz) conserva el detalle de los spikes y las decisiones de la migración.
`docs_david/` es **histórico**: está muy desactualizado (predata incluso la migración a Tauri) y fuera
de git — no usarlo como estado actual bajo ningún concepto.

### 2. Herramientas y MCP (Model Context Protocol)

No hay servidores MCP configurados para este proyecto.

### 3. Entorno de Ejecución (Sandboxing)

Desarrollo local en Windows. Python del proyecto en `backend/venv/Scripts/python.exe`.
**No instalar dependencias experimentales en ese venv**: usa uno aparte (`.venv-sidecar/` es el que
usa `packaging/build_sidecar.py` para congelar el sidecar con PyInstaller, y ya está gitignored).

### 4. Guardrails Deterministas de Seguridad

- Validación de tamaño y extensión antes de procesar (`settings.py` + `pdf_renderer.py`).
- Extensiones permitidas restringidas por lista blanca (`SUPPORTED_IMAGE_EXTENSIONS`).
- La restricción histórica de "no publicar instaladores mientras PyMuPDF siga en `requirements.txt`"
  ya no aplica — PyMuPDF está erradicado desde el 2026-08-28 y la v2.0.0 ya se publicó.

### 5. Interfaz Externa para Agentes (Agent Readiness)

No aplica: aplicación local sin superficie web pública.

---

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** — libre y gratuito · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
