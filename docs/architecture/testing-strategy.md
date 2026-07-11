# Testing Strategy

**Status:** TBD - fill before first implementation.

## Principles
- Tests exercise behaviour **through a module's interface (its seam)**, not its internals. See
  `.agents/skills/codebase-design/DEEPENING.md`.
- Prefer the **highest seam** that still isolates the behaviour under test.
- `/implement` uses TDD at pre-agreed seams; `/diagnosing-bugs` writes a regression test at the
  correct seam *before* the fix.

## Test levels
| Level | Scope | Runs where |
| ----- | ----- | ---------- |
| Unit | single deep module via its interface | every commit |
| Integration | modules + real adapters (db, http) | CI |
| E2E | user-visible flow | CI / pre-release |

## What makes a good test here
_Concrete rules once the stack is chosen: naming, fixtures, no test of private internals, no
snapshot-only assertions, etc._

## Verification
_Manual verification of user-facing changes uses the `/verify` skill (run the app, observe
behaviour) before merge._
