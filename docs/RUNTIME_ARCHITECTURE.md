# Runtime Architecture

## Purpose

This document fixes where every ALSVID artifact lives. It separates the software program from the
environment that runs it, so that future work never has to reopen the question of where something
belongs.

The authoritative decision record is ADR 0003.

## Authority map

| Artifact | Authority | Holds |
| --- | --- | --- |
| Software program | GitHub | source, contracts, migrations, infrastructure definitions, CI |
| Runtime environment | authorized local Docker and existing Google Cloud Run | Web/API processes at more than one location, using one business data authority |
| Business database | Neon PostgreSQL | authoritative structured business facts |
| Business files | Cloudflare R2 | binary objects only (images, documents, attachments) |
| Passwords and configuration | Google Cloud Secret Manager | production credentials and configuration secrets |
| Logs | Cloud Logging (Cloud Run) and Docker logs (local) | runtime-specific observability |
| Backup | GitHub + verified Neon/database backup + R2 + approved independent backup | code history, database recovery and object copies |

## Software program — GitHub

GitHub is the single source of truth for the software program. A running environment is always
reproducible from a Git commit SHA.

- No code, migration, contract or infrastructure definition lives only on a machine.
- No production fix is applied by editing a running container.
- Release identity is a commit SHA, not a folder name or a timestamp.

## Runtime environment — local-first applications plus existing Cloud Run

ALSVID supports authorized local Docker Web/API/Gateway business runtimes connected to the same Production Neon PostgreSQL, R2 and centrally managed secrets. Cloud Run continues as an existing public HTTPS Web/API location; moving the public entrypoint is a separate acceptance decision. Do not assume local deployment has been tested or a public cutover completed. See `docs/LOCAL_PRODUCTION.md`.

- The platform runs the software; it does not own business rules.
- Application code stays provider-neutral so it can also run locally, on a VPS or on a home server
  without redesign. Container and configuration definitions in `infra/` must not assume Cloud Run in Domain code.
- Cloud Run reads configuration and credentials from Secret Manager rather than from committed files.

## Business database — Neon PostgreSQL

Neon is the selected managed PostgreSQL provider for ALSVID production structured data.

- PostgreSQL remains the database contract. Domain and application code must not depend on Neon-specific business semantics.
- Table ownership follows `docs/DATA_OWNERSHIP.md`.
- Runtime connectivity is supplied through `DATABASE_URL`; provider credentials never live in Git.
- Migrations run explicitly as a release step, never implicitly at container start.
- The production database is managed infrastructure and is never hosted on a personal computer.
- A future PostgreSQL provider change must not require rewriting Domain rules.

Live Neon connectivity and backup/restore readiness require direct provider and operational verification; source code alone does not establish their status.

## Business files — Cloudflare R2

R2 (S3-compatible) stores binary objects only.

- PostgreSQL stores object metadata, keys, checksums and business links; R2 stores bytes.
- Business files are never committed to the code repository.
- Browser clients never receive storage credentials.
- The concrete R2 adapter lives behind `@alsvid/ports` in `@alsvid/provider-adapters`; provider-specific SDKs do not enter Domain code.
- Live bucket/account settings and access must be verified against the authorized production deployment; do not infer their status from documentation.

## Passwords and configuration — Google Cloud Secret Manager

Production credentials and configuration secrets are held in Secret Manager.

- Secrets are read by the runtime at deploy/run time.
- No secret is committed to Git, embedded in an image, or written into documentation.
- Isolated development/CI uses non-production credentials. An authorized local business runtime instead retrieves existing Production secrets at startup; do not commit, distribute or log them. Ordinary staff use an authenticated HTTPS business entrypoint rather than receiving database/R2 secret access.

## Logs — Google Cloud Logging

Cloud Logging is the sink for Cloud Run; locally running application containers use their Docker logs. Application logging goes through
`@alsvid/observability` so the sink can change without touching business code.

## Backup — GitHub + Neon/database backup + R2

Backup and recovery span distinct layers because each protects against a different failure:

1. **GitHub** — all code, contracts, migrations and definitions, with full commit history.
2. **Neon/database backup** — PostgreSQL backup/recovery plus portable logical backups with a proven restore procedure.
3. **R2** — object storage durability and, where required, an independent object copy.
4. **Optional independent offline copy** — only if separately authorized, configured and recovery-tested; no personal device is assumed part of company infrastructure.

A backup that has never been restored is not a backup. Restore procedures are exercised before
production business data is accepted.

## Local machines

An authorized local machine may run the **business** Web/API/Gateway stack using the central Production Neon/R2 resources, or run an **isolated** development/Test stack. These are separate modes.

- Local business operation must use the guarded `infra/docker-compose.local-production.yml` path; it does not create a second PostgreSQL, MinIO, Worker or migrations.
- Development/Test must never silently connect to Production data or secrets.
- Local application hosting does not transfer business database authority away from Neon.
- Losing a local machine must never lose business data or the ability to reproduce the system.

## Provider-neutral external capabilities

Mail remains a provider-neutral platform capability with the current runtime adapter selecting Resend through `MAIL_PROVIDER=resend`; the API key is supplied by Secret Manager and business domains depend on `@alsvid/ports`, not vendor SDKs. AI remains provider-neutral until selected.

ALSVID operates its own first-party storefront and order orchestration; payments may use external PSP providers. The retired Shopify ingestion and registration runtime is not a dependency. Historical audit records and migrations must not be destroyed by code cleanup.

## Relationship to other documents

- `docs/ARCHITECTURE.md` — system shape and domain boundaries
- `docs/DEPLOYMENT.md` — environment separation and release model
- `docs/SECURITY.md` — secret handling and high-risk mutations
- `docs/DEVELOPMENT_WORKFLOW.md` — how a change gets from requirement to production
- `docs/adr/0003-runtime-and-deployment-platform.md` — the decision record behind this document
