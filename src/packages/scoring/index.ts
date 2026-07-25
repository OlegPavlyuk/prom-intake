// Entry point (public surface) of the Scoring engine's server-side adapter
// (ADR-0004/0009). `scoreResponse` scores a submitted Response and persists the
// results idempotently - always the Score Observation (FR-32), a Flag per fired
// Trigger (FR-21/22). The pure scoring kernel (`score`) and its FHIR-free models
// live in the `domain` package; this module is the thin persistence adapter the
// Subscription-fired Bot (`bot.ts`) calls. Callers speak domain outcomes, never
// `Observation`/`Task` shapes.
// `scoreResponse` is the write side (Subscription-fired Bot). `getResponse` and
// `getScore` are the read side the coordinator Flag detail composes from (#21):
// the module owns turning a persisted Response/Score into domain facts, so those
// resources are read through here, never inline (module-boundaries).
export {
  scoreResponse,
  getResponse,
  getScore,
  findResponsesByPatient,
  UnscorableResponseError,
  type PersistedScore,
  type ScoringOutcome,
  type SubmittedResponse,
} from "./lib/service.js";
