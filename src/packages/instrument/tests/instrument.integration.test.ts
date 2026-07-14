import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MedplumClient } from "@medplum/core";
import { createTestMedplumClient } from "../../test-harness/client.js";
import { loadMedplumTestConfig } from "../../test-harness/config.js";
// The Instrument module's seams, exercised through its public entry points.
import { loadInstrument } from "../index.js";
import { removeInstrument, seedCodeSystems, seedInstrument } from "../seed.js";
import { PHQ9 } from "../phq9.js";
// Pure domain accessors that read the loaded Instrument (assert domain outcomes).
import {
  acuteRiskItem,
  bandForScore,
  weightFor,
} from "../../domain/instrument-queries.js";
import type {
  CriticalItemTrigger,
  SeverityBandTrigger,
} from "../../domain/instrument.js";
import { SYNTHETIC } from "./synthetic.js";

// ADR-0008: the Instrument seam is tested against a REAL Medplum test project,
// never a mock. Without credentials the suite skips loudly (a dev box without
// Medplum, or an untrusted fork PR) rather than reporting a false green.
const config = loadMedplumTestConfig();
const describeIntegration = config ? describe : describe.skip;

if (!config) {
  console.warn(
    "\n[integration] SKIPPING Instrument load: MEDPLUM_* not set. Provision a " +
      "test project first - see docs/architecture/infrastructure.md.\n"
  );
}

describeIntegration(
  "Instrument seam: load config for Instrument (ADR-0008)",
  () => {
    let medplum: MedplumClient;

    beforeAll(async () => {
      medplum = await createTestMedplumClient(config!);
      await seedCodeSystems(medplum);
      // Both Instruments are provisioned the same way, config only - no per-
      // Instrument code path (FR-4, NFR-2).
      await seedInstrument(medplum, PHQ9);
      await seedInstrument(medplum, SYNTHETIC);
    });

    afterAll(async () => {
      // Leave PHQ-9 + CodeSystems as provisioned reference data for later tickets;
      // remove only the test-only synthetic Instrument.
      if (medplum) {
        await removeInstrument(medplum, SYNTHETIC);
      }
    });

    it("loads PHQ-9 with its items, scoring weights, and LOINC coding", async () => {
      const phq9 = await loadInstrument(medplum, "phq-9");

      expect(phq9.title).toBe("Patient Health Questionnaire-9 (PHQ-9)");
      expect(phq9.totalScore.code).toBe("44261-6");
      expect(phq9.panelCode?.code).toBe("44249-1");
      expect(phq9.items).toHaveLength(9);

      // Each item is 0-3; the total range is 0-27.
      for (const item of phq9.items) {
        expect(item.options.map((o) => o.weight)).toEqual([0, 1, 2, 3]);
      }
      expect(weightFor(phq9, "phq9-item-9", "nearly-every-day")).toBe(3);
      expect(weightFor(phq9, "phq9-item-1", "not-at-all")).toBe(0);
    });

    it("loads PHQ-9 severity bands so a total maps to its clinical band", async () => {
      const phq9 = await loadInstrument(medplum, "phq-9");

      expect(bandForScore(phq9, 2)?.code).toBe("none-minimal");
      expect(bandForScore(phq9, 7)?.code).toBe("mild");
      expect(bandForScore(phq9, 12)?.code).toBe("moderate");
      expect(bandForScore(phq9, 17)?.code).toBe("moderately-severe");
      expect(bandForScore(phq9, 27)?.code).toBe("severe");
    });

    it("loads PHQ-9 Triggers and the acute-risk item identity", async () => {
      const phq9 = await loadInstrument(medplum, "phq-9");

      const severity = phq9.triggers.find(
        (t): t is SeverityBandTrigger => t.kind === "severity-band"
      );
      expect(severity?.atOrAboveScore).toBe(10);
      expect(severity?.priority).toBe("urgent");

      const acute = phq9.triggers.find(
        (t): t is CriticalItemTrigger => t.kind === "critical-item"
      );
      expect(acute?.acuteRisk).toBe(true);
      expect(acute?.priority).toBe("acute-risk");
      expect(acute?.linkId).toBe("phq9-item-9");
      expect(acute?.atOrAboveValue).toBe(1);

      // The acute-risk item identity is loadable (drives the client Crisis Response).
      expect(phq9.acuteRiskItemLinkId).toBe("phq9-item-9");
      expect(acuteRiskItem(phq9)?.text).toContain("better off dead");
    });

    it("loads a synthetic second Instrument through the same module (config-driven)", async () => {
      const synthetic = await loadInstrument(medplum, "synthetic-2item-test");

      // Distinct from PHQ-9 in every dimension - proves no PHQ-9 literals leak.
      expect(synthetic.title).toBe("Synthetic Two-Item Test Instrument");
      expect(synthetic.panelCode).toBeUndefined();
      expect(synthetic.items).toHaveLength(2);
      expect(weightFor(synthetic, "syn-item-1", "high")).toBe(5);

      expect(bandForScore(synthetic, 1)?.code).toBe("calm");
      expect(bandForScore(synthetic, 9)?.code).toBe("elevated");

      const severity = synthetic.triggers.find(
        (t): t is SeverityBandTrigger => t.kind === "severity-band"
      );
      expect(severity?.atOrAboveScore).toBe(4);

      // The critical-item mechanism exists here without being acute-risk (FR-19).
      const critical = synthetic.triggers.find(
        (t): t is CriticalItemTrigger => t.kind === "critical-item"
      );
      expect(critical?.acuteRisk).toBe(false);

      // No acute-risk item on this Instrument.
      expect(synthetic.acuteRiskItemLinkId).toBeUndefined();
      expect(acuteRiskItem(synthetic)).toBeUndefined();
    });

    it("raises a domain error for an unknown Instrument", async () => {
      await expect(loadInstrument(medplum, "does-not-exist")).rejects.toThrow(
        /not found/i
      );
    });
  }
);
