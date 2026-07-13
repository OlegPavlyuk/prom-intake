> Produced by the `/research` skill on 2026-07-13. Investigated against primary/authoritative sources only (original validation paper, official Pfizer/PHQ instruction manual, APA, USPSTF, LOINC.org).

# PHQ-9: Scoring and Interpretation

Research notes feeding product requirements for a clinical PROM (patient-reported outcome measure) platform. Every factual claim below is traced to the source that owns it; see [Sources](#sources) for URLs.

## Summary table: severity bands

| Total score | Severity | "Flag" | Proposed treatment action (Kroenke & Spitzer, 2002) |
|---|---|---|---|
| 0-4 | None-minimal | - | None |
| 5-9 | Mild | - | Watchful waiting; repeat PHQ-9 at follow-up |
| 10-14 | Moderate | Yellow (>= 10) | Treatment plan; consider counseling, follow-up and/or pharmacotherapy |
| 15-19 | Moderately severe | Red (>= 15) | Active treatment with pharmacotherapy and/or psychotherapy |
| 20-27 | Severe | Red | Immediate pharmacotherapy; if severe impairment or poor response, expedited referral to mental-health specialist |

Independently of the total score, **any non-zero answer to Item 9 (suicidality) triggers suicide-risk follow-up** - see [Question 3](#3-item-9-suicidality).

---

## 1. Item scoring and total score range

**Confirmed.** Each of the 9 items is scored 0-3 using the response options **Not at all (0) / Several days (1) / More than half the days (2) / Nearly every day (3)**. The total score is the sum of the nine items and ranges from **0 to 27**.

- Original validation paper: response categories of "not at all," "several days," "more than half the days," and "nearly every day" are scored 0, 1, 2, and 3; the PHQ-9 total score ranges from 0 to 27. [PMC1495268]
- Official PHQ instruction manual (Table 1, pp. 5-6): "Nine items, each of which is scored 0 to 3, providing a 0 to 27 severity score." Scores of 0-3 are assigned to the four response categories respectively; "PHQ-9 total score for the nine items ranges from 0 to 27." [PHQ manual]

## 2. Official severity bands

**Confirmed.** Cutpoints of 5, 10, 15, and 20 define five bands:

| Total score | Severity |
|---|---|
| 0-4 | None-minimal |
| 5-9 | Mild |
| 10-14 | Moderate |
| 15-19 | Moderately severe |
| 20-27 | Severe |

- Original paper: "PHQ-9 scores of 5, 10, 15, and 20 represented mild, moderate, moderately severe, and severe depression, respectively." [PMC1495268]
- Official manual (Table 4) confirms the bands verbatim: 0-4 None-minimal, 5-9 Mild, 10-14 Moderate, 15-19 Moderately Severe, 20-27 Severe. [PHQ manual]

Additional flag thresholds stated in the official manual (p. 2): a score of **10 or greater is a "yellow flag"** (possible clinically significant condition) and **15 or greater is a "red flag"** (active treatment probably warranted). Useful for auto-flagging logic. [PHQ manual]

## 3. Item 9 (suicidality)

**Exact item wording** (official PHQ instrument, Table 3): *"Thoughts that you would be better off dead or of hurting yourself in some way?"* The LOINC display of the same item uses the comma form: *"Thoughts that you would be better off dead, or of hurting yourself in some way."*

**Standard clinical convention on non-zero responses.** Suicide-risk assessment is triggered by **any positive (non-zero) response to Item 9, independent of the total score.** The official manual states: "A particularly important question is how to assess suicide risk in individuals who answer positively to the 9th question of the PHQ-9. A four-item screener [the P4] has been developed that may assist... although a final decision about the actual risk of self-harm requires a clinical interview." The referenced P4 screener is described as an "Algorithm for following up on positive responses to 9th item of PHQ-9." [PHQ manual]

**Precision / caveat.** The primary sources phrase this as "answer positively" / "positive responses" rather than printing a bare numeric rule such as "score >= 1 = mandatory flag." Separately, in the diagnostic algorithm Item 9 (self-harm) is uniquely counted "if present at all, regardless of duration," unlike the other 8 items which require "more than half the days": the manual and paper note that suicidal ideation "is counted whenever it is present." So the "any non-zero response counts" convention is explicitly documented for Item 9 within the diagnostic algorithm, and the associated suicide-risk follow-up is triggered by a positive response independent of the total score. A product may reasonably implement "Item 9 >= 1 raises a suicidality flag regardless of total," but should understand this as operationalizing the sources' "positive response" language rather than a verbatim numeric threshold. [PMC1495268], [PHQ manual]

## 4. LOINC codes

Verified on loinc.org.

**Panel and total score**

| LOINC | Display name | Notes |
|---|---|---|
| **44249-1** | PHQ-9 quick depression assessment panel [Reported.PHQ] | The panel; fully-specified name `PHQ-9 quick depression assessment panel:-:Pt:^Patient:-:Reported.PHQ`. [LOINC 44249-1] |
| **44261-6** | Patient Health Questionnaire 9 item (PHQ-9) total score [Reported] | Scale type Quantitative (Qn). [LOINC 44261-6] |

**Individual item codes (contained in panel 44249-1)**

| LOINC | Item |
|---|---|
| 44250-9 | Little interest or pleasure in doing things |
| 44255-8 | Feeling down, depressed, or hopeless |
| 44259-0 | Trouble falling or staying asleep, or sleeping too much |
| 44254-1 | Feeling tired or having little energy |
| 44251-7 | Poor appetite or overeating |
| 44258-2 | Feeling bad about yourself - or that you are a failure or have let yourself or your family down |
| 44252-5 | Trouble concentrating on things, such as reading the newspaper or watching television |
| 44253-3 | Moving or speaking slowly, or being fidgety/restless (psychomotor) |
| 44260-8 | Thoughts that you would be better off dead, or of hurting yourself in some way (Item 9) |
| 69722-7 | Difficulty item (functional impairment); part of the panel but not summed into the total score |

Directly verified codes: **44249-1**, **44261-6**, **44250-9**, **44260-8**. The remaining individual codes are as listed on the 44249-1 panel page and were not each opened individually.

**Do not use:** deprecated code **44257-4** "Patient Health Questionnaire 9 item (PHQ-9) [Reported]". [LOINC 44249-1]

---

## Nuances for an auto-scoring / flagging product

**Full PHQ-9 vs PHQ-2.** The PHQ-9 is the full 9-item depression scale (0-27) used for "screening and diagnosis, as well as selecting and monitoring treatment." The PHQ-2 is the "first 2 items of PHQ-9... ultra-brief depression screener," two items scored 0-3 for a total of 0-6; its purpose is "not to establish final diagnosis or to monitor depression severity, but rather to screen." A PHQ-2 score of **3 or greater** should prompt administration of the full PHQ-9 plus clinical interview. [PHQ manual], [APA]

**Missing-data / validity rule.** The official manual and the original validation paper do **not** state how many items must be answered for a valid total, nor an imputation method. Requiring all 9 answered (or allowing limited missingness via mean-imputation, common in the literature but not in these primary sources) is a **product decision**, not an instrument-mandated rule. Do not assert an instrument-level "all 9 required" rule; the sources are silent. [PHQ manual], [PMC1495268]

**Official recommended clinical actions per band** (official manual, Table 4, "PHQ-9 Scores and Proposed Treatment Actions," attributed to Kroenke & Spitzer, Psychiatric Annals 2002;32:509-521), verbatim:

| Score | Severity | Proposed treatment actions |
|---|---|---|
| 0-4 | None-minimal | None |
| 5-9 | Mild | Watchful waiting; repeat PHQ-9 at follow-up |
| 10-14 | Moderate | Treatment plan, considering counseling, follow-up and/or pharmacotherapy |
| 15-19 | Moderately severe | Active treatment with pharmacotherapy and/or psychotherapy |
| 20-27 | Severe | Immediate initiation of pharmacotherapy and, if severe impairment or poor response to therapy, expedited referral to a mental-health specialist for psychotherapy and/or collaborative management |

[PHQ manual]

**Licensing.** All PHQ measures are in the public domain: "No permission is required to reproduce, translate, display or distribute." Developed by Spitzer, Williams, and Kroenke with an educational grant from Pfizer Inc. [PHQ manual]

**USPSTF context (2023), for clinical justification.** Screening for depression/major depressive disorder in adults is **Grade B** (recommended). Screening for suicide risk in adults is **Grade I** (insufficient evidence) - relevant when positioning Item 9 handling: it supports depression screening but does not endorse standalone suicide-risk screening as evidence-based. [USPSTF]

---

## Sources

- Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: Validity of a Brief Depression Severity Measure. *J Gen Intern Med.* 2001;16(9):606-613. [PMC1495268] - https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/
- Official PHQ / GAD-7 Instruction Manual (phqscreeners.com), incl. Tables 1, 3, 4 and the P4 Item-9 guidance. [PHQ manual] - https://www.phqscreeners.com/images/sites/g/files/g10016261/f/201412/instructions.pdf
- American Psychological Association - Patient Health Questionnaire (PHQ-9 & PHQ-2). [APA] - https://www.apa.org/pi/about/publications/caregivers/practice-settings/assessment/tools/patient-health
- USPSTF - Depression and Suicide Risk in Adults: Screening (2023). [USPSTF] - https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/screening-depression-suicide-risk-adults
- LOINC 44249-1 (PHQ-9 panel). - https://loinc.org/44249-1/
- LOINC 44261-6 (PHQ-9 total score). - https://loinc.org/44261-6/
- LOINC 44250-9 (Item 1). - https://loinc.org/44250-9/
- LOINC 44260-8 (Item 9). - https://loinc.org/44260-8/
