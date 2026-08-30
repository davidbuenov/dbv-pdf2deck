# Microsoft Store listing — English (United States)

> Copy each field as-is into the matching section of Partner Center ("Store Description"). The character limits shown are the ones the form itself displays.
>
> **⚠️ Do not submit yet — open blockers (see `dbv-specs-ops/task.md` → "Pendiente para las tiendas"):**
> 1. No MSIX package exists for this project yet. `Identity.Name`/`Publisher` still need to be reserved in Partner Center, and the package still needs to be built (candidate tool: `@choochmeque/tauri-windows-bundle`, already validated on `dbv-md-reader`).
> 2. The sidecar with `torch`+CUDA weighs 2–5 GB. The already-decided strategy — a small base installer plus a first-run wizard that provisions the OCR runtime — **has not been built yet**, and it is a certification prerequisite (policy 10.2.4: the listing must disclose that the app downloads the runtime after install).
> 3. `gh release list` returns nothing: there is no artifact to submit today.
>
> **✅ Screenshots & promotional assets ready in `docs/assets/store/`:**
> - Hero Featured Banner (16:9): `hero_featured_banner_en.jpg`
> - Screenshot 1 (Welcome / Dropzone): `01_hero_welcome_en.png`
> - Screenshot 2 (Visual Canvas WYSIWYG Editor): `02_canvas_editor_wysiwyg_en.png`
> - Screenshot 3 (Magic Eraser & Inpainting): `03_magic_eraser_inpainting_en.png`
> - Screenshot 4 (Clean Preview Mode): `04_preview_mode_clean_en.png`
> - Screenshot 5 (PPTX Export Menu): `05_export_modal_powerpoint_en.png`
>
> This file is the content draft, ready to paste in once packaging exists — not a confirmation that submission is ready.

---

## Description *

DBV PDF2Deck turns image-only PDFs and AI-generated infographics into fully editable PowerPoint presentations, using local OCR and a visual canvas editor — no accounts, no ads, no telemetry.

A lot of PDFs simply can't be edited: NotebookLM exports, infographics made with generative AI, scans. The text is right there, but only as an image — you can't select it, fix it, or turn it into a PowerPoint deck. DBV PDF2Deck solves exactly that: it recognizes the text on every page with local OCR (GPU-accelerated if you have an NVIDIA card with CUDA), groups it into full paragraphs, and places editable boxes directly on the document.

Edit the text, size, color, and position with a visual canvas editor. Clean up backgrounds and watermarks with local inpainting (OpenCV), or use an interactive eraser tool to remove standalone elements. Export the result to PowerPoint (.pptx), PDF, or Markdown, with each slide's background re-rasterized at the resolution you pick so it doesn't look soft next to your edited, vector text.

Perfect for reusing NotebookLM presentations, fixing typos or cut-off text in AI-generated infographics, or turning any image-only document into something you can keep editing.

Key features:
• 100% local text recognition (EasyOCR), with optional GPU acceleration (CUDA)
• Automatic grouping of OCR fragments into full lines and paragraphs, not loose scraps
• Visual canvas editor: drag, resize, and edit text boxes right on the document
• In-place editing with a double-click, plus multi-select via Ctrl+click or a drag rectangle
• Background cleanup with local inpainting (OpenCV) on the blocks you choose
• Magic Eraser tool for removing watermarks, logos, or other non-text elements
• Automatic detection of native PDF text versus image-only text, with an OCR fallback
• Simultaneous export to PowerPoint (.pptx), vector PDF, and Markdown (.md)
• Selectable PPTX background resolution (150–600 DPI) for print-quality sharpness
• Flexible input: multi-page PDF, PNG, JPG, and WEBP
• Undo/redo history (Ctrl+Z / Ctrl+Y)
• Built-in help with a complete usage guide
• Interface available in English and Spanish

No internet connection required to function, no personal data collected. Your documents never leave your computer.

---

## What's new in this version

v2.0.0: the app debuts a complete native desktop interface. New recognition engine: OCR fragments are now automatically grouped into readable lines and paragraphs instead of dozens of loose boxes, and text is read at a higher resolution than the editing canvas to improve recognition reliability without increasing the document's memory footprint. New Magic Eraser tool for removing non-text elements. PowerPoint export with a selectable background resolution (150–600 DPI). Exports now save through the operating system's native save dialog. Fixed a case where an image-only PDF with a page footer was misdetected as a text document and skipped OCR entirely. New built-in help module with a complete guide in English and Spanish.

---

## Product features
*(up to 20, short summaries — shown as a bulleted list)*

1. Local OCR, no accounts or telemetry: PDF/image to editable PowerPoint
2. Optional GPU acceleration (CUDA) for text recognition
3. Automatic merging of OCR fragments into full lines and paragraphs
4. Visual canvas editor with drag, resize, and in-place editing
5. Multi-select via Ctrl+click or a drag-select rectangle
6. Automatic detection of native PDF text versus image-only
7. Background cleanup with local inpainting (OpenCV), no paid API
8. Magic Eraser tool for logos, watermarks, and stray elements
9. Simultaneous export to PowerPoint (.pptx), PDF, and Markdown (.md)
10. Selectable PPTX background resolution (150–600 DPI)
11. Flexible input: multi-page PDF, PNG, JPG, WEBP
12. Great for NotebookLM presentations exported as images
13. Fixes typos and common defects in AI-generated infographics
14. Undo/redo history (Ctrl+Z / Ctrl+Y)
15. Per-block font, size, color, and alignment controls
16. Optional cloud cleanup mode using your own API key
17. Built-in help with a complete usage guide
18. Interface available in English and Spanish
19. Full privacy: your documents never leave your computer
20. Open source under the MIT license

---

## Additional fields

### Short title
*(optional shorter version of the name, used on Xbox — leave blank if not applicable)*

DBV PDF2Deck

### Short description
*(recommended max. 270 characters)*

Turns image-only PDFs and AI infographics into fully editable PowerPoint, with local OCR, automatic paragraph grouping, background cleanup, and a Magic Eraser for logos and watermarks. Exports to PPTX/PDF/Markdown. No telemetry.

*(228 characters)*

---

## Additional information

### Keywords
*(up to 7, 40 characters each)*

- pdf to powerpoint
- ocr pdf
- editable pdf
- notebooklm pdf
- ai infographic editor
- pdf to pptx
- local ocr

### Copyright and trademark info

© 2026 David Bueno Vallejo

### Additional license terms

*(leave blank — standard Store terms apply; the app itself is MIT licensed)*

### Privacy policy URL

https://davidbuenov.github.io/dbv-pdf2deck/privacy.html

### Website URL

https://davidbuenov.com

### Support and contact URL

https://github.com/davidbuenov/dbv-pdf2deck/issues

### Developed by

David Bueno Vallejo
