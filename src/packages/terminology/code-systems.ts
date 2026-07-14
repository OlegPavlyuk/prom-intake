// The project-owned CodeSystems (ADR-0003, data-model): the `Task.code`
// discriminator, the Flag and Assignment lifecycle codes, and the Resolution-
// reason enum (FR-28). These are project-wide reference data owned here (not by
// any one feature module) and seeded via `seedCodeSystems`. Idempotent upserts
// keyed on canonical url, so re-seeding leaves exactly one copy.

import type { MedplumClient } from "@medplum/core";
import type { CodeSystem } from "@medplum/fhirtypes";
import {
  CS_ASSIGNMENT_STATUS,
  CS_FLAG_STATUS,
  CS_RESOLUTION_REASON,
  CS_TASK_CODE,
  TASK_CODE_ASSIGNMENT,
  TASK_CODE_FLAG,
} from "./systems.js";

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
    { code: TASK_CODE_ASSIGNMENT, display: "Assignment" },
    { code: TASK_CODE_FLAG, display: "Flag" },
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

/** Upsert the four project-owned CodeSystems (idempotent by canonical url). */
export async function seedCodeSystems(medplum: MedplumClient): Promise<void> {
  for (const cs of CODE_SYSTEMS) {
    await medplum.upsertResource(cs, { url: cs.url as string });
  }
}
