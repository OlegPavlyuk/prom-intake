---
status: accepted
date: 2026-07-13
---

# Scoring and Trigger evaluation run in one instrument-agnostic Bot

Scoring a [Response](../../CONTEXT.md) and evaluating its [Triggers](../../CONTEXT.md) both run
server-side in a **single Medplum Bot**, fired by a **Subscription** on `QuestionnaireResponse`
creation. The Bot:

1. Parses the answers (`getQuestionnaireAnswers`, keyed by `linkId`).
2. Computes the [Score](../../CONTEXT.md) and **always** writes the Score `Observation`(s) - LOINC
   `44261-6` total (and optionally the `44249-1` panel), `derivedFrom` the `QuestionnaireResponse`.
   This satisfies FR-32 (persist every Response + Score regardless of flagging).
3. Evaluates each configured Trigger and **conditionally** raises the [Flag](0002-flag-as-fhir-task.md),
   recording which Trigger fired (FR-22). Note: **[ADR-0011](0011-one-flag-per-response.md) revises
   this** - all Triggers that fire on one Response are grouped into a **single** Flag `Task` carrying
   every reason, not one Flag per Trigger.

See [research](../research/medplum-prom-architecture.md) §5.

## Why a Bot fired by a Subscription

- Medplum explicitly prescribes a Bot (not declarative `$extract`) for clinical scoring
  instruments: "the scoring algorithm is code, not a declarative template," naming
  PHQ-9/GAD-7/AUDIT-C. Trigger evaluation is the same shape (conditional logic over parsed
  answers), so it belongs in the same seam.
- Server-side execution is **required**, not merely idiomatic: the acute-risk Flag (FR-20) must be
  raised from the *submitted* Response, and is deliberately distinct from the client-only Crisis
  Response (FR-15). A Bot is Medplum's server-side execution primitive; the Subscription only
  invokes it.
- One Subscription -> one Bot per submitted Response keeps scoring + triggers behind a single seam.

## Configuration - hybrid, and the Bot stays instrument-agnostic

Adding a new Instrument (e.g. GAD-7) must be **configuration, not an engine change** (FR-4, NFR-2).
Instrument configuration lives in two homes, each where its standard belongs:

| Config | Home | Why |
| ------ | ---- | --- |
| Per-answer scoring weights + the total's LOINC coding | On the `Questionnaire` via the **SDC `itemWeight`** extension | Standard HL7/SDC way; keeps the score definition beside the form. (Medplum does not auto-evaluate `itemWeight`; the Bot reads and sums it - the extension is a config carrier.) |
| Trigger definitions, severity bands, and other product-specific evaluation rules | A project-owned **`InstrumentConfig`** model | FHIR/SDC defines no Trigger model; this is our clean extension point for what the standards do not cover. |

**The Bot contains no instrument-specific code.** It evaluates any Instrument purely from
`itemWeight` (scoring) + `InstrumentConfig` (bands/triggers). Adding GAD-7 = author a `Questionnaire`
with weights + an `InstrumentConfig`; deploy nothing.

### Trade-off

Instrument config lives in **two places** rather than one. Accepted because it aligns with FHIR
where a standard exists (scoring) and only invents where FHIR is silent (triggers) - rather than
abandoning the idiomatic SDC scoring extension to keep everything in one store. The two homes are
bound together by the Instrument identity.

## Consequences

- `InstrumentConfig` is a new project-owned model; its schema (trigger-rule shape, band
  definitions, how the Bot dispatches on it) is ours to design and is detailed in the data model.
- The Bot must be **idempotent** (Bots can fire more than once): use conditional creates/upserts
  keyed on `derivedFrom` + code so re-delivery does not double-write Observations or Tasks.
- Item-level Observation extraction via `$extract` was considered and deferred; doing everything in
  the Bot is simpler and equally idiomatic for a one-Instrument v1. Revisit if item extraction
  becomes boilerplate across many Instruments.
