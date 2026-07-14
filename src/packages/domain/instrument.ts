// The Instrument domain vocabulary (pure, no FHIR). Entry point of the `domain`
// package. An Instrument is the reusable, validated PROM definition - its items,
// answer options + scoring weights, severity bands, Triggers, and the acute-risk
// item identity - independent of any one patient's answers (CONTEXT.md).
//
// These are plain domain types. The Instrument module (src/packages/instrument)
// maps them to/from FHIR (`Questionnaire` + a project-owned `InstrumentConfig`
// `Basic`) at its seam; nothing here knows about FHIR.

import type { LoincCoding } from "./coding.js";

/** Stable, human-meaningful identity of an Instrument, e.g. `phq-9`. */
export type InstrumentKey = string;

/**
 * One selectable answer for an item, carrying its scoring weight. The weight -
 * not the option's position or code - is what a Response contributes to the
 * Score (SDC `itemWeight`; ADR-0004), so display and score stay decoupled.
 */
export interface AnswerOption {
  /** Option code, unique within its item's answer set (e.g. `several-days`). */
  readonly code: string;
  /** Display text shown to the patient (e.g. `Several days`). */
  readonly label: string;
  /** Score contribution when this option is chosen. */
  readonly weight: number;
}

/** A single question of an Instrument. */
export interface InstrumentItem {
  /** Unique `linkId` within the Instrument. */
  readonly linkId: string;
  /** Question text. */
  readonly text: string;
  /** The ordered answer options, each with its scoring weight. */
  readonly options: readonly AnswerOption[];
}

/**
 * A named interpretation band for a total Score (e.g. PHQ-9 `Moderate` = 10-14).
 * Bands describe how a Score reads clinically; a Severity-band Trigger decides
 * when a band raises a Flag (they are separate concerns - CONTEXT.md).
 */
export interface SeverityBand {
  /** Band code, e.g. `moderate`. */
  readonly code: string;
  /** Human label, e.g. `Moderate`. */
  readonly label: string;
  /** Inclusive lower bound of the band. */
  readonly minScore: number;
  /** Inclusive upper bound, or `null` for the open-ended top band. */
  readonly maxScore: number | null;
}

/**
 * Relative urgency a fired Trigger confers on its Flag. Ordered most-urgent
 * first when the Worklist ranks Flags (FR-24/25); the Worklist owns the exact
 * ordering, this only tags the tier.
 */
export type FlagPriority = "acute-risk" | "urgent" | "routine";

/**
 * A Trigger whose condition is that the total Score is at or above a cutoff
 * (Severity-band Trigger; FR-18). PHQ-9 v1 fires at total >= 10.
 */
export interface SeverityBandTrigger {
  readonly kind: "severity-band";
  /** Stable Trigger code, recorded on any Flag it raises (FR-22). */
  readonly code: string;
  /** Human label for why the patient was flagged. */
  readonly label: string;
  /** Priority tier conferred on the raised Flag. */
  readonly priority: FlagPriority;
  /** Inclusive total-Score cutoff at or above which the Trigger fires. */
  readonly atOrAboveScore: number;
}

/**
 * A Trigger whose condition is met by one item's answer, independent of the
 * total Score (Critical-item Trigger; FR-19). When `acuteRisk` is true it is an
 * Acute-risk Trigger (FR-20) and its `linkId` is the item that drives the
 * client-side Crisis Response (FR-15).
 */
export interface CriticalItemTrigger {
  readonly kind: "critical-item";
  /** Stable Trigger code, recorded on any Flag it raises (FR-22). */
  readonly code: string;
  /** Human label for why the patient was flagged. */
  readonly label: string;
  /** Priority tier conferred on the raised Flag. */
  readonly priority: FlagPriority;
  /** The item this Trigger inspects. */
  readonly linkId: string;
  /** Inclusive answer-weight threshold at or above which the Trigger fires. */
  readonly atOrAboveValue: number;
  /** True for an Acute-risk Trigger (immediate patient-safety risk; FR-20). */
  readonly acuteRisk: boolean;
}

/** Any Trigger definition attached to an Instrument. */
export type TriggerDefinition = SeverityBandTrigger | CriticalItemTrigger;

/**
 * A fully-resolved Instrument: its FHIR definition (`Questionnaire`) and its
 * project-owned config (`InstrumentConfig`) composed into one domain object.
 * This is what the Instrument module's `loadInstrument` returns and what its
 * seed accepts, so a seed -> load round-trip is lossless.
 */
export interface Instrument {
  /** Stable identity used to look the Instrument up. */
  readonly key: InstrumentKey;
  /** Canonical URL of the backing `Questionnaire`. */
  readonly questionnaireUrl: string;
  /** Human title, e.g. `Patient Health Questionnaire-9 (PHQ-9)`. */
  readonly title: string;
  /** LOINC coding of the total Score (e.g. `44261-6`). */
  readonly totalScore: LoincCoding;
  /** LOINC coding of the item panel, if the Instrument has one (e.g. `44249-1`). */
  readonly panelCode?: LoincCoding;
  /** The Instrument's items, in order, with per-option scoring weights. */
  readonly items: readonly InstrumentItem[];
  /** Interpretation bands for the total Score. */
  readonly severityBands: readonly SeverityBand[];
  /** Trigger definitions evaluated against a Response. */
  readonly triggers: readonly TriggerDefinition[];
  /**
   * `linkId` of the acute-risk item that drives the client-side Crisis Response
   * (FR-15), if the Instrument has one. Read directly by the patient client, so
   * the Crisis Response stays config-driven rather than hard-coded.
   */
  readonly acuteRiskItemLinkId?: string;
}
