# Product Vision

**Status:** Draft - Product Discovery in progress (2026-07-13).

## One-line vision

For the **Care Coordinator** who must review standardized questionnaires without drowning in manual
scoring, PROM Intake is a **PROM triage and worklist platform** that automatically scores every
submitted patient self-report and surfaces the patients who need attention at the top of a shared,
prioritized Worklist - instead of leaving them in an unread pile.

## Longer-term north star

Care Coordinators run entirely off a single, trustworthy Worklist. Standardized outcome measures
flow in from patients continuously, are scored automatically the instant they arrive, and only the
patients who genuinely need attention rise to the top - each with the clinical signal that flagged
them already visible. Adding a new measure (GAD-7, PROMIS, and beyond) is a configuration exercise,
never a rebuild, because the platform treats PHQ-9 as just the first Instrument in a generic PROM
engine. The coordinator's judgment is amplified, not replaced: the platform does the counting,
watching, and sorting; the human does the caring.

## What the product guarantees

Because this is a safety-adjacent tool, its promise is stated precisely:

- **It guarantees** that every *submitted* Response is automatically scored, that every Trigger
  condition met by a submitted Response raises a Flag, and that those Flags appear on one shared
  Worklist ordered by clinical urgency.
- **It does not guarantee** a timely human response, that a patient completes or submits an assigned
  Instrument, or that risk a patient discloses but never submits is ever seen by a coordinator (the
  patient still receives the immediate Crisis Response - see the non-goals below).

In short, the product guarantees *detection, scoring, and prioritized queueing of submitted
Responses* - not real-time intervention.

## Who this is for

- **Primary user:** the **Care Coordinator** (see [`CONTEXT.md`](../../CONTEXT.md)). The product is
  optimized for their workflow, their trust, and their time.
- **Source of clinical information:** the **patient**, who completes Instruments. Important, but not
  the primary customer of v1.

## What this product is NOT

Explicit non-goals that keep scope honest and the clinical boundary safe:

- **Not an emergency response or crisis-intervention system.** It does not dispatch help, contact
  emergency services, or guarantee a real-time human response. The patient-facing **Crisis Response**
  is informational only.
- **Not a continuous / real-time patient monitoring system.** It reacts to submitted Responses; it
  does not watch patients between submissions.
- **Not a replacement for clinical judgment or an established care relationship.** It assumes the
  patient is already under the care of the coordinator's organization; it supports that relationship,
  it does not create or substitute for it.
- **Not a diagnostic tool.** Scores and Flags are decision *support*, not diagnoses.
- **Not a patient-engagement / messaging product.** v1 is not a patient portal, chat, or reminder
  platform beyond what is needed to complete an Instrument and see the Crisis Response.

## Related

- Problem: [`problem-statement.md`](problem-statement.md)
- Goals & metrics: [`goals-and-metrics.md`](goals-and-metrics.md)
- Domain glossary: [`CONTEXT.md`](../../CONTEXT.md)
