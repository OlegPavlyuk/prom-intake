// The Worklist ordering kernel (pure, no FHIR, no I/O). Entry point of the
// `domain` package. `PriorityPolicy.order(flags)` is the single, deterministic
// priority function of FR-24/25/26, computed at query time rather than stored as
// a rank (ADR-0007): the Worklist service loads the unresolved Flags and this
// component owns the ordering (SRP). It depends on nothing.
//
// The ranking contract, most-significant key first:
//   1. Priority tier (FR-24): acute-risk, then urgent, then routine.
//   2. State within a tier (FR-26): Open before Acknowledged - so an
//      Acknowledged acute-risk Flag still outranks any lower-tier Open Flag
//      (FR-25), because the tier is compared before the state.
//   3. Age within a tier+state group (FR-24): oldest first (`createdAt` asc).
// Ties on all three keys preserve input order (a stable sort), so ordering is
// deterministic on equal inputs.

import type { FlagPriority } from "./instrument.js";
import type { Flag, FlagStatus } from "./workflow.js";

/** Tier order (FR-24): lower rank sorts first. Acute-risk is always on top. */
const PRIORITY_RANK: Record<FlagPriority, number> = {
  "acute-risk": 0,
  urgent: 1,
  routine: 2,
};

/**
 * The highest-priority tier among the given tiers (acute-risk outranks urgent
 * outranks routine; FR-24). When several Triggers fire on one Response, the
 * single Flag they raise takes its most urgent tier (ADR-0011) - the same tier
 * order `order` ranks by, kept in one place. Requires a non-empty input.
 */
export function highestPriority(
  priorities: readonly FlagPriority[]
): FlagPriority {
  return priorities.reduce((top, p) =>
    PRIORITY_RANK[p] < PRIORITY_RANK[top] ? p : top
  );
}

/**
 * State order within a tier (FR-26): Open before Acknowledged. Resolved Flags
 * are not on the Worklist (ADR-0007: the Worklist service loads only unresolved
 * Flags), so they are not expected here; ranking them last keeps `order` a total
 * function if one is ever passed.
 */
const STATUS_RANK: Record<FlagStatus, number> = {
  Open: 0,
  Acknowledged: 1,
  Resolved: 2,
};

/** Compare two Flags by tier, then state, then age (oldest first). */
function byPriority(a: Flag, b: Flag): number {
  const byTier = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byTier !== 0) return byTier;

  const byState = STATUS_RANK[a.status] - STATUS_RANK[b.status];
  if (byState !== 0) return byState;

  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/**
 * The query-time Worklist priority policy (ADR-0007). `order` is the FR-24/25/26
 * ranking made concrete and independently unit-testable through its seam.
 */
export const PriorityPolicy = {
  /**
   * Order Flags for the Worklist (FR-24/25/26). Ranks across both Open and
   * Acknowledged state. Returns a new array (the input is not mutated); ties on
   * every key preserve input order.
   */
  order(flags: readonly Flag[]): Flag[] {
    return [...flags].sort(byPriority);
  },
};
