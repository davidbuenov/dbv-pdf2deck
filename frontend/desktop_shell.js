// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
/**
 * @fileoverview Chrome de escritorio: barra superior, chincheta (always-on-top),
 * selector de idioma (i18n), modal «Acerca de», menú de exportación y barra de estado.
 */

(() => {

const APP_VERSION = "2.0.0";

const runningInTauri = !!window.dbvApi?.runningInTauri;
const $ = (id) => document.getElementById(id);

function getRuntimeLabel() {
    const isEn = window.DBV_I18N?.getLang?.() === "en";
    if (runningInTauri) {
        return isEn ? "Desktop (Tauri v2)" : "Escritorio (Tauri v2)";
    }
    return isEn ? "Web Browser" : "Navegador web";
}

function tauriApi(path) {
    if (!runningInTauri) return null;
    return path.split(".").reduce((obj, key) => obj?.[key], window.__TAURI__) ?? null;
}

// ─── Selector de idioma ──────────────────────────────────────────────────────
function mountLangToggle() {
    const btn = $("btn-lang-toggle");
    const indicator = $("lang-indicator");
    if (!btn) return;

    const updateIndicator = () => {
        const lang = window.DBV_I18N?.getLang?.() || "es";
        if (indicator) indicator.textContent = lang === "es" ? "EN" : "ES";
        btn.title = lang === "es"
            ? "Switch to English / Cambiar a inglés"
            : "Cambiar a español / Switch to Spanish";
    };

    btn.onclick = () => {
        window.DBV_I18N?.toggleLang?.();
        updateIndicator();
    };

    document.addEventListener("dbv-lang-changed", () => {
        updateIndicator();
        paintRuntimeMode();
        const curDoc = $("doc-name");
        if (curDoc && (curDoc.textContent === "Sin documento" || curDoc.textContent === "No document")) {
            curDoc.textContent = window.DBV_I18N?.t("toolbar.noDoc") || "Sin documento";
        }
    });

    updateIndicator();
}

// ─── Chincheta: mantener la ventana encima del resto ─────────────────────────
function mountAlwaysOnTop() {
    const btn = $("btn-always-on-top");
    if (!btn || !tauriApi("window.getCurrentWindow")) return;
    btn.hidden = false;

    btn.onclick = async () => {
        const pinned = !btn.classList.contains("active");
        try {
            await window.__TAURI__.window.getCurrentWindow().setAlwaysOnTop(pinned);
            btn.classList.toggle("active", pinned);
            const isEn = window.DBV_I18N?.getLang?.() === "en";
            btn.title = pinned
                ? (isEn ? "Window pinned on top — click to unpin" : "Ventana fijada encima — clic para soltarla")
                : (isEn ? "Keep window on top" : "Fijar la ventana encima del resto");
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

// ─── Ayuda ───────────────────────────────────────────────────────────────────
/**
 * Monta el modal de ayuda. El contenido no vive en el diccionario de i18n: cada
 * idioma es un documento completo en `help_content.js`, y se reinyecta al
 * cambiar de idioma para que la ayuda abierta cambie con la interfaz.
 * @returns {(() => void) | null} Cerrador del modal, o null si falta el marcado.
 */
function mountHelpModal() {
    const modal = $("help-modal");
    const btnOpen = $("btn-help");
    const btnClose = $("help-close");
    const backdrop = $("help-backdrop");
    const body = $("help-body");
    if (!modal || !btnOpen || !body) return null;

    const paint = () => {
        const lang = window.DBV_I18N?.getLang?.() === "en" ? "en" : "es";
        body.innerHTML = window.DBV_HELP?.[lang] ?? "";
        body.scrollTop = 0;
    };

    const open = () => {
        paint();
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

    document.addEventListener("dbv-lang-changed", () => {
        if (!modal.hidden) paint();
    });

    return close;
}

// ─── Actualizaciones ─────────────────────────────────────────────────────────
function setBtnText(btn, text) {
    const slot = btn.querySelector(".btn-txt");
    if (slot) slot.textContent = text;
    else btn.textContent = text;
}

async function mountUpdater() {
    const wrap = $("about-update");
    const btn = $("btn-check-update");
    const status = $("update-status");
    if (!wrap || !btn || !status) return;
    if (!tauriApi("updater.check") || !tauriApi("core.invoke")) return;

    const setStatus = (text, available) => {
        status.textContent = text;
        status.classList.toggle("available", !!available);
    };

    let packaged = false;
    try {
        packaged = await window.__TAURI__.core.invoke("is_packaged_app");
    } catch (err) {
        console.warn("[DBV] No se pudo determinar el canal de instalación:", err);
    }

    wrap.hidden = false;
    if (packaged) {
        btn.hidden = true;
        setStatus(window.DBV_I18N?.t("about.store") || "Las actualizaciones las gestiona la tienda.", false);
        return;
    }

    let pending = null;

    const install = async () => {
        btn.disabled = true;
        setStatus(window.DBV_I18N?.t("about.downloading") || "Descargando…", true);
        try {
            let total = 0;
            let bajado = 0;
            await pending.downloadAndInstall((evt) => {
                if (evt.event === "Started") {
                    total = evt.data.contentLength || 0;
                } else if (evt.event === "Progress") {
                    bajado += evt.data.chunkLength || 0;
                    const pct = total ? ` ${Math.round((bajado / total) * 100)} %` : "";
                    setStatus(`${window.DBV_I18N?.t("about.downloading") || "Descargando…"}${pct}`, true);
                } else if (evt.event === "Finished") {
                    setStatus(window.DBV_I18N?.t("about.installed") || "Instalada. Reiniciando…", true);
                }
            });
            setStatus(window.DBV_I18N?.t("about.installed") || "Actualización instalada. Reiniciando…", true);
            await window.__TAURI__.process.relaunch();
        } catch (err) {
            console.error("[DBV] Fallo al instalar la actualización:", err);
            btn.disabled = false;
            setStatus(window.DBV_I18N?.t("about.installFailed") || "No se pudo instalar la actualización.", false);
        }
    };

    btn.onclick = async () => {
        if (pending) {
            install();
            return;
        }
        btn.disabled = true;
        setStatus(window.DBV_I18N?.t("about.checking") || "Buscando…", false);
        try {
            const update = await window.__TAURI__.updater.check();
            btn.disabled = false;
            if (!update) {
                setStatus(window.DBV_I18N?.t("about.upToDate") || "Estás en la última versión.", false);
                return;
            }
            pending = update;
            setBtnText(btn, window.DBV_I18N?.t("about.updateBtn") || `Actualizar (${update.version})`);
            setStatus(window.DBV_I18N?.t("about.available", { version: update.version }) || `Nueva versión ${update.version} disponible.`, true);
        } catch (err) {
            console.error("[DBV] Fallo al buscar actualizaciones:", err);
            btn.disabled = false;
            setStatus(window.DBV_I18N?.t("about.checkFailed") || "No se pudo comprobar si hay actualizaciones.", false);
        }
    };
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

    menu.addEventListener("click", (evt) => evt.stopPropagation());
    document.addEventListener("click", () => {
        if (!menu.hidden) close();
    });

    return close;
}

// ─── Barra de estado ─────────────────────────────────────────────────────────
function setEngineStatus(online, healthInfo) {
    const dot = $("engine-dot");
    const text = $("engine-status");
    if (dot) {
        dot.classList.toggle("online", !!online);
        dot.classList.toggle("offline", !online);
    }
    if (text) {
        const isEn = window.DBV_I18N?.getLang?.() === "en";
        const modeLabel = healthInfo?.ocr_label ? ` (${healthInfo.ocr_label})` : "";
        text.textContent = online
            ? (isEn ? `Local OCR active${modeLabel} · no cloud connection` : `Motor OCR local activo${modeLabel} · sin conexión a la nube`)
            : (isEn ? "Waiting for local OCR engine…" : "Esperando al motor OCR local…");
    }
}

async function paintRuntimeMode() {
    const version = await resolveVersion();
    const versionLabel = $("about-version");
    if (versionLabel) {
        versionLabel.textContent = window.DBV_I18N?.t("about.version", { version }) || `Versión ${version}`;
    }
    const slot = $("runtime-mode");
    if (slot) slot.textContent = `${getRuntimeLabel()} · v${version}`;
}

// ─── Compuertas declarativas de la barra ─────────────────────────────────────
function setGate(name, enabled) {
    document.querySelectorAll(`[data-needs-${name}]`).forEach((el) => {
        el.disabled = !enabled;
    });
    document.querySelectorAll(`[data-active-on="${name}"]`).forEach((el) => {
        el.classList.toggle("active", !!enabled);
    });
}

// ─── Estado del documento ────────────────────────────────────────────────────
function setDocumentState(loaded, fileName, totalPages) {
    const name = $("doc-name");
    if (name) {
        const noDoc = window.DBV_I18N?.t("toolbar.noDoc") || "Sin documento";
        name.textContent = loaded ? (fileName || "Documento") : noDoc;
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
const closeHelp = mountHelpModal();
const closeExportMenu = mountExportMenu();
mountLangToggle();
mountAlwaysOnTop();
mountUpdater();
paintRuntimeMode();

document.addEventListener("keydown", (evt) => {
    if (evt.key !== "Escape") return;
    const modal = $("about-modal");
    const help = $("help-modal");
    const menu = $("export-menu");
    if (help && !help.hidden) {
        evt.preventDefault();
        closeHelp?.();
    } else if (modal && !modal.hidden) {
        evt.preventDefault();
        closeAbout?.();
    } else if (menu && !menu.hidden) {
        evt.preventDefault();
        closeExportMenu?.();
    }
});

window.dbvShell = {
    setGate,
    setDocumentState,
    setPage,
    setEngineStatus
};
})();
