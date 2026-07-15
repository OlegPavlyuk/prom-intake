# Module Boundaries

**Status:** Accepted (v1) - 2026-07-13.

This project favours **deep modules** (a lot of behaviour behind a small interface). Vocabulary and
principles: `.agents/skills/codebase-design/SKILL.md`. Every module below hides its FHIR/Medplum
implementation behind a domain interface that speaks [CONTEXT.md](../../CONTEXT.md) terms - callers
never touch `Task`, `Observation`, or tokens directly.

## Boundaries

| Module | Interface (public, domain) | Hides (private) | Seam |
| ------ | -------------------------- | --------------- | ---- |
| **Instrument** | load an Instrument's definition + config; expose scoring weights, severity bands, Trigger definitions | `Questionnaire` + SDC `itemWeight`; `InstrumentConfig` store | "load config for Instrument", "weights/bands/triggers for Instrument" |
| **Assignment** | create / complete / expire an Assignment; query by patient/status | Assignment `Task` (`code=assignment`) mapping; lifecycle <-> `status`/`businessStatus` | create -> complete -> expire transitions |
| **Access link** | issue token for an Assignment; validate + consume on submit; audit | hashed-token resource, expiry/single-use logic, `publicWebhook` Bot | issue -> open -> submit(consume) -> expired/invalid |
| **Scoring engine** (Bot) | given a submitted Response + Instrument config -> Score + Flags | Subscription->Bot wiring, `getQuestionnaireAnswers`, idempotent creates, **`ObservationEmitter`** (internal output adapter -> `Observation`) | score(response, config) -> Observation(s) + Flag(s) |
| **`PriorityPolicy`** | order a set of Flags per FR-24/25, ranking across Open **and** Acknowledged state | pure domain logic (no FHIR) | order(flags) -> ordered list |
| **Worklist / Flag service** | list **unresolved Flags (Open + Acknowledged)** via `PriorityPolicy`; acknowledge; resolve(reason,note) | Flag `Task` (`code=flag`), `If-Match` claim, `412` -> `FlagAlreadyClaimed`, resolution mapping | list / acknowledge / resolve; concurrent-claim outcome |

**Notes**
- `ObservationEmitter` is an **internal strategy of the Scoring engine**, not a standalone module -
  it translates scoring results into `Observation`s and is the additive seam for future panel/
  item-level Observations.
