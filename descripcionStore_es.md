# Ficha de Microsoft Store — Español (España)

> Copia cada campo tal cual a la sección correspondiente de Partner Center ("Descripción de Store"). Los límites de caracteres indicados son los que muestra el propio formulario.
>
> **⚠️ No enviar todavía — bloqueantes pendientes (ver `dbv-specs-ops/task.md` → "Pendiente para las tiendas"):**
> 1. No existe empaquetado MSIX de este proyecto. Falta reservar `Identity.Name`/`Publisher` en el Partner Center y generar el paquete (candidato: `@choochmeque/tauri-windows-bundle`, ya validado en `dbv-md-reader`).
> 2. El sidecar con `torch`+CUDA pesa 2–5 GB. La estrategia decidida —instalador base pequeño + asistente de primer arranque que provisiona el runtime de OCR— **no está construida**, y es prerrequisito de certificación (política 10.2.4: hay que divulgar en la ficha que la app descarga el runtime tras instalar).
> 3. `gh release list` no devuelve ninguna versión: no hay ningún artefacto que enviar hoy.
>
> **✅ Capturas e imágenes promocionales listas en `docs/assets/store/`:**
> - Portada Hero (16:9): `hero_featured_banner_es.jpg`
> - Captura 1 (Bienvenida/Dropzone): `01_hero_welcome_es.png`
> - Captura 2 (Editor Visual WYSIWYG): `02_canvas_editor_wysiwyg_es.png`
> - Captura 3 (Goma Mágica & Inpainting): `03_magic_eraser_inpainting_es.png`
> - Captura 4 (Modo Vista Previa Limpia): `04_preview_mode_clean_es.png`
> - Captura 5 (Menú de Exportación PPTX): `05_export_modal_powerpoint_es.png`
>
> Este fichero es la ficha de contenido lista para copiar en cuanto el empaquetado exista — no una confirmación de que ya se puede enviar a certificación.

---

## Descripción *

DBV PDF2Deck convierte PDFs de solo imagen e infografías generadas por IA en presentaciones de PowerPoint totalmente editables, con OCR local y un editor visual en canvas — sin cuentas, sin publicidad, sin telemetría.

Muchos PDFs no se pueden editar: exportaciones de NotebookLM, infografías creadas con IA generativa, escaneos. El texto está ahí, pero solo como imagen — no se puede seleccionar, corregir ni convertir a PowerPoint. DBV PDF2Deck resuelve exactamente ese problema: reconoce el texto de cada página con OCR local (acelerado por GPU si tienes una NVIDIA con CUDA), lo agrupa en párrafos completos y coloca cajas editables directamente sobre el documento.

Edita el texto, el tamaño, el color y la posición con un editor visual en canvas. Limpia fondos y marcas de agua con inpainting local (OpenCV) o con una herramienta de goma interactiva para eliminar elementos sueltos. Exporta el resultado a PowerPoint (.pptx), PDF o Markdown, con el fondo de cada diapositiva re-rasterizado en la resolución que elijas para que no pierda nitidez frente al texto editado.

Ideal para reutilizar presentaciones de NotebookLM, corregir infografías de IA con erratas o texto cortado, o convertir cualquier documento de solo imagen en algo que puedas seguir editando.

Características principales:
• Reconocimiento de texto 100% local (EasyOCR), con aceleración GPU opcional (CUDA)
• Agrupación automática de fragmentos OCR en líneas y párrafos completos, no en trozos sueltos
• Editor visual en canvas: arrastra, redimensiona y edita cajas de texto directamente sobre el documento
• Edición en sitio con doble clic, y edición múltiple con selección por Ctrl+clic o por rectángulo
• Limpieza de fondo con inpainting local (OpenCV) sobre los bloques que elijas
• Herramienta Goma Mágica para eliminar marcas de agua, logos o elementos sueltos que no son texto
• Detección automática de texto nativo del PDF frente a texto solo-imagen, con fallback a OCR
• Exportación simultánea a PowerPoint (.pptx), PDF vectorial y Markdown (.md)
• Resolución del fondo del PPTX seleccionable (150–600 DPI) para máxima nitidez en impresión
• Entrada flexible: PDF multipágina, PNG, JPG y WEBP
• Historial de deshacer/rehacer (Ctrl+Z / Ctrl+Y)
• Ayuda integrada con guía completa de uso
• Interfaz disponible en español e inglés

