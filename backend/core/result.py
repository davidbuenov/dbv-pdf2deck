# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Módulo base fundamental para el manejo de errores siguiendo el patrón Result funcional.
"""
from dataclasses import dataclass
from typing import Generic, TypeAlias, TypeVar

T = TypeVar("T")


@dataclass(slots=True)
class Ok(Generic[T]):
    """
    Representa un resultado exitoso de una operación.

    Args:
        value (T): El valor contenido producto del éxito.
    """

    value: T


@dataclass(slots=True)
class Err:
    """
    Representa un error manejado o recuperable de negocio.

    Args:
        message (str): Descripción detallada del error.
    """

    message: str


Result: TypeAlias = Ok[T] | Err
