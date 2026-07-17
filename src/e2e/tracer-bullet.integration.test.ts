import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReference, type MedplumClient } from "@medplum/core";
import type { Patient, Practitioner } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../packages/test-harness/client.js";
import { loadMedplumTestConfig } from "../packages/test-harness/config.js";
import { seedCodeSystems } from "../packages/terminology/code-systems.js";
import { seedInstrument } from "../packages/instrument/seed.js";
import { PHQ9 } from "../packages/instrument/phq9.js";
import type { ResponseAnswer } from "../packages/domain/workflow.js";
// The tracer bullet is composed ONLY from the modules' public entry points - the
// same seams every other caller (the Bots, the coordinator app) uses. It never
// reaches into a package's internals; that it can be assembled from the entry
// points alone is part of what it proves.
import {
  createAssignment,
  getAssignment,
} from "../packages/assignment/index.js";
import {
  issueAccessLink,
  openAccessLink,
  submitAccessLinkResponse,
} from "../packages/access-link/index.js";
import { scoreResponse } from "../packages/scoring/index.js";
import {
  acknowledge,
  getFlag,
  listWorklist,
  resolve,
} from "../packages/worklist/index.js";

// Seam #8 (testing-strategy): the end-to-end tracer bullet, exercised against a
// REAL Medplum test project (ADR-0008), never a mock. It drives the whole path -
// assign -> open -> submit -> score -> flag -> worklist -> acknowledge -> resolve -
// through the module entry points and asserts each step's OBSERVABLE DOMAIN
// OUTCOME (not HTTP codes or FHIR shapes). Browser-E2E tooling is deferred
// (ADR-0010); this is the integration-level proof of the full flow. The
// per-seam behaviours (ordering, the acknowledge race, submit atomicity) are
// owned by their own suites; this asserts they compose into one working path.
// Without credentials the suite skips loudly.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING tracer-bullet E2E: MEDPLUM_* not set. " +
      "Provision a test project first - see docs/architecture/infrastructure.md.\n"
  );
}

/** The two PHQ-9 Triggers (v1), for asserting which Flag was raised. */
const SEVERITY_TRIGGER = "phq9-moderate-or-above";
const ACUTE_RISK_TRIGGER = "phq9-item-9-acute-risk";

