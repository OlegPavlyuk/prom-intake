import { describe, expect, it } from "vitest";
// Exercised through the package entry point (its seam), like every other caller.
import type { FlagPriority } from "../instrument.js";
import type { Flag, FlagStatus } from "../workflow.js";
import { PriorityPolicy } from "../priority.js";

// --- Fixtures ---------------------------------------------------------------

// A minimal Flag builder: the ordering only reads `priority`, `status`, and
// `createdAt`, so tests vary those and let the rest default. `id` is the handle
// we assert final order by. Everything is a plain domain Flag (workflow.ts) -
// no FHIR, no Medplum: this is off-server pure logic (ADR-0007).
function flag(
  id: string,
  priority: FlagPriority,
  status: FlagStatus,
  createdAt: string
): Flag {
  return {
    id,
    patientId: `patient-${id}`,
    priority,
    status,
    createdAt,
    triggerCodes: ["some-trigger"],
  };
}

/** Extract the ids of an ordered Flag list, for compact order assertions. */
const ids = (flags: readonly Flag[]): string[] => flags.map((f) => f.id);

// Distinct ISO-8601 timestamps; `T1` is the oldest.
const T1 = "2026-07-15T09:00:00.000Z";
const T2 = "2026-07-15T10:00:00.000Z";
const T3 = "2026-07-15T11:00:00.000Z";

// --- Priority tier first (FR-24) --------------------------------------------

describe("PriorityPolicy.order - priority tier (FR-24)", () => {
  it("ranks acute-risk before urgent before routine", () => {
    const ordered = PriorityPolicy.order([
      flag("routine", "routine", "Open", T1),
      flag("acute", "acute-risk", "Open", T1),
      flag("urgent", "urgent", "Open", T1),
    ]);
    expect(ids(ordered)).toEqual(["acute", "urgent", "routine"]);
  });

  it("tier dominates age: a newer acute-risk Flag still outranks an older routine Flag", () => {
    const ordered = PriorityPolicy.order([
      flag("old-routine", "routine", "Open", T1),
      flag("new-acute", "acute-risk", "Open", T3),
    ]);
    expect(ids(ordered)).toEqual(["new-acute", "old-routine"]);
  });
});

// --- Cross-state ranking (FR-25) --------------------------------------------

describe("PriorityPolicy.order - ranks across state (FR-25)", () => {
  it("an Acknowledged acute-risk Flag outranks any lower-tier Open Flag", () => {
    const ordered = PriorityPolicy.order([
      flag("open-urgent", "urgent", "Open", T1),
      flag("ack-acute", "acute-risk", "Acknowledged", T1),
    ]);
    expect(ids(ordered)).toEqual(["ack-acute", "open-urgent"]);
  });

  it("an Acknowledged acute-risk Flag outranks an Open routine Flag even when older", () => {
    const ordered = PriorityPolicy.order([
      flag("open-routine", "routine", "Open", T1),
      flag("ack-acute", "acute-risk", "Acknowledged", T3),
    ]);
    expect(ids(ordered)).toEqual(["ack-acute", "open-routine"]);
  });
});

// --- Open before Acknowledged within a tier (FR-26) -------------------------

describe("PriorityPolicy.order - Open before Acknowledged within a tier (FR-26)", () => {
  it("ranks Open above Acknowledged in the same tier, regardless of age", () => {
    // The Acknowledged Flag is older, yet Open ranks first within the tier.
    const ordered = PriorityPolicy.order([
      flag("ack-old", "acute-risk", "Acknowledged", T1),
      flag("open-new", "acute-risk", "Open", T3),
    ]);
    expect(ids(ordered)).toEqual(["open-new", "ack-old"]);
  });
});

// --- Oldest first within a tier+state group (FR-24) -------------------------

