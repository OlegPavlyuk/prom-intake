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
- **Access link scope today:** `issue` + read-only `validate` are implemented. The single-use
  `consume`-on-submit burn (atomic with `QuestionnaireResponse` creation, via the `publicWebhook`
  Bot) lands with the submit ticket; until then no submit path is wired, so the read-only validate
  carries no single-use exposure.

## Dependency rules

_Which modules may depend on which. In a TypeScript monorepo these rules are enforced by
dependency-cruiser via the `/setup-ts-deep-modules` skill (entry-point boundary, no cycles)._

- `PriorityPolicy` depends on nothing (pure). The **Worklist/Flag service** depends on
  `PriorityPolicy`.
- The **Scoring engine** depends on **Instrument** (for config) and raises Flags by calling the
  **Flag module's exported Flag-construction function**, and marks the Assignment complete via the
  **Assignment module's** function - never by building a `Task` inline.
- The **Access link** depends on **Assignment** (the token binds to an Assignment).
- No module reads another module's FHIR resources directly; cross-module access is through the
  domain interface only.

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
