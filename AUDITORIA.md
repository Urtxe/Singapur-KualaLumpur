# Auditoría inicial de Asia Trip 2026

Revisión realizada el 25 de noviembre de 2026 sobre la versión 1 entregada. El proyecto existente contiene una SPA en TypeScript sin framework, compilada por Vite con base relativa. La navegación por hash, los datos públicos, CSS, iconos, manifest, portada y service worker se sirven desde el mismo subdirectorio. El motor de estado valida la estructura, escapa texto y neutraliza fórmulas de hoja de cálculo. Se conservan el itinerario, el catálogo, los identificadores, los enlaces de navegación y la lista de preparación ya entregados.

| Área | Comportamiento observado en la versión 1 | Efecto en el viaje |
| --- | --- | --- |
| Uso en móvil | Menú inferior y áreas seguras, controles táctiles amplios, menú de formulario nativo. Agenda diaria basada en tarjetas con varias acciones por actividad. | Funciona en móvil, pero para ajustar un día completo hay que abrir muchas fichas. Faltan bandeja, vistas de conjunto y arrastre táctil. |
| Inicio | Fecha en UTC+8, etapa siguiente y hotel. El presupuesto y el registro de gastos se alcanzan desde otra sección. | Hace falta una vista operativa que una hora local, siguiente acción, avisos y alternativas. |
| Agenda | Estado, hora, movimiento entre días y reordenación por botones. El borrado se limita a actividades propias. | Las reservas, el plan alternativo, el ritmo familiar y la recuperación requieren más operaciones del modelo. |
| Intercambio | JSON v1 validado, reemplazo total tras confirmación. Identificadores estables sin historial de versiones ni bajas. | Importar la planificación de otro teléfono puede sustituir los gastos y notas propios. No se pueden reconciliar cambios concurrentes. |
| Gastos | Tres divisas, cambio manual global y un presupuesto. Cada recálculo vuelve a usar la cotización actual. | Cambiar el tipo altera los importes históricos. No hay distinción entre efectivo disponible, comisiones y consumo del presupuesto. |
| Guía | Catálogo local, fichas con fuente, mapa geográfico esquemático y enlaces de navegación. | Faltan filtros de eventos fechados, horarios y precios por edades cuando se publican, gastronomía y referencias médicas y consulares. |
| Offline | Precarga por revisión de contenido con caché separada por subruta. El worker anterior activaba automáticamente la versión nueva y borraba la caché previa. | Primera recarga sin red funciona. La actualización puede cambiar de versión mientras una pantalla antigua sigue abierta. Faltan diagnóstico y preparación en el segundo móvil. |
| Privacidad | Estado JSON en `localStorage` con clave versionada y subruta. Los ficheros de usuario no forman parte del modelo. | Las reservas con archivos y las fotos necesitan un almacén privado separado y una copia explícita. |

## Referencias funcionales

- De Wanderlog, vistas de itinerario y sugerencias por proximidad. Las coordenadas locales permiten calcular distancia directa y proponer un orden razonado. Una ruta real necesita datos de la red viaria y del transporte. [Planificador de mapas de Wanderlog](https://wanderlog.com/travel-maps).
- De TripIt, acceso offline a la agenda y a los documentos. En esta PWA, la caché conserva el núcleo e IndexedDB los ficheros seleccionados por el usuario. [Ayuda offline de TripIt](https://help.tripit.com/en/support/solutions/articles/103000063436-using-mobile-apps-without-connectivity), [documentos en TripIt](https://help.tripit.com/en/support/solutions/articles/103000063361).
- De TravelSpend, alta rápida de un gasto, divisas, gráficos y presupuesto. Los importes históricos se guardan en unidades menores y cada movimiento conserva su conversión. [TravelSpend](https://travel-spend.com/).
- De Sygic Travel y Google Maps, puntos de visita, filtros y enlaces de navegación. Se conserva el mapa esquemático con coordenadas locales. La navegación giro a giro, el tráfico, las llegadas en directo y la colaboración en tiempo real requieren fuentes y servicios que quedan fuera de una PWA estática.

## Decisiones de continuidad

Se conserva el proyecto y la clave de almacenamiento de la versión anterior en cada subruta. El esquema 2 añade metadatos a los datos estructurados. Los documentos privados quedan en una base local por subruta y las copias de planificación y gastos excluyen los archivos adjuntos por defecto. La fusión combina solo las colecciones seleccionadas, compara el linaje de cada registro y plantea los cambios divergentes para que el usuario elija.
