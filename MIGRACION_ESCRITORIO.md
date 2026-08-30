# 🖥️ Migración a escritorio nativo — punto de partida

> ✅ **Migración completada y publicada (v2.0.0, 2026-08-30/31).** Este fichero queda como **registro
> histórico** de las decisiones tomadas al arrancar la migración — sigue siendo la referencia de *por
> qué* se decidió cada cosa (sidecar vs. reescritura en Rust, sustitución de PyMuPDF, modo dual...).
> Para el estado **actual** (qué está verificado en ejecución real por plataforma, qué falta antes de
> anunciar la v2.0.0 como estable en macOS/Linux, MSIX en Partner Center), ver el snapshot de contexto
> del 2026-08-31 en `dbv-specs-ops/task.md` y el log de decisiones de `dbv-specs-ops/memory.md`.

> **Qué es este fichero.** El arranque de la conversión de DBV PDF2Deck a aplicación de escritorio
> (Tauri v2). Recoge el trabajo previo ya hecho el **2026-08-28** en una sesión sobre el repo
> `dbv-tauri-starter`, para que la sesión que continúe aquí no tenga que redescubrirlo.
>
> **Este fichero no es el procedimiento.** El procedimiento vive en `dbv-tauri-starter`
> (ver abajo). Esto es el contexto + las decisiones que ya están tomadas + el primer paso concreto.

---

## 1. Cómo arrancar la sesión en este repo

Todas las instrucciones de conversión viven en el repositorio de la plantilla:

- **Repo:** <https://github.com/davidbuenov/dbv-tauri-starter>
- **Local:** `d:\Programacion\github-davidbuenov\dbv-tauri-starter`
- **Procedimiento ejecutable:** `MIGRATION_PROMPT.md` (raíz de ese repo) — 9 fases con puertas de parada,
  desde clasificar la app hasta publicar el primer instalador.
- **Base conceptual:** `dbv-specs-ops/docs/WEB_TO_DESKTOP_MIGRATION.md`, que se lee **antes** que
  `dbv-specs-ops/docs/NATIVE_DESKTOP_APPS.md`.

> 📌 **Para la primera sesión no hace falta salir de este repo.** El siguiente paso son los spikes de §5,
> que solo leen código de PDF2Deck. `MIGRATION_PROMPT.md` se necesita a partir de la **Fase 2**, y para
> entonces la Fase 2.2 ya habrá traído `dbv-specs-ops/` dentro de este repo. Si aun así hiciera falta leer
> la plantilla desde aquí, añádela como directorio de trabajo:
> `/add-dir d:\Programacion\github-davidbuenov\dbv-tauri-starter`

**Prompt para abrir la conversación aquí:**

```text
Lee MIGRACION_ESCRITORIO.md de la raíz de este repo. Vamos a migrar
DBV PDF2Deck a aplicación de escritorio nativa con Tauri v2, siguiendo
el framework dbv-specs-ops.

Las Fases 0 y 1.1 ya están hechas y documentadas ahí, pero verifica sus
conclusiones leyendo los ficheros reales antes de darlas por buenas — no
te fíes de que estén escritas.

Empezamos por §5: el spike de lectura con pypdfium2 y la estimación del
coste de portar exporter_engine.py. Nada de tocar Tauri todavía; primero
hay que decidir qué hacemos con PyMuPDF.
```

> ⚠️ **Regla de dirección de la adopción (no negociable).** La plantilla viaja **hacia este repo**, nunca
> al revés. Clonar `dbv-tauri-starter` para meter dentro PDF2Deck destruiría el historial, los issues y la
> URL de este proyecto. Ver `WEB_TO_DESKTOP_MIGRATION.md` §2.
>
> ⚠️ **Por qué el prompt dice "verifica"**. En agosto se detectaron dos casos de lecciones que un ADR daba
> por escritas en el framework y que nunca habían llegado allí. La regla que salió de eso: *un documento que
> declara algo no es prueba de que sea cierto*. Aplícalo también a este fichero.

---

## 2. Estado del framework