- **Scoring engine scope today:** the **pure kernel** landed (#18) as `score(response, instrument)`
  in the `domain` package - it sums SDC `itemWeight` into a total, evaluates the Triggers, and
  returns the Score, the Score Observation model(s) (via the `ObservationEmitter`), and the Flag
  domain object(s) to raise (Open, `authoredOn`, trigger refs). It is instrument-agnostic (PHQ-9 and
  a synthetic second Instrument drive it via config only; FR-4/NFR-2) and holds **no** FHIR/Bot
  wiring. The Subscription -> Bot adapter that persists those results idempotently **landed (#19)** as
  the `scoring` package's `scoreResponse` (called by `src/packages/scoring/bot.ts`, a thin adapter):
  it resolves the Instrument from the Response's `Questionnaire`, runs the pure kernel, always upserts
  the Score `Observation` (conditional create on `derivedFrom` + LOINC code; FR-32), raises a Flag
  per fired Trigger via the Flag module, and re-asserts Assignment completion via the Assignment
  module - all idempotent under at-least-once redelivery
  ([ADR-0009](../adr/0009-bots-as-adapters-over-shared-domain-logic.md)). The Access-link submit path
  completes the Assignment on the fast path (#17); the Scoring Bot's completion is the recovery if
  that best-effort step did not land. Mapping the raised Flag domain object to a Flag `Task` stays the
  Flag module's concern ([ADR-0002](../adr/0002-flag-as-fhir-task.md)).
- **Worklist / Flag service scope today:** the module (`worklist` package) owns the Flag `Task`
  (`code=flag`). #19 landed its **Flag-creation seam** only - `raiseFlag`, an idempotent conditional
  create keyed on the (Response, Trigger) origin, which the Scoring Bot calls to raise a Flag without
  ever building a `Task` inline ([ADR-0002](../adr/0002-flag-as-fhir-task.md)/
  [ADR-0009](../adr/0009-bots-as-adapters-over-shared-domain-logic.md)). Listing via `PriorityPolicy`,
  `acknowledge`, and `resolve` are later slices (#20/#21+).
- The Access link is delivery only; the durable Assignment lives in the Assignment module
  ([ADR-0001](../adr/0001-assignment-as-fhir-task.md)). Swapping delivery channels never touches the
  domain.
- **`terminology`** (shared, non-feature package) owns the project-wide FHIR reference data used by
  more than one module: the project-owned canonical URLs / CodeSystem coordinates (`task-code`,
  `flag-status`, `assignment-status`, `resolution-reason`, `basic-type`, `instrument-key`) and the
  `CodeSystem` seed (`seedCodeSystems`). It exists so a shared identifier has one home (P8) rather
  than being duplicated across the Instrument, Assignment, Access-link, and Worklist modules. It
  holds no feature logic; module-specific identifiers (an Instrument's config extensions, the
  Access-link token's extensions) stay private to their own module.
- **Access link scope today:** `issue`, read-only `validate`/`open`, and single-use
  `submit`(consume) are all implemented (#17). `submit` burns the token via an optimistic-lock
  compare-and-swap (`If-Match`), then creates the `QuestionnaireResponse` and completes the
  Assignment; Medplum transaction Bundles are **not** atomic on a failed precondition, so the CAS
  burn is the race gate and a failed create is compensated by reverting the burn (see
  [ADR-0005](../adr/0005-access-link-security-model.md) and the submit Bot's module note). The
  `publicWebhook` Bot (`src/packages/access-link/bot.ts`) is a thin adapter over `openAccessLink` /
  `submitAccessLinkResponse`; deployment is in [infrastructure.md](infrastructure.md).

## Dependency rules

_Which modules may depend on which. In a TypeScript monorepo these rules are enforced by
dependency-cruiser via the `/setup-ts-deep-modules` skill (entry-point boundary, no cycles)._

- `PriorityPolicy` depends on nothing (pure). The **Worklist/Flag service** depends on
  `PriorityPolicy`.
- The **Scoring engine** depends on **Instrument** (for config) and raises Flags by calling the
  **Flag module's exported Flag-construction function**, and marks the Assignment complete via the
  **Assignment module's** function - never by building a `Task` inline.
- The **Access link** depends on **Assignment** (the token binds to an Assignment, and `submit`
  completes it) and on **Instrument** (to re-check completeness server-side and build the
  `QuestionnaireResponse` on submit; #17). It composes both through their entry points, never by
  building their resources inline (ADR-0009).
- No module reads another module's FHIR resources directly; cross-module access is through the
  domain interface only.
- The **client apps** (`src/apps/`, [ADR-0010](../adr/0010-frontend-architecture.md)) sit at the
  **top** of the graph: they import module entry points and pass a `MedplumClient` in (the
  authenticated `useMedplum()` client in the Coordinator app), exactly like any other consumer -
  the deep-module seam is unchanged. Nothing in `src/packages/**` may depend on `src/apps/**` or on
  React/DOM; the two apps may not import each other. Enforced by dependency-cruiser.
- **Delivery layer.** `issueAccessLink` returns a raw token, not a URL; the **Coordinator app**
  assembles the patient-facing Access link from it. This keeps the Access-link module
  delivery-agnostic - a future SMS/email/portal channel never touches it.

### Bots are adapters ([ADR-0009](../adr/0009-bots-as-adapters-over-shared-domain-logic.md))

Medplum Bots are separately-deployed runtime units, not a place for business rules. Domain logic
(Flag construction, Assignment completion, scoring, Trigger evaluation, Observation emission) is
exported as **pure functions in a shared package** that both the app services and the Bots import. A
Bot unpacks the FHIR event, calls the shared function(s), and persists the result (with idempotent
conditional creates). "Only module X writes resource Y" holds **including inside Bots** - the Bot
invokes the module's function rather than constructing the resource itself.

## Test seams

The agreed seams where behaviour is tested through the interface (see
[`testing-strategy.md`](testing-strategy.md)):

- `PriorityPolicy.order(flags)` - pure unit tests (richest coverage; all FR-24/25 orderings).
- Scoring engine `score(response, config)` - given answers + config, assert Observations + which
  Flags are raised (severity band, acute-risk Item-9). Instrument-agnostic: PHQ-9 and a synthetic
  second Instrument both drive it via config only.
- Worklist/Flag service `acknowledge` - assert single-owner claim and the `FlagAlreadyClaimed`
  outcome under a concurrent race.
- Access link `issue/validate/consume` - single-use, expiry, invalid-token, atomic consume-on-submit.
- Assignment lifecycle transitions.
