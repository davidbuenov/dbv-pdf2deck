import base64
from google import genai
from google.genai import types

def clean_image_with_ai(b64_image: str, api_key: str) -> str:
    """
    Envía la imagen a Nano Banana 2 (gemini-3.1-flash-image-preview) para inpainting.
    Se espera que el LLM devuelva la imagen sin texto.
    """
    client = genai.Client(api_key=api_key)
    
    import io
    from PIL import Image
    
    # Decodificar el base64 a bytes
    if "," in b64_image:
        b64_image = b64_image.split(",")[1]
    image_bytes = base64.b64decode(b64_image)
    
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