`dbv-specs-ops` está en **v2.7.0** (28-ago-2026), con la cosecha de lecciones de las tres apps ya
publicadas en tienda: `dbv-md-reader`, `dbv-teleprompter` y `eer-studio`.

**Este repo todavía NO tiene `dbv-specs-ops/` adoptado.** Es la Fase 2.2 del `MIGRATION_PROMPT.md` y hay que
hacerla antes de tocar código de Tauri — adopción nueva, no `UPGRADE_PROMPT.md`.

Dos secciones de v2.7.0 aplican directamente a esta migración y conviene leerlas enteras antes de la Fase 4:

- `NATIVE_DESKTOP_APPS.md` **§3** — patrón sin bundler: la IIFE obligatoria en todos los ficheros JS.
- `NATIVE_DESKTOP_APPS.md` **§7** — DoD de Experiencia de Escritorio: los 6 criterios de aceptación.

### Dónde se lleva hoy el seguimiento en este repo

**No hay `task.md` ni `memory.md` del framework** — llegarán con la adopción (Fase 2.2). Hasta entonces, el
seguimiento del proyecto vive en documentación propia anterior, que está **desactualizada** y conviene leer
como contexto histórico, no como estado actual:

| Fichero | Última actualización | Contenido |
| --- | --- | --- |
| `docs_david/STATUS.md` | 2026-04-03 | Estado ejecutivo, objetivo v1.3.0 |
| `docs_david/TASKS.md` | 2026-04-01 | Backlog + **un bug crítico abierto de exportación OCR** (ver §4) |
| `docs_david/ARCHITECTURE.md`, `TECH_STACK.md` | — | Base útil para reconstruir `ARCHITECTURE.md` en la adopción |

Cuando se ejecute la Fase 2.2, el `task.md` del framework pasa a ser la fuente de verdad y estos quedan como
histórico. **Migrar el bug crítico de `TASKS.md` al nuevo `task.md`** en ese momento, para que no se pierda.

---

## 3. Fase 0 — Clasificación (hecha, verificar)

Leído el **código real**, no el README:

| Aspecto | Hallazgo | Fichero |
| --- | --- | --- |
| Frontend | JS clásico **sin bundler y sin `package.json`** — `canvas_engine.js` (78 KB) + `main.js` (9 KB) + `index.html` + `styles.css` | `frontend/` |
| Backend | FastAPI + uvicorn, arrancado por `start_dev.cmd` contra `localhost` | `backend/main.py`, `backend/api/endpoints.py` |
| Pesos pesados | `PyMuPDF`, `easyocr`, `torch`/`torchvision`/`torchaudio` (índice CUDA 12.1), `opencv-python-headless`, `python-pptx`, `google-genai` | `backend/requirements.txt` |

**Arquetipo: D** (backend Python pesado) según `WEB_TO_DESKTOP_MIGRATION.md` §1 — pero ver §5, porque una de
las razones para clasificarlo como D es evitable.

**Consecuencia inmediata para la Fase 4:** al no haber bundler, aplica el patrón §3 de
`NATIVE_DESKTOP_APPS.md` y este repo está en primera línea de riesgo para las dos trampas que más caro han
salido en las migraciones anteriores:

1. **Colisión de identificadores en el ámbito global.** Los scripts clásicos comparten ámbito. `main.js` y
   `canvas_engine.js` deben ir **cada uno en su propia IIFE** antes de añadir ningún puente de Tauri. Un
   choque de nombres produce un `SyntaxError` de *parseo* que mata el fichero entero sin ejecutar ni su
   primera línea: la app renderiza perfecta y la interfaz queda completamente muerta, sin nada en pantalla.
2. **Nunca declarar `const isTauri`.** Con `withGlobalTauri: true`, Tauri v2 ya inyecta un global con ese
   nombre. Usa `runningInTauri` o similar.

---

## 4. Fase 1.1 — Auditoría de licencias (hecha; hay un problema **actual**, no futuro)

### 🔴 Contradicción de licencia viva en el repo publicado

