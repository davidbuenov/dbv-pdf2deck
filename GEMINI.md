# Instrucciones del Proyecto para Gemini CLI — dbv-pdf2deck

Este proyecto sigue la metodología **Spec-Driven Development (SDD)** con el framework **dbv-specs-ops**.
Toda la documentación, normas y especificaciones residen en el subdirectorio `dbv-specs-ops/`:

| Archivo | Propósito |
| --- | --- |
| `dbv-specs-ops/project.config.md` | Identidad del proyecto: nombre, autor, licencia y plantilla de cabeceras |
| `dbv-specs-ops/docs/MASTER_PROMPT.md` | Workflow obligatorio, normas y límites de desarrollo |
| `dbv-specs-ops/docs/SPECIFICATIONS.md` | Requisitos del proyecto actual (dbv-pdf2deck) |
| `dbv-specs-ops/docs/ARCHITECTURE.md` | Stack técnico (FastAPI + EasyOCR + Canvas 2D + Tauri v2, publicado en v2.0.0) |
| `dbv-specs-ops/memory.md` | Contexto y Decisiones cualitativas (ADRs) |
| `dbv-specs-ops/task.md` | Estado actual de tareas + Snapshot de Contexto |

## ⚠️ Reglas Core

**Lee `dbv-specs-ops/docs/MASTER_PROMPT.md` y sigue su flujo de trabajo estrictamente.**

## 📌 Contexto específico de este proyecto

- **Migración a escritorio completada y publicada (v2.0.0, 2026-08-30/31).** El contexto y las
  decisiones tomadas al arrancarla siguen en `MIGRACION_ESCRITORIO.md` (raíz) como registro histórico.
  **Estado actual** (qué está verificado en ejecución real por plataforma, qué falta antes de dar la
  v2.0.0 por estable en macOS/Linux): snapshot de contexto del 2026-08-31 en `dbv-specs-ops/task.md`.
- **`docs_david/` está fuera de git y desactualizado.** Es histórico, no estado actual.
  La fuente de verdad es `dbv-specs-ops/task.md`.
- **PyMuPDF (AGPL-3.0) erradicado por completo** desde el 2026-08-28 — ya no hay restricción de
  licencia sobre publicar instaladores.
- **No instalar dependencias experimentales en `backend/venv/`**: usa un venv aparte
  (`.venv-sidecar/` es el que usa `packaging/build_sidecar.py`).
- Al tocar el frontend: **IIFE por fichero** (ya aplicada a los seis `.js` de `frontend/`), y **nunca
  declarar `const isTauri`** ni ningún identificador que colisione con los globales que Tauri inyecta
  (usa `runningInTauri`) — hay una puerta de build que lo comprueba automáticamente
  (`scripts/check-tauri-globals.mjs`), pero sigue siendo la trampa más fácil de reintroducir al añadir
  un `.js` nuevo.
- **El sidecar Python viaja como carpeta `--onedir`** (recurso de Tauri en `src-tauri/sidecar/`), no
  como `externalBin` de un solo fichero — `--onefile` compila pero no arranca en ejecución real con
  esta combinación de dependencias (torch/easyocr). Ver `memory.md` antes de tocar
  `packaging/build_sidecar.py` o el arranque del sidecar en `src-tauri/src/lib.rs`.

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
