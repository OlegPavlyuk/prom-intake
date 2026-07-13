# Roadmap

**Status:** Draft - Product Discovery in progress (2026-07-13).

Milestones describe **outcomes**, not task lists. Terms are defined in [`CONTEXT.md`](../../CONTEXT.md).

## Now - v1: the PHQ-9 tracer bullet

**Outcome:** a Care Coordinator can assign PHQ-9 to a patient, the patient completes it (with an
immediate Crisis Response on a positive acute-risk answer), the system scores it and raises Flags,
and the coordinator works a shared, priority-ordered Worklist to resolution - all deployed and
demoable, built on the generic PROM engine so PHQ-9 is configuration, not hardcoding.

This is the thinnest complete path through every layer (P9 tracer bullet). It proves the architecture
end-to-end before anything is thickened.

Covers the "v1? = Yes" features in [`features.md`](features.md).

## Next - prove genericity & close the safety fast-follow

- **Second Instrument (GAD-7) by configuration** - the single strongest signal the platform is
  generic (FR-4). Adds no new architecture.
- **Coordinator notifications for acute-risk Flags** - the deferred fast-follow from Q6, so the most
  urgent Flags don't depend solely on someone watching the Worklist.

## Later - directional, low-resolution

- **Longitudinal tracking** - trend a patient's Scores over time (the deferred-but-not-designed-out
  capability); enables outcome-improvement metrics.
- **Recurring / scheduled assignments** - re-assess patients on a cadence.
- **Reporting / metrics dashboard** - surface the KPIs the data model is already obligated to support
  (NFR-1).
- **Outstanding-assignment view** - "who hasn't responded yet".
- **Additional delivery channels** - patient portal / SMS / email, delivering the same Assignment
  without a domain-model change.

> Large or foggy future milestones should be planned with `/wayfinder` (a map issue) when their time
> comes, not guessed at here.

## Related

- Features: [`features.md`](features.md)
- Vision: [`vision.md`](vision.md)
- Portfolio/learning goals: [`docs/project/portfolio-goals.md`](../project/portfolio-goals.md)
