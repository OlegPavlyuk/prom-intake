// Entry point (public surface) of the Worklist (Flag) module. It owns the Flag
// `Task` (`code=flag`; ADR-0002/0003) end to end, mapping the domain Flag to and
// from FHIR behind this interface - callers speak Flags, never `Task`s.
//
// - `raiseFlag` (#19): the Scoring Bot raises a Response's Flag - one carrying
//   every fired Trigger's reason (ADR-0009/0011).
// - `listWorklist` (#21): the shared, prioritized Worklist of unresolved Flags
//   (Open + Acknowledged), ordered by delegating to `PriorityPolicy` (ADR-0007).
// - `getFlag` (#21): read one Flag with its Response/Score origin, for the Flag
//   detail's FR-29 clinical signal.
// - `acknowledge` (#22): a coordinator claims an Open Flag single-owner under
//   optimistic concurrency (`If-Match`); the loser gets a domain
//   `already-claimed` outcome, never a raw `412` (ADR-0006).
// - `resolve` (#23): a coordinator resolves a Flag with a structured reason
//   (+ optional note), the terminal transition that drops it from the active
//   Worklist while retaining history (FR-27/28/30). Reuses the same
//   optimistic-concurrency pattern; a later resolve gets `already-resolved`.
//
// Domain types (`Flag`, `Resolution`) live in the `domain` package.
export {
  raiseFlag,
  listWorklist,
  getFlag,
  acknowledge,
  resolve,
  NotAFlagError,
  ResolutionNoteRequiredError,
  type FlagOrigin,
  type FlagRecord,
  type AcknowledgeOutcome,
  type ResolveOutcome,
} from "./lib/service.js";
