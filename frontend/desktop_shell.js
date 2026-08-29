// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
/**
 * @fileoverview Chrome de escritorio: barra superior, chincheta (always-on-top),
 * modal «Acerca de», menú de exportación y barra de estado.
 *
 * Este módulo es el dueño de la barra: el motor de canvas describe su estado
 * (`setGate`, `setPage`) y aquí se decide cómo se pinta. Todo degrada solo en
 * navegador: lo que no existe fuera de Tauri no llega a mostrarse.
 */

(() => {

// Espejo de la versión declarada en package.json, src-tauri/tauri.conf.json y
// src-tauri/Cargo.toml. En escritorio la sobreescribe la que reporta Tauri.
const APP_VERSION = "1.5.0";

// Una sola fuente de verdad para la detección de entorno: api.js la calcula y
// la publica, y este módulo se carga después.
const runningInTauri = !!window.dbvApi?.runningInTauri;
const runtimeLabel = runningInTauri ? "Escritorio (Tauri v2)" : "Navegador web";

const $ = (id) => document.getElementById(id);

/**
 * Resuelve una API de Tauri por su ruta, comprobando cada tramo.
 * `window.__TAURI__` existiendo no garantiza que el plugin concreto esté
 * inyectado, y acceder a un tramo ausente lanza antes de que haya promesa
 * que capturar.
 * @param {string} path Ruta separada por puntos, p. ej. "opener.openUrl".
 * @returns {*} La API pedida, o null si no está disponible.
 */
function tauriApi(path) {
    if (!runningInTauri) return null;
    return path.split(".").reduce((obj, key) => obj?.[key], window.__TAURI__) ?? null;
}

// ─── Chincheta: mantener la ventana encima del resto ─────────────────────────
function mountAlwaysOnTop() {
    const btn = $("btn-always-on-top");
    // En navegador no existe el concepto: el botón se queda oculto.
    if (!btn || !tauriApi("window.getCurrentWindow")) return;
    btn.hidden = false;

    btn.onclick = async () => {
        const pinned = !btn.classList.contains("active");
        try {
            await window.__TAURI__.window.getCurrentWindow().setAlwaysOnTop(pinned);
            btn.classList.toggle("active", pinned);
            btn.title = pinned
                ? "Ventana fijada encima — clic para soltarla"
                : "Fijar la ventana encima del resto";
        } catch (err) {
            console.error("[DBV] No se pudo cambiar always-on-top:", err);
        }
    };
}

// ─── Modal «Acerca de» ───────────────────────────────────────────────────────
async function resolveVersion() {
    if (tauriApi("app.getVersion")) {
        try {
            return await window.__TAURI__.app.getVersion();
        } catch (err) {
            console.warn("[DBV] Versión de Tauri no disponible:", err);
        }
    }
    return APP_VERSION;
}

function mountAboutModal() {
    const modal = $("about-modal");
    const btnOpen = $("btn-about");
    const btnClose = $("about-close");
    const backdrop = $("about-backdrop");
    if (!modal || !btnOpen) return null;

    const open = () => {
        modal.hidden = false;
        if (btnClose) btnClose.focus();
    };
    const close = () => {
        modal.hidden = true;
        btnOpen.focus();
    };

    btnOpen.onclick = open;
    if (btnClose) btnClose.onclick = close;
    if (backdrop) backdrop.onclick = close;

    // En escritorio los enlaces salen al navegador del sistema en vez de
    // navegar dentro de la propia webview. Si el plugin no está, se deja el
    // comportamiento normal del enlace en vez de matarlo con preventDefault().
    if (tauriApi("opener.openUrl")) {
        modal.querySelectorAll(".about-links a").forEach((link) => {
            link.addEventListener("click", (evt) => {
                evt.preventDefault();
                try {
                    window.__TAURI__.opener.openUrl(link.href).catch((err) => {
                        console.error("[DBV] No se pudo abrir el enlace:", err);
                    });
                } catch (err) {
                    console.error("[DBV] No se pudo abrir el enlace:", err);
                }
            });
        });
    }

    return close;
}

// ─── Menú de exportación ─────────────────────────────────────────────────────
function mountExportMenu() {
    const trigger = $("btn-export-menu");
    const menu = $("export-menu");
    if (!trigger || !menu) return null;

    const close = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    };

    trigger.onclick = (evt) => {
        evt.stopPropagation();
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", String(willOpen));
    };

    // Clic fuera del menú lo cierra; dentro, no.
    menu.addEventListener("click", (evt) => evt.stopPropagation());
    document.addEventListener("click", () => {
        if (!menu.hidden) close();
    });

    return close;
}

// ─── Barra de estado ─────────────────────────────────────────────────────────
/**
 * Refleja si el backend local responde.
 * @param {boolean} online Si el motor OCR ha contestado al chequeo de salud.
 */
function setEngineStatus(online) {
    const dot = $("engine-dot");
    const text = $("engine-status");
    if (dot) {
        dot.classList.toggle("online", !!online);
        dot.classList.toggle("offline", !online);
    }
    if (text) {
        text.textContent = online
            ? "Motor OCR local activo · sin conexión a la nube"
            : "Esperando al motor OCR local…";
    }
}

async function paintRuntimeMode() {
    const version = await resolveVersion();
    const versionLabel = $("about-version");
    if (versionLabel) versionLabel.textContent = `Versión ${version}`;
    const slot = $("runtime-mode");
    if (slot) slot.textContent = `${runtimeLabel} · v${version}`;
}

// ─── Compuertas declarativas de la barra ─────────────────────────────────────
/**
 * Habilita o deshabilita todo lo que depende de una condición del editor.
 * Los controles se marcan en el HTML con `data-needs-<nombre>`, y los que
 * además deben resaltarse cuando la condición se cumple, con
 * `data-active-on="<nombre>"`. Así añadir una herramienta contextual nueva no
 * obliga a tocar JavaScript.
 * @param {string} name Nombre de la compuerta: "doc", "eraser"…
 * @param {boolean} enabled Si la condición se cumple.
 */
function setGate(name, enabled) {
    document.querySelectorAll(`[data-needs-${name}]`).forEach((el) => {
        el.disabled = !enabled;
    });
    document.querySelectorAll(`[data-active-on="${name}"]`).forEach((el) => {
        el.classList.toggle("active", !!enabled);
    });
}

// ─── Estado del documento ────────────────────────────────────────────────────
/**
 * Proyecta en la barra si hay un documento cargado. Es una proyección de
 * estado, no un evento: llamarla con `false` devuelve la barra a su reposo,
 * que es lo que hace falta al abrir un segundo documento.
 * @param {boolean} loaded Si hay un documento listo para editar.
 * @param {string} [fileName] Nombre del archivo abierto.
 * @param {number} [totalPages] Total de páginas del documento.
 */
function setDocumentState(loaded, fileName, totalPages) {
    const name = $("doc-name");
    if (name) {
        name.textContent = loaded ? (fileName || "Documento sin nombre") : "Sin documento";
        name.title = loaded ? (fileName || "") : "";
    }
    setGate("doc", loaded);
    if (!loaded) setGate("eraser", false);
    const hint = $("editor-hint");
    if (hint) hint.hidden = !loaded;
    setPage(1, loaded ? totalPages : 0);
}

function setPage(current, total) {
    const badge = $("doc-badge");
    if (!badge) return;
    if (!total) {
        badge.hidden = true;
        return;
    }
    badge.hidden = false;
    badge.textContent = `${current} / ${total}`;
}

// ─── Arranque ────────────────────────────────────────────────────────────────
if (runningInTauri) {
    document.documentElement.classList.add("is-desktop");
}

const closeAbout = mountAboutModal();
const closeExportMenu = mountExportMenu();
mountAlwaysOnTop();
paintRuntimeMode();

// Escape cierra lo que esté abierto, sin pisar los atajos del editor.
document.addEventListener("keydown", (evt) => {
    if (evt.key !== "Escape") return;
    const modal = $("about-modal");
    const menu = $("export-menu");
    if (modal && !modal.hidden) {
        evt.preventDefault();
        closeAbout?.();
    } else if (menu && !menu.hidden) {
        evt.preventDefault();
        closeExportMenu?.();
    }
});

window.dbvShell = {
    runtimeLabel,
    setGate,
    setDocumentState,
    setPage,
    setEngineStatus
};
})();
