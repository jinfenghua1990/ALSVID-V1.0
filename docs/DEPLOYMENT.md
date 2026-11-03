# Deployment Model

> Current operations decision (2026-11-02): authorized local Production Web/API/Gateway is an optional **local-first application runtime** connected to the same Neon/R2/Secret Manager authority used by the existing Cloud Run HTTPS services. Its actual startup and data/access acceptance are not yet verified. The local **isolated Test** stack described below is different and must not use Production secrets. See `docs/LOCAL_PRODUCTION.md`.

## Local development and Test

At the current solo/small-team stage, the M1 workstation is the primary development and Test environment. ALSVID does **not** maintain a separate Cloud Run Test environment by default.

The purpose of Test is to verify that a candidate software version, database migration, integration flow and object-storage behavior work correctly before the same Git commit/image is promoted to Production.

Local/Test runtime:

- M1 workstation for development and Test acceptance
- Docker is mandatory for Test acceptance; production-bound code is not accepted based only on a bare macOS process
- PostgreSQL in Docker for local Test data unless a specific integration test requires a managed PostgreSQL target
- Web / API / Worker run as the same production-oriented container definitions used for deployment
- optional local S3-compatible storage or isolated non-production R2 resources only when an object-storage workflow specifically needs them
- Test data is disposable and must never be treated as production business truth

The repository-side Test gate builds the real Web/API/Worker images, starts PostgreSQL, runs migrations, starts all three applications and performs API/Web smoke checks. Container builds used for release acceptance must remain compatible with the Cloud Run production target.

The release rule is **Test the candidate first, then deploy the same version to Production**. A successful local Test does not turn the Test database or Test files into Production data; it approves the software version for production deployment.

A separate cloud Test environment is not part of the current architecture. Reconsider it only after a new reviewed owner decision and a concrete need, such as:

1. multiple developers or employees need a shared isolated integration environment;
2. repeated defects appear only in Cloud Run or other cloud-specific services and cannot be reproduced locally;
3. realistic cloud load, IAM, region, managed-service or end-to-end infrastructure testing becomes necessary.

Until one of those conditions exists, maintaining a second cloud **Test** runtime is unnecessary. Authorized local Production application hosting is a separate opt-in mode; it never changes the Production database authority.

## Unified Test Gateway boundary

The local/CI Test runtime keeps `web`, `api`, and `worker` as separate processes/containers inside the same ALSVID system. This is runtime separation, not separate business systems, duplicated domain ownership, or a new independent runtime.

For the Test stack in `infra/docker-compose.test.yml`:

- The only host-published Web/API entry is `http://localhost:8080`, served by the version-controlled Nginx `gateway`.
- Web `3000` and API `4000` remain internal to the Docker network. Do not publish `3000/4000` or legacy host ports `3001/4001` directly.
- Worker remains a separate internal process and has no user-facing host port.
- PostgreSQL may expose its Test-only port `5433` for local test tooling; it is not another Web/API entry point.
- `infra/gateway/nginx.conf` is the routing source of truth. The general `/api/` route goes to API and the remaining paths go to Web, while explicitly configured Next.js/BFF/session/control/admin/public/settings/partners and image-upload routes are intentional exceptions. Do not simplify this into a blanket rule that every `/api/*` request goes to API.
- Any Gateway route or published-port change must update this document and the relevant health/smoke tests together.
- This is a local/CI Test access rule only. It does not create a cloud Test runtime or change the Production deployment topology. Test data and credentials must remain isolated from Production.

Use `docs/PRODUCTION_RUNBOOK.md` for the exact Production release, secret-management, and rollback procedure, and `docs/RELEASE_FLOW.md` for current release gates.

## Selected production placement

Current public-cloud release topology is retained from ADR 0003, with the local Production application option documented separately:

| Artifact | Production authority |
| --- | --- |
| Software / migrations / CI | GitHub `main` + commit SHA |
| Web | Existing public Cloud Run `alsvid-web`; optional authorized local Docker Web |
| API | Existing Cloud Run `alsvid-api`; optional authorized local Docker API |
| Worker | Not deployed; no registered production handlers or queued jobs |
| Migrations | Google Cloud Run Job `alsvid-migrate` |
| Container images | Google Artifact Registry |
| Structured business data | Neon managed PostgreSQL |
| Binary business files | Cloudflare R2 |
| Runtime secrets | Google Cloud Secret Manager |
| Runtime logs | Google Cloud Logging |
| Independent backup | Not yet accepted as complete; do not assume a personal Q4 is in the Production recovery topology |

### Product hosting boundary

All public storefront and product-detail routes run inside the single Next.js Web application deployed as Cloud Run Service `alsvid-web`. This includes FC1, FC2 (the ALSVID model based on the Pilot X5 reference), L7, L8 and future catalogue products. Shared backend requests use `alsvid-api`. Adding a product or model must not create another Cloud Run service.

