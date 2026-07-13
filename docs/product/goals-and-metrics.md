# Product Goals & Success Metrics

**Status:** Draft - Product Discovery in progress (2026-07-13).

> This document is deliberately written as if for a real healthcare product: it states the outcomes
> the product exists to produce and how success would be measured. The project's separate
> learning/portfolio objectives live in [`docs/project/portfolio-goals.md`](../project/portfolio-goals.md)
> and are intentionally kept out of this document.

## Product goals

The outcomes the product exists to produce (not features):

1. **Every submitted Response is scored and triaged.** Every submitted Response that meets a Trigger
   condition produces a Flag on the shared Worklist, ordered by clinical urgency, so risk signals are
   queued for a coordinator instead of sitting in an unread pile. (The product does not guarantee a
   timely human response, nor does it see risk a patient discloses but never submits.)
2. **Coordinators spend their time on the patients who need it.** Automation removes manual scoring
   and triage so effort concentrates on follow-up, not paperwork.
3. **Prioritization is shared, consistent, and trustworthy.** There is one Worklist, ordered by
   clinical urgency, that any coordinator can rely on - not per-person memory.
4. **Every resolution is accountable.** Each Flag leaves the Worklist with a recorded reason, so the
   organization can see how risk was handled.

## Measurement constraint (design rule)

**Every metric below must be computable from the application's own data** - the FHIR resources it
produces (e.g. QuestionnaireResponse, Observation) plus the Flag/Worklist workflow records. This is a
binding design constraint on the data model, even though a reporting dashboard is out of scope for
v1: if a KPI here cannot be derived from our own data, either the metric or the model is wrong.

## Success metrics (KPIs)

> Note: "capture" properties that are true *by construction* (every qualifying submitted Response
> produces a Flag) are not KPIs - they are **acceptance invariants**, listed separately below. KPIs
> here measure outcomes that can actually vary.

| Metric | Baseline (manual) | Target | How measured (from app data) |
| ------ | ----------------- | ------ | ---------------------------- |
| **Time-to-acknowledge (acute-risk)** | Hours-days, variable | Minutes-hours within working hours | Time from Flag creation (Open) to Acknowledged, for acute-risk Flags. |
| **Time-to-resolve** | Days, variable | Trending down | Time from Flag creation to Resolved. |
| **Worklist burn-down** | No shared state | Active Flags trend toward zero; none aged beyond a threshold | Count and age of Open/Acknowledged Flags over time. |
| **Coordinator manual-scoring effort** | 1 manual score per Response | **0** | Scores are computed automatically; no manual scoring step exists. |

## Acceptance invariants (verified by tests, not tracked as KPIs)

These must hold **by construction**; they are correctness guarantees checked by automated tests
(and are acceptance criteria for the relevant features), not outcome metrics:

- **Acute-risk invariant:** every submitted Response whose acute-risk item is positive (PHQ-9 Item 9
  >= 1) produces an acute-risk Flag.
- **Severity invariant:** every submitted Response whose Score meets the configured flagging cutoff
  (PHQ-9 >= 10) produces a severity Flag.

> TODO (feature specs): the KPI targets and guardrail thresholds below (time-to-acknowledge,
> burn-down age, alert-fatigue band) are directional until baselines / demo data exist; quantify them
> when the relevant features are specced.

## Guardrail metrics

Things that must **not** get worse while chasing the targets above:

| Guardrail | Why it matters | How measured (from app data) |
| --------- | -------------- | ---------------------------- |
| **Alert-fatigue rate** | Too many low-value Flags erodes trust and buries real risk | Share of Flags resolved with reason "No action needed" stays within a sane band (neither ~0, meaning thresholds too loose, nor very high, meaning we cry wolf). |
| **Unexplained resolutions** | Accountability depends on knowing *why* a Flag closed | 100% of Resolved Flags carry a Resolution reason. |
| **Scoring correctness** | A wrong Score is worse than no Score | Computed Scores match the instrument's published scoring for a fixed validation set (see the PHQ-9 research note). |
| **Stale acute-risk Flags** | The one thing we must never sit on | No acute-risk Flag remains Open beyond a defined age without acknowledgement. |

## Explicitly out of scope for v1 (as metrics)

- Longitudinal outcome improvement (does the patient's Score improve over time) - depends on the
  deferred longitudinal-tracking capability.
- Patient-side engagement metrics (completion funnels, reminders) - v1 is coordinator-optimized.

## Related

- Vision: [`vision.md`](vision.md)
- Problem: [`problem-statement.md`](problem-statement.md)
- Portfolio/learning goals: [`docs/project/portfolio-goals.md`](../project/portfolio-goals.md)
- Domain glossary: [`CONTEXT.md`](../../CONTEXT.md)