- `README.md:11` declara **MIT** con un badge que enlaza a `LICENSE`.
- **No existe fichero `LICENSE`** en la raíz del repo. Un repo sin licencia es, por defecto, "todos los
  derechos reservados" — el badge y el enlace prometen algo que no está.
- `backend/requirements.txt` incluye **`PyMuPDF>=1.23.0`, que es AGPL-3.0** (o licencia comercial de
  Artifex).

MIT sobre una obra que enlaza AGPL-3.0 no se sostiene. **Esto ya es un problema hoy**, con la app
distribuida como código; empaquetarla en un binario para una tienda solo lo hace evidente e insoslayable.

### Las tres salidas, y cuál se recomienda

| Opción | Coste | Efecto |
| --- | --- | --- |
| **(A) Sustituir PyMuPDF** — lector `pypdfium2` + escritor `reportlab` | El mayor de los tres. Ver §alcance real, abajo: no es un spike, es un proyecto | Elimina el AGPL de raíz. Ambas son permisivas (Apache-2.0/BSD-3), compatibles con MIT y con cualquier tienda |
| (B) Licencia comercial de Artifex | Dinero recurrente | Resuelve lo legal, no cambia nada técnico |
| (C) Relicenciar todo el proyecto a AGPL-3.0 | Gratis | Obliga a AGPL a cualquier obra derivada y complica la distribución en tiendas |

**Cuál recomendar todavía no se puede decir con honestidad**: depende de lo que cueste (A), y eso es
justo lo que miden los spikes de §5. Lo que sí está claro es que (A) es la única que deja el proyecto
libre de ataduras, y que el bug abierto del exportador (ver abajo) inclina la balanza a su favor.

**Independientemente de cuál se elija, hay que crear el fichero `LICENSE` que el README promete.**

### El alcance real de la sustitución: tres módulos, dos problemas distintos

PyMuPDF **no** está solo en el renderizador. `grep -rn "fitz" backend/` lo encuentra en tres módulos, y el
uso más denso es como **escritor de PDF**, no como lector:

| Módulo | Usos de `fitz` | Papel | ¿`pypdfium2` sirve? |
| --- | --- | --- | --- |
| `core/exporter_engine.py` | 18 | **Escritura de PDF**: `fitz.open()` para crear documento, `insert_image`, `insert_textbox`, `get_text_length`, `draw_line` (subrayado), firma oculta | ❌ **No.** PDFium es lector/rasterizador; no tiene API de composición de texto equivalente |
| `core/markdown_exporter.py` | 11 | `fitz.Rect` como ayuda geométrica + rescate de enlaces ocultos del PDF original | ⚠️ Parcial. `Rect` se sustituye por una dataclass trivial; la extracción de enlaces necesita revisión |
| `core/pdf_renderer.py` | 7 | Lectura, rasterizado y extracción de spans | ✅ Sí |

**Consecuencia: la opción (A) es un proyecto, no un spike-y-sustituir.** Hacen falta *dos* piezas:

1. **Lector/rasterizador** → `pypdfium2` (Apache-2.0/BSD-3).
2. **Escritor de PDF** → librería nueva. Candidata madura y permisiva: **`reportlab`** (BSD-3). `fpdf2` es
   más ligera pero LGPL-3.0, o sea copyleft otra vez, aunque más suave — no cambies un problema de licencia
   por otro sin darte cuenta.

Esto **reabre la opción (B)** (licencia comercial de Artifex): si la sustitución del exportador resulta cara,
pagar puede salir mejor que reescribir. Es una decisión de coste, y es del usuario.

> ⚠️ **Las dos incógnitas a medir antes de comprometerse.**
>
> 1. **Lectura:** los metadatos de estilo **por span** (nombre de fuente, tamaño, negrita) son más pobres en
>    PDFium que en MuPDF, y `pdf_renderer.py` los propaga hasta el `.pptx`. *Matiz:* esto solo afecta a la
>    ruta de **PDF digital**. En la ruta de OCR el estilo ya es una heurística
>    (`ocr_engine.py::_estimate_font_size_from_bbox`, `bbox_height * 0.76` — nunca fue el tamaño real), así
>    que ahí no hay nada que degradar.
> 2. **Escritura:** reescribir `exporter_engine.py` sobre `reportlab` es el grueso del trabajo y hay que
>    estimarlo leyendo ese fichero, no a ojo.

