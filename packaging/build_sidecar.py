# =============================================================================
# DBV PDF2Deck - Build the Python sidecar for a Tauri target
# Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the DBV PDF2Deck Tauri sidecar")
    parser.add_argument("--target-triple", required=True)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    project_root = Path(__file__).resolve().parent.parent
    sidecar_directory = project_root / "src-tauri" / "sidecar"
    executable_suffix = ".exe" if "windows" in arguments.target_triple else ""
    pyinstaller_name = f"dbv-pdf2deck-sidecar{executable_suffix}"

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--onedir",
        "--name",
        "dbv-pdf2deck-sidecar",
        "--paths",
        str(project_root / "backend"),
        "--collect-all",
        "uvicorn",
        "--collect-all",
        "pypdfium2",
        "--collect-all",
        "reportlab",
        "--collect-all",
        "pypdf",
        "--collect-all",
        "PIL",
        "--collect-all",
        "easyocr",
        "--collect-all",
        "torch",
        "--collect-all",
        "torchvision",
        "--collect-all",
        "cv2",
        "--collect-all",
        "pptx",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--hidden-import",
        "uvicorn.protocols",
        "--hidden-import",
        "uvicorn.protocols.http",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespans",
        "--hidden-import",
        "uvicorn.lifespans.on",
        "--hidden-import",
        "uvicorn.lifespans.auto",
        "--hidden-import",
        "multipart",
        "--copy-metadata",
        "tqdm",
        "--copy-metadata",
        "torch",
        "--copy-metadata",
        "easyocr",
        "--copy-metadata",
        "pypdfium2",
        str(project_root / "backend" / "main.py"),
    ]
    subprocess.run(command, cwd=project_root, check=True)
    built_directory = project_root / "dist" / "dbv-pdf2deck-sidecar"
    built_executable = built_directory / pyinstaller_name
    if not built_executable.is_file():
        raise FileNotFoundError(f"PyInstaller no genero el ejecutable esperado: {built_executable}")

    # --onedir, no --onefile: el binario en --onefile compilaba y "funcionaba" en CI
    # (que nunca lo ejecuta), pero se caía al arrancar en cualquier máquina real. Por
    # eso el sidecar viaja como carpeta (recurso de Tauri, `bundle.resources`), no como
    # `externalBin` de un solo fichero.
    if sidecar_directory.exists():
        shutil.rmtree(sidecar_directory)
    shutil.copytree(built_directory, sidecar_directory)

    # Causa real del arranque roto (WinError 1114 / 0xc0000005 al cargar `c10.dll`,
    # visor de sucesos de Windows -> módulo con errores real: `msvcp140.dll`): alguna
    # dependencia (torch/numpy/opencv...) vendoriza su propia copia del runtime de
    # Visual C++ (v14.16.27033.0, de 2019) dentro del paquete, y PyInstaller la coloca
    # en `_internal/` donde el orden de búsqueda de DLL de Windows la encuentra ANTES
    # que la del sistema — la vendorizada es incompatible con el resto de DLLs nativas
    # del propio paquete y revienta al inicializarse. El sistema ya trae una versión
    # más nueva y compatible (confirmado: v14.51.36247.0 en System32) — basta con NO
    # enviar la vendorizada para que la resolución de DLL caiga sola al system32.
    # Verificado de extremo a extremo: sin este borrado el sidecar se cae siempre al
    # arrancar (frozen); con él, EasyOCR carga y `/api/v1/health` responde.
    vc_runtime_dll_names = (
        "msvcp140.dll",
        "vcruntime140.dll",
        "vcruntime140_1.dll",
    )
    internal_directory = sidecar_directory / "_internal"
    for dll_name in vc_runtime_dll_names:
        vendored_dll = internal_directory / dll_name
        if vendored_dll.is_file():
            vendored_dll.unlink()

    # `--copy-metadata` copia el `.dist-info` entero de cada paquete para que
    # `importlib.metadata` funcione en tiempo de ejecución (solo lee `METADATA`,
    # `RECORD`, `WHEEL`, `top_level.txt` — nunca `licenses/`). PyTorch vendoriza ahí
    # los textos de licencia de TODAS sus dependencias C++ de terceros (Kineto,
    # dynolog, prometheus-cpp, civetweb, duktape, googletest...) en rutas anidadísimas
    # que rozan o superan el límite clásico de 260 caracteres de Windows. MakeAppx.exe
    # (empaquetado MSIX) descarta esas rutas en silencio sin avisar — de 870 MB de
    # contenido real, el `.msixbundle` resultante solo llevaba 6 ficheros. Se borra sin
    # riesgo: no es código, solo texto legal que `importlib.metadata` nunca lee.
    for licenses_directory in internal_directory.glob("*.dist-info/licenses"):
        shutil.rmtree(licenses_directory)

    # `torch/include/` son las cabeceras C++ de libtorch para compilar extensiones
    # nativas contra PyTorch — 60+ MB que nadie usa en tiempo de ejecución (el
    # sidecar solo llama a la API Python de torch, nunca compila C++/CUDA) y, de
    # paso, la fuente de las rutas más largas de todo el paquete.
    torch_include_directory = internal_directory / "torch" / "include"
    if torch_include_directory.is_dir():
        shutil.rmtree(torch_include_directory)


if __name__ == "__main__":
    main()
