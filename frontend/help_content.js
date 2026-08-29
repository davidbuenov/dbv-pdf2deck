// =============================================================================
// DBV PDF2Deck — Local OCR · Visual Canvas · PPTX Export
// Copyright (c) 2026 David Bueno Vallejo · https://davidbuenov.com
// Licensed under the MIT License. See LICENSE for details.
// Built with dbv-specs-ops — https://github.com/davidbuenov/dbv-specs-ops
// =============================================================================
/**
 * @fileoverview Contenido del módulo de ayuda.
 *
 * Cada idioma es un documento completo e independiente, no una traducción
 * frase a frase: la ayuda se escribe para que se lea bien en su idioma, y
 * trocearla en claves de `i18n.js` obligaría a redactarla en inglés con
 * sintaxis española. El diccionario de `i18n.js` sigue siendo el sitio de las
 * etiquetas de interfaz; esto es prosa larga y vive aparte.
 */

(() => {

const HELP_ES = `
<section>
  <h3>Qué es DBV PDF2Deck</h3>
  <p>
    Convierte PDFs e infografías en presentaciones editables. Reconoce el texto de la página,
    lo convierte en bloques que puedes mover, reescribir y dar formato, y exporta el resultado
    a PowerPoint, PDF y Markdown.
  </p>
  <p class="help-note">
    <strong>Todo ocurre en tu ordenador.</strong> Ni el documento ni su texto salen de la máquina:
    no hay servidor remoto, ni cuenta, ni suscripción. El motor de OCR se ejecuta en local.
  </p>
</section>

<section>
  <h3>1. Cargar un documento</h3>
  <p>
    Arrastra el archivo sobre el área de carga o pulsa para elegirlo. Se admiten
    <strong>PDF, PNG, JPG y WEBP</strong>, hasta 20&nbsp;MB, con un máximo de 8.000&nbsp;px por lado
    y 25 millones de píxeles en total.
  </p>
  <p>
    Al procesar verás una consola de progreso. La <strong>primera ejecución tarda más</strong>: el motor
    de OCR carga sus modelos en memoria la primera vez. Las siguientes son notablemente más rápidas.
  </p>
</section>

<section>
  <h3>2. Cómo se lee la página</h3>
  <p>
    Si el PDF ya trae <strong>texto nativo</strong>, se extrae directamente con su tipografía, tamaño y
    color reales: es el caso ideal y el más fiel. Si la página es una imagen (un escaneo, una
    infografía, una exportación de NotebookLM), entra el <strong>OCR</strong>, que reconoce el texto y
    estima su tamaño y estilo a partir de la caja que lo contiene.
  </p>
  <p class="help-note">
    En las páginas reconocidas por OCR, el tamaño de fuente es una <em>estimación</em>, no un dato real
    del documento. Es normal tener que ajustarlo a mano en algunos bloques.
  </p>
</section>

<section>
  <h3>3. Editar en el lienzo</h3>
  <ul>
    <li><strong>Doble clic</strong> sobre un bloque: lo edita en su sitio, sobre la propia página.</li>
    <li><strong>Arrastrar</strong> un bloque: lo mueve. Los tiradores de las esquinas lo redimensionan.</li>
    <li><strong>Ctrl + clic</strong>: añade o quita bloques de una selección múltiple.</li>
    <li><strong>Arrastrar sobre zona vacía</strong>: selecciona por rectángulo todo lo que quede dentro.</li>
    <li><strong>Ctrl + Z</strong> deshace y <strong>Ctrl + Y</strong> (o Ctrl + Mayús + Z) rehace.</li>
    <li><strong>Esc</strong> cierra el diálogo o el menú que tengas abierto.</li>
  </ul>
  <p>
    La barra flotante permite cambiar tipografía, tamaño, interlineado, negrita, cursiva, subrayado,
    color y alineación del bloque seleccionado.
  </p>
</section>

<section>
  <h3>4. Limpiar el fondo</h3>
  <p>
    <strong>Limpiar Fondo</strong> reconstruye el fondo bajo los cuadros de texto para que puedas
    reescribir encima sin que asome el texto original. Usa <em>inpainting</em> local: rellena la zona
    a partir de los píxeles vecinos, sin enviar nada a ningún sitio.
  </p>
  <p>
    Si tienes bloques seleccionados, el botón pasa a llamarse <strong>Limpiar selección</strong> y actúa
    solo sobre ellos. Es lo recomendable: limpiar la página entera obliga a reajustar textos que
    estaban perfectos.
  </p>
</section>

<section>
  <h3>5. La Goma Mágica</h3>
  <p>
    Sirve para lo que no es texto: marcas de agua, logos, manchas, elementos sobrantes.
  </p>
  <ul>
    <li><strong>Goma</strong> coloca una goma sobre el documento. Solo puede haber una por página;
        si ya existe, el botón la vuelve a seleccionar en lugar de crear otra.</li>
    <li>Arrástrala y redimensiónala hasta cubrir lo que quieras eliminar.</li>
    <li><strong>Borrar zona</strong> borra lo que hay debajo. Puedes pulsarlo
        <strong>varias veces seguidas</strong> sobre la misma zona: cada pasada refina el resultado.</li>
    <li><strong>Retirar goma</strong> la quita del documento. La goma nunca aparece en lo exportado.</li>
  </ul>
  <p class="help-note">
    La goma se dibuja opaca, así que tapa lo que hay debajo aunque todavía no hayas borrado nada.
    Para comprobar el resultado real, retírala o muévela a un lado.
  </p>
</section>

<section>
  <h3>6. Exportar</h3>
  <p>
    El menú <strong>Exportar</strong> permite elegir formatos y modo. Se descarga un ZIP con todo lo
    marcado, y el sistema te pregunta dónde guardarlo.
  </p>
  <ul>
    <li><strong>.pptx</strong> — presentación de PowerPoint con cada página como diapositiva y los
        bloques como cuadros de texto reales, editables.</li>
    <li><strong>.pdf</strong> — si partiste de un PDF, tus cambios se superponen sobre el original,
        de modo que todo lo que no tocaste conserva su calidad vectorial intacta.</li>
    <li><strong>.md</strong> — el texto en Markdown, rescatando además los enlaces ocultos del PDF.</li>
  </ul>
  <p>
    <strong>Solo los bloques modificados</strong> exporta únicamente lo que has tocado y deja el resto
    como parte de la página. <strong>Todo el documento editable</strong> convierte cada bloque
    reconocido en un cuadro de texto.
  </p>

  <h4>Calidad del fondo (PPTX)</h4>
  <p>
    Un PPTX no puede contener una página vectorial, así que el fondo de cada diapositiva es siempre
    una imagen. El editor trabaja a 100&nbsp;DPI porque ahí lo que importa es la velocidad, pero al
    exportar se vuelve a rasterizar el <strong>PDF original</strong> a la resolución que elijas.
  </p>
  <ul>
    <li><strong>150–200 DPI</strong> — ficheros ligeros, suficiente para proyectar.</li>
    <li><strong>300 DPI</strong> — el valor por defecto y el mejor equilibrio para casi todo.</li>
    <li><strong>400–600 DPI</strong> — para impresión o zoom fuerte. Genera archivos más pesados y
        tarda más; en páginas muy grandes la resolución se reduce sola para no agotar la memoria.</li>
  </ul>
  <p class="help-note">
    Este ajuste solo mejora los documentos <strong>PDF</strong>. Si cargaste una imagen, el fondo ya son
    sus píxeles originales y no hay nitidez que recuperar: el límite es la propia imagen. Tampoco se
    aplica a las páginas que hayas limpiado con la goma, porque esos píxeles corregidos solo existen
    en la versión del editor.
  </p>
</section>

<section>
  <h3>7. La barra superior</h3>
  <ul>
    <li><strong>ES / EN</strong> — cambia el idioma de toda la interfaz, incluida esta ayuda.</li>
    <li><strong>Chincheta</strong> — mantiene la ventana por encima del resto (solo en la app de escritorio).</li>
    <li><strong>Motor</strong> — el indicador de estado. En verde, el motor de OCR está listo.</li>
    <li><strong>Acerca de</strong> — versión, enlaces y búsqueda de actualizaciones.</li>
  </ul>
</section>

<section>
  <h3>8. Si algo no va</h3>
  <ul>
    <li><strong>El indicador del motor no se pone en verde.</strong> Dale unos segundos tras abrir la
        aplicación: arrancar el motor de OCR lleva su tiempo. Se reintenta solo.</li>
    <li><strong>El procesado tarda mucho la primera vez.</strong> Es esperable: se están cargando los
        modelos de reconocimiento. A partir de ahí va mucho más rápido.</li>
    <li><strong>El texto exportado no encaja en su cuadro.</strong> En páginas de OCR el tamaño de
        fuente es estimado. Ajústalo desde la barra flotante y vuelve a exportar.</li>
    <li><strong>El documento se rechaza al cargarlo.</strong> Revisa los límites: 20&nbsp;MB, 8.000&nbsp;px
        por lado y 25 millones de píxeles.</li>
  </ul>
</section>
`;

const HELP_EN = `
<section>
  <h3>What DBV PDF2Deck does</h3>
  <p>
    It turns PDFs and infographics into editable presentations. It recognises the text on the page,
    converts it into blocks you can move, rewrite and restyle, and exports the result to PowerPoint,
    PDF and Markdown.
  </p>
  <p class="help-note">
    <strong>Everything runs on your machine.</strong> Neither the document nor its text ever leaves your
    computer: no remote server, no account, no subscription. The OCR engine runs locally.
  </p>
</section>

<section>
  <h3>1. Loading a document</h3>
  <p>
    Drop a file onto the upload area or click to browse. <strong>PDF, PNG, JPG and WEBP</strong> are
    accepted, up to 20&nbsp;MB, with a ceiling of 8,000&nbsp;px per side and 25 million pixels in total.
  </p>
  <p>
    A progress console appears while the document is processed. The <strong>first run takes longer</strong>:
    the OCR engine loads its models into memory once. Later runs are noticeably faster.
  </p>
</section>

<section>
  <h3>2. How the page is read</h3>
  <p>
    When a PDF already carries <strong>native text</strong>, it is extracted directly with its real font,
    size and colour — the ideal case, and the most faithful. When the page is an image (a scan, an
    infographic, a NotebookLM export), <strong>OCR</strong> takes over: it recognises the text and
    estimates size and style from the box that contains it.
  </p>
  <p class="help-note">
    On OCR pages the font size is an <em>estimate</em>, not a value read from the document. Expect to
    adjust a few blocks by hand.
  </p>
</section>

<section>
  <h3>3. Editing on the canvas</h3>
  <ul>
    <li><strong>Double-click</strong> a block to edit it in place, right on the page.</li>
    <li><strong>Drag</strong> a block to move it. Corner handles resize it.</li>
    <li><strong>Ctrl + click</strong> adds or removes blocks from a multiple selection.</li>
    <li><strong>Drag over empty space</strong> to rubber-band select everything inside.</li>
    <li><strong>Ctrl + Z</strong> undoes, <strong>Ctrl + Y</strong> (or Ctrl + Shift + Z) redoes.</li>
    <li><strong>Esc</strong> closes whichever dialog or menu is open.</li>
  </ul>
  <p>
    The floating toolbar changes font, size, line spacing, bold, italic, underline, colour and
    alignment of the selected block.
  </p>
</section>

<section>
  <h3>4. Cleaning the background</h3>
  <p>
    <strong>Clean Background</strong> reconstructs the background underneath text boxes so you can write
    over them without the original text showing through. It uses local <em>inpainting</em>: the area is
    filled in from neighbouring pixels, with nothing sent anywhere.
  </p>
  <p>
    With blocks selected, the button becomes <strong>Clean selection</strong> and applies only to them.
    That is the recommended way — cleaning the whole page forces you to redo text that was already fine.
  </p>
</section>

<section>
  <h3>5. The Magic Eraser</h3>
  <p>
    This one is for everything that is not text: watermarks, logos, smudges, leftovers.
  </p>
  <ul>
    <li><strong>Eraser</strong> places an eraser on the document. There is only ever one per page; if it
        already exists, the button reselects it instead of creating another.</li>
    <li>Drag and resize it until it covers what you want gone.</li>
    <li><strong>Erase area</strong> wipes what is underneath. You can press it
        <strong>several times in a row</strong> on the same spot — each pass refines the result.</li>
    <li><strong>Remove eraser</strong> takes it off the document. The eraser never appears in exports.</li>
  </ul>
  <p class="help-note">
    The eraser is drawn opaque, so it hides whatever is beneath it even before you erase anything. To
    check the real result, remove it or drag it aside.
  </p>
</section>

<section>
  <h3>6. Exporting</h3>
  <p>
    The <strong>Export</strong> menu selects formats and mode. You get a ZIP with everything you ticked,
    and the system asks where to save it.
  </p>
  <ul>
    <li><strong>.pptx</strong> — a PowerPoint deck with one slide per page and blocks as real, editable
        text boxes.</li>
    <li><strong>.pdf</strong> — if you started from a PDF, your edits are overlaid on the original, so
        everything you did not touch keeps its vector quality untouched.</li>
    <li><strong>.md</strong> — the text as Markdown, also recovering links hidden in the PDF.</li>
  </ul>
  <p>
    <strong>Only modified blocks</strong> exports just what you touched and leaves the rest as part of the
    page. <strong>Entire document editable</strong> turns every recognised block into a text box.
  </p>

  <h4>Background quality (PPTX)</h4>
  <p>
    A PPTX cannot hold a vector page, so every slide background is an image. The editor works at
    100&nbsp;DPI because that is where speed matters, but on export the <strong>original PDF</strong> is
    re-rasterised at the resolution you pick.
  </p>
  <ul>
    <li><strong>150–200 DPI</strong> — light files, fine for projecting.</li>
    <li><strong>300 DPI</strong> — the default, and the best balance for almost everything.</li>
    <li><strong>400–600 DPI</strong> — for print or heavy zooming. Bigger files and slower exports; on
        very large pages the resolution is reduced automatically to avoid exhausting memory.</li>
  </ul>
  <p class="help-note">
    This setting only helps <strong>PDF</strong> documents. If you loaded an image, the background already
    is its original pixels and there is no sharpness to recover — the source itself is the limit. It
    also does not apply to pages you cleaned with the eraser, because those corrected pixels exist
    only in the editor's version.
  </p>
</section>

<section>
  <h3>7. The top bar</h3>
  <ul>
    <li><strong>ES / EN</strong> — switches the whole interface, this help included.</li>
    <li><strong>Pin</strong> — keeps the window above everything else (desktop app only).</li>
    <li><strong>Engine</strong> — the status indicator. Green means the OCR engine is ready.</li>
    <li><strong>About</strong> — version, links and update check.</li>
  </ul>
</section>

<section>
  <h3>8. If something goes wrong</h3>
  <ul>
    <li><strong>The engine indicator never turns green.</strong> Give it a few seconds after launch —
        starting the OCR engine takes a moment. It retries on its own.</li>
    <li><strong>The first document takes ages.</strong> That is expected: the recognition models are
        loading. It is much faster from then on.</li>
    <li><strong>Exported text overflows its box.</strong> On OCR pages the font size is estimated. Adjust
        it from the floating toolbar and export again.</li>
    <li><strong>The document is rejected on upload.</strong> Check the limits: 20&nbsp;MB, 8,000&nbsp;px per
        side and 25 million pixels.</li>
  </ul>
</section>
`;

window.DBV_HELP = { es: HELP_ES, en: HELP_EN };

})();
