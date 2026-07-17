import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReference, type MedplumClient } from "@medplum/core";
import type { Patient, Practitioner } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { CS_RESOLUTION_REASON } from "../../terminology/systems.js";
// The Worklist service resolve seam, through its public entry point: a
// coordinator resolves a Flag with a structured reason (+ optional note), which
// drops it from the active Worklist while retaining history. Outcomes are domain
// results, never a raw `412` or a `Task` shape (ADR-0006).
import {
  acknowledge,
  getFlag,
  listWorklist,
  raiseFlag,
  ResolutionNoteRequiredError,
  resolve,
} from "../index.js";

// ADR-0003 + ADR-0006 + ADR-0008: resolve is the Flag's terminal single-writer
// transition, exercised against a REAL Medplum test project (never a mock). It
// reuses the same optimistic-concurrency pattern as acknowledge. Assertions are
// domain outcomes (the Resolved Flag with its reason/note, dropped from
// `listWorklist`), not HTTP codes or `Task` shapes - except the audit assertions
// (Provenance, retained history), which have no domain read-back seam and so are
// checked directly (NFR-6, FR-30). Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Worklist resolve: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

describeIntegration(
  "Worklist resolve: structured resolution drops the Flag from the active Worklist (ADR-0003/0006)",
  () => {
    let medplum: MedplumClient;
    let coordinator: Practitioner;
    let patient: Patient;
    const createdFlagIds: string[] = [];

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      coordinator = await medplum.createResource<Practitioner>({
        resourceType: "Practitioner",
        name: [{ given: ["Coordinator"], family: "Resolver" }],
      });
      patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Resolve"], family: "Flag-Test" }],
      });
    });

    afterAll(async () => {
      if (!medplum) return;
      for (const id of createdFlagIds) {
        await medplum.deleteResource("Task", id).catch(() => {});
      }
      await medplum
        .deleteResource("Practitioner", coordinator.id!)
        .catch(() => {});
      await medplum.deleteResource("Patient", patient.id!).catch(() => {});
    });

    /** Raise a fresh Open Flag for the test patient with a distinct origin. */
    async function openFlag(origin: string): Promise<string> {
      const flag = await raiseFlag(
        medplum,
        {
          patientId: patient.id!,
          status: "Open",
          priority: "urgent",
          triggerCodes: [`trigger-${origin}`],
          createdAt: "2026-07-16T10:00:00.000Z",
        },
        { responseId: `response-${origin}` }
      );
      createdFlagIds.push(flag.id);
      return flag.id;
    }

    it("resolves an Acknowledged Flag with a reason + note, drops it from the Worklist, and retains history", async () => {
      const flagId = await openFlag("resolve-happy");
      const ref = createReference(coordinator).reference!;

      // A coordinator claims then resolves the Flag (the common path).
      const ack = await acknowledge(medplum, flagId, ref);
      expect(ack.outcome).toBe("acknowledged");

      const now = new Date("2026-07-16T12:00:00.000Z");
      const result = await resolve(
        medplum,
        flagId,
        { reason: "contacted-patient", note: "Reached the patient by phone." },
        ref,
        { now }
      );

      // The domain outcome carries the now-Resolved Flag with its structured
      // resolution and the resolve timestamp (executionPeriod.end -> resolvedAt).
      expect(result.outcome).toBe("resolved");
      if (result.outcome !== "resolved") throw new Error("unreachable");
      expect(result.flag.status).toBe("Resolved");
      expect(result.flag.resolution?.reason).toBe("contacted-patient");
      expect(result.flag.resolution?.note).toBe(
        "Reached the patient by phone."
      );
      expect(result.flag.resolvedAt).toBe(now.toISOString());

      // The Resolved Flag is off the active Worklist (status=completed excluded).
      const worklist = await listWorklist(medplum);
      expect(worklist.map((f) => f.id)).not.toContain(flagId);

      // History is retained: the Flag is still readable through the domain seam
      // (no hard delete), and reads back its resolution (FR-30, NFR-6).
      const { flag: persisted } = await getFlag(medplum, flagId);
      expect(persisted.status).toBe("Resolved");
      expect(persisted.resolution?.reason).toBe("contacted-patient");
      expect(persisted.resolution?.note).toBe("Reached the patient by phone.");
      expect(persisted.resolvedAt).toBe(now.toISOString());

      // NFR-6 audit: the resolve wrote a Provenance recording the actor + the
      // resolution reason (no domain read-back seam exists, so checked directly).
      const provenances = await medplum.searchResources("Provenance", {
        target: `Task/${flagId}`,
      });
      const resolveProv = provenances.find((p) =>
        (p.reason ?? []).some((r) =>
          (r.coding ?? []).some(
            (c) =>
              c.system === CS_RESOLUTION_REASON &&
              c.code === "contacted-patient"
          )
        )
      );
      expect(resolveProv).toBeDefined();
      const agents = (resolveProv!.agent ?? []).map((a) => a.who?.reference);
      expect(agents).toContain(`Practitioner/${coordinator.id}`);
    });

    it("resolves an Open Flag directly (acknowledge is not required first)", async () => {
      const flagId = await openFlag("resolve-open");
      const ref = createReference(coordinator).reference!;

      const result = await resolve(
        medplum,
        flagId,
        { reason: "no-action-needed" },
        ref
      );

      expect(result.outcome).toBe("resolved");
      if (result.outcome !== "resolved") throw new Error("unreachable");
      expect(result.flag.status).toBe("Resolved");
      expect(result.flag.resolution?.reason).toBe("no-action-needed");
      expect(result.flag.resolution?.note).toBeUndefined();

      expect((await listWorklist(medplum)).map((f) => f.id)).not.toContain(
        flagId
      );
    });

    it("requires a note when the reason is 'other' (FR-28)", async () => {
      const flagId = await openFlag("resolve-other");
      const ref = createReference(coordinator).reference!;

      // "Other" without a note is refused before any write.
      await expect(
        resolve(medplum, flagId, { reason: "other" }, ref)
      ).rejects.toBeInstanceOf(ResolutionNoteRequiredError);

      // The Flag is untouched: still on the active Worklist, still Open.
      expect((await getFlag(medplum, flagId)).flag.status).toBe("Open");
      expect((await listWorklist(medplum)).map((f) => f.id)).toContain(flagId);

      // With a note, "other" resolves.
      const ok = await resolve(
        medplum,
        flagId,
        { reason: "other", note: "Patient already seen in clinic today." },
        ref
      );
      expect(ok.outcome).toBe("resolved");
    });

    it("tells a second resolver the Flag is already resolved, without a double write", async () => {
      const flagId = await openFlag("resolve-twice");
      const ref = createReference(coordinator).reference!;

      const first = await resolve(
        medplum,
        flagId,
        { reason: "follow-up-scheduled" },
        ref
      );
      expect(first.outcome).toBe("resolved");

      // A later resolve on an already-Resolved Flag is refused and reports the
      // existing resolution - the first reason stands, not the second.
      const second = await resolve(
        medplum,
        flagId,
        { reason: "duplicate-invalid" },
        ref
      );
      expect(second.outcome).toBe("already-resolved");
      if (second.outcome !== "already-resolved") throw new Error("unreachable");
      expect(second.flag.resolution?.reason).toBe("follow-up-scheduled");
    });
  }
);
