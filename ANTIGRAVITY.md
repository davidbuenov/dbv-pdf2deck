# Instrucciones del Proyecto para Antigravity — dbv-pdf2deck

Este proyecto sigue la metodología **Spec-Driven Development (SDD)** con el framework **dbv-specs-ops**.
Toda la documentación, normas y especificaciones residen en el subdirectorio `dbv-specs-ops/`:

| Archivo | Propósito |
| --- | --- |
| `dbv-specs-ops/project.config.md` | Identidad del proyecto: nombre, autor, licencia y plantilla de cabeceras |
| `dbv-specs-ops/docs/MASTER_PROMPT.md` | Workflow obligatorio, normas y límites de desarrollo |
| `dbv-specs-ops/docs/SPECIFICATIONS.md` | Requisitos del proyecto actual (dbv-pdf2deck) |
| `dbv-specs-ops/docs/ARCHITECTURE.md` | Stack técnico (FastAPI + EasyOCR + Canvas 2D + Tauri v2 en migración) |
| `dbv-specs-ops/memory.md` | Contexto y Decisiones cualitativas (ADRs) |
| `dbv-specs-ops/task.md` | Estado actual de tareas + Snapshot de Contexto |

## ⚠️ Reglas Core

**Lee `dbv-specs-ops/docs/MASTER_PROMPT.md` y sigue su flujo de trabajo estrictamente.**

## 📌 Contexto específico de este proyecto

- **Migración a escritorio en curso.** El procedimiento vive en `MIGRATION_PROMPT.md` del repo
  `dbv-tauri-starter`; el contexto y las decisiones ya tomadas, en `MIGRACION_ESCRITORIO.md` (raíz).
  La plantilla viaja **hacia** este repo, nunca al revés.
- **`docs_david/` está fuera de git y desactualizado.** Es histórico, no estado actual.
  La fuente de verdad es `dbv-specs-ops/task.md`.
- **No publicar instaladores** mientras `PyMuPDF` (AGPL-3.0) siga en `backend/requirements.txt`.
- **No instalar dependencias experimentales en `backend/venv/`**: usa un venv aparte.
- Al tocar el frontend: **IIFE por fichero** antes de introducir Tauri, y **nunca declarar
  `const isTauri`** (Tauri v2 ya inyecta ese global con `withGlobalTauri: true`; usa `runningInTauri`).

> 🛠️ Framework SDD creado por **[David Bueno Vallejo](https://github.com/davidbuenov)** · [dbv-specs-ops](https://github.com/davidbuenov/dbv-specs-ops)
