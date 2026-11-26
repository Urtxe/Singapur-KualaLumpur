# Asia Trip 2026

Planificador familiar para Singapur y Kuala Lumpur, del 3 al 12 de diciembre de 2026. La aplicación existente continúa como PWA estática en TypeScript y Vite. GitHub Pages sirve el itinerario público. El plan editado, el diario, los gastos y los documentos viven en el navegador de cada teléfono.

## Dejar preparados el iPhone y el POCO

1. Abre la [app de viaje](https://urtxe.github.io/Singapur-KualaLumpur/) con conexión en ambos teléfonos. En **Viaje → Offline y documentos**, ejecuta **Preparar viaje sin conexión** y espera la verificación de recursos.
2. En el iPhone, usa Safari y elige **Compartir → Añadir a pantalla de inicio**. En el POCO, abre Chrome y usa **Menú → Instalar y crear acceso directo → Instalar**, según la versión. [Guía de iPhone](https://support.apple.com/es-es/guide/iphone/iphea86e5236/ios), [guía de Chrome](https://support.google.com/chrome/answer/9658361?hl=es&co=GENIE.Platform%3DAndroid).
3. Abre una vez la app desde cada icono con red. Después recarga en modo avión, consulta la agenda y abre un documento de prueba. Cada teléfono prepara su propia caché y conserva su propia copia.
4. En **Compartir**, guarda una copia completa. Si incluyes documentos o fotos en tu respaldo, exporta también el archivo de **Offline y documentos** y guárdalo en privado.

El almacenamiento se separa por origen y subruta. Cambiar la URL o abrir el sitio por primera vez en otro dispositivo requiere importar los datos. El sistema puede eliminar almacenamiento del navegador. Conserva copias fuera de la app.

## Trabajar desde dos teléfonos

Cada teléfono puede anotar cosas y editar el plan por separado, también sin internet. En **Compartir**, elige planificación, gastos, un día, notas, favoritos, actividades realizadas o el viaje. La otra persona puede abrir el selector de archivos o pegar un paquete pequeño. Usa la descarga si el navegador no ofrece el menú nativo de compartir archivos. WhatsApp y el correo requieren su propia conexión para enviar el archivo.

La revisión identifica registros que se pueden combinar y cambios divergentes que necesitan una elección. El linaje de versiones y las marcas de borrado permiten reconocer duplicados y copias antiguas aunque los relojes de los móviles discrepen. Se conserva una copia para deshacer la última importación. Los paquetes corrientes excluyen documentos, recibos y fotos. Una copia completa de los datos estructurados y una exportación del almacén de archivos son dos archivos separados.

La clave de la versión 1 se conserva en la misma URL. La migración congela el último equivalente conocido de los gastos antiguos con el cambio que tenía su copia v1. Si un gasto v1 no tenía un tipo disponible, queda pendiente de convertir. Las nuevas cotizaciones se aplican al registrar movimientos y los cambios históricos quedan guardados con cada gasto.

## Uso durante el viaje

- **HOY** reúne la próxima actividad, avisos, presupuesto y accesos para gastos y notas. El selector permite revisar a mano una fecha, aunque el viaje todavía no haya comenzado.
- **Agenda** tiene vistas por día, semana, cronología y zona. Mantén pulsado el agarre y arrastra para cambiar el orden, o usa los botones de subida y bajada. El orden de visitas y las horas se editan por separado. Los avisos y sugerencias nunca reordenan el día por sí solos.
- **Lugares**, **Agenda local**, **Gastronomía** y **Transporte** reúnen las fichas, fuentes y enlaces. Las líneas del mapa representan el orden y las distancias directas usan coordenadas locales. Consulta las indicaciones reales mediante Google Maps con conexión.
- **Gastos** separa prepagos, destino, presupuestos y efectivo. Cambiar moneda o sacar dinero alimenta la cartera. Las comisiones registradas cuentan como gasto. El importe real en EUR, si se introduce, se conserva con el movimiento.
- **Offline y documentos** permite guardar archivos locales. Usa imágenes JPEG, PNG o WebP y documentos PDF. Una foto local puede adjuntarse al diario o a un gasto. El almacenamiento del navegador queda accesible para quien pueda abrir ese perfil. Evita compartir una copia privada por error y guarda fuera de este repositorio pasaportes, referencias privadas, información médica y datos financieros reales.

Los vuelos y los accesos pendientes están etiquetados en la app. Las direcciones internas de Star Residence y las condiciones de roaming, APN y hotspot del plan TSIM requieren confirmar la reserva y la tarjeta concretas. Consulta de fuentes turísticas del 25 de noviembre de 2026. Cada ficha, evento, contacto y tramo documentado incluye su fuente cuando está disponible.

## Desarrollo y publicación

Requiere Node.js 24 y npm.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

`npm run build` genera `dist/`. `npm run serve:subpath` lo sirve en `http://127.0.0.1:4173/asia-trip/`, la subruta reproducida por Playwright. Las pruebas móviles usan Chromium y WebKit con perfiles emulados. `src/state.ts` y `src/exchange.ts` gestionan migración, validación y fusión. El resto de `src/` contiene planificador, guía, finanzas y almacén local. `public/` lleva recursos y manifest, y `vite.config.ts` genera la precarga del service worker.

El repositorio es [Urtxe/Singapur-KualaLumpur](https://github.com/Urtxe/Singapur-KualaLumpur). Las ramas de trabajo salen de `develop`. El workflow de producción ejecuta lint, unidades, build y Playwright antes de publicar `dist/` desde `main`. Configuración de Pages en **GitHub Actions**. [Documentación de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Imágenes locales

`public/cover.webp`, `public/kuala-lumpur.webp`, `public/kaya.webp` y `public/nasi.webp` son ilustraciones fotográficas generadas con ImageGen y optimizadas a WebP. Se encargaron fotografías editoriales de Gardens by the Bay, de las torres Petronas al anochecer, de kaya toast en una cafetería de Singapur y de nasi lemak servido sobre hoja de plátano. Las fotos de las fichas de comida son ilustrativas.

Las fotografías de lugares están en `public/places/`, con metadatos y créditos en `src/place-photos.ts` y en los detalles de cada ficha. Se distribuyen como WebP locales para poder verlas sin conexión.
