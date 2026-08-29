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
    binary_directory = project_root / "src-tauri" / "binaries"
    binary_directory.mkdir(parents=True, exist_ok=True)
    executable_suffix = ".exe" if "windows" in arguments.target_triple else ""
    output_name = f"dbv-pdf2deck-sidecar-{arguments.target_triple}{executable_suffix}"
    pyinstaller_name = f"dbv-pdf2deck-sidecar{executable_suffix}"

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        "--onefile",
        "--name",
        "dbv-pdf2deck-sidecar",
        "--paths",
        str(project_root / "backend"),
        str(project_root / "backend" / "main.py"),
    ]
    subprocess.run(command, cwd=project_root, check=True)
    built_binary = project_root / "dist" / pyinstaller_name
    if not built_binary.is_file():
        raise FileNotFoundError(f"PyInstaller no genero el ejecutable esperado: {built_binary}")
    shutil.copy2(built_binary, binary_directory / output_name)


if __name__ == "__main__":
    main()
