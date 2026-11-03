# ALSVID Copilot Instructions

Before any change, read `AGENTS.md` and `docs/ONE_SYSTEM_DEVELOPMENT_CONTRACT.md` from current main.

ALSVID is one integrated business system, one GitHub monorepo, one shared domain and data authority. Its portals are distinct user/permission experiences but not duplicated business backends. Do not fork modules into separate products, independent databases, incompatible API surfaces or separate production deployments.

For each task, identify upstream and downstream dependencies, update shared API/domain contracts and all consumers together, provide cross-module tests, and resolve integration conflicts before merging. Do not ask another agent to retrofit integration afterward; never test with production data or credentials. All required CI checks must pass. See linked contract for full rules.

Editing location (owner decision 2026-11-03, ADR 0007, supersedes the earlier "short branches and PRs only" rule): change code in the local checkout, then run `scripts/local-backup.ps1` to commit and push only the `backup/local` branch, which triggers no CI and no release. Pushing `main`, marking a PR ready or dispatching `production-deploy.yml` requires the owner's explicit release authorization; production still ships only from merged `main`.
