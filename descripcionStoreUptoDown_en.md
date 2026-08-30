# Uptodown listing — English

> Adapted from `descripcionStore_en.md` (Microsoft Store) for the real submission form of the **Uptodown Developers Console** (Apps → Add new app). Field names and limits per its own help center ("How to publish an app on Uptodown"). Uptodown's *Operating System* field only supports **Windows and Mac** — Linux isn't a supported platform there.
>
> **⚠️ Do not submit yet — no macOS build of this project exists.** Unlike `dbv-md-reader` (which already has a published `.dmg` on Uptodown with a verified asset name), `dbv-pdf2deck` has so far only compiled the **Windows** sidecar (`dbv-pdf2deck-sidecar-x86_64-pc-windows-msvc.exe`, see `dbv-specs-ops/task.md`). There is no macOS target configured in `src-tauri/tauri.conf.json`, no `.dmg` built, and no release published (`gh release list` returns nothing).
>
> This file is Mac-focused, following the same approach as `dbv-md-reader` (the platform Uptodown actually accepted) — ready to paste once that build exists, not before. The **Select File** field is left without an asset name because there's nothing to verify yet; fill it in with `gh release view <tag>` once it exists, the way it was done for `dbv-md-reader`.

---

## Name

DBV PDF2Deck

## Operating System

Mac *(macOS, universal .dmg for Intel + Apple Silicon — no Apple code signing, still to be built)*

## Short description
*(max. 70 characters)*

PDF and AI infographics to editable PowerPoint, with local OCR.

*(63 characters)*

## Full body text description
*(min. 50 words)*

DBV PDF2Deck is a native Mac app that turns image-only PDFs and AI-generated infographics into fully editable PowerPoint presentations, using 100% local text recognition (OCR) — no accounts, no ads, no telemetry. A lot of documents simply can't be edited because the text only exists as an image: NotebookLM exports, generative-AI infographics, scans. DBV PDF2Deck recognizes that text, automatically groups it into readable paragraphs, and places it in editable boxes directly on the document.

With the visual canvas editor you can drag, resize, and edit every text block, and adjust font, size, color, and alignment. It includes background cleanup with local inpainting (OpenCV) and a Magic Eraser tool for removing watermarks, logos, or other non-text elements. The result exports simultaneously to PowerPoint (.pptx), vector PDF, and Markdown, with a selectable PPTX background resolution (150–600 DPI) so it doesn't look soft next to the text you've edited.

Perfect for reusing NotebookLM presentations, fixing typos or cut-off text in AI-generated infographics, or turning any image-only PDF into something you can actually keep editing.

**Key features:**
• 100% local text recognition (EasyOCR), with optional GPU acceleration (CUDA) on NVIDIA machines
• Automatic grouping of OCR fragments into full lines and paragraphs
• Visual canvas editor: drag, resize, and edit text boxes right on the document
• In-place editing with a double-click, plus multi-select via Ctrl+click or a drag rectangle
• Background cleanup with local inpainting (OpenCV) on the blocks you choose
• Magic Eraser tool for removing watermarks, logos, or stray elements
• Automatic detection of native PDF text versus image-only text
• Simultaneous export to PowerPoint (.pptx), vector PDF, and Markdown (.md)
• Selectable PPTX background resolution (150–600 DPI)
• Flexible input: multi-page PDF, PNG, JPG, and WEBP
• Undo/redo history (Ctrl+Z / Ctrl+Y)
• Built-in help with a complete usage guide
• Interface available in English and Spanish

No internet connection required to function, no personal data collected. Your documents never leave your computer. Open source under the MIT license.

**A note on code signing (applies once the build exists):** if the universal `.dmg` ships without Apple code signing (outside the paid Apple Developer program), macOS will warn the first time it's opened ("cannot verify the developer"). Fix: right-click the app → Open, or run `xattr -cr /Applications/DBV\ PDF2Deck.app` from Terminal.

**Also available for Windows** (Microsoft Store, in preparation — see `descripcionStore_en.md`) — see https://github.com/davidbuenov/dbv-pdf2deck.

---

## What's new in this version (v2.0.0)
*(per-version changelog field)*

New recognition engine: OCR fragments are now automatically grouped into readable lines and paragraphs instead of dozens of loose boxes, reading at a higher resolution than the editing canvas to improve text reliability without increasing the document's footprint. New Magic Eraser tool for removing non-text elements. PowerPoint export with a selectable background resolution (150–600 DPI). Fixed a case where an image-only PDF with a page footer was misdetected as a text document and skipped OCR entirely. New built-in help module in English and Spanish.

---

## Additional information

**Official website:** https://github.com/davidbuenov/dbv-pdf2deck
**Suggested category/directory:** Productivity / Office
**Nationality:** Spain
**Author:** David Bueno Vallejo

### License and distribution

- **Distribution Model:** Free
- **License Type:** MIT
- **License Text URL:** https://github.com/davidbuenov/dbv-pdf2deck/blob/main/LICENSE
- **Source Code URL:** https://github.com/davidbuenov/dbv-pdf2deck

### Keywords
*(reference for SEO/ASO — Uptodown has no field identical to Partner Center's)*

- pdf to powerpoint mac
- ocr pdf mac
- editable pdf
- notebooklm pdf
- ai infographic editor
- pdf to pptx
- local ocr

### Icon to upload

`src-tauri/icons/icon.png` (512×512, PNG, square) — meets Uptodown's minimum requirement of 256×256.
