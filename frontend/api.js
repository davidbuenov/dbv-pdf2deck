// =============================================================================
// DBV PDF2Deck - Local OCR, Visual Canvas and PPTX Export
// Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================

(() => {
    const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
    const runningInTauri = typeof window !== "undefined" && !!window.__TAURI__;

    async function resolveWebBackendUrl() {
        const ports = [8000, 8005, 8080];
        for (const port of ports) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(600) });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === "running") {
                        return `http://127.0.0.1:${port}/api/v1`;
                    }
                }
            } catch (_) {
                // Siguiente puerto
            }
        }
        return API_BASE_URL;
    }

    const apiBaseUrlPromise = runningInTauri
        ? window.__TAURI__.core.invoke("get_backend_port")
            .then(port => `http://127.0.0.1:${port}/api/v1`)
        : resolveWebBackendUrl();

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
        const apiBaseUrl = await apiBaseUrlPromise;
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
        const apiBaseUrl = await apiBaseUrlPromise;
        return new EventSource(`${apiBaseUrl}/process-log-stream/${encodeURIComponent(docId)}`);
    }

    async function exportDocument(payload) {
        const apiBaseUrl = await apiBaseUrlPromise;
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
        const apiBaseUrl = await apiBaseUrlPromise;
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

    async function checkHealth() {
        const apiBaseUrl = await apiBaseUrlPromise;
        const rootUrl = apiBaseUrl.replace(/\/api\/v1\/?$/, "");
        const response = await fetch(`${rootUrl}/health`, { method: "GET" });
        if (!response.ok) {
            throw await parseError(response);
        }
        return response.json();
    }

    window.dbvApi = {
        runningInTauri,
        checkHealth,
        processDocument,
        openProcessLogStream,
        exportDocument,
        cleanBackground
    };
})();
