// Entry point (public surface) of the Assignment module: create, transition, and
// query Assignments. An Assignment is a Care Coordinator giving an Instrument to
// a patient to complete (CONTEXT.md); it is persisted as a FHIR `Task`
// (`code=assignment`) whose lifecycle Pending/Completed/Expired lives in
// `businessStatus` shadowing `status` (ADR-0001, ADR-0003). All of that FHIR
// mapping is hidden here - callers speak Assignments, never `Task`
// (module-boundaries). Only this module reads or writes the assignment `Task`.
//
// The `Assignment` domain type lives in the `domain` package and is imported
// from there directly.
export {
  createAssignment,
  completeAssignment,
  expireAssignment,
  getAssignment,
  findAssignmentsByPatient,
  ASSIGNMENT_TTL_DAYS,
  AssignmentNotFoundError,
  IllegalAssignmentTransitionError,
} from "./lib/service.js";
export type { NewAssignment } from "./lib/service.js";
