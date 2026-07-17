# Testing Strategy

**Status:** Accepted (v1) - 2026-07-13. Seam decisions: [ADR-0008](../adr/0008-integration-tests-against-real-medplum.md);
module seams: [`module-boundaries.md`](module-boundaries.md).

## Principles
- Tests exercise behaviour **through a module's interface (its seam)**, not its internals. See
  `.agents/skills/codebase-design/DEEPENING.md`.
- Prefer the **highest seam** that still isolates the behaviour under test.
- `/implement` uses TDD at pre-agreed seams; `/diagnosing-bugs` writes a regression test at the
  correct seam *before* the fix.
- **Medplum is a core dependency, so its integration points are tested against a real Medplum test
  project, never a mocked FHIR server** ([ADR-0008](../adr/0008-integration-tests-against-real-medplum.md)).

## Test levels
| Level | Scope | Runs where |
| ----- | ----- | ---------- |
| Unit | single deep module via its interface (pure domain logic) | every commit |
| Integration | modules + **real Medplum** (Subscriptions, Bots, ETags, AccessPolicy) | CI |
| UI (component) | React components in the client apps, in **jsdom** | every commit |
| E2E | the tracer-bullet user flow | CI / pre-release |

The vitest runner has **three projects** ([ADR-0010](../adr/0010-frontend-architecture.md)):
`unit` and `integration` run in the node environment (keeping the domain pyramid DOM-free);
`ui` runs the client apps' `src/apps/**/*.test.tsx` in jsdom with `@testing-library/react`.
Browser-**E2E** tooling (Playwright etc.) is **deferred** to the tracer-bullet E2E ticket - it is
not decided against the one-screen app foundation (#28).

### Seam assignment
| Behaviour | Level | Seam |
| --------- | ----- | ---- |
| Worklist ordering (FR-24/25) | Unit | `PriorityPolicy.order(flags)` - all orderings, pure |
| Scoring + Trigger evaluation (instrument-agnostic) | Unit + Integration | Scoring engine `score(response, config)`; drive PHQ-9 **and** a synthetic 2nd Instrument via config only |
| Score Observation emitted (FR-32) | Integration | Subscription -> Bot -> Observation against real Medplum |
| Flag raised per fired Trigger (severity band, acute-risk Item 9) | Unit + Integration | scoring seam asserts which Flags; integration asserts Flag `Task` persisted |
| Worklist lists unresolved Flags (Open + Acknowledged), ranked across state (FR-23/25/26) | Unit + Integration | `PriorityPolicy` unit; Worklist query returns Open + Acknowledged |
| Single-owner Acknowledge race (FR-26) | Integration | Worklist service concurrent claim -> one owner + `FlagAlreadyClaimed`; real `If-Match` |
| Resolve a Flag with a structured reason (FR-27/28/30) | Integration | Worklist service `resolve` -> reason + note + `executionPeriod.end` + `Provenance`; dropped from `listWorklist`; history retained; `other` requires a note; `already-resolved` on a second resolve |
| Access link issue/validate/consume (FR-6/7/8/11) | Integration | issue -> open -> submit(consume); single-use, expiry, invalid token; `publicWebhook` Bot |
| Assignment lifecycle Pending/Completed/Expired (FR-9) | Integration | Assignment module transitions |
| Tracer bullet (landed #23) | E2E | assign -> open link -> submit -> score -> flag -> worklist -> acknowledge -> resolve, composed from the module entry points against real Medplum (`src/e2e/tracer-bullet.integration.test.ts`); asserts each step's domain outcome |

## What makes a good test here
- Test at the **domain interface**: assert domain outcomes (e.g. `FlagAlreadyClaimed`), not HTTP
  status codes or FHIR resource internals.
- The scoring engine tests must be **instrument-agnostic** - proving "add GAD-7 = config" means a
  second, synthetic Instrument drives the same engine with no code change.
- No testing of private FHIR shapes directly; no snapshot-only assertions.
- Integration tests provision/seed a **real Medplum test project** (CI concern - see
  [`cicd.md`](cicd.md)); pure logic stays off-server to keep the pyramid healthy.
- The **Crisis Response** (FR-15) is client-side UI behaviour - tested at the client seam, asserted
  to create **no** server resource (guarding the FR-15/FR-20 separation).

## Verification
Manual verification of user-facing changes uses the `/verify` skill (run the app, observe
behaviour) before merge - the tracer-bullet flow above is the canonical thing to observe. For the
**client apps** (`src/apps/`), the repo's browser recipe is the **`verifier-ui`** skill
(`.agents/skills/verifier-ui/`): it drives the Vite/React surface in a real browser against local
Medplum, logs in via built-in auth (`npm run medplum:dev-user`), and carries the auth-flow checklist
(gate -> authenticated -> refresh persists -> logout -> no session resurrection). Browser tooling is
installed ephemerally per session (Playwright stays out of `package.json` until the E2E ticket, per
[ADR-0010](../adr/0010-frontend-architecture.md)).
