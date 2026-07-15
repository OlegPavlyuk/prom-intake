# Event / Async Flows

**Status:** Accepted (v1) - 2026-07-13.

The one async path in v1 is **submit -> score -> flag**, driven by a Medplum Subscription firing a
Bot ([ADR-0004](../adr/0004-scoring-and-trigger-engine.md)).

## Transport

Medplum **Subscription** (FHIR subscription) on `QuestionnaireResponse` creation invokes the Scoring
Bot. Delivery is **at-least-once** - the Bot may fire more than once, so it must be idempotent.

## Events

| Event | Producer | Consumers | Payload |
| ----- | -------- | --------- | ------- |
| `QuestionnaireResponse` created | `publicWebhook` submit Bot (after atomic token consume) | Scoring Bot (via Subscription) | the `QuestionnaireResponse` |
| Score `Observation` created | Scoring Bot | analytics / coordinator views | `Observation` (LOINC `44261-6`, `derivedFrom` QR) |
| Flag `Task` created | Scoring Bot (when a Trigger fires) | Worklist | `Task` `code=flag` referencing the Response/Observation and Trigger |

## Submit -> score -> flag

```mermaid
sequenceDiagram
  participant P as Patient page
  participant SB as publicWebhook submit Bot
  participant F as FHIR store
  participant Sub as Subscription
  participant Score as Scoring Bot
  P->>SB: token + answers
  SB->>SB: validate token hash, check unused/unexpired
  SB->>F: atomically consume token + create QuestionnaireResponse
  F->>Sub: QuestionnaireResponse created
  Sub->>Score: invoke with QR
  Score->>Score: getQuestionnaireAnswers; load InstrumentConfig; compute Score
  Score->>F: upsert Score Observation (always - FR-32)
  Score->>Score: evaluate each Trigger (severity band, acute-risk Item 9)
  Score->>F: upsert Flag Task per fired Trigger (conditional)
  Score->>F: re-assert Assignment completion (idempotent; ADR-0009)
```

The Scoring Bot re-asserts Assignment completion via the Assignment module (idempotent). The submit
Bot completes the Assignment on the fast path ([ADR-0005](../adr/0005-access-link-security-model.md));
this is the recovery the Access-link module relies on if that best-effort step did not land - a
`QuestionnaireResponse` proves the Response is stored, so its Assignment must reach Completed.

## Idempotency & retries

The Scoring Bot uses **conditional creates / upserts** keyed on `derivedFrom` + code so a redelivered
event never double-writes an Observation or a duplicate Flag. Token consumption is **atomic** with
`QuestionnaireResponse` creation in the submit Bot, preventing double submissions
([ADR-0005](../adr/0005-access-link-security-model.md)).

## Implemented (#19)

The Scoring Bot (`src/packages/scoring/bot.ts`) is a thin adapter over the `scoring` module's
`scoreResponse`, and the Subscription (`criteria: QuestionnaireResponse`, `channel` -> the Bot) is
created by `npm run medplum:deploy-bots` (see [infrastructure.md](infrastructure.md)). The criteria
stays instrument-agnostic - the Bot resolves the Instrument from the Response's `Questionnaire` and
no-ops any it cannot score, so a further Instrument needs no Subscription change. The always-writes,
per-Trigger, and idempotent-redelivery behaviour is covered by the integration seam
(`src/packages/scoring/tests/scoring.integration.test.ts`).

## Not async (deliberately)

The **Crisis Response** (FR-15) is a synchronous client-side UI reaction to an acute-risk answer -
it emits no event and creates no resource, kept independent of the server-side acute-risk Flag.
