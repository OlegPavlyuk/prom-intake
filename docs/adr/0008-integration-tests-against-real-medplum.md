---
status: accepted
date: 2026-07-13
---

# Integration tests run against a real Medplum, not a mocked FHIR server

Every Medplum/FHIR integration point is validated against a **real Medplum test project**, not a
mocked FHIR server. Pure domain logic (e.g. `PriorityPolicy`, scoring math) is covered by unit
tests through its interface; anything that touches Medplum (Subscription -> Bot wiring, Observation/
Flag creation, `publicWebhook` submission + token consume, `If-Match` claim races) is exercised
against the real server.

## Why

- Medplum is a **core dependency**, not an incidental one - the architecture leans on server
  behaviours (Subscriptions firing Bots, resource versioning/ETags for concurrency, `AccessPolicy`
  scoping, conditional creates). Mocking the FHIR server would mock away exactly the behaviour under
  test and yield false confidence.
- Several of our decisions rest on precise server semantics (ADR-0004 Subscription->Bot, ADR-0005
  `publicWebhook` + scoped `AccessPolicy`, ADR-0006 `If-Match` concurrency). Only a real server
  proves them.

## Trade-off

Real-server integration is slower and needs a provisioned test project in CI (infra cost) versus the
common "mock the FHIR client" default. Accepted: the confidence gain on a Medplum-centric product
outweighs the speed cost, and the test pyramid stays healthy because pure logic is still unit-tested
off-server.

## Consequences

- CI must provision/seed a Medplum test project (detailed in `docs/architecture/cicd.md` and
  `infrastructure.md` when implemented).
- Test-seam assignment is recorded in `docs/architecture/testing-strategy.md`.