The production workflows manage `alsvid-web` and `alsvid-api`; neither deploys `alsvid-fc1` nor `alsvid-pilot-x5`. Those names are not part of the repository's current production topology. Before deleting an existing service with either name, verify in Google Cloud that no custom domain mapping, traffic tag, or external integration still points to it. Removing either service does not remove the corresponding product route from `alsvid-web`.

Current Cloud Run deployment has successful release evidence; do not treat historical pre-deployment notes as current. Independently verify actual Neon/R2 bindings and backup/restore acceptance before making a claim about provider readiness.

## Provider boundaries

Production provider choices must not leak into Domain rules.

- PostgreSQL is the database contract; Neon is the selected managed provider.
- `@alsvid/ports` is the object-storage contract; the concrete Cloudflare R2 adapter lives in `@alsvid/provider-adapters`.
- Mail currently uses a provider-neutral interface with Resend delivery; AI integration remains provider-neutral.
- ALSVID owns its first-party storefront, checkout orchestration and customer orders. An external PSP processes payments; retired Shopify ingestion must not be reintroduced.

## First-time Google Cloud bootstrap

Google Cloud account/project resources are initialized from repository-defined tooling rather than a remembered console checklist.

From an authenticated machine with the Google Cloud CLI:

```bash
export GCP_PROJECT_ID='<project-id>'
export GCP_REGION='<selected-region>'
bash infra/gcp/bootstrap-production.sh
```

The bootstrap is idempotent and creates/configures:

- required Google Cloud APIs
- Artifact Registry Docker repository
- dedicated GitHub deploy service account
- dedicated Cloud Run runtime service account
- GitHub OIDC Workload Identity Pool/provider restricted to `jinfenghua1990/ALSVID`
- least-purpose deployment/runtime IAM bindings
- Secret Manager resource shells for Neon `DATABASE_URL` and R2 credentials

It intentionally does **not** write secret values. It prints the non-secret GitHub `production` Environment variables required by `.github/workflows/production-deploy.yml`.

## Configuration and secrets

Production secret values come from Google Cloud Secret Manager and are read by Cloud Run at deploy/run time or by an authorized local Production startup operator. They are not committed, embedded in images or stored as GitHub variables.

Required secret names:

- `alsvid-database-url` — Neon production PostgreSQL connection URL
- `alsvid-r2-access-key` — Cloudflare R2 access key
- `alsvid-r2-secret-key` — Cloudflare R2 secret key

Non-secret GitHub `production` Environment variables are documented in `docs/PRODUCTION_RUNBOOK.md`.

## Release

Production deployment builds and publishes only Web and API images. The Worker scaffold remains available to local/CI acceptance, but no Worker Pool is created by the production workflow. Introduce a production worker only with registered business handlers and an explicit processing requirement.

Production releases are reproducible from a Git commit SHA. **Temporary WWW-only staged mode (2026-10-20):** after passing main CI, compatible frontend/workflow-only changes are dispatched to `.github/workflows/www-deploy.yml`, which deploys only `alsvid-web` and verifies the live `www.alsvidbike.com/release-check` commit; it does not migrate the database or touch the API, worker, email or auth base. Backend/database/shared/infrastructure changes are not automatically promoted through this path. `.github/workflows/production-deploy.yml` remains the explicit full-platform release/rollback workflow, and must only be used after its additional domain, authentication and service preflight checks pass. Both workflows validate exact commit CI and immutable image identity.

No production fix is made by editing a running container.

## Portability

Cloud Run, Neon and R2 are selected production providers, not Domain dependencies. Environment-driven configuration and provider ports preserve the ability to replace runtime/database/object-storage infrastructure without redesigning ALSVID business logic.

## Rollback rule

Application rollback means redeploying a previous known-good commit that is already contained in `main`. It does not restore the database over the live database. A release with an irreversible schema change must have a reviewed forward-fix or database recovery plan before deployment; application code and database schema must remain compatible during rollback.

## Acceptance boundary

Repository-side Docker/Test acceptance is complete. Production is not accepted until all of the following have real evidence:

- Neon production database created and reachable with TLS
- Cloudflare R2 bucket and scoped credentials created
- Google Cloud bootstrap completed
- required Secret Manager values added
- first GitHub Production Deploy succeeds
- API/Web and database/object-storage access verified live
- PostgreSQL restore drill succeeds against an isolated target
- independent backup/Q4 procedure is proven
- budget/alert/operational monitoring is configured

See `docs/PRODUCTION_RUNBOOK.md`, `docs/RUNTIME_ARCHITECTURE.md` and ADR 0003.
