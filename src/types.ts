export type Day = {
  date: string;
  city: 'sg' | 'kl' | 'air';
  title: string;
  subtitle: string;
  hotelId?: string;
};

export type Place = {
  id: string;
  name: string;
  city: 'sg' | 'kl';
  area: string;
  kind: 'must' | 'food' | 'optional' | 'hotel' | 'airport';
  address: string;
  lat: number | null;
  lon: number | null;
  description: string;
  photo: string;
  access: string;
  shade: string;
  price: string;
  source?: string;
};

export type Activity = {
  id: string;
  date: string;
  title: string;
  time: string;
  duration: number;
  placeId: string;
  zone: string;
  effort: 'bajo' | 'medio' | 'alto';
  priority: 'principal' | 'opcional' | 'pausa';
  status: 'pending' | 'done' | 'skipped';
  food: string;
  tickets: string;
  rain: string;
  detail: string;
  fromHotel: string;
  fromPrevious: string;
  flight?: 'confirmed' | 'provisional';
  localTime?: string;
  custom?: boolean;
};

export type Currency = 'EUR' | 'SGD' | 'MYR';

export type Note = {
  id: string;
  date: string;
  placeId: string;
  text: string;
  rating: number | null;
  memory: string;
};

export type Expense = {
  id: string;
  date: string;
  title: string;
  amount: number;
  currency: Currency;
  category: string;
};

export type State = {
  version: 1;
  activities: Activity[];
  customPlaces: Place[];
  favorites: string[];
  notes: Note[];
  expenses: Expense[];
  budget: number | null;
  rates: { SGD: number | null; MYR: number | null };
  checks: string[];
  theme: 'auto' | 'light' | 'dark';
  family: boolean;
};
