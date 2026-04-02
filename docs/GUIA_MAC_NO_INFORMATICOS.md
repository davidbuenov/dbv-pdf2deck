# Guía Paso a Paso para No Informáticos (macOS)

Esta guía está pensada para personas sin experiencia técnica que usan Mac.

Objetivo: dejar DBV PDF2Deck funcionando en tu Mac, incluso si hoy no tienes instalado ni Git ni Python.

Si usas Windows, ve directamente aquí: [Guía para No Informáticos (Windows)](GUIA_NO_INFORMATICOS.md).

---

## Índice

1. [Antes de empezar](#antes-de-empezar)
2. [Camino recomendado (sin usar Git): descargar ZIP](#camino-recomendado-sin-usar-git-descargar-zip)
3. [Camino alternativo (si prefieres Git)](#camino-alternativo-si-prefieres-git)
4. [Instalar Python 3.12 (obligatorio)](#instalar-python-312-obligatorio)
5. [Primera puesta en marcha de la app](#primera-puesta-en-marcha-de-la-app)
6. [Cómo conseguir la API Key de AI Studio (paso a paso)](#como-conseguir-la-api-key-de-ai-studio-paso-a-paso)
7. [Solución de problemas frecuentes](#solucion-de-problemas-frecuentes)
8. [Cerrar la aplicación](#cerrar-la-aplicacion)
9. [Resumen rápido](#resumen-rapido)

---

## Antes de empezar

Necesitas:

- Un Mac con macOS reciente.
- Conexión a internet.
- Navegador (Chrome, Edge, Safari o Firefox).

Tiempo estimado la primera vez: 20 a 40 minutos.

---

## Camino recomendado (sin usar Git): descargar ZIP

Si no quieres usar Git, este método es el más sencillo.

### 1) Descargar el proyecto

1. Abre esta página en tu navegador:
   - https://github.com/davidbuenov/dbv-pdf2deck
2. Pulsa el botón verde **Code**.
3. Pulsa **Download ZIP**.
4. Ve a Descargas y abre el ZIP (macOS lo descomprime automáticamente).
5. Mueve la carpeta descomprimida a un lugar cómodo, por ejemplo al Escritorio.
6. Opcional: renombra la carpeta a `dbv-pdf2deck` para que coincida con esta guía.

Importante: al terminar, debes ver una carpeta con archivos como README.md, start_dev.bat, backend, frontend, etc.

---

## Camino alternativo (si prefieres Git)

Este camino es opcional.

### 1) Instalar Git

En macOS, Git suele venir ya instalado. Compruébalo así:

1. Abre la app **Terminal**.
2. Escribe:

```bash
git --version
```

3. Si aparece una versión, ya está listo.
4. Si no, macOS te ofrecerá instalar las herramientas de desarrollo. Acepta la instalación y vuelve a ejecutar el comando.

### 2) Descargar el proyecto con Git

En Terminal, ejecuta:

```bash
cd ~
git clone https://github.com/davidbuenov/dbv-pdf2deck.git
```

Esto creará la carpeta `~/dbv-pdf2deck`.

---

## Instalar Python 3.12 (obligatorio)

### 1) Comprobar si ya tienes Python 3.12

1. Abre **Terminal**.
2. Escribe:

```bash
python3.12 --version
```

3. Si ves `Python 3.12.x`, puedes pasar al siguiente bloque.

### 2) Si no lo tienes, instalar Python 3.12

Opción sencilla:

1. Abre https://www.python.org/downloads/release/python-3120/
2. Descarga el instalador para macOS.
3. Abre el instalador y sigue los pasos por defecto.

### 3) Comprobar que quedó bien instalado

En Terminal:

```bash
python3.12 --version
```

Si aparece `Python 3.12.x`, está correcto.

---

## Primera puesta en marcha de la app

### 1) Entrar en la carpeta del proyecto

Si usaste ZIP y lo dejaste en Escritorio con el nombre sugerido:

```bash
cd ~/Desktop/dbv-pdf2deck
```

Si usaste Git:

```bash
cd ~/dbv-pdf2deck
```

Si está en otra ubicación, adapta la ruta.

### 2) Crear entorno virtual e instalar dependencias

Ejecuta estos comandos uno por uno:

```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Nota: la primera instalación puede tardar varios minutos.

### 3) Arrancar backend y frontend

Esta parte en Mac se hace en dos terminales.

Terminal 1 (backend):

```bash
cd ~/dbv-pdf2deck/backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2 (frontend estático):

```bash
cd ~/dbv-pdf2deck/frontend
python3 -m http.server 5500
```

Si tu carpeta está en otra ruta, cambia `~/dbv-pdf2deck` por tu ruta real.

### 4) Abrir la app en el navegador

Abre:

- http://localhost:5500

Si todo va bien, verás la interfaz para cargar tu PDF.

---

## Cómo conseguir la API Key de AI Studio (paso a paso)

La API Key solo es necesaria si quieres usar la función **"Limpiar Fondo"** con IA.

### 1) Entrar en Google AI Studio

1. Abre: https://aistudio.google.com/
2. Inicia sesión con tu cuenta de Google.

### 2) Crear una API Key

1. Dentro de AI Studio, busca el menú de **API keys**.
2. Pulsa **Create API key**.
3. Si te pide proyecto de Google Cloud:
   - Puedes crear uno nuevo siguiendo los pasos guiados.
   - O elegir uno existente.
4. Copia la clave cuando aparezca.

Consejo: guarda la clave temporalmente en un bloc de notas hasta pegarla en la app.

### 3) Pegar la API Key en DBV PDF2Deck

1. Abre DBV PDF2Deck en http://localhost:5500
2. En la parte superior, localiza el campo **AI API Key**.
3. Pega la clave.
4. Ya puedes usar el botón **✨ Limpiar Fondo**.

Importante:

- La clave se guarda en tu navegador (en local).
- No compartas tu API Key con otras personas.

---

## Solución de problemas frecuentes

### "python3.12: command not found"

- Python 3.12 no está instalado o no está en PATH.
- Solución: reinstala Python 3.12 desde python.org y vuelve a abrir Terminal.

### "Address already in use" al arrancar puertos

- Algún proceso ya está usando el puerto 8000 o 5500.
- Solución rápida:
  1. Cierra terminales anteriores.
  2. Vuelve a abrir Terminal y arranca de nuevo.

### "ModuleNotFoundError" o errores de dependencias

- Probablemente no está activado el entorno virtual.
- Repite:

```bash
cd ~/dbv-pdf2deck/backend
source venv/bin/activate
pip install -r requirements.txt
```

---

## Cerrar la aplicación

En cada terminal donde esté corriendo la app, pulsa `Control + C`.

---

## Resumen rápido

1. Descarga el proyecto (ZIP o Git).
2. Instala Python 3.12.
3. Instala dependencias en `backend`.
4. Arranca backend (puerto 8000) y frontend (puerto 5500).
5. Abre http://localhost:5500.
6. (Opcional) Crea API Key en AI Studio y pégala en la app.

---

¿Usas Windows? Sigue esta guía equivalente: [Guía para No Informáticos (Windows)](GUIA_NO_INFORMATICOS.md).