# Ficha de Uptodown — Español

> Adaptado de `descripcionStore_es.md` (Microsoft Store) para el formulario real de la **Developers Console de Uptodown** (Apps → Add new app). Nombres de campo y límites según su ayuda oficial ("How to publish an app on Uptodown"). Uptodown solo admite **Windows y Mac** en el campo *Operating System* — Linux no es plataforma soportada allí.
>
> **⚠️ No enviar todavía — no existe ningún build de macOS de este proyecto.** A diferencia de `dbv-md-reader` (que ya tiene un `.dmg` publicado en Uptodown y un nombre de asset verificado), `dbv-pdf2deck` solo ha compilado hasta hoy el sidecar de **Windows** (`dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe`, ver `dbv-specs-ops/task.md`). No hay target de macOS configurado en `src-tauri/tauri.conf.json`, ni instalador `.dmg` generado, ni release publicada (`gh release list` no devuelve nada).
>
> Este fichero está centrado en Mac siguiendo el mismo criterio que `dbv-md-reader` (la plataforma que Uptodown realmente aceptó), listo para copiar en cuanto exista ese build — no antes. El campo **Select File** queda sin nombre de asset porque no hay ninguno que verificar todavía; complétalo con `gh release view <tag>` cuando exista, como se hizo en `dbv-md-reader`.

---

## Name

DBV PDF2Deck

## Operating System

Mac *(macOS, .dmg universal Intel + Apple Silicon — sin firma de Apple, pendiente de compilar)*

## Short description
*(máx. 70 caracteres)*

PDF e infografías de IA a PowerPoint editable, con OCR local.

*(61 caracteres)*

## Full body text description
*(mín. 50 palabras)*

DBV PDF2Deck es una aplicación nativa para Mac que convierte PDFs de solo imagen e infografías generadas por IA en presentaciones de PowerPoint totalmente editables, usando reconocimiento de texto (OCR) 100% local — sin cuentas, sin publicidad, sin telemetría. Muchos documentos no se pueden editar porque el texto solo existe como imagen: exportaciones de NotebookLM, infografías de IA generativa, escaneos. DBV PDF2Deck reconoce ese texto, lo agrupa automáticamente en párrafos legibles y lo coloca en cajas editables directamente sobre el documento.

Con el editor visual en canvas puedes arrastrar, redimensionar y editar cada bloque de texto, ajustar tipografía, tamaño, color y alineación. Incluye limpieza de fondo con inpainting local (OpenCV) y una herramienta de Goma Mágica para eliminar marcas de agua, logos u otros elementos que no son texto. El resultado se exporta simultáneamente a PowerPoint (.pptx), PDF vectorial y Markdown, con la resolución del fondo del PPTX seleccionable (150–600 DPI) para que no pierda nitidez frente al texto que has editado.

Ideal para reutilizar presentaciones de NotebookLM, corregir erratas o texto cortado en infografías de IA, o convertir cualquier PDF de solo imagen en algo que puedas seguir editando de verdad.

**Características principales:**
• Reconocimiento de texto 100% local (EasyOCR), con aceleración GPU opcional (CUDA) en equipos con NVIDIA
• Agrupación automática de fragmentos OCR en líneas y párrafos completos
• Editor visual en canvas: arrastra, redimensiona y edita cajas de texto directamente sobre el documento
• Edición en sitio con doble clic, y selección múltiple por Ctrl+clic o por rectángulo
• Limpieza de fondo con inpainting local (OpenCV) sobre los bloques que elijas
• Herramienta Goma Mágica para eliminar marcas de agua, logos o elementos sueltos
• Detección automática de texto nativo del PDF frente a texto solo-imagen
• Exportación simultánea a PowerPoint (.pptx), PDF vectorial y Markdown (.md)
• Resolución del fondo del PPTX seleccionable (150–600 DPI)
• Entrada flexible: PDF multipágina, PNG, JPG y WEBP
• Historial de deshacer/rehacer (Ctrl+Z / Ctrl+Y)
• Ayuda integrada con guía completa de uso
• Interfaz disponible en español e inglés

Sin conexión a internet requerida para funcionar, sin recopilación de datos personales. Tus documentos nunca salen de tu equipo. Código abierto bajo licencia MIT.

**Nota sobre la firma (aplicable en cuanto exista el build):** si el `.dmg` universal se distribuye sin firma de Apple (fuera del programa de pago Apple Developer), macOS avisará la primera vez que se abra ("no se puede verificar el desarrollador"). Solución: clic derecho sobre la app → Abrir, o `xattr -cr /Applications/DBV\ PDF2Deck.app` desde Terminal.

**También disponible para Windows** (Microsoft Store, en preparación — ver `descripcionStore_es.md`) — ver https://github.com/davidbuenov/dbv-pdf2deck.

---

## Novedades de esta versión (v2.0.0)
*(campo de changelog por versión)*

Motor de reconocimiento nuevo: los fragmentos de OCR se agrupan automáticamente en líneas y párrafos legibles en lugar de docenas de cajas sueltas, con lectura a mayor resolución que el lienzo de edición para mejorar la fiabilidad del texto sin aumentar el peso del documento. Nueva herramienta Goma Mágica para eliminar elementos que no son texto. Exportación a PowerPoint con resolución de fondo seleccionable (150–600 DPI). Corrección de un caso en el que un PDF de solo imagen con pie de página se detectaba erróneamente como documento de texto y omitía el OCR. Nuevo módulo de ayuda integrado en español e inglés.

---

## Información adicional

**Web oficial:** https://github.com/davidbuenov/dbv-pdf2deck
**Categoría / Directorio sugerido:** Productividad / Ofimática
**Nacionalidad:** España
**Autor:** David Bueno Vallejo

### Licencia y distribución

- **Distribution Model:** Free
- **License Type:** MIT
- **License Text URL:** https://github.com/davidbuenov/dbv-pdf2deck/blob/main/LICENSE
- **Source Code URL:** https://github.com/davidbuenov/dbv-pdf2deck

### Palabras clave
*(referencia para SEO/ASO, Uptodown no tiene un campo idéntico al de Partner Center)*

- pdf a powerpoint mac
- ocr pdf mac
- pdf editable
- notebooklm pdf
- infografia ia
- pdf a pptx
- ocr local

### Icono a subir

`src-tauri/icons/icon.png` (512×512, PNG, cuadrado) — cumple el mínimo de 256×256 que exige Uptodown.
