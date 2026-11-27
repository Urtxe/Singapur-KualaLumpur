export type FoodStop = {
  city: 'sg' | 'kl'
  name: string
  address: string
  hours: string
  order: string
  price: string
  source: string
}

export const foodStops: FoodStop[] = [
  {
    city: 'sg', name: 'Tian Tian Hainanese Chicken Rice', address: 'Maxwell Food Centre, #01-10/11, 1 Kadayanallur Street',
    hours: 'Mar–dom 08:30–20:00 según Michelin. Lunes cerrado. Puede agotarse antes.',
    order: 'Pollo y arroz para compartir. Pedid el chile aparte y llevad efectivo. El domingo 6 encaja con la parada en Chinatown.',
    price: 'Michelin lo clasifica como económico. Importe según ración en el mostrador.',
    source: 'https://guide.michelin.com/sg/en/singapore-region/singapore/restaurant/tian-tian-hainanese-chicken-rice',
  },
  {
    city: 'sg', name: 'Satay Street · Lau Pa Sat', address: 'Boon Tat Street, junto a 18 Raffles Quay',
    hours: 'Lun–vie 19:00–03:00. Para fin de semana, la tabla del recinto indica 15:00–03:00 y su descripción recomienda desde las 19:00.',
    order: 'Brochetas de pollo o cordero con ketupat (arroz prensado). Confirmad el mínimo por pedido y pedid la salsa de cacahuete aparte.',
    price: 'Cada parrilla fija sus precios por unidad o lote.',
    source: 'https://www.laupasat.sg/sataystreet/',
  },
  {
    city: 'sg', name: 'Tekka Centre · zona de comida', address: 'Planta baja, 665 Buffalo Road',
    hours: '06:30–21:00 según la guía de turismo. Cada puesto tiene su horario.',
    order: 'Roti prata simple con curry aparte o biryani para compartir el domingo 6. Los puestos y el mercado ocupan zonas distintas.',
    price: 'Mirad el precio por ración en la pizarra de cada puesto.',
    source: 'https://www.visitsingapore.com/content/dam/desktop/global/about-singapore/traveller-information/guides/mv_main_en.pdf',
  },
  {
    city: 'sg', name: 'Toast Box · Jewel Changi', address: 'Jewel Changi Airport, #B2-231',
    hours: '08:00–22:00 a diario.',
    order: 'Tostadas de kaya y un kopi. Parada antes de facturar el lunes 7 si lo permite el vuelo y sobra tiempo tras la cascada.',
    price: 'Consultar el menú de la sucursal para los combos con bebida.',
    source: 'https://www.jewelchangiairport.com/en/dine/toast-box---thye-moh-chan.html',
  },
  {
    city: 'kl', name: 'Vishal Food & Catering', address: '22 Jalan Scott, Brickfields, frente al templo Sree Veera Hanuman',
    hours: '07:00–22:30 a diario según el restaurante.',
    order: 'En la parada de Brickfields del miércoles 9, probad el arroz en hoja de plátano con verduras. Pedid sambar y curris aparte si queréis controlar el picante.',
    price: 'Confirmad el precio del plato base y el suplemento por carne antes de pedir.',
    source: 'https://www.vishalfood.com/',
  },
  {
    city: 'kl', name: 'Chinatown Cendol · Central Market', address: 'Local SK-45, planta baja de Central Market',
    hours: 'Central Market abre 10:00–22:00. El directorio oficial no especifica el horario del puesto.',
    order: 'Compartid un cendol original de hielo, coco y azúcar de palma. Buen descanso corto el jueves 10.',
    price: 'Mirad el precio del bol en el puesto. El durián se ofrece en versiones aparte.',
    source: 'https://centralmarket.com.my/store-category/food-and-beverages/chinatown-cendol-shop/',
  },
  {
    city: 'kl', name: 'Precious Old China · Central Market', address: 'Local M-02, entreplanta de Central Market',
    hours: '11:00–22:00. Último pedido de cocina a las 21:00.',
    order: 'Alternativa sentados para probar cocina peranakan. Pedid arroz y un plato para compartir, y preguntad por el picante de las salsas.',
    price: 'Carta a consultar. Verificad precio y suplementos antes de sentaros.',
    source: 'https://www.oldchina.com.my/precious.html',
  },
]