### 🎁 Un apunte que juega a favor de reescribir el exportador

`docs_david/TASKS.md` (01-abr-2026) documenta un **bug crítico abierto** precisamente ahí: en la exportación
de páginas con OCR, el PPTX sale con texto minúsculo y rectángulos blancos opacos tapando el fondo, y en el
PDF el texto es invisible porque **`insert_textbox` de PyMuPDF no renderiza** cuando el texto no cabe en el
rect. Es decir: el código que habría que reescribir es el mismo que hoy está roto.

`reportlab` da control explícito de layout y medición de texto, que es exactamente lo que le falta al
enfoque actual. **Sustituir PyMuPDF en el exportador no sería solo pagar una deuda legal — sería la ocasión
natural de arreglar ese bug.** Verifica primero si el bug sigue vivo: ese documento tiene ~5 meses.

### Resto de dependencias — sin problemas

`easyocr` (Apache-2.0), `torch`/`torchvision`/`torchaudio` (BSD-3), `opencv-python-headless` (Apache-2.0),
`python-pptx` (MIT), `Pillow` (MIT-CMU), `fastapi`/`uvicorn` (MIT/BSD), `google-genai` (Apache-2.0).
PyMuPDF es la única pieza copyleft del inventario.

---

## 5. 🚦 Primer paso: los dos spikes (antes que ninguna otra cosa)

Es la única incógnita capaz de tirar abajo el plan completo, así que va primero — antes de la rama, antes de
adoptar el framework, antes de tocar Tauri.

**Objetivo:** poner precio a la opción (A) con datos, para poder compararla honestamente con (B) y (C).
Son dos preguntas independientes y conviene responderlas por separado.

### 5.1 Spike de **lectura** — ¿aguanta `pypdfium2`?

1. Reunir un banco de PDFs reales de los tres casos que maneja la app: PDF digital con capa de texto, PDF de
   solo imagen (escaneado), e infografía generada por IA. Hay material de partida en
   `docs_david/test_files/`, `docs_david/pruebas/` y `docs_david/infografiaok.pdf` — verificar que siguen
   siendo representativos.
2. Script de comparación aislado — **fuera** de `backend/`, sin tocar código de producción — que procese ese
   banco con `fitz` y con `pypdfium2` y vuelque, por span: texto, bbox, nombre de fuente, tamaño y negrita.
3. Comparar. Lo que importa no es coincidir al decimal, sino si los datos bastan para reconstruir un `.pptx`
   fiel.

**Criterio de aceptación (fijarlo antes de mirar los resultados, no después):**

- ✅ **Verde** — texto y bboxes equivalentes; el estilo se degrada de forma tolerable (p. ej. se pierde el
  nombre exacto de la fuente pero se conservan tamaño y negrita).
- 🟡 **Ámbar** — se pierde estilo de forma apreciable pero recuperable con heurísticas → estimar ese trabajo.
- 🔴 **Rojo** — no hay datos suficientes para un `.pptx` fiel en la ruta de PDF digital.

Recordatorio: esto **solo afecta a la ruta de PDF digital**. La ruta de OCR ya usa heurísticas de estilo, no
datos reales de fuente, así que un rojo aquí no toca el caso de uso estrella de la app.

### 5.2 Estimación de **escritura** — ¿cuánto cuesta `exporter_engine.py` sobre `reportlab`?

No es un spike de código, es una lectura con lápiz: abrir `backend/core/exporter_engine.py` (y
`markdown_exporter.py`) y estimar el trabajo real de portar `insert_textbox`, `get_text_length`,
`insert_image` y `draw_line` a `reportlab`. Comprobar de paso si el bug crítico de `docs_david/TASKS.md`
sigue vivo, porque si lo está, parte de ese trabajo hay que hacerlo igualmente.

### 5.3 🛑 STOP — decisión del usuario

