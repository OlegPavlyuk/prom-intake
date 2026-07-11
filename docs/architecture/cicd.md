# CI / CD

**Status:** TBD - fill when the first pipeline is set up.

## Continuous Integration
_What runs on every PR: typecheck, lint, boundary lint (`lint:boundaries`), unit + integration
tests. These gates must pass before merge._

## Pre-commit
_Local fast feedback via Husky + lint-staged, configured by `/setup-pre-commit` (format, typecheck,
test on staged files)._

## Continuous Delivery / Deployment
_How a merge to `main` reaches each environment; promotion and rollback strategy._

## Branch protection
_Required checks and review before merge to `main`._
