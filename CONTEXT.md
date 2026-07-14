# CONTEXT - Domain Glossary (Ubiquitous Language)

> Single source of truth for this project's domain vocabulary. Every issue title, spec, test
> name, and code identifier should use the canonical terms defined here.
>
> **Maintenance:** this file is grown *lazily* by the `/domain-modeling` skill (reached via
> `/grill-with-docs` and `/improve-codebase-architecture`) as terms actually get resolved during
> design work. Do not pre-invent terminology. See `docs/agents/domain.md` for how skills consume it.
>
> Format reference: `.agents/skills/domain-modeling/CONTEXT-FORMAT.md`.

## Language

The PROM Intake platform lets a Care Coordinator collect standardized patient self-reports,
turns them into scored clinical signals, and surfaces the patients who need attention. These are
the terms that carry that meaning. Definitions here are intentionally instrument-agnostic - PHQ-9
is only the first Instrument, and no PHQ-9-specific numbers belong in this glossary.

### Instruments and responses

**PROM (Patient-Reported Outcome Measure)**:
A patient's self-reported assessment of their own health, symptoms, or wellbeing, captured through
a standardized Instrument.
_Avoid_: survey, poll.

**Instrument**:
A standardized, validated PROM definition - its items (questions), answer options, and scoring
rules (e.g. PHQ-9). The reusable template, not any one patient's answers.
_Avoid_: form, test, survey; "questionnaire" when the generic measure is meant.

**Response**:
One patient's completed answers to one Instrument at one point in time.
_Avoid_: submission, result, answer set.

**Assignment**:
The record of a Care Coordinator giving a specific Instrument to a specific patient to complete - the
core domain concept, independent of how it is delivered. In v1 an Assignment is one-off (one expected
Response) and moves through a lifecycle: **Pending** (awaiting a Response), **Completed** (Response
submitted), **Expired** (lapsed unused).
_Avoid_: invite, task, order.

**Access link**:
The unique, expiring, single-use URL that is v1's **delivery mechanism** for an Assignment - it lets
an assigned patient open and complete their Instrument without a full patient account. The Access
link is how an Assignment reaches the patient today; future channels (patient portal, SMS, email)
would deliver the same Assignment without changing the domain model.
_Avoid_: magic link, invite link, token (the token is what makes the link work, not the link).

**Score**:
The numeric result computed from a Response according to its Instrument's scoring rules.
_Avoid_: result, rating, grade.

### Risk detection

**Trigger**:
A rule attached to an Instrument that inspects a Response and, when its condition is met, raises a
Flag. An Instrument may define several.
_Avoid_: rule, alert condition; "threshold" (a threshold is one input to a Trigger, not the Trigger).

**Severity-band trigger**:
A Trigger whose condition is that the total Score falls within a configured band (e.g. a "severe"
band).
_Avoid_: score alert.

**Critical-item trigger**:
A Trigger whose condition is met by a specific answer to a specific item, independent of the total
Score.
_Avoid_: question alert, item flag.

**Acute-risk trigger**:
A Critical-item trigger that denotes immediate patient safety risk (e.g. self-harm intent). Beyond
raising a Flag, it drives an immediate patient-facing Crisis Response.
_Avoid_: emergency trigger, red alert.

### Coordinator workflow

**Care Coordinator**:
The clinical staff member who assigns Instruments to patients, monitors incoming Flags via the
Worklist, and works each Flag to resolution. The product's primary user.
_Avoid_: nurse, clinician, provider, admin (when this specific role is meant).

**Flag**:
A work item raised when a Trigger fires on a Response, representing a patient who needs the Care
Coordinator's attention. A Flag is worked through a lifecycle - **Open** (unclaimed, on the
Worklist), **Acknowledged** (claimed by a coordinator, being worked), **Resolved** (completed and
off the active Worklist) - not merely displayed.
_Avoid_: alert, notification, task (these imply a push or a fire-and-forget signal).

**Resolution reason**:
The structured, predefined category a coordinator selects when resolving a Flag (e.g. "contacted
patient", "no action needed"), optionally accompanied by a free-text note. It records *why* a Flag
left the Worklist, so the reason - not just the fact of resolution - is retained.
_Avoid_: disposition, outcome, status.

**Worklist**:
The Care Coordinator's prioritized list of unresolved Flags - the operational heart of the
coordinator dashboard.
_Avoid_: queue, inbox; "dashboard" (the dashboard is the screen that presents the Worklist).

**Crisis Response**:
The immediate, informational-only message shown to a patient the moment they give a positive answer
to an Acute-risk item - before and independent of submitting the Response - directing them to
emergency/crisis resources. It does not notify staff, dispatch help, or provide real-time
intervention. (The coordinator-facing Flag, by contrast, is raised only when the Response is
submitted.)
_Avoid_: intervention, escalation, emergency response.

### Client surfaces

**Coordinator app**:
The authenticated frontend the Care Coordinator uses to assign Instruments and work the Worklist.
The only surface behind a login (Medplum built-in auth); it also acts as the delivery layer that
turns an issued Access link token into the patient-facing URL.
_Avoid_: dashboard (the dashboard is one screen within it), admin panel, portal.

**Patient completion page**:
The account-less, PHI-minimal frontend a patient reaches through an Access link to complete one
Instrument. It renders only the blank Instrument (no patient or clinical data) and submits through
the `publicWebhook` Bot - a separate surface from the Coordinator app, never holding a coordinator
session.
_Avoid_: patient portal, form page, survey page.

## Relationships

- An **Instrument** defines zero or more **Triggers**.
- A **Care Coordinator** creates an **Assignment** of an **Instrument** to a patient, delivered via
  an **Access link**; the patient uses it to produce one **Response**.
- A **Response** is one patient's completed **Instrument**; scoring it produces a **Score**.
- A **Trigger** evaluates a **Response** and may raise a **Flag**.
- The **Worklist** is the set of unresolved **Flags** awaiting the **Care Coordinator**.
- An **Acute-risk trigger** additionally produces a **Crisis Response** shown to the patient.
- The **Care Coordinator** works in the **Coordinator app**; the patient completes their Instrument
  in the **Patient completion page**, reached via the **Access link**.
