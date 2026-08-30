# =============================================================================
# DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
# Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
# Licensed under the MIT License. See LICENSE for details.
# =============================================================================
"""
Tests de regresión para la fusión de fragmentos y líneas OCR.
Verifica que las columnas independientes no se fusionen horizontalmente
incluso si los fragmentos llegan en desorden vertical leve.
"""
from core.ocr_engine import (
    _TextGroup,
    _same_line,
    _merge_into_lines,
    _same_paragraph,
    _merge_into_paragraphs,
    _group_from_fragment,
)


def test_independent_columns_do_not_merge_horizontally():
    """
    Simula 4 columnas contiguas en la misma banda vertical (y=100..130).
    Verifica que cada columna se mantenga como su propia línea independiente.
    """
    col1 = _group_from_fragment((50, 100, 200, 130), "VESOS > 1.0", 0.95)
    col2 = _group_from_fragment((250, 100, 350, 130), "ESCALAR", 0.90)
    col3 = _group_from_fragment((400, 100, 600, 130), "DIAGNOSTICO FALLOS", 0.88)
    col4 = _group_from_fragment((650, 100, 900, 130), "1. NO PROYECTOS VAGOS", 0.92)

    assert not _same_line(col1, col2)
    assert not _same_line(col2, col3)
    assert not _same_line(col3, col4)

    lines = _merge_into_lines([col1, col2, col3, col4])
    assert len(lines) == 4, f"Se esperaban 4 líneas independientes pero se obtuvieron {len(lines)}"


def test_out_of_order_y_fragments_do_not_merge_across_screen():
    """
    Prueba el caso crítico de Storytelia: un fragmento a la derecha (x=620)
    con Y ligeramente menor que un fragmento a la izquierda (x=70).
    Verifica que no se produzca absorción por resta negativa.
    """
    # Fragmento derecho: x=620..674, y=502..514 (y_center=508)
    right_frag = _group_from_fragment((620.0, 502.0, 674.0, 514.0), "PROYECTOS", 1.0)
    # Fragmento izquierdo: x=70..159, y=507..520 (y_center=513.5)
    left_frag = _group_from_fragment((70.0, 507.0, 159.0, 520.0), "CARENCIA OBJETIVA", 0.73)

    assert not _same_line(right_frag, left_frag)
    assert not _same_line(left_frag, right_frag)

    lines = _merge_into_lines([right_frag, left_frag])
    assert len(lines) == 2, f"Se esperaban 2 líneas separadas, se obtuvieron {len(lines)}"


def test_words_in_same_phrase_do_merge():
    """
    Simula palabras de la misma frase con un espacio normal (~8px con h=30).
    Verifica que sí se fusionen en una sola línea.
    """
    w1 = _group_from_fragment((50, 100, 100, 130), "Hola", 0.95)
    w2 = _group_from_fragment((108, 100, 160, 130), "mundo", 0.95)

    assert _same_line(w1, w2)
    lines = _merge_into_lines([w1, w2])
    assert len(lines) == 1
    assert lines[0].text == "Hola mundo"
