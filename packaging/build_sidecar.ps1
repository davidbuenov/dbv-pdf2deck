# =============================================================================
# DBV PDF2Deck - Build the Python sidecar for Tauri
# Copyright (c) 2026 David Bueno Vallejo - https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops - https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot ".venv-sidecar"
$pythonPath = Join-Path $environmentPath "Scripts\python.exe"
$binaryDirectory = Join-Path $projectRoot "src-tauri\binaries"

Push-Location $projectRoot
try {
    if (-not (Test-Path $pythonPath)) {
        if (Get-Command py -ErrorAction SilentlyContinue) {
            py -3.12 -m venv $environmentPath
        } else {
            python -m venv $environmentPath
        }
    }

    & $pythonPath -m pip install --upgrade pip
    & $pythonPath -m pip install -r "packaging\requirements-sidecar.txt"

    & $pythonPath "packaging\build_sidecar.py" --target-triple "x86_64-pc-windows-msvc"
}
finally {
    Pop-Location
}
