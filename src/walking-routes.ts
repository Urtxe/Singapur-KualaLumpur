/**
 * Short, useful pedestrian legs for the fixed family itinerary. Mapped values
 * are routed on the public OSM pedestrian network; coordinates are snapped by
 * the router to its nearest routable point, so the precise doorway can vary.
 * Checked 27 Nov 2026. Singapore race-day barriers still need a final check.
 */
export type WalkLeg = {
  toActivity: string
  from: string
  to: string
  metres?: number
  minutes?: [number, number]
  basis: 'operator' | 'mapped' | 'pending'
  optional?: boolean
  detail: string
  source: string
  relatedSources?: string[]
}

const footRoute = (from: string, to: string) =>
  `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${from};${to}?overview=false`

const klccWalkway = 'https://www.klccconventioncentre.com/visitors/getting-to-the-centre-and-car-parking'
const marathon = 'https://singaporeinternationalmarathon.com/trafficadvisory/'
const gardensAccess = 'https://www.gardensbythebay.com.sg/en/plan-your-visit/getting-here.html'

export const walkingRoutes: Record<string, WalkLeg[]> = {
  '2026-12-05': [
    {
      toActivity: 'helix-mbs',
      from: 'Merlion Park, paseo',
      to: 'Helix Bridge, lado Marina Bay Sands',
      metres: 1300,
      minutes: [15, 20],
      basis: 'mapped',
      detail: 'Ruta por la promenade peatonal de Marina Bay; unos 1,3 km. Incluye cruzar Helix Bridge (su tramo tiene unos 280 m, ya incluido en esta distancia). Desvíos y barreras del maratón del 5 dic no comprobados; seguir los carteles del evento.',
      source: footRoute('103.8545,1.2868', '103.8607,1.2873'),
      relatedSources: ['https://www.coxarchitecture.com.au/project/the-helix-bridge/', marathon],
    },
    {
      toActivity: 'gardens-bay',
      from: 'Helix Bridge, lado Marina Bay Sands',
      to: 'Cloud Forest, entrada',
      metres: 700,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Paseo peatonal hacia Gardens by the Bay y la entrada de Cloud Forest; la entrada exacta y los desvíos de maratón pueden cambiar el recorrido.',
      source: footRoute('103.8607,1.2873', '103.8640,1.2840'),
      relatedSources: [gardensAccess, marathon],
    },
    {
      toActivity: 'gardens-bay',
      from: 'Cloud Forest, entrada',
      to: 'Flower Dome, entrada',
      metres: 250,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Conexión exterior corta dentro del recinto; validar el paso habilitado ese día, ya que el recinto puede modificar accesos por el maratón y Christmas Wonderland.',
      source: footRoute('103.8640,1.2840', '103.8650,1.2854'),
      relatedSources: [gardensAccess],
    },
    {
      toActivity: 'rhapsody',
      from: 'Flower Dome, entrada',
      to: 'Supertree Grove, zona de espectáculo',
      metres: 475,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Paseo por caminos del jardín hasta el Grove. El 5 dic está previsto Christmas Wonderland: para entrar al Grove hace falta entrada del evento; verificar acceso y colas en Gate 3. El trazado de carrera puede ocasionar desvíos.',
      optional: true,
      source: footRoute('103.8650,1.2854', '103.8648,1.2816'),
      relatedSources: ['https://www.gardensbythebay.com.sg/en/frequently-asked-questions/faq-christmas-wonderland-2026.html', marathon],
    },
  ],
  '2026-12-06': [
    {
      toActivity: 'little-india-morning',
      from: 'Hotel Mi Rochor, entrada',
      to: 'Tekka Centre, acceso',
      metres: 600,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Paseo urbano corto desde el hotel hasta el mercado; la ruta se calcula entre las coordenadas de ambos lugares, no desde una habitación o salida interior.',
      source: footRoute('103.8518,1.3031', '103.8504,1.3066'),
    },
    {
      toActivity: 'kampong-glam',
      from: 'Tekka Centre, acceso',
      to: 'Sultan Mosque, Gate 5',
      metres: 1400,
      minutes: [20, 25],
      basis: 'mapped',
      detail: 'Ruta peatonal hacia Kampong Glam. La mezquita identifica Gate 5, frente a Bussorah Street; el tramo exterior puede ser caluroso y sin sombra continua.',
      source: footRoute('103.8504,1.3066', '103.8597,1.3034'),
      relatedSources: ['https://www.sultanmosque.sg/visitors-info/'],
    },
    {
      toActivity: 'kampong-glam',
      from: 'Sultan Mosque, Gate 5',
      to: 'Haji Lane, tramo central',
      metres: 250,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Breve paseo por la zona peatonal de Kampong Glam; caminar por aceras y cruces señalizados, especialmente con niñas.',
      source: footRoute('103.8597,1.3034', '103.8598,1.3019'),
    },
    {
      toActivity: 'chinatown-temple',
      from: 'Maxwell Food Centre, acceso',
      to: 'Buddha Tooth Relic Temple, entrada',
      metres: 225,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Paseo llano y muy corto dentro de Chinatown. Este tramo empieza después del traslado desde Kampong Glam; ese traslado no es a pie.',
      source: footRoute('103.8448,1.2804', '103.8442,1.2815'),
      relatedSources: ['https://www.visitsingapore.com/neighbourhood/featured-neighbourhood/chinatown/buddha-tooth-relic-temple/'],
    },
  ],
  '2026-12-07': [
    {
      toActivity: 'jewel-buffer',
      from: 'Changi T2 o T3, enlace peatonal',
      to: 'Jewel, nivel 2',
      minutes: [5, 10],
      basis: 'operator',
      optional: true,
      detail: 'Por sentido y solo si salís de T2 o T3. T1 conecta por llegadas L1; para T4 hace falta shuttle. La terminal y el margen para facturar dependen del billete.',
      source: 'https://www.jewelchangiairport.com/en/getting-to-jewel.html',
    },
  ],
  '2026-12-08': [
    {
      toActivity: 'petronas-visit',
      from: 'Star Residences, pin aproximado de Jalan Yap Kwan Seng',
      to: 'Torres Petronas, acceso principal',
      metres: 475,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Ruta desde el pin aproximado del complejo. La torre, lobby, unidad y puerta de acceso de la reserva siguen sin confirmar; medir de nuevo desde el lobby real.',
      source: footRoute('101.7133,3.1597', '101.7116,3.1579'),
    },
    {
      toActivity: 'klcc-park',
      from: 'Torres Petronas, acceso principal',
      to: 'KLCC Park, paseo junto al lago',
      metres: 300,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Caminata corta desde las torres al paseo del parque; usar los cruces y pasos peatonales señalizados.',
      source: footRoute('101.7116,3.1579', '101.7123,3.1558'),
    },
    {
      toActivity: 'covered-walk',
      from: 'KLCC Park, paseo junto al lago',
      to: 'KLCC Convention Centre, entrada principal',
      metres: 375,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Acceso al extremo KLCC del corredor desde el parque. Esta conexión termina en el Convention Centre; no está incluida en los 1.700 m oficiales del tramo KLCC–Bukit Bintang.',
      optional: true,
      source: footRoute('101.7123,3.1558', '101.7130,3.1546'),
      relatedSources: [klccWalkway],
    },
    {
      toActivity: 'covered-walk',
      from: 'KLCC Convention Centre, entrada principal',
      to: 'Bukit Bintang / Pavilion KL',
      metres: 1700,
      minutes: [25, 35],
      basis: 'operator',
      detail: 'Longitud oficial publicada para el corredor peatonal KLCC–Bukit Bintang. Cubierto y climatizado; el dato es el trayecto completo desde el Convention Centre y no incluye Star Residence → Centre. Como el lobby del alojamiento no está confirmado, resolver por señalización desde el parque y no sumar recorridos parciales del mismo corredor.',
      source: klccWalkway,
    },
    {
      toActivity: 'jalan-alor-dinner',
      from: 'Pavilion KL, acceso principal',
      to: 'Jalan Alor, acceso norte',
      metres: 925,
      minutes: [15, 20],
      basis: 'mapped',
      detail: 'Paseo urbano hacia la zona de restaurantes; aceras concurridas y cruces, con menos protección frente a lluvia y calor que el tramo del walkway.',
      source: footRoute('101.7134,3.1491', '101.7098,3.1457'),
    },
  ],
  '2026-12-09': [
    {
      toActivity: 'batu-caves',
      from: 'Batu Caves KTM / acceso de plaza',
      to: 'Base de la escalinata del templo',
      metres: 500,
      minutes: [10, 15],
      basis: 'mapped',
      optional: true,
      detail: 'Desde el acceso de estación/plaza por el recinto exterior hasta la base de la escalinata. Monos, calor y suelo concurrido: mantener comida guardada y supervisar a las niñas.',
      source: footRoute('101.6810,3.2378', '101.6840,3.2379'),
    },
    {
      toActivity: 'batu-caves',
      from: 'Base de la escalinata',
      to: 'Templo de la cueva principal',
      basis: 'pending',
      optional: true,
      detail: 'Subida de 272 escalones; no se asigna distancia ni minutos porque la longitud y el tiempo dependen del paso y las paradas. No es accesible en silla ni adecuada para todas las personas: la abuela puede esperar en la explanada.',
      source: 'https://www.malaysia.travel/explore/top-places-to-visit-in-kuala-lumpur',
    },
    {
      toActivity: 'brickfields-lunch',
      from: 'Thean Hou Temple, puerta principal',
      to: 'Brickfields, acceso al barrio Little India',
      metres: 1650,
      minutes: [25, 35],
      basis: 'mapped',
      optional: true,
      detail: 'Ruta peatonal trazada entre los puntos del templo y Brickfields; es más larga y puede incluir pendientes y cruces, así que para la familia puede ser más cómodo reservar Grab. El punto de llegada es una referencia del barrio, no el restaurante del almuerzo.',
      source: footRoute('101.6860,3.1188', '101.6846,3.1289'),
    },
  ],
  '2026-12-10': [
    {
      toActivity: 'masjid-jamek-stop',
      from: 'Merdeka Square, borde sur junto a Jalan Raja',
      to: 'Masjid Jamek, acceso',
      metres: 500,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Cruzar por pasos peatonales hacia la mezquita; rutas junto a calles y ríos pueden tener obras o accesos temporales.',
      source: footRoute('101.6939,3.1479', '101.6957,3.1489'),
    },
    {
      toActivity: 'river-life',
      from: 'Masjid Jamek, acceso',
      to: 'River of Life, mirador junto a la confluencia',
      metres: 475,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Paseo por los caminos peatonales junto al río hasta el mirador. El punto de vista exacto depende del acceso abierto en el momento.',
      source: footRoute('101.6957,3.1489', '101.6952,3.1472'),
    },
    {
      toActivity: 'central-market',
      from: 'River of Life, mirador',
      to: 'Central Market, entrada principal',
      metres: 200,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Conexión corta por acera; evitar cruzar fuera de los pasos señalizados.',
      source: footRoute('101.6952,3.1472', '101.6953,3.1457'),
    },
    {
      toActivity: 'petaling-chinatown',
      from: 'Central Market, entrada principal',
      to: 'Petaling Street, tramo norte',
      metres: 450,
      minutes: [10, 15],
      basis: 'mapped',
      detail: 'Paseo urbano por calles de Chinatown; tramos concurridos, con toldos y pavimento irregular.',
      source: footRoute('101.6953,3.1457', '101.6975,3.1438'),
    },
    {
      toActivity: 'kwai-chai-hong',
      from: 'Petaling Street, extremo sur',
      to: 'Kwai Chai Hong, entrada',
      metres: 325,
      minutes: [5, 10],
      basis: 'mapped',
      detail: 'Paseo corto por Chinatown. Punto final en la entrada del callejón; sumar la visita interior aparte, no como distancia de traslado.',
      source: footRoute('101.6975,3.1438', '101.6977,3.1416'),
    },
  ],
}