Con los dos resultados sobre la mesa, elegir entre (A) sustituir, (B) licencia comercial de Artifex o
(C) relicenciar a AGPL. **No seguir a la Fase 2 sin esta decisión tomada**, porque condiciona el resto.

**Los spikes son descartables.** No se integran: informan una decisión y se borran.

---

## 5bis. ✅ Resultados de los spikes (ejecutados el 2026-08-28)

Ejecutados fuera de `backend/`, en un venv aislado del scratchpad. **Ninguna línea de este repo
modificada.** Banco: los 13 PDFs de `docs_david/` (7 con texto nativo, 6 solo imagen → ruta OCR).
Versiones medidas: `pypdfium2` 5.13.0, `reportlab` 5.0.1, `pypdf` 6.16.2, contra el `PyMuPDF` 1.27.2.2
del venv del proyecto.

### 5.1 Lectura — 🟢 **VERDE**

Comparación por línea, emparejando por solape de bbox (IoU > 0.3), replicando la lógica real de
`pdf_renderer.py::process_pdf_file` en ambos motores:

| Documento | Pág | Líneas | Emparej. | Texto | Tamaño | Negrita | Cursiva | Fuente | Color | IoU |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ICU-Storytelia | 10 | 30 | 30 | 100% | 100% | 100% | 100% | 100% | 100% | 0.81 |
| infografiaok | 1 | 66 | 65 | 98.5% | 98.5% | 100% | 100% | 100% | 98.5% | 0.80 |
| My Sweet Paradise | 5 | 166 | 166 | 100% | 99.4% | 88.0% | 100% | 100% | 100% | 0.91 |
| PADRON (formulario) | 2 | 115 | 114 | 98.2% | 99.1% | 99.1% | 100% | 100% | 99.1% | 0.99 |
| The_AI_Director_OCRv2 | 18 | 294 | 294 | 99.3% | 99.3% | 100% | 100% | 100% | 95.9% | 0.94 |
| **TOTAL** | | **676** | **674** | **99.3%** | **99.3%** | **96.9%** | **100%** | **100%** | **97.9%** | |

Se recuperan **674 de 676 líneas (99.7%)**. Contando el texto equivalente (mismo contenido con
partición de línea distinta), la coincidencia de texto sube al **99.9%**.

**El temor del §4 no se confirma: el estilo por span NO se degrada.** `pypdfium2` 5.13.0 expone
`FPDFText_GetFontInfo` (nombre + flags del descriptor), `GetFontSize`, `GetFontWeight` y
`GetFillColor`. El nombre de fuente coincide al **100%** — ni siquiera se pierde, que era justo la
pérdida que el §4 daba por tolerable.

Tres trampas encontradas, las tres resueltas dentro del spike. Son *la* parte que hay que conservar,
porque ninguna es obvia:

1. **`FPDFText_GetFontSize` devuelve el tamaño SIN escalar por la matriz de texto.** MuPDF devuelve el
   tamaño efectivo. Hay que multiplicar por la escala vertical de `FPDFText_GetMatrix`. Sin esto, un
   documento con matriz 0.75 reportaba 20pt donde MuPDF decía 15pt. Coincidencia de tamaño:
   **82.6% → 99.3%**.
2. **Los espacios generados por PDFium traen caja de altura 0.** Si participan en el agrupado por
   baseline, parten la línea en cada palabra (296 "líneas" donde MuPDF veía 46).
3. **El peso declarado NO es fiable en subconjuntos embebidos.** Visto en `My Sweet Paradise`: peso
   **645 en la regular y 380 en la negrita** del mismo documento. Manda el nombre de la fuente
   (`Arial-BoldMT` vs `ArialMT`), luego el flag `ForceBold`; el peso solo como último recurso.
   Negrita: **84.3% → 96.9%**.

**Residuo no cubierto** (el ~3% de negrita, unas 20 líneas de 676): MuPDF detecta negrita sintética
(trazo simulado) y `FPDFTextObj_GetRenderMode` no existe en este build. Es cosmético.

Verificado además:

