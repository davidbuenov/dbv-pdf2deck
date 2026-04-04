# DBV PDF2Deck 📄➡️📊

> **Convierte PDFs e imágenes (incluidas infografías generadas por IA) en presentaciones de PowerPoint totalmente editables**  
> *Converts image-only PDFs and AI-generated infographics into fully editable PowerPoint decks using local OCR and a visual canvas.*

> Open Source · Sin dependencias de nube · Aceleración GPU opcional

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![EasyOCR](https://img.shields.io/badge/OCR-EasyOCR%20%2B%20PyTorch-orange)](https://github.com/JaidedAI/EasyOCR)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ¿Qué es DBV PDF2Deck?

**DBV PDF2Deck** convierte PDFs de solo imagen y archivos visuales (como infografías generadas por IA) en **diapositivas de PowerPoint totalmente editables**, usando OCR local y un editor visual en el navegador.

No necesitas Adobe Acrobat, ni subir tus archivos a ningún servicio en la nube. Todo ocurre **en tu propio ordenador**.

El flujo es sencillo:
1. **Sube tu PDF o imagen** (`.pdf`, `.png`, `.jpg/.jpeg`, `.webp`) → el sistema detecta automáticamente si tiene texto nativo o solo imagen.
2. **El OCR local analiza cada página** y coloca cajas editables sobre el texto detectado.
3. **Edita el texto directamente** en el navegador con un editor visual tipo Canvas.
4. **Exporta** el resultado como presentación de PowerPoint (`.pptx`) o PDF modificado.

En la práctica, esto es especialmente útil para **infografías de IA** con fallos frecuentes (erratas, textos cortados, mezcla de idiomas, tamaños incoherentes o títulos mal alineados): puedes corregirlos en minutos y exportar un resultado profesional.

---

## Caso de uso principal: Presentaciones de NotebookLM

NotebookLM genera presentaciones en PDF que son **solo imágenes**: no puedes seleccionar el texto, ni editarlo, ni convertirlo directamente a PowerPoint. DBV PDF2Deck resuelve exactamente ese problema:

```
NotebookLM PDF (imagen) → OCR Local → Editor Visual → PowerPoint Editable
```

## Caso de uso clave: infografías generadas por IA

Las infografías creadas por modelos generativos suelen tener errores visuales y de texto: palabras inventadas, números mal escritos, jerarquías rotas o bloques desalineados. DBV PDF2Deck permite:

1. Cargar la infografía directamente como imagen.
2. Detectar y editar cada bloque de texto con precisión.
3. Limpiar el fondo para eliminar texto defectuoso original.
4. Exportar el resultado final en `.pptx`, `.pdf` o `.md`.

---

## Características

| Característica | Descripción |
|---|---|
| 🧠 **OCR local** | Motor EasyOCR (PyTorch) integrado. Sin APIs de pago, sin internet requerido. |
| 🖼️ **Entrada flexible** | Procesa tanto PDF multipágina como imágenes sueltas (PNG/JPG/WEBP) como página única editable. |
| ⚡ **Aceleración GPU** | Soporte CUDA para tarjetas NVIDIA. El OCR pasa de ~40s a ~4s por página. |
| 🎨 **Editor Canvas** | Interfaz visual en el navegador. Arrastra, redimensiona y edita cajas de texto. |
| 🔍 **Multi-selección** | `Ctrl+Click` para seleccionar varios bloques. Igualación de estilos o fusión en uno. |
| 🗑 **Eliminar bloque en 1 clic** | Papelera en la barra de edición para borrar bloques seleccionados con confirmación. |
| ↖️ **Alineación de texto** | Control izquierda / centro / derecha en cada bloque. Se exporta a PDF y PPTX. |
| 🧽 **Limpieza de fondo híbrida** | Modo `Auto / Local (OpenCV) / Cloud (AI Studio)` para eliminar texto de fondo. |
| 🖥 **Consola de progreso real** | Streaming por página en vivo con heartbeat y ETA estimada. |
| 📥 **Exportación múltiple** | Descarga simultánea en PowerPoint (.pptx), PDF (vectorial) y Markdown (.md). |
| ↩️ **Undo / Redo** | Historial de 50 estados. Ctrl+Z / Ctrl+Y en el editor. |
| 🔒 **Privacidad total** | Los documentos nunca salen de tu máquina (salvo uso voluntario de IA). |

---

## Novedades de la versión 1.4.0

## Novedades de la versión 1.5.0

- 🖼 **Entrada ampliada a imágenes** en el flujo principal (`.png`, `.jpg`, `.jpeg`, `.webp`) además de PDF.
- ✨ **Enfoque reforzado en infografías de IA**: el flujo está optimizado para corregir erratas y defectos habituales de contenido generado.
- 🧱 **Protección no invasiva para estabilidad**: límites de tamaño de archivo y resolución para evitar bloqueos por entradas gigantes, sin reescalar automáticamente.
- ⚙️ **Configuración profesional con `.env`**: límites ajustables por entorno con plantilla `.env.example`.

## Novedades de la versión 1.4.0

- 🧩 **Instalación simplificada para Windows**:
   - `instalar_y_ejecutar.cmd`: instalador 1 clic (detecta Python, crea venv, instala deps y arranca todo).
   - `ejecutar_dbv.cmd`: arranque diario rápido.
   - Compatibilidad total: los `.bat` siguen funcionando como alias.
- 🧭 **Asistencia cuando falta Python**: el instalador abre automáticamente la página oficial de Python 3.12 y muestra pasos guiados.
- 🧽 **Limpieza de fondo local con OpenCV Inpainting** (sin API key) para fondos complejos (gradientes, texturas suaves).
- ☁️ **Modo de limpieza seleccionable**: `Auto / Local / Cloud` desde la barra superior.
- 📡 **Terminal asíncrona en tiempo real**: conexión SSE desde el inicio del proceso, sin volcado tardío al final.
- ⏱ **Heartbeat con tiempo transcurrido y ETA**: muestra progreso estimado por páginas ya procesadas.
- ✍️ **Mejora UX en edición inline**: corrección de pérdida de foco al interactuar con la barra de edición.
- 🗑 **Botón de eliminar bloque** en la barra de edición visual.
- 🧱 **Rediseño horizontal de la zona IA** para reducir altura y mejorar legibilidad de controles.

---

## Novedades de la versión 1.3.0

- ✍️ **Edición inline estilo PowerPoint**: edición directa dentro del bloque con barra contextual blanca (sin dependencia del modal clásico).
- 🎛️ **Toolbar contextual avanzada**: fuente, tamaño, alineación, color, transparencia, subrayado, interlineado y control de dimensiones `W/H`.
- ↔️ **Selección por rectángulo**: arrastra en zona vacía para seleccionar múltiples bloques de una vez.
- 🧩 **Paneles movibles**: barras flotantes arrastrables para evitar solapar contenido crítico.
- 📏 **Calibración validada**: consistencia tipográfica PDF/PPTX dentro de tolerancias estrechas.

---

## Stack Tecnológico

### Backend
- **Python 3.12** · FastAPI · Uvicorn
- **PyMuPDF** (`fitz`) — Extracción y exportación de PDF
- **EasyOCR + PyTorch** — Motor OCR local (CPU o GPU CUDA)
- **python-pptx** — Generación de PowerPoint
- **Pillow** — Procesamiento de imágenes

### Frontend
- **Vanilla JavaScript** (ES Modules, sin frameworks)
- **HTML5 Canvas** — Motor de edición visual
- **CSS3 Glassmorphism** — Interfaz moderna con dark mode

---

## Requisitos del Sistema

- **Sistema operativo:** Windows 10/11 (64-bit)
- **Python:** 3.12.x (recomendado) · [Descargar](https://www.python.org/downloads/release/python-3120/)
- **Navegador:** Chrome, Edge o Firefox moderno
- **GPU (opcional):** Tarjeta NVIDIA con soporte CUDA 12.1 para aceleración

> ⚠️ **Python 3.13 no es compatible** con PyTorch-CUDA actualmente. Usa la versión 3.12.

---

## Instalación y Arranque

> 🧭 **¿No eres informático/a?** Sigue la guía completa paso a paso:
> - Windows: [Guía para No Informáticos (Windows)](docs/GUIA_NO_INFORMATICOS.md)
> - macOS: [Guía para No Informáticos (macOS)](docs/GUIA_MAC_NO_INFORMATICOS.md)

### Opción recomendada (Windows, 1 clic)

1. Descarga o clona el proyecto.
2. Haz doble clic en:

```cmd
instalar_y_ejecutar.cmd
```

Este script:
- detecta Python,
- crea el entorno virtual,
- instala dependencias,
- arranca backend y frontend,
- abre el navegador.

Uso diario posterior:

```cmd
ejecutar_dbv.cmd
```

Para detener servicios:

```cmd
stop_dev.cmd
```

> Compatibilidad: también puedes seguir usando `start_dev.bat` y `stop_dev.bat`.

### Opción manual (avanzada)

### 1. Clonar el repositorio

```bash
git clone https://github.com/davidbuenov/dbv-pdf2deck.git
cd dbv-pdf2deck
```

### 2. Crear el entorno virtual (Python 3.12)

```cmd
cd backend
py -3.12 -m venv venv
venv\Scripts\activate
```

### 3. Instalar dependencias

**Opción A — Solo CPU (más rápido de instalar, ~200 MB):**
```cmd
pip install -r requirements.txt
```

**Opción B — Con aceleración GPU NVIDIA CUDA (recomendado, ~2.5 GB):**
```cmd
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

> 📖 Para más detalles sobre la instalación de GPU, consulta la [Guía de Instalación CUDA](docs/instalar_cuda.md).

### 4. Verificar GPU (opcional)

```cmd
python backend/test_cuda.py
```

Si tienes GPU NVIDIA correctamente configurada verás:
```
¿CUDA Disponible?: SÍ (Modo Turbo Activo)
Nombre de la GPU: NVIDIA GeForce RTX XXXX
```

### 5. Arrancar el sistema

Desde la raíz del proyecto:
```cmd
start_dev.cmd
```

Esto lanza automáticamente dos servidores:
- **Backend API:** `http://localhost:8000`
- **Interfaz Web:** `http://localhost:5500`

Abre `http://localhost:5500` en tu navegador y ¡listo!

### 6. Actualizar (usuarios expertos)

Si ya tienes DBV PDF2Deck instalado y quieres traer la última versión:

1. Detén servicios si están activos:

```cmd
stop_dev.cmd
```

2. Desde la raíz del proyecto, actualiza el código:

```bash
git pull --ff-only
```

3. Actualiza dependencias del backend en el entorno virtual:

```cmd
cd backend
venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

4. Arranca de nuevo:

```cmd
start_dev.cmd
```

Si has hecho cambios locales propios y `git pull` falla, guarda tu trabajo (commit o stash) antes de actualizar.

---

## Uso

### Límites de entrada (modo no invasivo)

Para mantener estabilidad y tiempos de respuesta, el backend aplica límites por defecto:

- Tamaño máximo de archivo: **20 MB**
- Lado máximo de imagen/página renderizada: **8000 px**
- Máximo total de píxeles por imagen/página: **25.000.000 px**

Si un archivo excede estos límites, se rechaza con un error claro (sin reescalado automático).

Puedes ajustar estos valores por variables de entorno:

- `DBV_MAX_UPLOAD_MB` (por defecto `20`)
- `DBV_MAX_IMAGE_SIDE_PX` (por defecto `8000`)
- `DBV_MAX_IMAGE_TOTAL_PIXELS` (por defecto `25000000`)

Soporte `.env` incluido:

- Copia `.env.example` como `.env`
- Puedes guardar `.env` en la raíz del proyecto o dentro de `backend/`
- El backend carga ambos (`backend/.env` y raíz `.env`) sin sobrescribir variables ya definidas en el sistema

### Editor Visual

1. **Arrastra y suelta** tu PDF o imagen en la zona de carga (o haz clic para seleccionarlo).
2. Espera a que el OCR procese las páginas (4–40 segundos según GPU/CPU).
3. Haz clic en cualquier caja de texto para entrar en **edición inline** directamente sobre el bloque.
4. Usa la barra contextual para cambiar fuente, tamaño, color, fondo, transparencia, **alineación**, **subrayado** e **interlineado**.
5. **Ctrl+Click** en varios bloques para seleccionarlos juntos:
   - **⚖️ Igualar Estilos**: aplica el mismo tamaño, colores y alineación a todos.
   - **🔗 Fusionar**: une los bloques en uno solo (texto concatenado con saltos de línea).
6. También puedes seleccionar varios bloques arrastrando un rectángulo en una zona vacía del canvas.
7. Navega entre páginas con los controles de paginación.

### Exportación

En la barra de salida puedes marcar qué formatos quieres generar (`.pdf`, `.pptx`, `.md`) antes de descargar.

Pulsa el botón **"📥 Descargar Selección"** para generar solo los formatos marcados. Se descargará un archivo `.zip` con:
- `documento_editado.pptx` — Presentación de PowerPoint con cajas editables
- `documento_editado.pdf` — PDF con el texto modificado superpuesto
- `documento_editado.md` — Versión Markdown pensada para reutilización textual, documentación o LLMs

Cuando el PDF original contiene hipervínculos ocultos, la exportación Markdown intenta preservarlos en formato `[texto](url)`.

### IA Generativa y Limpieza Local (Opcional)

El botón **✨ Limpiar Fondo** soporta tres modos:

- **Auto**: usa Cloud si hay API key; si no, usa Local.
- **Local (OpenCV)**: inpainting offline, no requiere API key.
- **Cloud (AI Studio)**: limpieza con IA generativa (requiere API key).

Para usar modo Cloud:
1. Obtén una API Key gratuita en [Google AI Studio](https://aistudio.google.com/).
2. Pégala en el campo **"Google AI Studio API Key"** de la barra superior.
3. Selecciona **Cloud** (o deja **Auto**) y pulsa **"✨ Limpiar Fondo"**.

> La API Key se guarda localmente en tu navegador (`localStorage`). Nunca se envía a nuestros servidores.

> 💡 Consejo de edición rápida: usa **Ctrl+Click** sobre varios bloques para activar la multi-selección y editar estilos por lotes.

---

## Estructura del Proyecto

```
dbv-pdf2deck/
├── backend/                    # Servidor Python/FastAPI
│   ├── api/
│   │   └── endpoints.py        # Rutas REST (/process, /export)
│   ├── core/
│   │   ├── ocr_engine.py       # Motor EasyOCR + detección GPU
│   │   ├── pdf_renderer.py     # Extracción de bloques nativos (PyMuPDF)
│   │   ├── exporter_engine.py  # Exportación PDF y PPTX
│   │   └── result.py           # Patrón Result (Ok/Err)
│   ├── main.py                 # Arranque FastAPI + CORS
│   ├── requirements.txt        # Dependencias Python
│   └── test_cuda.py            # Script de diagnóstico GPU
├── frontend/                   # Interfaz Web
│   ├── index.html              # Estructura principal
│   ├── styles.css              # Diseño Glassmorphism Dark Mode
│   ├── canvas_engine.js        # Motor de edición visual Canvas
│   └── main.js                 # Comunicación con el backend
├── docs/                       # Documentación pública
│   ├── instalar_cuda.md        # Guía de instalación GPU
│   └── STYLEGUIDE.md           # Guía de estilo de código
├── instalar_y_ejecutar.cmd     # Instalador 1 clic (Windows)
├── ejecutar_dbv.cmd            # Arranque rápido diario
├── start_dev.cmd               # Entrada principal compatible
├── stop_dev.cmd                # Detención de servicios
├── start_dev.bat               # Alias legacy -> .cmd
└── stop_dev.bat                # Alias legacy -> .cmd
```

---

## Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Lee la [Guía de Estilo de Código](docs/STYLEGUIDE.md) antes de contribuir.
2. Asegúrate de que tu código usa **tipado estricto** (Python 3.12+) y el **Patrón Result** para manejo de errores.
3. Abre un Issue antes de modificar partes del motor OCR o del exportador.

### Estándares de calidad exigidos
- Python: Tipado fuerte con `mypy`, linting con `ruff`
- Funciones de backend devuelven `Result[T]`, nunca lanzan excepciones no controladas
- Frontend: JavaScript vanilla sin frameworks externos

---

## Licencia

Distribuido bajo la licencia **MIT**. Ver [LICENSE](LICENSE) para más detalles.

---

## Agradecimientos

- [EasyOCR](https://github.com/JaidedAI/EasyOCR) — Motor OCR open source
- [PyMuPDF](https://pymupdf.readthedocs.io/) — Procesamiento de PDF en Python
- [FastAPI](https://fastapi.tiangolo.com/) — Framework web asíncrono
- [python-pptx](https://python-pptx.readthedocs.io/) — Generación de PowerPoint

---

## ✍️ Autores y Créditos

### 👤 Concebido y dirigido por

**David Bueno Vallejo**

> *Idea original, visión de producto, decisiones de arquitectura, pruebas y refinamiento de UX.*

[![LinkedIn](https://img.shields.io/badge/LinkedIn-davidbueno-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/davidbueno/)
[![Website](https://img.shields.io/badge/Web-davidbuenov.com-6366f1?logo=google-chrome&logoColor=white)](https://davidbuenov.com)

---

### 🤖 Desarrollado con Programación en Pareja con IA

Este proyecto fue construido mediante un **flujo de trabajo de codificación asistida por IA**, donde el autor humano dirigió la arquitectura y las decisiones de producto mientras los modelos de IA generaron, depuraron y refinaron el código.

| Herramienta | Rol en el proyecto |
|---|---|
| **[Antigravity](https://antigravity.google)** · *by Google DeepMind* | Agente principal de codificación. Backend, frontend, motor de exportación y arquitectura general. |
| **[Gemini](https://gemini.google.com)** · *by Google* | Motor de IA generativa que impulsa la función opcional de limpieza de fondos. |
| **[Claude](https://claude.ai)** · *by Anthropic* | Agente secundario de codificación. Configuración de GPU, depuración y documentación. |
| **GPT Codex** · *by OpenAI* | Programación en pareja para implementación, refactor, depuración y cierre de funcionalidades de la versión 1.4.0. |

> *"La visión fue humana. El código fue una conversación."*
