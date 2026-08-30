// =============================================================================
// DBV PDF2Deck - Build the Windows MSIX bundle via a MakeAppx mapping file
// Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
//
// `npx @choochmeque/tauri-windows-bundle build` (y el propio `MakeAppx.exe pack /d
// <dir>` al que llama por debajo) falla en silencio o con un error de validación de
// manifiesto en este proyecto: el sidecar de PyTorch mete miles de ficheros (~4800)
// bajo `sidecar/_internal/`, y el modo de empaquetado por DIRECTORIO de MakeAppx
// (`/d`) los enumera mal — "Packing 2 file(s)" cuando hay 4771 reales, reproducido
// invocando `MakeAppx.exe` directamente, sin pasar por ninguna herramienta de
// terceros. Es un límite/bug real de esa herramienta con árboles de ficheros así de
// grandes, no un problema de nuestra configuración.
//
// La solución estándar para paquetes grandes es dejar de depender del recorrido de
// directorio de MakeAppx y darle en su lugar un FICHERO DE MAPEO (`/f mapping.txt`)
// que liste explícitamente cada fichero de origen y su ruta de destino dentro del
// paquete — sin ambigüedad de enumeración posible.
//
// Requiere que `npx @choochmeque/tauri-windows-bundle build --runner npm` ya se haya
// ejecutado antes (deja `src-tauri/target/appx/x64` listo con el AppxManifest.xml,
// los Assets y el sidecar). Este script retoma justo ahí: genera el mapeo, empaqueta
// con MakeAppx y produce el `.msixbundle` final.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcTauriDir = join(repoRoot, "src-tauri");
const appxDir = join(srcTauriDir, "target", "appx", "x64");
const msixOutDir = join(srcTauriDir, "target", "msix");

function findMakeAppx() {
    const kitsBinRoot = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
    if (!existsSync(kitsBinRoot)) {
        throw new Error(`No se encontró el Windows SDK en ${kitsBinRoot}`);
    }
    const versions = readdirSync(kitsBinRoot)
        .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
        .sort()
        .reverse();
    for (const version of versions) {
        const candidate = join(kitsBinRoot, version, "x64", "makeappx.exe");
        if (existsSync(candidate)) return candidate;
    }
    throw new Error(`No se encontró makeappx.exe bajo ninguna versión en ${kitsBinRoot}`);
}

// El copiado de recursos de Tauri deja `Assets`, `sidecar` y `AppxManifest.xml` como
// *reparse points* (symlinks de Windows), no como ficheros/carpetas normales —
// `Dirent.isFile()`/`isDirectory()` los reporta como ninguno de los dos porque no
// siguen el enlace. `statSync` sí lo sigue.
function collectFiles(dir, baseDir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
            collectFiles(fullPath, baseDir, out);
        } else if (stats.isFile()) {
            out.push({ abs: fullPath, rel: relative(baseDir, fullPath) });
        }
    }
    return out;
}

function buildMappingFile(files, mappingPath) {
    const lines = ["[Files]"];
    for (const { abs, rel } of files) {
        lines.push(`"${abs}"    "${rel}"`);
    }
    writeFileSync(mappingPath, lines.join("\r\n") + "\r\n", "utf8");
}

function main() {
    if (!existsSync(join(appxDir, "AppxManifest.xml"))) {
        throw new Error(
            `No existe ${appxDir}\\AppxManifest.xml — ejecuta primero ` +
                `"npx @choochmeque/tauri-windows-bundle build --runner npm" para generar el AppxContent.`
        );
    }

    const makeAppx = findMakeAppx();
    console.log(`MakeAppx.exe: ${makeAppx}`);

    const files = collectFiles(appxDir, appxDir);
    console.log(`Ficheros a empaquetar: ${files.length}`);

    mkdirSync(msixOutDir, { recursive: true });
    const packMappingPath = join(msixOutDir, "pack-mapping.txt");
    buildMappingFile(files, packMappingPath);

    const version = JSON.parse(
        readFileSync(join(srcTauriDir, "tauri.conf.json"), "utf8")
    ).version;
    const fourPartVersion = `${version}.0`;
    const msixPath = join(msixOutDir, `dbv-pdf2deck_${fourPartVersion}_x64.msix`);

    console.log("Empaquetando .msix con fichero de mapeo (sin modo directorio)...");
    execFileSync(makeAppx, ["pack", "/f", packMappingPath, "/p", msixPath, "/o"], {
        stdio: "inherit",
    });

    // El .msixbundle envuelve un único .msix por arquitectura — aquí el modo
    // directorio de MakeAppx no tiene el problema anterior (un solo fichero).
    const bundleStagingDir = join(msixOutDir, "bundle-staging");
    rmSync(bundleStagingDir, { recursive: true, force: true });
    mkdirSync(bundleStagingDir, { recursive: true });
    const stagedMsixPath = join(bundleStagingDir, `dbv-pdf2deck_${fourPartVersion}_x64.msix`);
    execFileSync("cmd", ["/c", "copy", "/y", msixPath, stagedMsixPath], { stdio: "inherit" });

    const msixBundlePath = join(msixOutDir, `dbv-pdf2deck_${fourPartVersion}.msixbundle`);
    console.log("Empaquetando .msixbundle...");
    execFileSync(
        makeAppx,
        ["bundle", "/d", bundleStagingDir, "/p", msixBundlePath, "/o"],
        { stdio: "inherit" }
    );

    console.log(`\nListo: ${msixBundlePath}`);
}

main();