- **Rasterizado**: mismas dimensiones a 150 DPI (1px de redondeo en un caso), diferencia media de
  **2–3.6 sobre 255**, concentrada en bordes de glifo. Inspección visual del peor caso: renders
  **indistinguibles**, ningún elemento ausente. Velocidad 1.0×–1.9× la de MuPDF (irrelevante: el
  OCR domina el tiempo total).
- **Formas rellenas** (`get_drawings`, de donde sale el color de fondo): 213/213, 10/10, 2/2.
- **`has_native_text`**: idéntico en los 13 documentos → el enrutado OCR vs digital no cambia.

> ⚠️ **Sin cobertura de prueba: el rescate de enlaces.** Ningún PDF del banco tiene anotaciones de
> enlace (`get_links()` devuelve 0 en los 13). La función de `markdown_exporter.py` es portable
> (verificado leyendo anotaciones `/Link` con `pypdf`), pero **no se puede validar con este corpus**:
> hace falta un PDF con enlaces reales antes de dar esa parte por buena.

### 5.2 Escritura — coste medido, y **una corrección al §4**

> 🔴 **El §4 se queda corto en un punto que cambia el plan.** Dice "escritor de PDF → `reportlab`".
> Pero `build_pdf_export_from_original()` **abre y modifica el PDF original in-place**
> (`fitz.open(source)` → edita páginas → guarda), y **reportlab no sabe hacer eso**: solo crea PDFs
> nuevos. Hace falta una **tercera** librería: `pypdf` (BSD-3, permisiva) para fusionar la capa de
> reportlab sobre las páginas existentes. No es un problema — está probado abajo — pero hay que saberlo.

**Prueba de viabilidad ejecutada** (`reportlab` + `pypdf` sobre el PDF del PADRON), cubriendo las cuatro
primitivas y el caso difícil. Resultado: el PDF original se preserva íntegro, la "cinta correctora", la
imagen, la negrita y el subrayado se pintan correctamente, y las páginas sin editar quedan intactas.

| Primitiva PyMuPDF | Sustituto | Coste |
| --- | --- | --- |
| `_to_pdf_font()` → Base-14 | reportlab trae las **12/12** fuentes Base-14 | **Cero.** Porta sin cambios |
| `fitz.get_text_length()` | `pdfmetrics.stringWidth()` | Trivial, 1:1 |
| `page.draw_line()` / `draw_rect()` | `canvas.line()` / `canvas.rect()` | Trivial |
| `page.insert_image()` | `canvas.drawImage(ImageReader(...))` | Trivial |
| metadatos (firma oculta) | `PdfWriter.add_metadata()` | Trivial |
| `page.insert_textbox()` | **Layout manual** (~40 líneas, probadas) | El grueso del trabajo |
| Editar un PDF existente | overlay reportlab + `pypdf.merge_page()` | Medio, probado |
| `page.clean_contents()` | **Innecesario**: el overlay se añade después de todo el contenido original, así que el problema de Z-order que motivaba esa llamada desaparece por construcción | Se elimina |

### 🎁 El bug crítico sigue vivo, y la sustitución lo arregla

Verificado, no asumido: `exporter_engine.py` **no se toca desde el 2026-04-02** (el día siguiente al
`TASKS.md` que reporta el bug), y `grep` confirma que **no existe ninguna comprobación del retorno de
`insert_textbox`**. Solo está el parche `extra_h = 200.0`, que ensancha la caja a ciegas.

El sustituto probado **dibuja siempre lo que cabe y devuelve lo que no cupo**, en vez de descartarlo
todo en silencio. Medido en la prueba: con la caja apretada, **1 línea dibujada + 4 reportadas como
sobrante**; PyMuPDF ahí no dibuja **nada**. Es exactamente el arreglo que pide `TASKS.md`.

### Alcance total y estimación

| Módulo | Estado |
| --- | --- |
| `core/pdf_renderer.py` (7 usos) | El spike **ya es** la implementación de referencia (~120 líneas) |
| `core/exporter_engine.py` (18 usos) | 2 constructores + 4 primitivas. `build_pptx_export()` (132 líneas) **no usa fitz: coste cero** |
| `core/markdown_exporter.py` (11 usos) | `fitz.Rect` → dataclass trivial; enlaces portables pero **sin cobertura de prueba** |

