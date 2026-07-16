import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { CS_FLAG_STATUS } from "../../terminology/systems.js";
import type { FlagPriority } from "../../domain/instrument.js";
import type { Flag, FlagStatus } from "../../domain/workflow.js";
// The Worklist service seam, through its public entry point: list the
// organization's unresolved Flags, ordered by delegating to PriorityPolicy.
import { listWorklist, raiseFlag } from "../index.js";

// ADR-0007 + ADR-0008: the Worklist query loads the unresolved Flag `Task`s
// (Open + Acknowledged) and orders them via PriorityPolicy - exercised against a
// REAL Medplum test project, never a mock. Ordering itself is unit-covered by the
// PriorityPolicy seam (#20); this asserts that `list` loads the right Flags,
// excludes Resolved, and returns them in the policy's order. Without credentials
// the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Worklist list: MEDPLUM_* not set. Provision a " +
      "test project first - see docs/architecture/infrastructure.md.\n"
  );
}

describeIntegration(
  "Worklist list: prioritized unresolved Flags (ADR-0007)",
  () => {
    let medplum: MedplumClient;
    let patient: Patient;
    const createdFlagIds: string[] = [];

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Worklist"], family: "List-Test" }],
      });
    });

    afterAll(async () => {
      if (!medplum) return;
      for (const id of createdFlagIds) {
        await medplum.deleteResource("Task", id).catch(() => {});
      }
      await medplum.deleteResource("Patient", patient.id!).catch(() => {});
    });

    /**
     * Raise an Open Flag for the test patient with a distinct (Response, Trigger)
     * origin so no two fixtures collide on the idempotency key, then optionally
     * transition it to Acknowledged/Resolved. Returns the persisted Flag id.
     */
    async function fixtureFlag(opts: {
      priority: FlagPriority;
      createdAt: string;
      origin: string;
      state?: FlagStatus;
    }): Promise<string> {
      const flag = await raiseFlag(
        medplum,
        {
          patientId: patient.id!,
          status: "Open",
          priority: opts.priority,
          triggerCodes: [`trigger-${opts.origin}`],
          createdAt: opts.createdAt,
        },
        { responseId: `response-${opts.origin}` }
      );
      createdFlagIds.push(flag.id);
      if (opts.state && opts.state !== "Open") {
        const task = await medplum.readResource("Task", flag.id);
        await medplum.updateResource({
          ...task,
          status: opts.state === "Resolved" ? "completed" : "in-progress",
          businessStatus: {
            coding: [{ system: CS_FLAG_STATUS, code: opts.state }],
          },
        });
      }
      return flag.id;
    }

    /** Keep only the fixture Flags (the project may hold others) in list order. */
    function mine(flags: Flag[], ids: string[]): string[] {
      const wanted = new Set(ids);
      return flags.filter((f) => wanted.has(f.id)).map((f) => f.id);
    }

    it("returns Open + Acknowledged unresolved Flags in PriorityPolicy order, excluding Resolved", async () => {
      // Across tiers and states: acute-risk outranks lower tiers regardless of
      // state (FR-25); within a tier Open ranks before Acknowledged (FR-26); the
      // Resolved Flag is off the active Worklist (ADR-0007).
      const acuteOpen = await fixtureFlag({
        priority: "acute-risk",
        createdAt: "2026-07-15T10:00:00.000Z",
        origin: "acute-open",
      });
      const acuteAck = await fixtureFlag({
        priority: "acute-risk",
        createdAt: "2026-07-15T08:00:00.000Z", // older, yet ranks below acuteOpen
        origin: "acute-ack",
        state: "Acknowledged",
      });
      const urgentOpen = await fixtureFlag({
        priority: "urgent",
        createdAt: "2026-07-15T09:00:00.000Z",
        origin: "urgent-open",
      });
      const routineOpen = await fixtureFlag({
        priority: "routine",
        createdAt: "2026-07-15T07:00:00.000Z",
        origin: "routine-open",
      });
      const urgentResolved = await fixtureFlag({
        priority: "urgent",
        createdAt: "2026-07-15T06:00:00.000Z",
        origin: "urgent-resolved",
        state: "Resolved",
      });

      const flags = await listWorklist(medplum);

      const ordered = mine(flags, [
        acuteOpen,
        acuteAck,
        urgentOpen,
        routineOpen,
        urgentResolved,
      ]);
      // Acute-risk first (Open before Acknowledged), then urgent, then routine.
      expect(ordered).toEqual([acuteOpen, acuteAck, urgentOpen, routineOpen]);
      // The Resolved Flag is excluded from the active Worklist.
      expect(ordered).not.toContain(urgentResolved);

      // The returned Flags carry their domain lifecycle state, not FHIR shapes.
      const byId = new Map(flags.map((f) => [f.id, f]));
      expect(byId.get(acuteOpen)!.status).toBe("Open");
      expect(byId.get(acuteAck)!.status).toBe("Acknowledged");
      expect(byId.get(acuteOpen)!.priority).toBe("acute-risk");
    });
  }
);
