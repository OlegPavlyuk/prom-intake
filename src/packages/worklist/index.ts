// Entry point (public surface) of the Worklist (Flag) module. It owns the Flag
// `Task` (`code=flag`; ADR-0002/0003) end to end, mapping the domain Flag to and
// from FHIR behind this interface - callers speak Flags, never `Task`s.
//
// This slice (#19) exposes only Flag creation: the Scoring Bot raises a Flag per
// fired Trigger via `raiseFlag` (ADR-0009). Listing / acknowledge / resolve are
// later slices (#20/#21+). Domain types (`Flag`) live in the `domain` package.
export { raiseFlag, type FlagOrigin } from "./lib/service.js";
