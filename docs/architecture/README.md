# Level 2 - Engineering Documentation (HOW)

Documentation intended for **implementation** - how we build the product. Audience is engineers and
implementing agents.

| File | Covers |
| ---- | ------ |
| `overview.md` | System context + container view (C4-style), tech stack, key flows |
| `module-boundaries.md` | Deep-module boundaries, seams, and dependency rules |
| `api-conventions.md` | API style, versioning, error shape, auth |
| `data-model.md` | Persistence model, schemas, migrations, ownership |
| `event-flows.md` | Asynchronous flows, messages/events, ordering guarantees |
| `observability.md` | Logging, metrics, tracing, alerting |
| `security.md` | Threat model, authn/authz, secrets, data protection/compliance |
| `infrastructure.md` | Environments, cloud resources, IaC |
| `cicd.md` | Pipelines, gates, deployment strategy |
| `testing-strategy.md` | Test pyramid, seams, what "a good test" means here |

**Decisions vs description:** these files describe the *current* HOW. When a choice is hard to
reverse, surprising, or a real trade-off, it also gets an **ADR** in `docs/adr/`. Do not restate the
domain glossary here - link to `CONTEXT.md`.

These start as skeletons; fill `overview.md`, `testing-strategy.md`, and any relevant convention docs
before the first feature is implemented (architecture precedes feature specs).
