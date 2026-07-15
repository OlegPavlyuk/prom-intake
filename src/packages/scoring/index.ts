// Entry point (public surface) of the Scoring engine's server-side adapter
// (ADR-0004/0009). `scoreResponse` scores a submitted Response and persists the
// results idempotently - always the Score Observation (FR-32), a Flag per fired
// Trigger (FR-21/22). The pure scoring kernel (`score`) and its FHIR-free models
// live in the `domain` package; this module is the thin persistence adapter the
// Subscription-fired Bot (`bot.ts`) calls. Callers speak domain outcomes, never
// `Observation`/`Task` shapes.
export {
  scoreResponse,
  UnscorableResponseError,
  type PersistedScore,
  type ScoringOutcome,
} from "./lib/service.js";
