import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReference, type MedplumClient } from "@medplum/core";
import type { Patient, Practitioner } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
// The Worklist service acknowledge seam, through its public entry point: a
// coordinator claims an Open Flag under optimistic concurrency (`If-Match`), and
// the outcome is a domain result - never a raw `412` or a `Task` shape.
import { acknowledge, getFlag, raiseFlag } from "../index.js";

// ADR-0006 + ADR-0008: single-owner Acknowledge is exercised against a REAL
// Medplum test project (never a mock) so the concurrent-claim race runs against
// the server's actual version/`If-Match` guard. Assertions are domain outcomes
// (`acknowledged` / `already-claimed` with the current owner), not HTTP codes or
// `Task`/`Provenance` shapes - except the audit assertion, which has no domain
// read-back seam and so is checked directly (NFR-6). Without credentials the
// suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Worklist acknowledge: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

describeIntegration(
  "Worklist acknowledge: single-owner claim under optimistic concurrency (ADR-0006)",
  () => {
    let medplum: MedplumClient;
    let coordinatorA: Practitioner;
    let coordinatorB: Practitioner;
    let patient: Patient;
    const createdFlagIds: string[] = [];

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      coordinatorA = await medplum.createResource<Practitioner>({
        resourceType: "Practitioner",
        name: [{ given: ["Coordinator"], family: "Ada" }],
      });
      coordinatorB = await medplum.createResource<Practitioner>({
        resourceType: "Practitioner",
        name: [{ given: ["Coordinator"], family: "Grace" }],
      });
      patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Acknowledge"], family: "Race-Test" }],
      });
    });

    afterAll(async () => {
      if (!medplum) return;
      for (const id of createdFlagIds) {
        await medplum.deleteResource("Task", id).catch(() => {});
      }
      await medplum
        .deleteResource("Practitioner", coordinatorA.id!)
        .catch(() => {});
      await medplum
        .deleteResource("Practitioner", coordinatorB.id!)
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
          priority: "acute-risk",
          triggerCodes: [`trigger-${origin}`],
          createdAt: "2026-07-15T10:00:00.000Z",
        },
        { responseId: `response-${origin}` }
      );
      createdFlagIds.push(flag.id);
      return flag.id;
    }

    it("gives exactly one owner when two coordinators race, and tells the loser who claimed it", async () => {
      const flagId = await openFlag("race");
      const refA = createReference(coordinatorA).reference!;
      const refB = createReference(coordinatorB).reference!;

      // Two coordinators claim the same Open Flag concurrently. Both read the
      // same version, both write with `If-Match`: exactly one wins, the other's
      // `412` is translated to `already-claimed` (ADR-0006).
      const [outA, outB] = await Promise.all([
        acknowledge(medplum, flagId, refA),
        acknowledge(medplum, flagId, refB),
      ]);

      const outcomes = [outA.outcome, outB.outcome].sort();
      expect(outcomes).toEqual(["acknowledged", "already-claimed"]);

      const winner = outA.outcome === "acknowledged" ? outA : outB;
      const loser = outA.outcome === "acknowledged" ? outB : outA;
      if (
        winner.outcome !== "acknowledged" ||
        loser.outcome !== "already-claimed"
      ) {
        throw new Error("unreachable");
      }

      // The winner owns the Flag, which is now Acknowledged and carries the
      // claim timestamp (executionPeriod.start -> acknowledgedAt).
      const winnerId = winner.flag.owner;
      expect([coordinatorA.id, coordinatorB.id]).toContain(winnerId);
      expect(winner.flag.status).toBe("Acknowledged");
      expect(winner.flag.acknowledgedAt).toBeTruthy();

      // The loser is told the current owner - the same coordinator that won.
      expect(loser.owner).toBe(winnerId);

      // The persisted Flag has a single owner (the winner), read back through
      // the domain seam.
      const { flag: persisted } = await getFlag(medplum, flagId);
      expect(persisted.status).toBe("Acknowledged");
      expect(persisted.owner).toBe(winnerId);

      // NFR-6 audit: the claim wrote a Provenance recording the actor (no domain
      // read-back seam exists, so this is checked directly).
      const provenances = await medplum.searchResources("Provenance", {
        target: `Task/${flagId}`,
      });
      expect(provenances.length).toBeGreaterThanOrEqual(1);
      const agents = provenances.flatMap((p) =>
        (p.agent ?? []).map((a) => a.who?.reference)
      );
      expect(agents).toContain(`Practitioner/${winnerId}`);
    });

    it("transitions Open -> Acknowledged and refuses a later second claim", async () => {
      const flagId = await openFlag("sequential");
      const refA = createReference(coordinatorA).reference!;
      const refB = createReference(coordinatorB).reference!;

      const first = await acknowledge(medplum, flagId, refA);
      expect(first.outcome).toBe("acknowledged");
      if (first.outcome !== "acknowledged") throw new Error("unreachable");
      expect(first.flag.status).toBe("Acknowledged");
      expect(first.flag.owner).toBe(coordinatorA.id);
      expect(first.flag.acknowledgedAt).toBeTruthy();

      // A later claim by another coordinator on an already-Acknowledged Flag is
      // refused and reports the existing owner - a Flag never gets two owners,
      // even outside a same-version race.
      const second = await acknowledge(medplum, flagId, refB);
      expect(second.outcome).toBe("already-claimed");
      if (second.outcome !== "already-claimed") throw new Error("unreachable");
      expect(second.owner).toBe(coordinatorA.id);
    });
  }
);
