export type VisitDetails = {
  hours: string
  hoursStatus: 'published' | 'variable' | 'public' | 'pending'
  lastEntry?: string
  highlights: string
  duration: string
  practical?: string
  price?: string
  source?: string
  accessSource?: string
}
