# Problem Statement

**Status:** Draft - Product Discovery in progress (2026-07-13).

## The problem

Care Coordinators are responsible for catching patients whose condition is deteriorating - but the
standardized measures that would reveal it (PROMs such as PHQ-9) arrive as **paper forms or free-text
messages that a human must read, hand-score, interpret against clinical cutoffs, and prioritize**.
That manual pipeline is slow, error-prone, and unevenly applied under load. Two failures follow
directly from it:

1. **Missed high-risk patients.** A patient can report active suicidal ideation on a single item
   while their total score looks unremarkable. Hand-scoring that watches only the total - or that
   simply falls behind - can silently miss exactly the patient who most needs attention.
2. **Wasted coordinator time.** Coordinators spend scarce clinical time transcribing and adding up
   questionnaires and re-reading ones that turned out to be fine, instead of acting on the few
   patients who genuinely need them.

There is no shared, trustworthy view of "who needs attention right now, and why," so prioritization
lives in individual coordinators' heads and paper piles.

## Who has it

- **Primary:** the **Care Coordinator** (see [`CONTEXT.md`](../../CONTEXT.md)) - the clinical staff
  member accountable for reviewing incoming PROMs and following up. The pain is theirs: the manual
  labor, the cognitive load, and the risk of a miss.
- **Affected:** the **patient**, whose deterioration may go unnoticed or whose acute-risk disclosure
  may not be met with timely follow-up; and the **care organization**, which carries the clinical and
  reputational risk of a missed high-risk result.

## Why now

- PROMs are increasingly expected in value-based and behavioral-health care, so the volume of
  standardized measures a coordinator must process is rising.
- FHIR-native platforms (Medplum) now make it practical to model instruments, responses, scores, and
  alerts as first-class interoperable clinical data rather than rows in a bespoke database - so the
  automation can be built on standards instead of glue.

## Current alternatives and their gaps

| How coordinators cope today | Where it falls short |
| --------------------------- | -------------------- |
| Paper questionnaires, hand-scored | Slow, transcription errors, no audit trail, easy to fall behind |
| Free-text / email / phone responses | Unstructured, not comparable over time, no automatic scoring |
| Generic form tools (surveys) | Capture answers but don't score clinically, don't watch critical items, don't produce a prioritized worklist |
| Spreadsheets to track follow-up | No safety logic, no shared state, "who's handling this" lives in someone's memory |

None of these guarantee that a positive acute-risk item is surfaced, that scores are computed
consistently, or that the highest-risk patient is at the top of a shared, working list.

## Evidence

- **Instrument design itself supports the problem.** PHQ-9's own scoring manual treats Item 9 (self-harm
  ideation) as warranting follow-up on *any* positive response, independent of the total score (see
  [`docs/research/phq-9-scoring-and-interpretation.md`](../research/phq-9-scoring-and-interpretation.md)).
  A total-only manual process structurally under-serves this case.
- **This is a portfolio/practice project**, so the evidence base is the published clinical literature
  and instrument documentation rather than first-party user research. That framing is stated openly in
  [`docs/project/portfolio-goals.md`](../project/portfolio-goals.md); the product itself is designed as
  if for a real care organization.

## Related

- Vision: [`vision.md`](vision.md)
- Goals & metrics: [`goals-and-metrics.md`](goals-and-metrics.md)
- Domain glossary: [`CONTEXT.md`](../../CONTEXT.md)
