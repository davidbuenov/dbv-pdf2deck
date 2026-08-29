# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
# =============================================================================
"""
Configuración global de arnés de pruebas para pytest.
Garantiza la resolución de módulos internos desde la carpeta backend/.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Inyectar el directorio backend en sys.path para resolución limpia de core.* y api.*
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
