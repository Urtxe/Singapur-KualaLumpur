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
  kind: 'must' | 'food' | 'optional' | 'hotel' | 'airport' | 'station' | 'medical';
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
  plan?: 'A' | 'B';
  fixed?: boolean;
  archived?: boolean;
  order?: number;
  category?: string;
  address?: string;
  lat?: number | null;
  lon?: number | null;
  estimatedPrice?: number | null;
  actualPrice?: number | null;
  priceCurrency?: Currency;
  notes?: string;
  booking?: string;
  officialUrl?: string;
  mapsUrl?: string;
  transport?: string;
  journeyMinutes?: number | null;
  access?: string;
  alternate?: string;
};

export type Currency = 'EUR' | 'SGD' | 'MYR';

export type Note = {
  id: string;
  date: string;
  placeId: string;
  text: string;
  rating: number | null;
  memory: string;
  photoId?: string;
  activityId?: string;
};

export type Expense = {
  id: string;
  date: string;
  title: string;
  amount: number;
  currency: Currency;
  category: string;
  amountMinor?: number;
  time?: string;
  city?: 'sg' | 'kl' | 'other';
  payer?: string;
  method?: 'cash' | 'card' | 'other';
  people?: number;
  rate?: number | null;
  eurMinor?: number | null;
  /** Exact EUR amount charged by the bank, when known. */
  bankEurMinor?: number | null;
  activityId?: string;
  receiptId?: string;
  notes?: string;
  phase?: 'prepaid' | 'destination';
};

export type Budget = {
  id: string;
  scope: 'total' | 'destination' | 'city' | 'day' | 'category';
  qualifier: string;
  amountMinor: number;
};

export type CashMovement = {
  id: string;
  date: string;
  time: string;
  currency: 'SGD' | 'MYR';
  kind: 'exchange' | 'withdrawal' | 'refund' | 'adjustment';
  amountMinor: number;
  feeMinor: number;
  feeEurMinor: number | null;
  rate?: number | null;
  eurMinor?: number | null;
  notes: string;
};

export type RecordRevision = {
  revision: string;
  parents: string[];
  createdAt: string;
  updatedAt: string;
  source: string;
  version: number;
  deleted: boolean;
};

export type SyncMeta = { deviceId: string; records: Record<string, RecordRevision> };
export type DayPreference = string[] | { preferences: string[]; active: 'B' };

export type State = {
  version: 2;
  activities: Activity[];
  customPlaces: Place[];
  favorites: string[];
  notes: Note[];
  expenses: Expense[];
  budget: number | null;
  rates: { SGD: number | null; MYR: number | null };
  rateDates?: { SGD: string | null; MYR: string | null };
  checks: string[];
  theme: 'auto' | 'light' | 'dark';
  family: boolean;
  cash: CashMovement[];
  budgets: Budget[];
  trash: Activity[];
  triedDishes: string[];
  dayPreferences: Record<string, DayPreference>;
  meta: SyncMeta;
};
