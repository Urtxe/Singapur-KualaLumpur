import { singaporeVisits } from './visit-details-sg'
import { kualaLumpurVisits } from './visit-details-kl'
import type { VisitDetails } from './visit-details-types'

export { walkingRoutes } from './walking-routes'

export const visitCatalogue: ReadonlyMap<string, VisitDetails> =
  new Map(Object.entries({ ...singaporeVisits, ...kualaLumpurVisits }))
