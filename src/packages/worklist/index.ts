// Entry point (public surface) of the Worklist (Flag) module. It owns the Flag
// `Task` (`code=flag`; ADR-0002/0003) end to end, mapping the domain Flag to and
// from FHIR behind this interface - callers speak Flags, never `Task`s.
//
// - `raiseFlag` (#19): the Scoring Bot raises a Flag per fired Trigger (ADR-0009).
// - `listWorklist` (#21): the shared, prioritized Worklist of unresolved Flags
//   (Open + Acknowledged), ordered by delegating to `PriorityPolicy` (ADR-0007).
// - `getFlag` (#21): read one Flag with its Response/Score origin, for the Flag
//   detail's FR-29 clinical signal.
//
// Acknowledge and resolve are later slices (#22/#23). Domain types (`Flag`) live
// in the `domain` package.
export {
  raiseFlag,
  listWorklist,
  getFlag,
  NotAFlagError,
  type FlagOrigin,
  type FlagRecord,
} from "./lib/service.js";
