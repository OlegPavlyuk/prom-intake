> Produced by the `/research` skill on 2026-07-13. Investigated against primary sources only (official Medplum docs at medplum.com/docs, Medplum's `medplum-demo-bots` repo, the HL7 FHIR R4 spec, and the HL7 Structured Data Capture (SDC) Implementation Guide). Every claim is traced inline to the source that owns it; see [Sources](#sources) for URLs. Domain terms follow [`CONTEXT.md`](../../CONTEXT.md); clinical facts defer to [`phq-9-scoring-and-interpretation.md`](phq-9-scoring-and-interpretation.md).

# Medplum + FHIR Architecture for a PROM Intake Platform

Research notes feeding the architecture phase. The goal is **idiomatic Medplum usage** and **clean, extensible module seams** - not FHIR maximalism. Where Medplum has an established pattern we adopt it; where it does not, this doc says so explicitly so we know we are inventing.

---

## 0. Executive summary

- **The end-to-end PROM loop maps cleanly onto Medplum's documented pattern:** a `Questionnaire` is the Instrument, a `QuestionnaireResponse` is the Response, a **Bot** triggered by a **Subscription** scores it and writes `Observation`s, and downstream work is tracked with `Task`. Medplum documents each of these as its own recommended way. [Medplum parse], [Medplum bot-qr], [Medplum tasks]
- **Scoring belongs in a Bot, not `$extract`.** Medplum explicitly says: *"Clinical scoring instruments - use a Bot; the scoring algorithm is code, not a declarative template,"* naming PHQ-9/GAD-7/AUDIT-C. `$extract` is for straightforward field-to-resource mapping. [Medplum parse]
- **Our domain "Flag" is NOT the FHIR `Flag` resource.** FHIR `Flag` has only `active | inactive | entered-in-error`, no owner, and no structured resolution - it cannot carry our Open -> Acknowledged -> Resolved lifecycle, single owner, resolution reason, or priority. The idiomatic carrier is **`Task`**, which Medplum documents as *the* worklist/queue primitive with `owner`, `priority`, `businessStatus`, and `focus`. [FHIR Flag], [Medplum tasks], [Medplum task-apps]
- **The Assignment is also a `Task`** (the request-side task: "patient to complete this Instrument"), with `Task.focus` -> the `Questionnaire` and a `restriction.period.end` due date. `ServiceRequest` is available as an optional higher-level authorization but is not required for v1. [Medplum tasks], [Medplum workflow-patterns]
- **Score `Observation`s are produced in the Bot** using `getQuestionnaireAnswers()`, coded with the LOINC codes we already verified (total `44261-6`, panel `44249-1`). This satisfies FHIR/SDC's general recommendation to convert a QuestionnaireResponse into `Observation`s. [Medplum getanswers], [SDC extraction], [phq-9 research]
- **Account-less patient completion is the one genuine gap.** Medplum documents *open patient registration* (a real, full account) and an authenticated patient portal - but has **no documented "tokenized single-use link, no account" pattern**. Our Access link (FR-6/13) is something we will architect ourselves, most plausibly via a `publicWebhook` Bot behind a scoped `AccessPolicy`. Flagged as invented. [Medplum open-reg], [Medplum public-webhook]
- **Trigger evaluation runs in the same Bot as scoring** (one Subscription -> one Bot per submitted Response). Keeping scoring + trigger evaluation behind one seam, driven by per-Instrument configuration, is what makes "add GAD-7 = config, not engine change" (FR-4, NFR-2) achievable.

**One-line recommendation per hinge question:**
- **A (worklist Flag):** use FHIR **`Task`** (owner + priority + businessStatus + note), NOT FHIR `Flag`.
- **B (Assignment):** use FHIR **`Task`** with `focus` -> `Questionnaire` and a due date; skip `ServiceRequest` in v1.
- **C (scoring + triggers):** run both in a **Bot** fired by a **Subscription** on `QuestionnaireResponse`; emit LOINC-coded `Observation`s.
- **D (account-less completion):** Medplum has **no established pattern**; build a **`publicWebhook` Bot + scoped AccessPolicy + our own token store** and treat it as an invented, carefully-bounded seam.

---

## 1. Medplum's established PROM pattern (the happy path)

Medplum documents an end-to-end questionnaire workflow, and it lines up almost 1:1 with our domain:

| Our domain term | Medplum / FHIR resource | Medplum's stated role |
|---|---|---|
| Instrument | `Questionnaire` | The reusable form template; items carry `linkId`s that must be unique. [Medplum model] |
| Response | `QuestionnaireResponse` | What the patient submitted; links to the `Questionnaire` (canonical URL) and to the patient via `subject`. [Medplum model] |
| Score | `Observation` | Downstream resource derived from the response; *"From one form, create many Observation and DiagnosticReport resources."* [Medplum bot-qr] |
| Scoring/trigger engine | **Bot** (fired by **Subscription**) | *"Use a Bot when you need to score a PHQ-9... or otherwise do something that does not fit a declarative template."* [Medplum parse] |
| Assignment / Flag / Worklist | `Task` | *"The core of a workflow app is a queue or worklist - a list of tracking tasks."* [Medplum task-apps] |

The submission-to-processing wiring Medplum documents: the server creates a `QuestionnaireResponse`; a **Subscription** whose criteria match new `QuestionnaireResponse`s fires a **Bot**; the Bot receives the response as `event.input`, parses answers with `getQuestionnaireAnswers()` (a map keyed by `linkId`), and calls `medplum.createResource(...)` for each derived resource. [Medplum bot-qr], [Medplum getanswers]

The `medplum-demo-bots` repo shows this exact pattern in `patient-intake.ts`: it reads answers by `linkId`, creates a `Patient`, a `ServiceRequest`, and a `Communication` (`basedOn` the ServiceRequest) - the same shape our scoring Bot will use. [demo patient-intake]

---

## 2. When Medplum reaches for each resource

Traced from Medplum's own docs (not inferred):

- **`Questionnaire` / `QuestionnaireResponse`** - data capture. The `Questionnaire` is the template; `linkId`s must be unique within it; the response links back via the questionnaire canonical URL and `subject`. [Medplum model]
- **`Observation`** - the FHIR/SDC-recommended destination for values captured in a response; *"the general recommendation in FHIR is to use questionnaires for raw data capture but then to convert the resulting QuestionnaireResponse instances into other FHIR resources - Observations..."* [SDC extraction]
- **`Task`** - *"the basic building-block resource used to implement care plans and track workflow progress,"* and the primitive for queues/worklists. Carries a single `owner`, a `priority`, a `focus` (the resource being acted on, e.g. a `Questionnaire`), `restriction.period` (due date), `businessStatus` (custom stages), and `note`. [Medplum tasks], [Medplum task-apps]
- **`ServiceRequest`** - a *request/authorization* ("this needs to happen"), the "Swiss-Army-knife of clinical orders." It can be the higher-level authorization that a `Task` fulfils, linked by `Task.basedOn` / `Task.focus`. [Medplum workflow-patterns], [Medplum servicerequest]
- **`Flag`** - *"prospective warnings of potential issues when providing care."* Status is only `active | inactive | entered-in-error`; it has an optional `author` (creator, not owner) and no structured resolution. Deliberately narrow. [FHIR Flag]
- **`Communication`** - *"a conveyance of information from one entity... to another."* Medplum threads them (parent thread header + child messages via `partOf`). This is the messaging/notification primitive, not a work item. [Medplum comms], [Medplum comms-model]

FHIR's own workflow taxonomy (which Medplum teaches) splits resources into **Request** (intent: `ServiceRequest`), **Event** (what happened: `Observation`, `Communication`), and **Definition** (template: `Questionnaire`, `PlanDefinition`); `Task` spans request and event to track execution. This taxonomy is the lens for the hinge questions below. [Medplum workflow-patterns]

---

## 3. Hinge question A - the worklist "Flag"

**Question:** what is the idiomatic resource for a work item carrying a lifecycle (Open -> Acknowledged -> Resolved), a single owner, a structured resolution reason + optional note, and a priority?

**Recommendation: FHIR `Task`. Our domain "Flag" does NOT map to the FHIR `Flag` resource.**

### Why not FHIR `Flag`
FHIR `Flag` is a display-oriented warning. Its `status` is limited to `active | inactive | entered-in-error`; it has no `owner`, no `priority` in the workflow sense, and no structured resolution field - only an `author` (who created it) and a `period`. Medplum/HL7 describe it as intentionally narrow: a concise, high-priority notice, *not* a tracked work item. [FHIR Flag] It cannot express Open -> Acknowledged -> Resolved, single ownership, or a resolution reason without heavy custom extensions - which would be inventing a lifecycle FHIR already gives us elsewhere.

### Why `Task`
Medplum documents `Task` as the worklist/queue primitive and gives us every field the domain needs:

| Domain need (FR) | `Task` field | Source |
|---|---|---|
| Lifecycle Open/Acknowledged/Resolved | `Task.status` (`ready` -> `in-progress` -> `completed`) plus `Task.businessStatus` for our exact labels | [Medplum tasks], [Medplum task-apps] |
| Single owner, claim on Acknowledge (FR-26) | `Task.owner` (single reference; unassigned = query with `:missing`) | [Medplum tasks] |
| Priority ordering (FR-24/25) | `Task.priority` (`routine`/`urgent`/`asap`/`stat`) as one input to our priority function | [Medplum tasks] |
| Which Trigger fired / why flagged (FR-22, FR-29) | `Task.focus` -> the `Observation`/`QuestionnaireResponse`; `Task.reasonCode`/`input` | [Medplum tasks] |
| Resolution reason + note (FR-28) | `Task.businessStatus` or a coded `Task.output` + `Task.note` (author + timestamp) | [Medplum tasks] |
| Retained history / audit (FR-30, NFR-6) | Medplum versions every resource; never hard-delete | [Medplum tasks] |

Medplum explicitly describes the "claim an unassigned task" model: create tasks assigned to a *role* (e.g. "Care Coordinator") and let any coordinator pick one up by setting `Task.owner`. That is precisely FR-23/FR-26. [Medplum task-apps]

### Trade-offs
- **Terminology collision (accept, but document).** Our ubiquitous-language "Flag" will be persisted as a `Task`. `CONTEXT.md` already warns "Flag != push/notification"; the architecture note must add "domain Flag = FHIR `Task`, not FHIR `Flag`." Keep the domain word in the UI and code seams; `Task` is an implementation detail behind the Worklist module.
- **Concurrency for single-owner claim (FR-26).** `Task.owner` is a single reference, but Medplum documents *no* built-in optimistic-lock recipe for "first claim wins." Medplum resources support conditional/versioned updates (ETag / `If-Match`), which is the natural mechanism - but the "first-Acknowledge-wins, second told who owns it" rule is **ours to implement** on top. Flag as a small invented seam.
- **`businessStatus` is free-form.** Using it for Open/Acknowledged/Resolved keeps `Task.status` clean but means our lifecycle labels are a local convention, not interoperable. Acceptable for a single-org v1; revisit if we ever export.
- **Alternative considered - `Communication`:** rejected. It is an event/message ("this was said"), fire-and-forget, with no owner or claim semantics - exactly what `CONTEXT.md` says a Flag is *not*.
- **Alternative considered - custom/profiled resource:** rejected for v1. Profiling `Task` (a Medplum-blessed `Task` profile with our `businessStatus` value set) gives us validation without leaving the idiom; a brand-new resource type would abandon Medplum's worklist tooling (search, `ResourceBoard` inbox shell). [Medplum task-apps]

---

## 4. Hinge question B - the "Assignment"

**Question:** idiomatic resource for a coordinator giving an Instrument to a patient (lifecycle Pending -> Completed -> Expired)?

**Recommendation: FHIR `Task` (the request-side task), with `Task.focus` -> the `Questionnaire` and a due date. Skip `ServiceRequest` in v1.**

Medplum documents this verbatim: *"a Task might represent the task of having a practitioner complete a PHQ-9 questionnaire for a patient,"* and *"If an action requires collecting structured data... it can reference a Questionnaire... the system generates a Task whose input references the Questionnaire, signaling... this specific form needs to be completed."* [Medplum tasks], [Medplum bot-qr]

Mapping to our Assignment (`CONTEXT.md`, FR-9):

| Assignment concept | `Task` field |
|---|---|
| Instrument given to patient | `Task.focus` (or `Task.input`) -> `Questionnaire`; `Task.for` -> `Patient` |
| Pending | `Task.status = requested`/`ready` |
| Completed (Response submitted) | `Task.status = completed`; the Bot flips it on `QuestionnaireResponse` create |
| Expired (14-day link lapses, FR-7) | `Task.status = cancelled` + `businessStatus = expired`; `Task.restriction.period.end` holds the deadline |

### Trade-offs
- **`Task` vs `ServiceRequest`.** FHIR's request/event split would let a `ServiceRequest` ("PHQ-9 is ordered for this patient") authorize a `Task` ("go collect it"), linked by `Task.basedOn`. For a *one-off, single-Instrument v1* that is ceremony with no payoff - the Assignment is already the actionable unit. Medplum uses bare `Task` for exactly this in its own examples. **Recommend `Task` alone now**; if recurring/scheduled assignments ever land (explicitly out of scope), promote to `ServiceRequest` -> `Task`. This keeps the seam future-proof without paying today. [Medplum workflow-patterns], [Medplum tasks]
- **Assignment `Task` vs Flag `Task` are two different Tasks.** Distinguish by `Task.code` (Medplum: *"`Task.code` directs the UI presentation for specific task types"*). One code = "complete-instrument" (Assignment), another = "work-flag" (Worklist item). Clean, and it means the Worklist search is just a `Task?code=work-flag&status:not=completed` query. [Medplum task-apps]
- **The Access link is not the Assignment.** `CONTEXT.md` is explicit: the link is a *delivery mechanism*. The token/link lives outside the FHIR model (see D); the `Task` is the durable Assignment. Good separation - swapping delivery channels never touches the `Task`.

---

## 5. Hinge question C - where scoring + trigger evaluation run

**Question:** Bots vs Subscriptions vs client, and how score `Observation`s (LOINC `44261-6` total, `44249-1` panel) are produced from a `QuestionnaireResponse`?

**Recommendation: a single Medplum Bot, fired by a Subscription on `QuestionnaireResponse` creation, does both scoring and trigger evaluation, and writes LOINC-coded `Observation`s.**

### Why a Bot (Medplum's own guidance)
Medplum draws the line for us: **`$extract`** (declarative SDC template extraction) for *"straightforward field-to-resource mappings; forms that change often"*; **Bot** for *"Scoring instruments - PHQ-9, GAD-7, AUDIT-C... where answers combine into computed results,"* and states flatly *"Clinical scoring instruments - use a Bot; the scoring algorithm is code, not a declarative template."* [Medplum parse] Trigger evaluation (severity band, critical item, acute risk) is the same shape - conditional logic over parsed answers - so it belongs in the same Bot.

### The submit -> score -> flag flow
1. `QuestionnaireResponse` is created (from the patient's Access link submission, FR-3/FR-32).
2. A **Subscription** with criteria matching new `QuestionnaireResponse`s (Medplum recommends scoping to the specific `Questionnaire`) invokes the **Bot**. [Medplum bot-qr]
3. The Bot calls `getQuestionnaireAnswers(response)` -> map of `linkId` -> answer. [Medplum getanswers]
4. The Bot loads the **Instrument's configuration** (scoring rules + Trigger definitions), computes the Score, and creates `Observation`s:
   - a total-score `Observation` coded **LOINC `44261-6`** (quantitative), and optionally item-level `Observation`s / a panel `Observation` coded **`44249-1`**, `hasMember` linking the items. [phq-9 research], [SDC extraction]
   - `Observation.derivedFrom` -> the `QuestionnaireResponse`; `Observation.subject` -> the `Patient`.
5. The Bot evaluates each configured **Trigger** against Score + item answers and, when one fires, creates the Worklist **`Task`** (hinge A) recording which Trigger(s) fired (FR-22).

This keeps FR-32 (persist every Response + Score regardless of triggers) trivially satisfied: the `Observation`s are always written; the `Task` is conditional.

### Why not the client, why not raw Subscriptions-only
- **Not the client:** score/trigger logic is clinical and must run server-side on the *submitted* Response (FR-20 is explicitly server-side, distinct from the client-only Crisis Response FR-15). A Bot is Medplum's server-side execution primitive.
- **Subscription is the trigger mechanism, not the compute:** the Subscription only *invokes* the Bot; the logic lives in the Bot. Medplum's documented wiring is Subscription -> Bot. [Medplum bot-qr]

### Extensibility seam (FR-4, NFR-2) - the important part
To make "add GAD-7 = configuration, not engine change" real, the **Bot must be a generic engine** that reads a per-Instrument config (scoring formula, LOINC codes, band cutoffs, Trigger definitions) rather than hard-coding PHQ-9. Options for where the config lives:
- **Author scores into the `Questionnaire` via SDC scoring extensions** (`itemWeight`, formerly `ordinalValue`, on `answerOption`; FHIRPath `ordinal()` sums them). This is the HL7-blessed way to make scoring data-not-code, and keeps the score definition beside the form. [SDC itemWeight], [SDC ordinalValue] **Caveat: Medplum documents no built-in evaluation of these scoring extensions** - the Bot would read `itemWeight` and sum it itself. So the extension is a *configuration-carrier*, and the summing is still our generic Bot code (which is fine and stays instrument-agnostic).
- **Or keep Instrument config in our own store** (a config resource / `PlanDefinition` / project-scoped JSON) the Bot loads by Instrument. More explicit, less FHIR-idiomatic.

**Recommend:** carry per-item weights and the total LOINC code on the `Questionnaire` (SDC `itemWeight` + coding), and keep band/Trigger definitions in a small Instrument-config the Bot reads. Either way the engine never changes to add GAD-7. **Explicitly invented:** the shape of the Trigger-config and how the Bot dispatches on it - Medplum has no prescribed "trigger rules" model.

### Trade-offs
- **Bot vs `$extract` for the raw item Observations:** we *could* use `$extract` (template-based, which Medplum implements: templates in `Questionnaire.contained` + `templateExtract*` extensions) to emit item-level `Observation`s, and a Bot only for the computed total + triggers. [Medplum extract-op] That's a clean division but adds a second mechanism; for a v1 with one Instrument, doing everything in the Bot is simpler and equally idiomatic (Medplum explicitly supports combining them, but does not require it). Recommend **Bot-only for v1**, revisit `$extract` if item-extraction becomes boilerplate across many Instruments.
- **Idempotency:** Bots can fire more than once; use conditional creates (upsert on `derivedFrom` + code) so re-delivery doesn't double-write Observations/Tasks. Medplum supports conditional create - this is standard but ours to wire.

---

## 6. Hinge question D - account-less patient completion

**Question:** how does Medplum handle a patient completing a questionnaire without an account (tokens / open registration / patient auth)?

**Recommendation: Medplum has NO established "tokenized single-use link, no account" pattern. Build it ourselves on a `publicWebhook` Bot behind a scoped `AccessPolicy`, with our own token store. Treat as invented and security-review it.**

### What Medplum actually documents
- **Open Patient Registration** - patients *self-register a real account* (email/password), gated by a default `AccessPolicy` that restricts them to their own data. This is a genuine account, not our account-less flow. [Medplum open-reg]
- **Patient portal / patient auth** - authenticated patients viewing records and filling forms. Again, an account. [Medplum comms]
- **Unauthenticated Bots (`publicWebhook`)** - *"Only Bots explicitly configured with `Bot.publicWebhook: true` can be executed via this endpoint,"* and *"all Bots enabled for unauthenticated webhooks must have an associated AccessPolicy that strictly defines the permissions and resources the Bot can access."* This is the closest documented primitive to "an unauthenticated caller submits data." [Medplum public-webhook]

**No Medplum doc describes a per-Assignment, single-use, expiring token that opens exactly one Instrument for one patient with no account.** Multiple primary pages (open-registration, intake questionnaires) were checked; the "how the un-accounted patient reaches and submits the form" layer is simply undocumented. Our Access link (FR-6/8/11, and the Product "possession of token = authorization" assumption) is a design **we own**.

### Recommended shape (invented, bounded)
1. **Token issuance:** when the Assignment `Task` is created, mint a high-entropy single-use token with a 14-day expiry (FR-7) and store `{token -> Assignment/Patient/Questionnaire, status, expiry}` in our own store (a Medplum resource we control, or app DB). The token is *not* Medplum auth.
2. **Patient opens the link:** an unauthenticated app route resolves the token, and (only if valid/unused/unexpired) renders the one Instrument. Used/expired -> friendly page (FR-11).
3. **Submission:** the app posts the answers to a **`publicWebhook` Bot** whose `AccessPolicy` is scoped to *only* create `QuestionnaireResponse` (and nothing else). The Bot validates the token server-side, sets `subject` to the bound patient, consumes the token, and creates the `QuestionnaireResponse` - which then fires the scoring Subscription (hinge C). [Medplum public-webhook]

### Trade-offs
- **Bearer-token risk (already accepted by Product):** possession = authorization; the link is a secret. The `publicWebhook` Bot + narrow `AccessPolicy` is the mitigation - a leaked link can, at most, submit one response for one patient, never read other data. Still, this is the highest-risk seam and must be security-reviewed (an Architecture deferred item already).
- **Token store is ours.** FHIR has no "single-use link token" resource. We can model it as a custom resource or bind it to the Assignment `Task`, but the single-use/expiry enforcement is invented logic. Keep it in one module.
- **Alternative - real patient accounts (open registration):** rejected for v1. It contradicts the Product decision "not an authenticated account in v1," adds friction, and is heavier than the demo needs. [Medplum open-reg]
- **Alternative - a long-lived project `ClientApplication` the front-end holds:** rejected. That would let the front-end write broadly; it does not give per-Assignment scoping and leaks a powerful credential to the browser. `publicWebhook` + per-token validation is tighter. [Medplum clientapp]

---

## 7. The Crisis Response (FR-15) - note, not a hinge

`CONTEXT.md`/FR-15 define the Crisis Response as **client-side only, informational, creates nothing on the server**. So it needs **no FHIR resource at all** - it is a UI reaction to an acute-risk answer. Do *not* model it as a `Communication` or `Flag`. (Medplum's `Communication` messaging model exists and would be the idiom *if* we ever wanted a stored patient-facing message, but FR-15 explicitly does not.) This keeps the two mechanisms - client Crisis Response vs server acute-risk `Task` - cleanly separate, as the requirements demand. [Medplum comms], [FHIR Flag]

---

## 8. Where we are inventing (so nobody assumes Medplum blessed it)

| Area | Medplum pattern exists? | What we invent |
|---|---|---|
| Questionnaire / Response / Observation / Bot / Subscription happy path | **Yes**, fully documented | Nothing - adopt as-is |
| Worklist as `Task` with owner/priority/businessStatus | **Yes** | Our exact `businessStatus` value set + `Task.code`s |
| Assignment as `Task` -> `Questionnaire` | **Yes** | One-off status mapping (Pending/Completed/Expired) |
| Scoring in a Bot; LOINC-coded Observations | **Yes** | Generic multi-Instrument config; Trigger-rules model |
| First-claim-wins Acknowledge (FR-26 concurrency) | **No documented recipe** | ETag/conditional-update-based single-owner claim |
| Per-Instrument Trigger definitions | **No** | Our Trigger config schema + Bot dispatch |
| Account-less tokenized Access link (FR-6/8/13) | **No** | Token store + `publicWebhook` Bot + scoped AccessPolicy |

---

## Sources

- Medplum - Parsing Questionnaire Responses ($extract vs Bots; "use a Bot" for PHQ-9/GAD-7/AUDIT-C). [Medplum parse] - https://www.medplum.com/docs/questionnaires/parsing-questionnaire-responses
- Medplum - Bot for QuestionnaireResponse (Subscription -> Bot wiring; `getQuestionnaireAnswers`; create resources). [Medplum bot-qr] - https://www.medplum.com/docs/bots/bot-for-questionnaire-response
- Medplum - Modeling Questionnaires and Responses (`linkId` uniqueness; response links to Questionnaire + subject). [Medplum model] - https://www.medplum.com/docs/questionnaires/questionnaires-and-responses
- Medplum - Using Tasks to Manage Clinical Workflow (`Task.owner`/`priority`/`businessStatus`/`focus`/`restriction.period`; status lifecycle). [Medplum tasks] - https://www.medplum.com/docs/careplans/tasks
- Medplum - Task Management Apps (worklist/queue = list of Tasks; claim a role-assigned task via `Task.owner`; `Task.code` for UI). [Medplum task-apps] - https://www.medplum.com/blog/task-management-apps
- Medplum - FHIR Workflow Patterns (Request/Event/Definition; ServiceRequest vs Task; `basedOn`). [Medplum workflow-patterns] - https://www.medplum.com/blog/fhir-workflow-patterns-to-simplify-your-life
- Medplum - ServiceRequest resource. [Medplum servicerequest] - https://www.medplum.com/docs/api/fhir/resources/servicerequest
- Medplum - `getQuestionnaireAnswers` SDK reference. [Medplum getanswers] - https://www.medplum.com/docs/sdk/core.getquestionnaireanswers
- Medplum - QuestionnaireResponse $extract operation (template-based extraction; `templateExtract*`; contained templates). [Medplum extract-op] - https://www.medplum.com/docs/api/fhir/operations/extract
- Medplum - Open Patient Registration (self-registered accounts + restricting AccessPolicy). [Medplum open-reg] - https://www.medplum.com/docs/user-management/open-patient-registration
- Medplum - Consuming Webhooks / `Bot.publicWebhook` + required AccessPolicy for unauthenticated Bots. [Medplum public-webhook] - https://www.medplum.com/docs/bots/consuming-webhooks
- Medplum - ClientApplication resource. [Medplum clientapp] - https://www.medplum.com/docs/api/fhir/medplum/clientapplication
- Medplum - Messaging & Communications (Communication as conveyance; sender/receiver). [Medplum comms] - https://www.medplum.com/docs/communications
- Medplum - Messaging Data Model (thread header + child messages via `partOf`). [Medplum comms-model] - https://www.medplum.com/docs/communications/messaging-data-model
- Medplum - `medplum-demo-bots` `patient-intake.ts` (getQuestionnaireAnswers -> Patient + ServiceRequest + Communication). [demo patient-intake] - https://github.com/medplum/medplum-demo-bots/blob/main/src/patient-intake.ts
- HL7 FHIR R4 - Flag resource (status `active|inactive|entered-in-error`; `author` only; narrow warning). [FHIR Flag] - https://www.medplum.com/docs/api/fhir/resources/flag
- HL7 SDC IG - Form Data Extraction (recommendation to convert QuestionnaireResponse into Observations; Observation-based / Definition-based / StructureMap-based extraction; `$extract`). [SDC extraction] - https://www.hl7.org/fhir/uv/sdc/STU3/extraction.html
- HL7 FHIR Extensions - `itemWeight` (numeric weight on `answerOption` for scoring; supersedes `ordinalValue`). [SDC itemWeight] - http://hl7.org/fhir/extensions/5.2.0/StructureDefinition-itemWeight.html
- HL7 FHIR STU3 - `ordinalValue` extension + `ordinal()` FHIRPath for questionnaire scoring. [SDC ordinalValue] - https://www.hl7.org/fhir/STU3/extension-questionnaire-ordinalvalue.html
- PHQ-9 scoring & LOINC codes (total `44261-6`, panel `44249-1`, Item 9 acute-risk). [phq-9 research] - ./phq-9-scoring-and-interpretation.md
