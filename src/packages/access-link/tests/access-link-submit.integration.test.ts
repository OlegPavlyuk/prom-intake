import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import type { Patient, QuestionnaireResponse } from "@medplum/fhirtypes";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
import { seedCodeSystems } from "../../terminology/code-systems.js";
import { seedInstrument } from "../../instrument/seed.js";
import { PHQ9 } from "../../instrument/phq9.js";
import { createAssignment, getAssignment } from "../../assignment/index.js";
import type { ResponseAnswer } from "../../domain/workflow.js";
// The Access-link module's submit/open seam, through its public entry point.
import {
  issueAccessLink,
  openAccessLink,
  submitAccessLinkResponse,
  validateAccessLink,
} from "../index.js";

// ADR-0008 + ADR-0005: submit is the sharpest trust boundary in v1, tested
// against a REAL Medplum test project, never a mock. This is the issue -> open ->
// submit(consume) seam: single-use, expiry, invalid, incomplete-rejected, and
// the compare-and-swap atomicity (no partial write on failure, one Response
// under a race).
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Access-link submit/open: MEDPLUM_* not set.\n"
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A complete PHQ-9 answer set (all nine items) - the happy-path submission. */
function completeAnswers(): ResponseAnswer[] {
  return PHQ9.items.map((item) => ({
    linkId: item.linkId,
    answerCode: "not-at-all",
  }));
}

