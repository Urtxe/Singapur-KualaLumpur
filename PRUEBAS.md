# Verificación de Asia Trip 2026 Premium

El proyecto se comprobó con Node.js 24. Las pruebas de navegador usan el build de producción servido bajo `/asia-trip/`, una subruta equivalente a un proyecto de GitHub Pages.

Resultado local de la versión 2.0.0 del 25 de noviembre de 2026. TypeScript, lint y build correctos, 27 pruebas unitarias superadas y 42 pruebas Playwright superadas. Se omiten tres combinaciones que requieren CDP en un motor o perfil distinto del previsto por el test.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e -- --workers=3
```

## Cobertura

| Prueba | Qué comprueba |
| --- | --- |
| `state.test.ts` y `exchange.test.ts` | Esquema v2, compatibilidad JSON v1 y conservación de la clave local, deduplicación, concurrencia entre dispositivos, linaje y tombstones, restauración explícita y deshacer, datos manipulados, referencias de archivos y fecha UTC+8. |
| `planner.test.ts` y `planner.spec.ts` | Advertencias de solapamientos y ritmo, distancia directa, edición del plan alternativo, reordenación táctil mediante CDP, cronología, semana y consulta de fechas en HOY. |
| `finance.test.ts` y `finance.spec.ts` | Céntimos, equivalentes históricos, presupuesto, edición, compras prepagadas, comisiones y retiradas que no se cargan como gasto. |
| `trip.spec.ts` | Mapa, navegación externa, agenda original y personalizada, intercambio entre dos contextos de navegador, archivos inválidos, copias completas, conservación de notas tras cerrar y reabrir la página, CSV y teclado sin desbordamiento horizontal a 375 px. |
| `offline.spec.ts` | Preparación de la caché, selector de archivos estable al guardar el seguro, recarga y descarga de un PDF con la red desactivada, copia privada con referencias estables, restauración en otro contexto y actualización del worker con conservación de gastos, recibos y seguro. |
| `connection.spec.ts` | Primera carga con caché vacía, latencia de 150 ms y 1 Mbps simulado, precarga completada y ausencia de peticiones externas en el arranque. |

Se ejecuta Chromium de escritorio, WebKit con perfil iPhone y Chromium con perfil Android. Las dos comprobaciones dependientes de CDP se ejecutan en Chromium. La red apagada se emula en Playwright. No se probaron el menú nativo de instalación, el selector físico de archivos ni la conectividad de las SIM en teléfonos físicos.