describe("PriorityPolicy.order - oldest first within a tier (FR-24)", () => {
  it("orders same-tier Open Flags oldest first", () => {
    const ordered = PriorityPolicy.order([
      flag("newest", "urgent", "Open", T3),
      flag("oldest", "urgent", "Open", T1),
      flag("middle", "urgent", "Open", T2),
    ]);
    expect(ids(ordered)).toEqual(["oldest", "middle", "newest"]);
  });

  it("orders same-tier Acknowledged Flags oldest first, after all Open in the tier", () => {
    const ordered = PriorityPolicy.order([
      flag("ack-new", "urgent", "Acknowledged", T3),
      flag("open-new", "urgent", "Open", T3),
      flag("ack-old", "urgent", "Acknowledged", T1),
      flag("open-old", "urgent", "Open", T1),
    ]);
    // Open (oldest first), then Acknowledged (oldest first).
    expect(ids(ordered)).toEqual([
      "open-old",
      "open-new",
      "ack-old",
      "ack-new",
    ]);
  });
});

// --- Full mixed ranking contract --------------------------------------------

describe("PriorityPolicy.order - full mixed ranking", () => {
  it("orders a mixed set by tier, then Open-before-Acknowledged, then oldest first", () => {
    const ordered = PriorityPolicy.order([
      flag("routine-open", "routine", "Open", T1),
      flag("acute-ack-old", "acute-risk", "Acknowledged", T1),
      flag("urgent-open-new", "urgent", "Open", T3),
      flag("acute-open", "acute-risk", "Open", T2),
      flag("urgent-open-old", "urgent", "Open", T1),
      flag("acute-ack-new", "acute-risk", "Acknowledged", T3),
    ]);
    expect(ids(ordered)).toEqual([
      // acute-risk tier: Open first, then Acknowledged oldest-first.
      "acute-open",
      "acute-ack-old",
      "acute-ack-new",
      // urgent tier: both Open, oldest first.
      "urgent-open-old",
      "urgent-open-new",
      // routine tier.
      "routine-open",
    ]);
  });
});

// --- Ties & stability -------------------------------------------------------

describe("PriorityPolicy.order - ties and stability", () => {
  it("preserves input order for Flags that tie on tier, state, and time", () => {
    const ordered = PriorityPolicy.order([
      flag("first", "urgent", "Open", T1),
      flag("second", "urgent", "Open", T1),
      flag("third", "urgent", "Open", T1),
    ]);
    expect(ids(ordered)).toEqual(["first", "second", "third"]);
  });

  it("is deterministic: the same input yields the same order", () => {
    const input = [
      flag("b", "urgent", "Open", T2),
      flag("a", "acute-risk", "Acknowledged", T1),
      flag("c", "routine", "Open", T1),
    ];
    expect(ids(PriorityPolicy.order(input))).toEqual(
      ids(PriorityPolicy.order(input))
    );
  });
});

// --- Purity & edges ---------------------------------------------------------

describe("PriorityPolicy.order - purity and edge cases", () => {
  it("returns a new array and does not mutate the input", () => {
    const input = [
      flag("routine", "routine", "Open", T1),
      flag("acute", "acute-risk", "Open", T1),
    ];
    const ordered = PriorityPolicy.order(input);
    expect(ordered).not.toBe(input);
    // Input order is untouched.
    expect(ids(input)).toEqual(["routine", "acute"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(PriorityPolicy.order([])).toEqual([]);
  });

  it("returns a single Flag unchanged", () => {
    const only = flag("solo", "urgent", "Acknowledged", T2);
    expect(ids(PriorityPolicy.order([only]))).toEqual(["solo"]);
  });

  it("is total even if a Resolved Flag is passed: it sorts after unresolved in its tier", () => {
    // ADR-0007: the Worklist service loads only unresolved Flags, so Resolved is
    // not expected here. order() stays a total function regardless - a stray
    // Resolved ranks below Open and Acknowledged within its tier.
    const ordered = PriorityPolicy.order([
      flag("resolved", "urgent", "Resolved", T1),
      flag("ack", "urgent", "Acknowledged", T2),
      flag("open", "urgent", "Open", T3),
    ]);
    expect(ids(ordered)).toEqual(["open", "ack", "resolved"]);
  });
});
