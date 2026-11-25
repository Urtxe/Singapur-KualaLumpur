# Asia Trip 2026

Agenda y diario para cinco viajeros en Singapur y Kuala Lumpur del 3 al 12 de diciembre de 2026. Incluye un plan editable, lugares y mapa offline, transporte, notas y recuerdos, gastos en EUR/SGD/MYR, preparación y un modo familia con la siguiente etapa, vuelta al hotel y emergencias.

## Desarrollo y comprobaciones

Requiere Node.js 24 y npm. El proyecto usa Vite y TypeScript sin framework. La interfaz se renderiza con APIs estándar del navegador y el build entrega un JavaScript pequeño sin dependencias de ejecución ni peticiones automáticas a terceros.

```sh
npm ci
npm run dev
```

```sh
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Playwright inicia el servidor de prueba en `http://127.0.0.1:4173/asia-trip/`. Usa Chromium de escritorio, iPhone 13 con WebKit y Pixel 7 con Chromium. Para abrir la compilación manualmente:

```sh
npm run build
npm run serve:subpath
```

Piezas principales

- `src/data.ts` contiene el itinerario, las coordenadas orientativas, las estimaciones rotuladas y las fuentes oficiales.
- `src/main.ts`, `src/views.ts`, `src/dialogs.ts`, `src/ui.ts` y `src/style.css` componen la navegación, las pantallas y la edición.
- `src/state.ts` valida el estado local y las copias de seguridad, convierte importes y protege las celdas CSV. El esquema JSON lleva una versión y los registros conservan su identificador al editarlos o moverlos.
- `vite.config.ts` genera el service worker con una revisión por contenido. `public/` contiene el manifest, los iconos y la portada local.
- `dist/` es el resultado compilado preparado para publicar. La portada es una imagen editorial ilustrativa creada con ImageGen y optimizada a WebP.

## GitHub Pages

La aplicación sirve desde la raíz o una subruta, como `https://<usuario>.github.io/asia-trip/`, gracias a la base relativa y navegación por fragmentos. El proyecto es autocontenido. El remoto y las ramas de integración y producción quedan por definir en el repositorio que se elija.

1. Usa `dist/` o extrae el ZIP estático. `index.html`, `sw.js`, `manifest.webmanifest`, `.nojekyll` y sus recursos deben quedar juntos al nivel de la carpeta que sirva Pages.
2. Una vez aprobada la publicación, usa la rama de producción del repositorio. Coloca el contenido en `/docs` de esa rama o en la raíz de una rama dedicada a los archivos compilados.
3. En **Settings → Pages → Build and deployment**, elige **Deploy from a branch**, selecciona la rama y carpeta correspondientes y guarda. Visita la URL HTTPS servida por Pages. [Documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

El workflow incluido valida el código, los tests unitarios y el build. La publicación se configura por separado.

## Instalar y usar offline

1. Abre la URL HTTPS con conexión y espera **Disponible offline**. El primer arranque descarga la app, el itinerario, la imagen y los iconos.
2. En iOS, abre Safari y elige **Compartir → Añadir a pantalla de inicio**. Si aparece **Abrir como app web**, actívalo. [Guía de iPhone](https://support.apple.com/es-es/guide/iphone/iphea86e5236/ios).
3. En Android, abre Chrome y usa **Menú → Instalar y crear acceso directo → Instalar**, según la versión. [Guía de Chrome](https://support.google.com/chrome/answer/9658361?hl=es&co=GENIE.Platform%3DAndroid).
4. Desde el icono instalado, abre una vez con red y confirma el aviso. Después prueba a recargar en modo avión. Los enlaces a Google Maps y a las fuentes necesitan conexión.

El mapa está construido con coordenadas aproximadas. Los segmentos indican el orden de visitas. Los tiempos son estimaciones para preparar el día y pueden variar por acceso, conexiones y tráfico. Al modificar el orden de las actividades, revisa sus tiempos de tramo. Si el navegador retira el almacenamiento o cambia el dominio o la subruta, vuelve a importar tu copia.

## Datos y copias

El itinerario base, los hoteles y las fechas integradas serán visibles para quien pueda acceder al sitio. La agenda modificada, los favoritos, las notas, los gastos y la lista de preparación se guardan en `localStorage`, separado por origen y subruta. No hay cuenta ni sincronización. Evita introducir datos de identificación, documentos, localizadores o secretos.

En **Diario → Copias**, descarga un JSON para conservar el estado o transferirlo al navegador de otro dispositivo. La app valida la versión, el formato y las referencias y solicita confirmación antes de sustituir los datos locales. El archivo contiene los datos del diario y debe guardarse en privado. El CSV exporta gastos originales e importes convertidos cuando existe un tipo de cambio manual. Se introduce el equivalente en EUR de **una** unidad SGD o MYR. Los gastos sin tipo quedan visibles y se excluyen de los totales convertidos.

La ubicación se solicita solo al tocar **Usar mi ubicación**. Se mantiene en memoria para construir el enlace de esa consulta y Google Maps recibe las coordenadas si se abre el enlace. Los teléfonos de emergencia usan el marcador del dispositivo.

## Datos pendientes

Comprueba el vuelo SIN–KUL del 7 de diciembre, las terminales, la torre y acceso de Star Residence, el acceso navideño a Garden Rhapsody y la activación/APN/registro y el hotspot de TSIM para la unidad concreta del iPhone. Las referencias consultadas y sus límites figuran en **Viaje → Fuentes y consultas**. El horario de salida hacia KUL el 11 de diciembre es orientativo.

## Portada

La portada `public/cover.webp` se generó con la herramienta integrada ImageGen. Se pidió una imagen editorial panorámica de los Supertrees y Marina Bay Sands desde un jardín tropical de Singapur al final de la tarde, con follaje sombreado a la izquierda, edificios a la derecha, tonos verde y dorado y sin texto.