describeIntegration("Access-link submit/open seam (ADR-0005)", () => {
  let medplum: MedplumClient;
  let questionnaireRef: string;
  const patients: string[] = [];

  beforeAll(async () => {
    medplum = await createTestMedplumClient(config!);
    await seedCodeSystems(medplum);
    await seedInstrument(medplum, PHQ9);
    const questionnaire = await medplum.searchOne("Questionnaire", {
      url: PHQ9.questionnaireUrl,
    });
    questionnaireRef = `Questionnaire/${questionnaire!.id}`;
  });

  afterAll(async () => {
    if (!medplum) return;
    for (const patientId of patients) {
      for (const type of ["Basic", "QuestionnaireResponse"] as const) {
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
  });

  /** A fresh patient + Pending Assignment + issued link, ready to open/submit. */
  async function anIssuedLink(
    now?: Date
  ): Promise<{ token: string; assignmentId: string; patientId: string }> {
    const patient = await medplum.createResource<Patient>({
      resourceType: "Patient",
      name: [{ given: ["Submit"], family: "Link-Test" }],
    });
    patients.push(patient.id!);
    const assignment = await createAssignment(
      medplum,
      { patientId: patient.id!, instrumentKey: PHQ9.key, questionnaireRef },
      now ? { now } : undefined
    );
    const issued = await issueAccessLink(
      medplum,
      assignment,
      PHQ9.questionnaireUrl,
      now ? { now } : undefined
    );
    return {
      token: issued.token,
      assignmentId: assignment.id,
      patientId: patient.id!,
    };
  }

  async function responsesFor(
    patientId: string
  ): Promise<QuestionnaireResponse[]> {
    return medplum.searchResources("QuestionnaireResponse", {
      subject: `Patient/${patientId}`,
    });
  }

  it("opens a valid link to the blank Instrument, and only the Instrument (NFR-5)", async () => {
    const { token } = await anIssuedLink();
    const open = await openAccessLink(medplum, token);

    expect(open.status).toBe("valid");
    if (open.status !== "valid") return;
    expect(open.instrument.key).toBe(PHQ9.key);
    expect(open.instrument.items).toHaveLength(9);
    // PHI-minimal: an open carries the Instrument definition, no patient data.
    expect(JSON.stringify(open.instrument)).not.toContain("Patient/");
  });

  it("submits a complete Response: persists the QR, burns the link, completes the Assignment (FR-8/9/13/32)", async () => {
    const { token, assignmentId, patientId } = await anIssuedLink();

    const result = await submitAccessLinkResponse(medplum, {
      token,
      answers: completeAnswers(),
    });

    expect(result.status).toBe("submitted");
    if (result.status !== "submitted") return;

    // The Response persisted, attributed to the bound patient + Assignment.
    const qr = await medplum.readResource(
      "QuestionnaireResponse",
      result.responseId
    );
    expect(qr.subject?.reference).toBe(`Patient/${patientId}`);
    expect(qr.basedOn?.[0]?.reference).toBe(`Task/${assignmentId}`);
    expect(qr.item).toHaveLength(9);

    // The Assignment is Completed (via the Assignment module).
    expect((await getAssignment(medplum, assignmentId)).status).toBe(
      "Completed"
    );

    // The link is burned: it now reads as used, never valid.
    expect((await validateAccessLink(medplum, token)).status).toBe("used");
    expect((await openAccessLink(medplum, token)).status).toBe("used");
  });

  it("is single-use: a second submit on a consumed link is refused, with no second Response (FR-8)", async () => {
    const { token, patientId } = await anIssuedLink();

    expect(
      (
        await submitAccessLinkResponse(medplum, {
          token,
          answers: completeAnswers(),
        })
      ).status
    ).toBe("submitted");
    expect(
      (
        await submitAccessLinkResponse(medplum, {
          token,
          answers: completeAnswers(),
        })
      ).status
    ).toBe("used");

    expect(await responsesFor(patientId)).toHaveLength(1);
  });

  it("rejects an incomplete submission before any write (FR-14, trust boundary)", async () => {
    const { token, assignmentId, patientId } = await anIssuedLink();
    // Drop the last item, and give one item an invalid option code.
    const answers = completeAnswers().slice(0, 8);
    answers[0] = {
      linkId: PHQ9.items[0]!.linkId,
      answerCode: "not-a-real-code",
    };

    const result = await submitAccessLinkResponse(medplum, { token, answers });

    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.missingLinkIds).toContain(PHQ9.items[8]!.linkId); // the dropped 9th
    expect(result.missingLinkIds).toContain(PHQ9.items[0]!.linkId); // invalid answer

    // No write happened: no Response, the link is still valid, still Pending.
    expect(await responsesFor(patientId)).toHaveLength(0);
    expect((await validateAccessLink(medplum, token)).status).toBe("valid");
    expect((await getAssignment(medplum, assignmentId)).status).toBe("Pending");
  });

  it("rejects a submit on an expired link, with no Response (FR-7)", async () => {
    const t0 = new Date("2026-07-14T12:00:00.000Z");
    const { token, patientId } = await anIssuedLink(t0);
    const after = new Date(t0.getTime() + 15 * DAY_MS);

    const result = await submitAccessLinkResponse(
      medplum,
      { token, answers: completeAnswers() },
      { now: after }
    );

    expect(result.status).toBe("expired");
    expect(await responsesFor(patientId)).toHaveLength(0);
  });

  it("rejects an unknown token as not-found", async () => {
    const result = await submitAccessLinkResponse(medplum, {
      token: "not-a-real-token",
      answers: completeAnswers(),
    });
    expect(result.status).toBe("not-found");
  });

  it("atomicity: a failed Response create reverts the burn - no partial write (ADR-0005)", async () => {
    const { token, assignmentId, patientId } = await anIssuedLink();

    // A client that fails exactly the QuestionnaireResponse create, after the
    // token has been burned - the window the compensation must cover.
    const failing = new Proxy(medplum, {
      get(target, prop, receiver) {
        if (prop === "createResource") {
          return async (
            resource: { resourceType?: string },
            ...rest: unknown[]
          ) => {
            if (resource?.resourceType === "QuestionnaireResponse") {
              throw new Error("injected QR create failure");
            }
            return (target as MedplumClient).createResource(
              resource as never,
              ...(rest as [])
            );
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as MedplumClient;

    await expect(
      submitAccessLinkResponse(failing, { token, answers: completeAnswers() })
    ).rejects.toThrow();

    // The burn was reverted: the link is usable again, nothing persisted.
    expect(await responsesFor(patientId)).toHaveLength(0);
    expect((await validateAccessLink(medplum, token)).status).toBe("valid");
    expect((await getAssignment(medplum, assignmentId)).status).toBe("Pending");

    // And it can still be submitted for real.
    expect(
      (
        await submitAccessLinkResponse(medplum, {
          token,
          answers: completeAnswers(),
        })
      ).status
    ).toBe("submitted");
  });

  it("under a concurrent race, exactly one submit wins and one Response is created (ADR-0005)", async () => {
    const { token, patientId } = await anIssuedLink();

    const [a, b] = await Promise.all([
      submitAccessLinkResponse(medplum, { token, answers: completeAnswers() }),
      submitAccessLinkResponse(medplum, { token, answers: completeAnswers() }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["submitted", "used"]);
    expect(await responsesFor(patientId)).toHaveLength(1);
  });
});
