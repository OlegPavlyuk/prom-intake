# Feature Catalogue

**Status:** Draft - Product Discovery in progress (2026-07-13).

One row per feature. A feature becomes a spec (via `/to-spec` -> GitHub issue) when it is picked up.
Features map to the requirements in [`requirements.md`](requirements.md).

| Feature | Description | v1? | Requirements | Status |
| ------- | ----------- | --- | ------------ | ------ |
| Generic PROM engine | Instruments (items, scoring, triggers) defined as configuration, not code | Yes | FR-1, FR-4, NFR-2 | Idea |
| PHQ-9 instrument | PHQ-9 configured on the engine (9 items, 0-27, bands, triggers) | Yes | FR-2, FR-18, FR-20 | Idea |
| Automatic scoring | Compute the Score from a submitted Response, no manual step | Yes | FR-3 | Idea |
| Assignment & Access link | Assign an Instrument to a patient; deliver via unique expiring single-use link | Yes | FR-5-FR-11 | Idea |
| Patient completion flow | Account-free completion of the Instrument via the link, all-items-required | Yes | FR-13, FR-14, FR-16 | Idea |
| Crisis Response | Immediate informational crisis resources on a positive acute-risk answer | Yes | FR-15 | Idea |
| Trigger evaluation | Evaluate severity-band and critical/acute-risk triggers on submit; raise Flags | Yes | FR-17-FR-22 | Idea |
| Flag Worklist | Shared, priority-ordered list of unresolved Flags | Yes | FR-23-FR-25 | Idea |
| Flag detail view | Show the clinical signal behind a Flag | Yes | FR-29 | Idea |
| Acknowledge & Resolve | Claim a Flag; resolve with a predefined reason + optional note | Yes | FR-26-FR-28, FR-30 | Idea |
| Coordinator auth | Medplum built-in authentication for coordinators | Yes | FR-31 | Idea |
| Patient selection / minimal create | Assign to existing (or minimally created) patients | Yes | FR-12 | Idea |
| Coordinator notifications | Push (e.g. email) for acute-risk Flags | No (fast follow) | - | Idea |
| Outstanding-assignment view | "Who hasn't responded yet" screen | No | FR-9 (data only) | Idea |
| Second instrument (GAD-7) | Prove genericity by adding an instrument as config | No | FR-4 | Idea |
| Longitudinal tracking | Trend a patient's Scores over time | No | - | Idea |
| Recurring assignments | Scheduled re-assessment | No | - | Idea |
| Reporting / metrics dashboard | Surface the KPIs the data model already supports | No | NFR-1 | Idea |

**Status legend:** `Idea` -> `Specced` (issue exists) -> `In progress` (tickets open) -> `Done`.

## Related

- Requirements: [`requirements.md`](requirements.md)
- Roadmap: [`roadmap.md`](roadmap.md)
