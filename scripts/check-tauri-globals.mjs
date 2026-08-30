// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
//
// Puerta de calidad: colisión de globales con Tauri.
//
// Tauri inyecta globales en `window` con `Object.defineProperty` (no configurables) antes de que
// corra ningún script propio — `isTauri` entre ellos. En un script clásico (los de `frontend/` no
// son módulos ES, ver `dbv-specs-ops/docs/NATIVE_DESKTOP_APPS.md` §3), un `const`/`let`/`class` de
// nivel superior con uno de esos nombres NO da un error de ejecución depurable: revienta el fichero
// entero con un SyntaxError de *parseo*, así que ni su primera línea llega a correr. La app renderiza
// perfecta (HTML y CSS no dependen del JS) pero la interfaz queda muerta.
//
// Esto ya se coló hasta producción en un proyecto hermano (`dbv-teleprompter`, `const isTauri`,
// v0.2.0 — afectó a Microsoft Store, Uptodown y GitHub Releases). El comentario que advertía de
// esto ya existía ahí y no lo impidió: por eso es una puerta de build, no solo una nota en CLAUDE.md.
//
// La comprobación NO usa una regex sobre el código. Una heurística de texto se come las formas
// indentada, `const { isTauri } = ...` y `const a = 1, isTauri = 2`, y las tres son igual de letales.
// En vez de aproximar el parseo, lo ejecutamos: instanciamos el script en un contexto que declara
// los mismos globales que Tauri y dejamos que el propio motor de JS dicte sentencia. Un SyntaxError
// es un fallo real (colisión o sintaxis rota); cualquier otro error significa que el script pasó la
// instanciación y solo se queja de que aquí no hay DOM, que es lo esperado.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = join(repoRoot, "frontend");

const TAURI_INJECTED_GLOBALS = [
    "isTauri", "__TAURI__", "__TAURI_INTERNALS__", "__TAURI_IIFE__",
    "__TAURI_EVENT_PLUGIN_INTERNALS__", "__TAURI_OS_PLUGIN_INTERNALS__", "__TAURI_PATTERN__",
];

function findFatalError(source) {
    const context = vm.createContext({});
    for (const name of TAURI_INJECTED_GLOBALS) {
        vm.runInContext(`Object.defineProperty(globalThis, ${JSON.stringify(name)}, { value: true });`, context);
    }
    try {
        vm.runInContext(source, context);
    } catch (error) {
        // `instanceof` NO vale aqui: el error nace en el realm del contexto `vm`, asi que su
        // constructor no es el SyntaxError de este realm y la comprobacion daria siempre false.
        if (error.name === "SyntaxError") return error.message;
    }
    return null;
}

// Sobre todo lo que haya en `frontend/*.js`, no sobre una lista codificada a mano: cualquier
// fichero que se añada mañana queda cubierto por construcción, sin que nadie tenga que acordarse.
const jsFiles = (await readdir(frontendDir)).filter((name) => name.endsWith(".js"));

let hadFatal = false;
for (const name of jsFiles) {
    const fatal = findFatalError(await readFile(join(frontendDir, name), "utf8"));
    if (fatal) {
        hadFatal = true;
        console.error(`
frontend/${name} no sobrevive a la instanciación con los globales que Tauri inyecta:

    ${fatal}

Eso mata el fichero JS completo antes de su primera línea: la app abre y renderiza, pero ningún
botón responde. Renombra el identificador (p. ej. \`runningInTauri\`) o envuelve el fichero en una IIFE.
`);
    }
}

if (hadFatal) {
    process.exit(1);
}