**Estimación: 5–7 días de trabajo enfocado**, incluida la re-verificación contra los 13 PDFs del banco
y el cierre del bug crítico de OCR (que hay que hacer igualmente, se elija la opción que se elija).

**Conclusión: la opción (A) deja de ser la cara.** Verde en lectura, escritura probada, y se lleva por
delante el bug crítico abierto.

---

## 5ter. 🔓 DECISIÓN TOMADA (2026-08-28): opción **(A) sustituir PyMuPDF**

Con los resultados de §5bis sobre la mesa, el usuario elige **(A)**: sustituir PyMuPDF por
`pypdfium2` (lectura/rasterizado) + `reportlab` (escritura) + `pypdf` (fusión sobre PDF existente).
Las tres son permisivas (Apache-2.0 / BSD-3), compatibles con MIT y con cualquier tienda.

Queda descartado (B) licencia comercial de Artifex y (C) relicenciar a AGPL-3.0.

**Fichero `LICENSE` creado** (MIT, David Bueno Vallejo), el que el badge de `README.md:11` prometía.

> ⚠️ **La contradicción de licencia NO está cerrada todavía.** Crear el `LICENSE` documenta la
> intención y arregla el "repo sin licencia = todos los derechos reservados", pero **`PyMuPDF` (AGPL-3.0)
> sigue en `backend/requirements.txt`**. Mientras siga ahí, MIT sobre el conjunto no se sostiene.
> La contradicción se cierra el día que aterrice la sustitución, no hoy. No publicar instaladores
> hasta entonces.

### Orden de ataque recomendado para la sustitución

1. **`core/pdf_renderer.py`** — el spike de §5.1 ya es la implementación de referencia. Empezar aquí
   porque es el que tiene los datos de validación (674/676 líneas sobre 13 PDFs) para no romper nada.
   **Portar las tres trampas documentadas en §5.1**, o los resultados no se reproducen.
2. **`core/exporter_engine.py`** — las 4 primitivas triviales primero, luego `build_pdf_export()`,
   y `build_pdf_export_from_original()` al final (es el único que necesita `pypdf`).
   **No tocar `build_pptx_export()`: no usa fitz.**
3. **Cerrar el bug crítico de OCR** aprovechando que `insert_textbox` desaparece: el sustituto ya
   reporta el sobrante en vez de descartarlo en silencio.
4. **`core/markdown_exporter.py`** — el último. Antes de tocarlo, **conseguir un PDF con anotaciones
   de enlace reales**: hoy no hay ninguno en el banco y esa ruta se quedaría sin verificar.
5. Quitar `PyMuPDF` de `backend/requirements.txt` y añadir las tres nuevas. **Ese es el commit que
   cierra de verdad el problema de licencia.**

---

## 6. Fase 1.3 — Backend: sidecar, no reescritura en Rust

**Decisión recomendada, pendiente de confirmar con el usuario:** mantener Python como *sidecar*
(`bundle.externalBin` + `tauri-plugin-shell`, congelado con PyInstaller).

La regla del framework es decidir **por función, no por app**: se reescribe en Rust cuando la dependencia es
un detalle de implementación; se mantiene Python cuando la dependencia **es la razón de existir de la app**.
Aquí `easyocr` es exactamente eso, y no hay equivalente maduro en Rust que conserve la calidad del OCR.

### El tamaño del instalador, con un matiz que cambia la estrategia

`torch` + CUDA congelado con PyInstaller son **2-5 GB**. Eso rompe por completo la promesa de "instalador de
15-20 MB" y descarta Microsoft Store tal cual.

Ahora bien, leyendo el código:

- `backend/core/ocr_engine.py` importa `easyocr` dentro de un `try/except` que lo deja en `None` si falta.
- `backend/api/endpoints.py:237` solo llama a `analyze_image()` **en la rama `else`**: si la página trae capa
  de texto nativa (`render.native_blocks`), el OCR no se toca.