Sin conexión a internet requerida para funcionar, sin recopilación de datos personales. Tus documentos nunca salen de tu equipo.

---

## Novedades de esta versión

v2.0.0: la aplicación estrena interfaz de escritorio nativa completa. Nuevo motor de reconocimiento: los fragmentos de OCR se agrupan automáticamente en líneas y párrafos legibles en lugar de docenas de cajas sueltas, y la lectura se realiza a mayor resolución que el lienzo de edición para mejorar la fiabilidad del texto reconocido sin aumentar el peso del documento en memoria. Nueva herramienta Goma Mágica para eliminar elementos que no son texto. Exportación a PowerPoint con resolución de fondo seleccionable (150–600 DPI). Guardado de la exportación con el diálogo nativo del sistema operativo. Corrección de un caso en el que un PDF de solo imagen con pie de página se detectaba erróneamente como documento de texto y omitía el OCR. Nuevo módulo de ayuda integrado con guía completa en español e inglés.

---

## Características del producto
*(máximo 20, resúmenes breves — se muestran como lista con viñetas)*

1. OCR local, sin cuentas ni telemetría: PDF/imagen a PowerPoint editable
2. Aceleración GPU opcional (CUDA) para el reconocimiento de texto
3. Fusión automática de fragmentos OCR en líneas y párrafos completos
4. Editor visual en canvas con arrastre, redimensionado y edición en sitio
5. Selección múltiple por Ctrl+clic o por rectángulo de arrastre
6. Detección automática de texto nativo del PDF frente a solo-imagen
7. Limpieza de fondo con inpainting local (OpenCV), sin API de pago
8. Herramienta Goma Mágica para logos, marcas de agua y elementos sueltos
9. Exportación simultánea a PowerPoint (.pptx), PDF y Markdown (.md)
10. Resolución del fondo del PPTX seleccionable (150–600 DPI)
11. Entrada flexible: PDF multipágina, PNG, JPG, WEBP
12. Ideal para presentaciones de NotebookLM exportadas como imagen
13. Corrige erratas y defectos habituales de infografías generadas por IA
14. Historial de deshacer/rehacer (Ctrl+Z / Ctrl+Y)
15. Control de tipografía, tamaño, color y alineación por bloque
16. Modo de limpieza en la nube opcional con tu propia clave de API
17. Ayuda integrada con guía completa de uso
18. Interfaz disponible en español e inglés
19. Privacidad total: los documentos nunca salen de tu equipo
20. Código abierto bajo licencia MIT

---

## Campos complementarios

### Título corto
*(versión más corta opcional del nombre, se usa en Xbox — dejar en blanco si no aplica)*

DBV PDF2Deck

### Descripción corta
*(máx. recomendado 270 caracteres)*

Convierte PDFs de solo imagen e infografías de IA en PowerPoint totalmente editable, con OCR local, agrupación automática en párrafos, limpieza de fondo y una Goma Mágica para logos y marcas de agua. Exportación a PPTX/PDF/Markdown. Sin telemetría.

*(248 caracteres)*

---

## Información adicional

### Palabras clave
*(máximo 7, 40 caracteres cada una)*

- pdf a powerpoint
- ocr pdf
- pdf editable
- notebooklm pdf
- infografia ia
- pdf a pptx
- ocr local

### Información de copyright y marca registrada

© 2026 David Bueno Vallejo

### Términos de licencia adicionales

*(dejar en blanco — se usan los términos estándar de la Store, la app en sí es MIT)*

### URL de la directiva de privacidad

https://davidbuenov.github.io/dbv-pdf2deck/privacidad.html

### URL del sitio web

https://davidbuenov.com

### URL de soporte y contacto

https://github.com/davidbuenov/dbv-pdf2deck/issues

### Desarrollado por

David Bueno Vallejo
