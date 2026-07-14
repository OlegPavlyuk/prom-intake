// The project-owned CodeSystems (ADR-0003, data-model). These are reference/
// config data the app owns: the `Task.code` discriminator, the Flag and
// Assignment lifecycle codes, and the Resolution-reason enum (FR-28). Private to
// the Instrument module; seeded via `seedCodeSystems`.

import type { CodeSystem } from "@medplum/fhirtypes";
import {
  CS_ASSIGNMENT_STATUS,
  CS_FLAG_STATUS,
  CS_RESOLUTION_REASON,
  CS_TASK_CODE,
} from "./urls.js";

function codeSystem(
  url: string,
  name: string,
  title: string,
  concepts: ReadonlyArray<{ code: string; display: string }>
): CodeSystem {
  return {
    resourceType: "CodeSystem",
    url,
    name,
    title,
    status: "active",
    content: "complete",
    caseSensitive: true,
    concept: concepts.map((c) => ({ code: c.code, display: c.display })),
  };
}

export const CODE_SYSTEMS: readonly CodeSystem[] = [
  codeSystem(CS_TASK_CODE, "TaskCode", "Task code (discriminator)", [
    { code: "assignment", display: "Assignment" },
    { code: "flag", display: "Flag" },
  ]),
  codeSystem(CS_FLAG_STATUS, "FlagStatus", "Flag status", [
    { code: "Open", display: "Open" },
    { code: "Acknowledged", display: "Acknowledged" },
    { code: "Resolved", display: "Resolved" },
  ]),
  codeSystem(CS_ASSIGNMENT_STATUS, "AssignmentStatus", "Assignment status", [
    { code: "Pending", display: "Pending" },
    { code: "Completed", display: "Completed" },
    { code: "Expired", display: "Expired" },
  ]),
  codeSystem(CS_RESOLUTION_REASON, "ResolutionReason", "Resolution reason", [
    { code: "contacted-patient", display: "Contacted patient" },
    { code: "follow-up-scheduled", display: "Follow-up scheduled" },
    { code: "referred-to-clinician", display: "Referred to clinician" },
    { code: "escalated", display: "Escalated" },
    { code: "no-action-needed", display: "No action needed" },
    { code: "duplicate-invalid", display: "Duplicate / invalid response" },
    { code: "other", display: "Other (requires note)" },
  ]),
];
