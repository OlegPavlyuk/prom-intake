// Entry point (public surface) of the Worklist (Flag) module. It owns the Flag
// `Task` (`code=flag`; ADR-0002/0003) end to end, mapping the domain Flag to and
// from FHIR behind this interface - callers speak Flags, never `Task`s.
//
// - `raiseFlag` (#19): the Scoring Bot raises a Flag per fired Trigger (ADR-0009).
// - `listWorklist` (#21): the shared, prioritized Worklist of unresolved Flags
//   (Open + Acknowledged), ordered by delegating to `PriorityPolicy` (ADR-0007).
// - `getFlag` (#21): read one Flag with its Response/Score origin, for the Flag
//   detail's FR-29 clinical signal.
// - `acknowledge` (#22): a coordinator claims an Open Flag single-owner under
//   optimistic concurrency (`If-Match`); the loser gets a domain
//   `already-claimed` outcome, never a raw `412` (ADR-0006).
//
// Resolve is a later slice (#23). Domain types (`Flag`) live in the `domain`
// package.
export {
  raiseFlag,
  listWorklist,
  getFlag,
  acknowledge,
  NotAFlagError,
  type FlagOrigin,
  type FlagRecord,
  type AcknowledgeOutcome,
} from "./lib/service.js";
