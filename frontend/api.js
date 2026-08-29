// =============================================================================
// DBV PDF2Deck - Local OCR, Visual Canvas and PPTX Export
// Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

(() => {
    const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
    const runningInTauri = typeof window !== "undefined" && !!window.__TAURI__;

    let cachedApiBaseUrl = null;

    /**
     * En modo navegador puro (sin Tauri), intenta descubrir el backend probando
     * primero el puerto de la URL actual (Live Server / dev) y luego el puerto
     * por defecto 8000. Si hay un parámetro `?port=XXXX` en la URL, se usa ese.
     */
    async function resolveWebBackendUrl() {
        // Si la URL contiene ?port=XXXX (inyectado por el dev server o manualmente)
        const urlParams = new URLSearchParams(window.location.search);
        const explicitPort = urlParams.get("port");
        if (explicitPort) {
            return `http://127.0.0.1:${explicitPort}/api/v1`;
        }
        // Fallback al puerto por defecto del backend independiente
        return API_BASE_URL;
    }

    async function resolveTauriBackendUrl() {
        try {
            const port = await window.__TAURI__.core.invoke("get_backend_port");
            if (port) {
                return `http://127.0.0.1:${port}/api/v1`;
            }
        } catch (err) {
            console.warn("[DBV] Esperando puerto del sidecar de Tauri...", err);
        }
        return resolveWebBackendUrl();
    }

    async function getApiBaseUrl() {
        if (cachedApiBaseUrl) return cachedApiBaseUrl;
        const url = runningInTauri
            ? await resolveTauriBackendUrl()
            : await resolveWebBackendUrl();
        return url;
    }

    function getErrorMessage(errorBody, status) {
        let message = `Error HTTP ${status}`;
        if (errorBody && typeof errorBody === "object" && "detail" in errorBody) {
            message = String(errorBody.detail);
        }
        return message;
    }

    async function parseError(response) {
        let errorBody = null;
        try {
            errorBody = await response.json();
        } catch (error) {
            errorBody = null;
        }
        return new Error(getErrorMessage(errorBody, response.status));
    }

    async function processDocument(file, docId) {
        const apiBaseUrl = await getApiBaseUrl();
        const formData = new FormData();
        formData.append("file", file);
        formData.append("doc_id", docId);
        const response = await fetch(`${apiBaseUrl}/process`, {
            method: "POST",
            body: formData
        });
        if (!response.ok) {
            throw await parseError(response);
        }
        return response.json();
    }

    async function openProcessLogStream(docId) {
        const apiBaseUrl = await getApiBaseUrl();
        return new EventSource(`${apiBaseUrl}/process-log-stream/${encodeURIComponent(docId)}`);
    }

    async function exportDocument(payload) {
        const apiBaseUrl = await getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/export`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw await parseError(response);
        }
        return response.blob();
    }

    async function cleanBackground(payload, useCloud) {
        const apiBaseUrl = await getApiBaseUrl();
        const endpoint = useCloud ? "clean-background" : "clean-background-local";
        const response = await fetch(`${apiBaseUrl}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw await parseError(response);
        }
        return response.json();
    }

    /**
     * Convierte un Blob a base64 sin volcarlo a la pila: `btoa` sobre un
     * spread de bytes revienta con exportaciones de varios MB.
     * @param {Blob} blob
     * @returns {Promise<string>} Payload base64 sin el prefijo `data:`.
     */
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || "");
                const comma = result.indexOf(",");
                resolve(comma === -1 ? result : result.slice(comma + 1));
            };
            reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo generado."));
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Guarda un Blob en disco.
     *
     * En Tauri el WebView2 no tiene gestor de descargas: un `<a download>` con
     * una blob URL no hace absolutamente nada y no aparece ningún diálogo del
     * sistema. Por eso en escritorio pedimos la ruta con el diálogo nativo y
     * escribimos los bytes desde Rust. En navegador seguimos con la descarga
     * clásica, que allí sí funciona.
     *
     * @param {Blob} blob Contenido a guardar.
     * @param {string} defaultName Nombre propuesto en el diálogo.
     * @returns {Promise<string|null>} Ruta escrita, o `null` si se canceló.
     */
    async function saveBlobToDisk(blob, defaultName) {
        if (!runningInTauri) {
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.style.display = "none";
            anchor.href = url;
            anchor.download = defaultName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(url);
            return defaultName;
        }

        if (typeof window.__TAURI__?.dialog?.save !== "function") {
            throw new Error("El plugin de diálogos de Tauri no está disponible: recompila la aplicación.");
        }

        const extension = (defaultName.split(".").pop() || "").toLowerCase();
        const path = await window.__TAURI__.dialog.save({
            defaultPath: defaultName,
            filters: extension
                ? [{ name: extension.toUpperCase(), extensions: [extension] }]
                : []
        });
        if (!path) return null;

        const contentsBase64 = await blobToBase64(blob);
        await window.__TAURI__.core.invoke("save_binary_file", { path, contentsBase64 });
        return path;
    }

    async function checkHealth() {
        const apiBaseUrl = await getApiBaseUrl();
        const rootUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, "");
        const response = await fetch(`${rootUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(1500)
        });
        if (!response.ok) {
            throw await parseError(response);
        }
        const data = await response.json();
        if (data && data.status === "running") {
            cachedApiBaseUrl = apiBaseUrl;
        }
        return data;
    }

    window.dbvApi = {
        runningInTauri,
        checkHealth,
        processDocument,
        openProcessLogStream,
        exportDocument,
        cleanBackground,
        saveBlobToDisk
    };
})();
