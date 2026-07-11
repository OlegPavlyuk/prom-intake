# Module Boundaries

**Status:** TBD - fill as the codebase takes shape.

This project favours **deep modules** (a lot of behaviour behind a small interface). Vocabulary and
principles: `.agents/skills/codebase-design/SKILL.md`.

## Boundaries

_Each module: its interface (what a caller must know), what it hides, and its seam._

| Module | Interface (public) | Hides (private) | Seam |
| ------ | ------------------ | --------------- | ---- |

## Dependency rules

_Which modules may depend on which. In a TypeScript monorepo these rules are enforced by
dependency-cruiser via the `/setup-ts-deep-modules` skill (entry-point boundary, no cycles)._

## Test seams

_The agreed seams where behaviour is tested through the interface, not around it._
