import base64
import io

from PIL import Image
from google import genai
from google.genai import types


def _normalize_b64_image(b64_image: str) -> str:
    """Acepta data URI o base64 crudo y devuelve solo payload base64."""
    return b64_image.split(",", 1)[1] if "," in b64_image else b64_image


def clean_image_with_inpaint(b64_image: str, boxes: list[dict]) -> str:
    """
    Limpieza local de fondo mediante inpainting de OpenCV.

    Estrategia:
    1) Crear mascara de texto a partir de los bboxes.
    2) Dilatar suavemente la mascara para cubrir bordes/antialias.
    3) Inpaint TELEA para reconstruir fondo con pixeles vecinos.
    """
    try:
        import cv2
        import numpy as np
    except Exception as e:
        raise RuntimeError(
            "OpenCV no está instalado en el backend. Instala opencv-python-headless y reinicia el servidor."
        ) from e

    raw_b64 = _normalize_b64_image(b64_image)
    image_bytes = base64.b64decode(raw_b64)

    pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    rgb = np.array(pil_image)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    mask = np.zeros(bgr.shape[:2], dtype=np.uint8)
    height, width = mask.shape

    for box in boxes:
        # Soportar ambos formatos para compatibilidad:
        # - bbox: [x0, y0, x1, y1]
        # - coords: [x, y, w, h]
        if "bbox" in box and isinstance(box["bbox"], list) and len(box["bbox"]) == 4:
            x0, y0, x1, y1 = box["bbox"]
        elif "coords" in box and isinstance(box["coords"], list) and len(box["coords"]) == 4:
            x, y, w, h = box["coords"]
            x0, y0, x1, y1 = x, y, x + w, y + h
        else:
            continue

        x0i = max(0, min(width - 1, int(round(float(x0)))))
        y0i = max(0, min(height - 1, int(round(float(y0)))))
        x1i = max(0, min(width - 1, int(round(float(x1)))))
        y1i = max(0, min(height - 1, int(round(float(y1)))))

        if x1i <= x0i or y1i <= y0i:
            continue

        cv2.rectangle(mask, (x0i, y0i), (x1i, y1i), 255, -1)

    # Cubre bordes de caracteres para evitar halos al reconstruir
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)

    inpainted = cv2.inpaint(bgr, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    out_rgb = cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB)

    out_img = Image.fromarray(out_rgb)
    out_buffer = io.BytesIO()
    out_img.save(out_buffer, format="PNG")
    return base64.b64encode(out_buffer.getvalue()).decode("utf-8")

def clean_image_with_ai(b64_image: str, api_key: str) -> str:
    """
    Envía la imagen a Nano Banana 2 (gemini-3.1-flash-image-preview) para inpainting.
    Se espera que el LLM devuelva la imagen sin texto.
    """
    client = genai.Client(api_key=api_key)
    
    # Decodificar el base64 a bytes
    image_bytes = base64.b64decode(_normalize_b64_image(b64_image))
    
    # Obtener dimensiones originales para anclar el bounding box system
    original_img = Image.open(io.BytesIO(image_bytes))
    original_size = original_img.size
    
    # Prompt probado por el usuario (Añadido énfasis imperativo y tamaño)
    prompt = (
        "nanobanana, genera una imagen a partir de la anterior pero sin absolutamente ningún texto. "
        "Borra cualquier letra, cifra o palabra dejando solo los fondos y las formas limpias. "
        "Es CRÍTICO que la imagen generada mantenga exactamente el mismo tamaño, resolución y proporción (aspect ratio) que la imagen original suministrada."
    )
    
    response = client.models.generate_content(
        model='gemini-3.1-flash-image-preview',
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            prompt
        ]
    )
    
    for candidate in response.candidates:
        if not candidate.content or not candidate.content.parts:
            continue
            
        for part in candidate.content.parts:
            if part.inline_data and part.inline_data.data:
                # Redimensionar coercitivamente al aspect ratio y tamaño original
                generated_img = Image.open(io.BytesIO(part.inline_data.data))
                if generated_img.size != original_size:
                    generated_img = generated_img.resize(original_size, Image.Resampling.LANCZOS)
                
                buffer = io.BytesIO()
                generated_img.save(buffer, format="PNG")
                return base64.b64encode(buffer.getvalue()).decode("utf-8")
                
    raise ValueError(f"El modelo no retornó datos de imagen en línea. Respuesta textual: {response.text}")

