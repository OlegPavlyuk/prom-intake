# Target Users & Journeys

**Status:** Draft - Product Discovery in progress (2026-07-13).

Domain terms are defined in [`CONTEXT.md`](../../CONTEXT.md).

## Personas

### Persona: Nadia - Care Coordinator (primary user)

- **Role / context:** Clinical staff member at a care organization, part of a small team of
  coordinators who share responsibility for a population of patients. Works within an existing care
  relationship - she is not the patient's therapist, but she watches for who needs escalation.
- **Goals:** Never miss a patient in crisis or clinically deteriorating; spend her limited time on
  the patients who need follow-up, not on paperwork; trust that the "who needs attention" list is
  complete and current, even when a colleague is also working it.
- **Frustrations:** Hand-scoring questionnaires; re-reading forms that turn out fine; the nagging
  fear that a high-risk answer slipped past in the pile; no shared view of who's already been handled.

### Persona: Ben - Patient (source of clinical information)

- **Role / context:** A patient already under the organization's care, asked to complete a PHQ-9
  between contacts. Not a primary customer of the product; interacts with it briefly and rarely.
- **Goals:** Complete the questionnaire quickly and privately; know his answers reach his care team.
- **Frustrations:** Clunky forms, logins, uncertainty about whether anyone will see a worrying answer.

## User journeys

### Journey 1: Coordinator assigns an Instrument (Nadia)

1. Nadia signs in (FR-31) and selects an existing patient, Ben (FR-12).
2. She creates an **Assignment** of the PHQ-9 Instrument to Ben (FR-5).
3. The system produces a unique, expiring **Access link** (FR-6, FR-7); the Assignment is **Pending**
   (FR-9). She shares the link with Ben.

### Journey 2: Patient completes the Instrument (Ben)

1. Ben opens the Access link - no account, no login (FR-13).
2. He answers the items. He must answer all 9 before he can submit (FR-14).
3. **Safety branch:** if he gives a positive answer to Item 9, the **Crisis Response** appears
   immediately with crisis resources - whether or not he goes on to submit (FR-15).
4. He submits. The link is consumed (FR-8); the Assignment becomes **Completed** (FR-9). If he
   returns to the link later, he sees a friendly "no longer valid" page (FR-11).

### Journey 3: The system scores and flags (automatic)

1. On submission, the **Score** is computed automatically (FR-3).
2. Every **Trigger** on the Instrument is evaluated (FR-17, FR-21): the severity-band trigger (total
   >= 10, FR-18) and the acute-risk trigger (Item 9 >= 1, FR-20).
3. Each fired Trigger raises a **Flag**, recording why it fired (FR-22). No human scoring occurred.

### Journey 4: Coordinator works the Worklist (Nadia)

1. Nadia opens the **Worklist** - a shared list of unresolved Flags, ordered by Priority Rules:
   acute-risk first, then severity, oldest **Open** first (FR-23, FR-24, FR-25).
2. Ben's acute-risk Flag is at the top. She opens it and sees the clinical signal: identity,
   Instrument + submission time, total Score + band, the fired Triggers (acute-risk highlighted), and
   the item answers including Item 9 (FR-29).
3. She **Acknowledges** the Flag - her colleagues now see she owns it (FR-26). It stays visible but
   ranked as claimed.
4. She follows up with Ben, then **Resolves** the Flag, choosing a **Resolution reason** ("Contacted
   patient") with an optional note (FR-27, FR-28). It leaves the active Worklist; the history is
   retained (FR-30).

### Journey 5 (near-future, not v1): a second Instrument

A future coordinator configures GAD-7 - items, scoring, a severity-band trigger - as data only. No
engine changes (FR-4, NFR-2). This journey is the proof that the platform is generic, and is
deliberately *out* of v1 build scope.

## Related

- Requirements: [`requirements.md`](requirements.md)
- Vision: [`vision.md`](vision.md)
- Glossary: [`CONTEXT.md`](../../CONTEXT.md)
