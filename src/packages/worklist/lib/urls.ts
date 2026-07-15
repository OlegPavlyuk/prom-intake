// Canonical URLs / systems used by the Worklist (Flag) module. The project-wide
// shared identifiers come from the `terminology` package (one source of truth;
// P8); the identifiers below are Flag-specific and stay private to this module.

export {
  PROJECT_BASE,
  CS_TASK_CODE,
  CS_FLAG_STATUS,
  TASK_CODE_FLAG,
} from "../../terminology/systems.js";

import { PROJECT_BASE } from "../../terminology/systems.js";

/**
 * Coding system for the Trigger(s) that raised a Flag, recorded on the Flag
 * `Task.reasonCode` (FR-22). The concrete codes are defined by each Instrument's
 * config (e.g. `phq9-item-9-acute-risk`); this system names where they live on
 * the persisted Flag so the raising Trigger is recoverable.
 */
export const SYS_TRIGGER_CODE = `${PROJECT_BASE}/trigger`;

/**
 * Identifier system for a Flag's idempotency key: `{responseId}:{triggerCodes}`.
 * A Flag is raised at-most-once per (Response, Trigger), so a redelivered
 * Subscription event finds the existing Flag by this key instead of duplicating
 * it (event-flows; the Bot is idempotent, ADR-0004).
 */
export const ID_FLAG_DEDUP_KEY = `${PROJECT_BASE}/flag-dedup-key`;
