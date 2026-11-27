import type { Place, State } from './types';

export interface AppContext {
  getState(): State;
  commit(next: State, message?: string): boolean;
  applyImported(next: State, message?: string): boolean;
  render(): void;
  notify(message: string): void;
  openDialog(title: string, html: string, opener?: HTMLElement): HTMLDialogElement;
  navigate(route: string): void;
  directions(placeId: string, activityId?: string): void;
  places(): Place[];
  selectedDate(): string;
  setSelectedDate(date: string): void;
  todayPreview(): string | undefined;
  setTodayPreview(date?: string): void;
  quickSpend(activityId?: string): void;
  quickNote(activityId?: string): void;
}
