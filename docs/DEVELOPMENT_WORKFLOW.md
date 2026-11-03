# Development Workflow

## Development workspace

The owner confirmed cloud-only development on 2026-10-18. Reopen the same GitHub Codespace from home and company computers; use a connected cloud AI workspace for independent tasks. Do not clone, install project dependencies, build or start localhost development servers on those workstations. Documentation-only edits can use GitHub branches and PRs directly. If no cloud execution connection is available, report that limitation rather than falling back to local development. See `COLLABORATION.md`.

Exception: an authorized operations node may run the opt-in local Production application described in `docs/LOCAL_PRODUCTION.md` (Docker Web/API/Gateway on loopback `127.0.0.1:8080`, sharing the Production Neon/R2/Secret Manager authority). That exception never applies to developer workstations, local code edits, a second database, or migrations.

## Canonical flow

```text
Requirement → GitHub branch → pull request to main → CI → review → merge
                                                                    ↓
                                                          Production deploy
```

## 1. Requirement and branch

State the intended outcome and boundaries before implementation. Record architecture decisions in `docs/adr/` when needed. Work on a branch and submit a pull request to `main`; do not edit `main` directly.

Suggested names: `feat/<topic>`, `fix/<topic>`, `rebuild/<topic>`, `docs/<topic>`.

## 2. Change and review

Implement the smallest change that satisfies the requirement and add regression coverage for changed invariants. Keep provider SDKs behind existing ports, preserve domain boundaries, and never commit credentials or real customer data. AI-assisted changes still require human review.

A pull request should describe the change, what is deliberately out of scope, and how it was verified.

## 3. CI gates

CI validates migrations on PostgreSQL, architecture boundaries, TypeScript, tests, application builds, Docker builds, container startup and smoke checks. These gates must not be weakened merely to make a change pass. Documentation-only changes may skip expensive code checks while required gate jobs remain successful.

## 4. Merge and deploy

Merge only after review and required CI checks pass. A successful main-push CI run for the exact commit triggers Production deployment. The production workflow applies migrations explicitly, deploys the containers and checks live health. Production secrets are supplied by the approved cloud secret-management path.

Manual rollback selects a previously released `main` commit. It does not reverse database migrations; use a reviewed forward fix or separate recovery plan for schema/data recovery.

## Retired environment

Cloud Development/Test and its automatic promotion workflows are retired. Docker inside Codespaces and ephemeral CI are isolated validation environments, not cloud business environments. Do not restore cloud Development without a reviewed architecture decision.