describeIntegration(
  "Tracer bullet E2E: assign -> open -> submit -> score -> flag -> worklist -> acknowledge -> resolve",
  () => {
    let medplum: MedplumClient;
    let questionnaireUrl: string;
    let questionnaireRef: string;
    let coordinator: Practitioner;
    let patient: Patient;

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      await seedInstrument(medplum, PHQ9);
      questionnaireUrl = PHQ9.questionnaireUrl;
      const questionnaire = await medplum.searchOne("Questionnaire", {
        url: questionnaireUrl,
      });
      questionnaireRef = `Questionnaire/${questionnaire!.id}`;
      coordinator = await medplum.createResource<Practitioner>({
        resourceType: "Practitioner",
        name: [{ given: ["Tracer"], family: "Coordinator" }],
      });
      patient = await medplum.createResource<Patient>({
        resourceType: "Patient",
        name: [{ given: ["Tracer"], family: "Patient" }],
      });
    });

    afterAll(async () => {
      if (!medplum) return;
      const patientId = patient?.id;
      if (patientId) {
        for (const type of [
          "Observation",
          "QuestionnaireResponse",
          "Basic",
        ] as const) {
          const found = await medplum
            .searchResources(type, { subject: `Patient/${patientId}` })
            .catch(() => []);
          for (const r of found) {
            if (r.id) await medplum.deleteResource(type, r.id).catch(() => {});
          }
        }
        const tasks = await medplum
          .searchResources("Task", { patient: `Patient/${patientId}` })
          .catch(() => []);
        for (const t of tasks) {
          if (t.id) await medplum.deleteResource("Task", t.id).catch(() => {});
        }
        await medplum.deleteResource("Patient", patientId).catch(() => {});
      }
      if (coordinator?.id) {
        await medplum
          .deleteResource("Practitioner", coordinator.id)
          .catch(() => {});
      }
    });

    /**
     * A complete PHQ-9 answer set that fires BOTH Triggers: items 1-4 at
     * nearly-every-day (total 12, >= 10 -> severity band) and Item 9 positive
     * (-> acute-risk), the rest not-at-all. Total 13.
     */
    function riskAnswers(): ResponseAnswer[] {
      const overrides: Record<string, string> = {
        "phq9-item-1": "nearly-every-day",
        "phq9-item-2": "nearly-every-day",
        "phq9-item-3": "nearly-every-day",
        "phq9-item-4": "nearly-every-day",
        "phq9-item-9": "several-days",
      };
      return PHQ9.items.map((item) => ({
        linkId: item.linkId,
        answerCode: overrides[item.linkId] ?? "not-at-all",
      }));
    }

    it("drives the full path and each step's domain outcome holds", async () => {
      // 1. ASSIGN - a coordinator assigns PHQ-9 to the patient (FR-5), Pending.
      const assignment = await createAssignment(medplum, {
        patientId: patient.id!,
        instrumentKey: PHQ9.key,
        questionnaireRef,
      });
      expect(assignment.status).toBe("Pending");

      // 2. DELIVER + OPEN - the link mints a token; the patient opens it without
      // an account and sees only the blank Instrument, no PHI (FR-6/13, NFR-5).
      const issued = await issueAccessLink(
        medplum,
        assignment,
        questionnaireUrl
      );
      const open = await openAccessLink(medplum, issued.token);
      expect(open.status).toBe("valid");
      if (open.status !== "valid") throw new Error("unreachable");
      expect(open.instrument.key).toBe(PHQ9.key);
      expect(open.instrument.items).toHaveLength(9);
      expect(JSON.stringify(open.instrument)).not.toContain("Patient/");

      // 3. SUBMIT - the patient submits a complete Response; the link burns and
      // the Assignment completes (FR-8/9/13/32).
      const submission = await submitAccessLinkResponse(medplum, {
        token: issued.token,
        answers: riskAnswers(),
      });
      expect(submission.status).toBe("submitted");
      if (submission.status !== "submitted") throw new Error("unreachable");
      expect((await getAssignment(medplum, assignment.id)).status).toBe(
        "Completed"
      );

      // 4. SCORE + FLAG - the Scoring Bot scores the Response (total 13) and
      // raises a Flag per fired Trigger: severity-band + acute-risk (FR-18/20/21/22).
      const qr = await medplum.readResource(
        "QuestionnaireResponse",
        submission.responseId
      );
      const scored = await scoreResponse(medplum, qr);
      expect(scored.score.total).toBe(13);
      const raisedTriggers = scored.flags.flatMap((f) => f.triggerCodes).sort();
      expect(raisedTriggers).toEqual(
        [ACUTE_RISK_TRIGGER, SEVERITY_TRIGGER].sort()
      );

      // 5. WORKLIST - both Flags surface on the shared Worklist; the acute-risk
      // Flag ranks first (FR-23/24). Filter to this patient (the project holds
      // other Flags from sibling suites).
      const mineOnWorklist = (
        flags: Awaited<ReturnType<typeof listWorklist>>
      ) => flags.filter((f) => f.patientId === patient.id);
      const worklist = mineOnWorklist(await listWorklist(medplum));
      expect(worklist).toHaveLength(2);
      const top = worklist[0]!;
      expect(top.priority).toBe("acute-risk");
      expect(top.status).toBe("Open");

      // 6. FLAG DETAIL - opening the top Flag composes the clinical signal from
      // the origin Response/Score (FR-29): same patient, the acute-risk Trigger.
      const record = await getFlag(medplum, top.id);
      expect(record.flag.id).toBe(top.id);
      expect(record.flag.patientId).toBe(patient.id);
      expect(record.responseId).toBe(qr.id);
      expect(top.triggerCodes).toContain(ACUTE_RISK_TRIGGER);

      // 7. ACKNOWLEDGE - the coordinator claims the acute-risk Flag, single-owner
      // (FR-26); it stays on the Worklist, now Acknowledged and owned.
      const coordinatorRef = createReference(coordinator).reference!;
      const ack = await acknowledge(medplum, top.id, coordinatorRef);
      expect(ack.outcome).toBe("acknowledged");
      if (ack.outcome !== "acknowledged") throw new Error("unreachable");
      expect(ack.flag.status).toBe("Acknowledged");
      expect(ack.flag.owner).toBe(coordinator.id);
      const afterAck = mineOnWorklist(await listWorklist(medplum));
      expect(afterAck.find((f) => f.id === top.id)?.status).toBe(
        "Acknowledged"
      );

      // 8. RESOLVE - the coordinator resolves the Flag with a structured reason;
      // it leaves the active Worklist while history is retained (FR-27/28/30).
      const resolved = await resolve(
        medplum,
        top.id,
        {
          reason: "referred-to-clinician",
          note: "Escalated to the on-call clinician for acute-risk follow-up.",
        },
        coordinatorRef
      );
      expect(resolved.outcome).toBe("resolved");
      if (resolved.outcome !== "resolved") throw new Error("unreachable");
      expect(resolved.flag.status).toBe("Resolved");
      expect(resolved.flag.resolution?.reason).toBe("referred-to-clinician");

      // The resolved Flag is gone from the active Worklist; the acute-risk work
      // item is done and only the still-Open severity Flag remains for this patient.
      const afterResolve = mineOnWorklist(await listWorklist(medplum));
      expect(afterResolve.map((f) => f.id)).not.toContain(top.id);
      expect(afterResolve).toHaveLength(1);
      expect(afterResolve[0]!.triggerCodes).toContain(SEVERITY_TRIGGER);

      // History retained (no hard delete): the resolved Flag is still readable
      // through the domain seam, carrying its resolution (FR-30, NFR-6).
      const retained = await getFlag(medplum, top.id);
      expect(retained.flag.status).toBe("Resolved");
      expect(retained.flag.resolution?.reason).toBe("referred-to-clinician");
      expect(retained.flag.resolvedAt).toBeTruthy();
    });
  }
);