Es decir: **la app ya está arquitecturalmente preparada para arrancar sin el stack de OCR instalado.** No hay
que rediseñar nada, solo empaquetar distinto.

> ⚠️ **Matiz importante, no lo pierdas de vista.** El README vende como caso de uso principal los *"PDFs de
> solo imagen"* y las *"infografías generadas por IA"* — precisamente las rutas que **sí** pasan por OCR. Así
> que el pack de OCR no es un extra para minorías: es la funcionalidad estrella para la mayoría de usuarios.
> **Consecuencia:** el asistente de primer arranque que descarga y provisiona el entorno de OCR (estilo LM
> Studio) es **UX obligatoria y parte del alcance**, no un pulido posterior. Un instalador pequeño que deje
> al usuario sin la función que fue a buscar es peor que uno grande.

**Estrategia propuesta:** instalador base pequeño (FastAPI + renderizador de PDF + Pillow + python-pptx) +
asistente de primer arranque que provisiona el entorno de OCR. Alternativa a evaluar si el asistente resulta
demasiado frágil: CPU-only con un modelo pequeño embebido y descarga opcional de GPU.

---

## 7. Fase 1.2 — Modo dual (web + escritorio)

**Modo dual**, coherente con las otras cinco apps del portfolio.

En este caso no añade un canal nuevo: PDF2Deck ya es *"una app de escritorio disfrazada de web"* —
`start_dev.cmd`, backend en localhost, GPU local, argumento de venta "sin nube". Tauri no le da un canal
extra, le da la forma correcta. Y el modo web sigue funcionando gratis, porque el backend FastAPI no se toca.

El patrón es el de `WEB_TO_DESKTOP_MIGRATION.md` §3.1: **un único fichero** (`frontend/api.js`) sabe si
estamos en Tauri o en el navegador, y el resto del frontend no se entera. Recordatorio: la constante **no**
se llama `isTauri`.

---

## 8. Lo que NO está hecho

Para que nadie lo dé por hecho:

- ✅ Los spikes de §5 — **hechos el 2026-08-28, resultados en §5bis**. Lectura 🟢 verde, escritura probada.
- ✅ Fichero `LICENSE` creado (MIT). **Ojo: no cierra la contradicción mientras PyMuPDF siga en `requirements.txt`** (§5ter).
- ✅ Decisión final sobre PyMuPDF confirmada con el usuario: **opción (A), sustituir** (§5ter).
- ✅ Estimación del coste de portar `exporter_engine.py` (§5.2): **5–7 días**.
- ❌ Rama `feat/tauri-desktop` creada.
- ❌ `dbv-specs-ops/` adoptado en este repo (Fase 2.2).
- ❌ Nada de `src-tauri/`, workflows de release, capa `api.js` ni empaquetado.
- ❌ **La sustitución en sí** (§5ter): ninguna línea de `backend/` modificada todavía. **← SIGUIENTE PASO**

---

## 9. Orden de trabajo propuesto

1. ~~Spikes de lectura y escritura (§5.1 y §5.2) → 🛑 STOP~~ ✅ **hechos**; decisión tomada: **(A)** (§5bis, §5ter).
2. ~~Crear el fichero `LICENSE`~~ ✅ **hecho**. ← **Falta ejecutar la sustitución de PyMuPDF** (orden de ataque en §5ter).
3. Rama `feat/tauri-desktop` (Fase 2.1) y adopción de `dbv-specs-ops` (Fase 2.2).
4. Artefactos de la plantilla e identidad de la app (Fase 3).
5. Frontend, arquetipo sin bundler — **IIFE primero** (Fase 4).
6. Capa `api.js` (Fase 5) y sidecar + asistente de primer arranque (Fase 6).
7. Verificación ejecutando el binario real + DoD de escritorio (Fase 7).
8. Documentar, `/ship` y primer instalador (Fase 8).

---

*Documento de arranque generado el 2026-08-28 a partir de una lectura directa del código de este repo.
Las conclusiones son verificables: cada una cita el fichero del que sale.*
