# Guía de Instalación: Aceleración GPU (CUDA) para DBV PDF2Deck

> **GPU final utilizada:** NVIDIA GeForce RTX 4070 Ti (12 GB VRAM)  
> **Sistema operativo:** Windows 11  
> **Fecha:** Marzo 2026

---

## ¿Por qué activar la GPU?

El motor OCR del proyecto (EasyOCR + PyTorch) procesa las páginas del PDF en **30-50 segundos por página** cuando usa la CPU. Con la GPU activada, ese tiempo baja a **2-5 segundos**. La aceleración es de aproximadamente 10x.

El código del motor (`backend/core/ocr_engine.py`) detecta automáticamente si CUDA está disponible:

```python
import torch
gpu_ready = torch.cuda.is_available()
_reader = easyocr.Reader(['es', 'en'], gpu=gpu_ready, verbose=False)
```

---

## Requisitos previos

| Requisito | Versión necesaria | Notas |
|---|---|---|
| Python | **3.11 o 3.12** | ⚠️ La 3.13 NO funciona (ver problemas) |
| PyTorch (CUDA) | 2.5.1+cu121 | Descarga ~2.4 GB |
| Drivers NVIDIA | Actualizados | Necesario para CUDA 12.1 |

---

## Pasos de instalación (El proceso correcto)

### Paso 1: Verificar que NO tienes la GPU activa

Activa tu entorno virtual y ejecuta el script de diagnóstico:

```cmd
cd backend
venv\Scripts\activate
python test_cuda.py
```

Si el resultado es `CUDA: False`, continúa con los pasos siguientes.

---

### Paso 2: Instalar Python 3.12 (si no lo tienes)

> ⚠️ **Crítico:** PyTorch con soporte CUDA no existe para Python 3.13 en Windows todavía.
> Debes usar la versión 3.12.

```cmd
winget install Python.Python.3.12
```

Cierra y abre una terminal nueva para que Windows reconozca el nuevo Python.

---

### Paso 3: Recrear el entorno virtual con Python 3.12

Borra la carpeta `venv` existente (físicamente desde el explorador o con el comando):

```cmd
rmdir /s /q venv
```

Crea el nuevo entorno con Python 3.12:

```cmd
cd backend
py -3.12 -m venv venv
venv\Scripts\activate
```

Verifica que estás en la versión correcta:

```cmd
python --version
```

Debe mostrar `Python 3.12.x`. Si pone `3.13`, algo ha salido mal con la creación del entorno.

---

### Paso 4: Instalar PyTorch con soporte CUDA

> ⚠️ **Crítico:** El orden importa. Instala `torch` primero, solo, y luego el resto.

**Primero, solo torch:**

```cmd
pip install --force-reinstall --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu121
```

Verás una descarga de aproximadamente **2.4 GB**. Si no ves descarga, algo va mal.

**Luego, torchvision y torchaudio (deben coincidir en versión):**

```cmd
pip install --force-reinstall --no-cache-dir torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

---

### Paso 5: Instalar el resto de dependencias del proyecto

```cmd
pip install -r requirements.txt
```

---

### Paso 6: Verificar que CUDA está activa

```cmd
python test_cuda.py
```

Resultado esperado:

```
=== DBVPDFEditor - Diagnóstico GPU ===
Versión Python: 3.12.x
Versión PyTorch: 2.5.1+cu121
¿CUDA Disponible?: SÍ (Modo Turbo Activo)
Nombre de la GPU: NVIDIA GeForce RTX 4070 Ti
Memoria Total: 11.99 GB
```

---

## Problemas encontrados y soluciones

### ❌ Problema 1: Python 3.13 no soportada por PyTorch-CUDA

**Síntoma:**
```
ERROR: Could not find a version that satisfies the requirement torch
ERROR: No matching distribution found for torch
```

**Causa:** PyTorch no publica binarios CUDA para Python 3.13 en Windows todavía.

**Solución:** Instalar Python 3.12 (`winget install Python.Python.3.12`) y recrear el entorno virtual.

---

### ❌ Problema 2: pip dice "Requirement already satisfied" pero CUDA sigue en False

**Síntoma:**
```
Requirement already satisfied: torch in ...venv... (2.11.0)
```

**Causa:** `pip` encuentra el `torch` de CPU ya instalado y no lo actualiza porque cree que "ya está". El uso de `--extra-index-url` (en vez de `--index-url`) le permite seguir usando PyPI como fuente principal, donde encuentra el torch de CPU primero.

**Solución:**
1. Usar `--index-url` (sin "extra") para forzar que busque **solo** en los servidores de NVIDIA.
2. Añadir `--force-reinstall` y `--no-cache-dir` para ignorar caché y versiones anteriores.
3. Instalar `torch` por separado antes que `torchvision`.

---

### ❌ Problema 3: Conflicto de versiones entre torch y torchvision

**Síntoma:**
```
torchvision 0.26.0 requires torch==2.11.0, but you have torch 2.5.1+cu121 which is incompatible.
```

**Causa:** Se instaló `torch` con la versión de CUDA correcta (2.5.1) pero `torchvision` se quedó en la versión antigua (0.26.0) que solo era compatible con torch 2.11.0.

**Solución:** Reinstalar `torchvision` y `torchaudio` también con el flag `--index-url`:
```cmd
pip install --force-reinstall --no-cache-dir torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

---

### ❌ Problema 4: Warning de carpeta temporal

**Síntoma:**
```
WARNING: Failed to remove contents in a temporary directory '...\~orch'.
You can safely remove it manually.
```

**Causa:** Durante el desinstalado del torch antiguo, Windows bloqueó el borrado de una carpeta temporal.

**Solución:** Borrarla manualmente:
```cmd
rmdir /s /q venv\Lib\site-packages\~orch
```

---

## Notas sobre el `requirements.txt`

El archivo `backend/requirements.txt` incluye la línea:

```
--extra-index-url https://download.pytorch.org/whl/cu121
```

Esto ayuda en instalaciones *limpias*, pero si ya tienes torch instalado (aunque sea la versión de CPU), `pip` puede ignorarla. En ese caso, usa los comandos manuales del **Paso 4** encima.

---

## Comprobación rápida post-arranque

Tras lanzar el sistema con `start_dev.bat`, la primera carga de un PDF tardará unos segundos más de lo normal (la GPU está cargando el modelo a la VRAM). A partir de la segunda página, el procesamiento será casi instantáneo.
