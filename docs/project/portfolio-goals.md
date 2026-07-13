# Portfolio & Learning Goals

**Status:** Draft (2026-07-13).

> This document is deliberately **separate** from `docs/product/`. The product documentation is
> written as if for a real healthcare product; this document records the project's real-world purpose
> as a portfolio and learning exercise. Keeping the two apart keeps the product docs authentic.

## Why this project exists

PROM Intake is a portfolio-quality healthcare SaaS application whose purpose is to demonstrate the
skills required of a Full Stack Engineer working with Medplum and FHIR, and to build the author's
practical experience with Medplum, clinical workflows, and the surrounding ecosystem. It is **not**
intended to become a commercial product or startup.

The product is nonetheless designed and documented as if it were real, because doing so is itself the
demonstration.

## Skills this project is meant to demonstrate

- **Medplum** - modeling clinical data and workflows on the Medplum platform.
- **FHIR modeling** - Questionnaire, QuestionnaireResponse, Observation, and related resources used
  idiomatically rather than as a bespoke schema.
- **Clinical workflows** - a real triage/worklist loop with a defensible patient-safety boundary.
- **Patient data management** - assignment, response capture, and structured clinical records.
- **React** - the Care Coordinator dashboard/Worklist and the patient-facing completion flow.
- **Node.js / TypeScript** - scoring and workflow logic.
- **AWS / cloud deployment** - the application deployed to the cloud with CI/CD.
- **Research & discovery** - primary-source verification of clinical facts (see
  [`docs/research/`](../research/)).
- **Spec-driven development** - the full workflow in
  [`docs/workflows/OPERATING_MANUAL.md`](../workflows/OPERATING_MANUAL.md): product docs -> architecture
  -> reviewed spec -> vertical-slice tickets -> fresh-session implementation -> review -> merge.
- **AI-assisted development** - the above executed with AI agents as a first-class part of the
  process.

## Learning objectives

- Prove a **generic PROM engine**: adding GAD-7 (or another instrument) is a configuration exercise,
  with no architectural change - the strongest single signal that the design is sound.
- Exercise the **end-to-end tracer bullet** (assign -> complete -> score -> flag -> worklist -> resolve)
  before thickening any one layer.
- Keep a **clean audit and documentation trail** as a demonstration of engineering discipline.

## What "portfolio success" looks like

- The end-to-end PHQ-9 flow works in a deployed environment and can be demoed.
- A second instrument can be added without touching the core architecture.
- The repository tells a coherent story: product docs, architecture, ADRs, specs, tickets, PRs, and
  tests all consistent with the Operating Manual.

## Related

- Product goals & metrics (kept separate on purpose): [`docs/product/goals-and-metrics.md`](../product/goals-and-metrics.md)
- Operating Manual: [`docs/workflows/OPERATING_MANUAL.md`](../workflows/OPERATING_MANUAL.md)
