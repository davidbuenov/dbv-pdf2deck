# Guía de Estilos de Código (STYLEGUIDE.md)

Este proyecto rige el desarrollo de su lógica bajo las siguientes directrices OBLIGATORIAS para mantener la máxima calidad tanto en el ecosistema de Backend como de Frontend.

---

## 🐍 Reglas Backend (Python 3.10+)

1. **Tipado Moderno**
   - Uso de `|` para uniones, `TypedDict`, `TypeAlias`, `Literal`, `dataclass(slots=True)`.
   - Anotar tipos indefectiblemente en entradas, salidas y variables de estado importantes.

2. **Result Pattern**
   - Retornar el patrón `Result: TypeAlias = Ok[T] | Err` en funciones propensas a errores de negocio.
   - Prohibido utilizar `None` en retornos de forma ambigua y silenciar excepciones.

3. **Restricción de Flujo (Un solo return)**
   - Un **único** `return` estructurado por cada función, ubicado al final.
   - Uso estricto de *Guard Clauses* y estado acumulado, rehuyendo de las "pirámides de ifs" anidadas.

4. **Recursos y Errores**
   - Administración rigurosa vía *context managers* (`with`).
   - Las excepciones se lanzan con contexto específico solo cuando ocurra una falla irrecuperable.

5. **Linting y Documentación**
   - Linter base ideal: `ruff` sumado a `mypy`.
   - Docstrings sobre métodos o funciones públicas en convención *Google* (`Args:`, `Returns:`, `Raises:`).

---

## 🌐 Reglas Frontend (HTML / CSS / JS)

1. **Accesibilidad y Semántica (WCAG 2.2)**
   - HTML semántico con estructuración de *landmarks* definidos (nav, main, footer).
   - Obligatoriedad del atributo `lang` en `<html>`, `alt` descriptivo en imágenes, y controles de formulario siempre pareados a su respectivo `<label>`.
   - Sincronización ineludible de valores `aria-*` correspondientes al estado lógico de JS.

2. **CSS Moderno y Universal**
   - Paradigma basado en CSS Variables exclusivas y arquitectura responsiva fluida (`clamp`).
   - Apoyo irrestricto a preferencias sistémicas visuales (`prefers-reduced-motion`) y manejo consistente enfocado a teclado usando variables de `:focus-visible`.

3. **Prácticas Severas JavaScript (ESM)**
   - Patrón *ES Modules* implementado vía script `defer`.
   - Quedan terminantemente **prohibidos los inline handlers** (ej. `onclick="..."`) en el HTML; usando delegación de eventos u oyentes controlados.
   - *Progressive Enhancement.* Ni una sola variable en el `scope global` (`window.xyz = ...`).
   - Funciones exportadas y lógicas core rigurosamente documentadas en protocolo **JSDoc**.

4. **Seguridad Web y Rendimiento**
   - Despliegues ideados asumiendo una Content Security Policy (CSP) impidiendo scripts *inline*.
   - Toda renderización o impresión de datos dinámicos requiere purificación previa.
   - Manejo eficaz de recursos: fuentes intercambiables de forma óptima (`swap`) y carga diferida paramétrica (`loading="lazy"`) en multimedia.
   - División de responsabilidad irrompible: `index.html`, `styles.css` y `main.js`.
