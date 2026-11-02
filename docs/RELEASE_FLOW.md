# ALSVID Release Flow

> **Current operating evidence: 2026-10-25.** This supersedes the 2026-10-20 temporary “WWW-only until Admin TLS works” launch note. The old Admin TLS failure is historical; a successful full deploy on 2026-10-25 verified the Admin login hostname.

## Current GitHub release pipeline

```text
Feature branch / PR → CI (verify + containers; browser preview where applicable)
                    → review / guarded auto-merge into main
                    → exact-main-SHA CI
                    → changed-path classification
                      ├─ WWW-only change → WWW Production Deploy
                      └─ API/Worker/domain/DB/lockfile/infra/workflow change → ALSVID Production Deploy
```

- **WWW-only**: [`.github/workflows/www-deploy.yml`](../.github/workflows/www-deploy.yml) builds and deploys only Web; API, database, mail configuration and Worker are preserved. It verifies `/release-check` matches the new Web commit, six `zh/de/en × bikes/accessories` catalog pages and Admin login modes. If post-deploy verification fails, its workflow attempts to restore the previously serving Web revision.
- **Full platform**: [`.github/workflows/production-deploy.yml`](../.github/workflows/production-deploy.yml) builds or reuses immutable Web/API images, executes explicit migrations, deploys API, checks health/Dealer routes/mail configuration, then deploys Web and checks the public site and Admin. [PR #361](https://github.com/jinfenghua1990/ALSVID/pull/361) added exact-release-SHA and multilingual catalog smoke parity to the full workflow. It does **not** prove database restore or authenticated Admin business operations.
- CI never uses Production data or secrets for its isolated PostgreSQL/container tests. A green CI or Cloud Run rollout does not, by itself, prove checkout, payment, inventory fulfillment or external-system acceptance.
- Changes to a GitHub workflow or shared dependency require the full release path. Main-branch release dispatch rejects obsolete source SHAs. A manual rollback is restricted to eligible previously released commits and does **not** reverse migrations.
- Cloud Run uses one production runtime: **verified `alsvid-production` / `europe-west1`**, running only shared `alsvid-web` and `alsvid-api` app services. Both release workflows now reject other projects/regions; `alsvid-prod` is not the live deployment. The retired `alsvid-dev` shared environment must not be recreated as a normal promotion stage.
- The retired local `infra/docker-compose.yml` (independent PostgreSQL/MinIO) is removed. `pnpm infra:up/down/status` uses the optional verified shared-Neon/R2 local runtime, not a second database. CI continues to use its isolated `infra/docker-compose.test.yml` with synthetic data.
- The `/admin-legacy` page is removed and redirects to the canonical `/admin`. The still-imported `theme-legacy.css` remains until its active page styles are migrated; deleting an imported stylesheet without testing can break unrelated pages.
- WWW-only post-deploy smoke failures still **explicitly restore the previously serving Web revision for availability** and now produce a prominent rollback error and summary. A rollback is not a successful release. The exact-SHA final `/release-check` remains mandatory. No old revision or Cloud Run service is deleted remotely by this repository cleanup.

## Observed production versus intended migration

The [successful full production release #40169393607](https://github.com/jinfenghua1990/ALSVID/actions/runs/40169393607) deployed SHA `a9f6a3746ff738a5300d96c465790f3a7f7656b3` in **GCP project `alsvid-production`**, region **`europe-west1`**. Logs verify Web/API deployment, API health, public Dealer endpoint and Admin login modes. This is the **observed runtime**, not a promise that every business process has passed end-to-end acceptance.

The separately created **`alsvid-prod`** is the intended new-project migration target, **not a verified active deployment**. The GitHub Production Environment's `GCP_PROJECT_ID` and related Workload Identity / secrets / registry variables control the actual target. Do not simply change those variables to `alsvid-prod`, point it at live Neon/R2 or switch DNS without checking new-project provisioning, secret isolation, database migration strategy, service identity, full smoke tests, rollback and domain cutover. Track this in [Issue #34](https://github.com/jinfenghua1990/ALSVID/issues/34).

## Domain checks before and after rollout

Before either full-platform or WWW-only rollout, check HTTPS connectivity to the canonical domain(s). DNS, TLS and transport errors stop the release. HTTP 4xx/5xx from the currently serving page are logged with the URL and status as warnings so an unhealthy old page does not block the repair deployment.

After rollout, the existing strict checks remain mandatory: public pages must succeed, Web release SHA must match, catalog markers and Admin login modes must be present, and full-platform API readiness must pass. A WWW-only post-deploy failure still triggers its existing previous-revision recovery. A failed full-platform release requires the existing reviewed recovery procedure; this connectivity change does not roll back data or alter release authorization.

## Release acceptance boundaries

1. The selected full 40-character source SHA exists on `main`, is current for an ordinary release, and has successful exact-SHA `verify` and `containers` jobs.
2. Confirm the correct workflow ran and its own post-deploy validations passed. Compare `/release-check` to the expected SHA; check public site and Admin login; for a full release also check API/Dealer and migration steps.
3. After publication, perform **authenticated business** acceptance separately: user permissions, Product approvals, orders/inventory/production transitions, audit trail, and error handling.
4. External acceptance is separately required for PSP, 3PL/WMS, R2 read/write/checksum, isolated Neon backup/restore drill, cost alerts and domain/auth cutover. None is completed solely by a green deployment badge.
5. If a full release fails after API/database changes, preserve evidence and apply a compatible reviewed forward fix or rollback plan. Do not restore an older database directly over live Production.

See [Production Runbook](PRODUCTION_RUNBOOK.md), [Environment Architecture](ENVIRONMENT_ARCHITECTURE.md), [Current State](CURRENT_STATE.md) and [Issue #34](https://github.com/jinfenghua1990/ALSVID/issues/34).

## Second legacy architecture cleanup (2026-11-02)

- The 85-page Ardot mock screen corpus and redundant Admin fixture renderer are removed. Only implemented route metadata remains; archived deep links return to live workspaces rather than rendering simulated sales or vehicle records.
- Publicly served stale Vue 2/Element UI assets and the isolated CRMEB PHP/MySQL validation pipeline, source-import automation and native runtime snapshots are retired. Existing ALSVID Next.js, API and Neon/R2 authority are unchanged; historical license and ADR records remain.
- Duplicate theme-legacy.css selectors were folded into theme.css; old workbench variants redirect to /admin.
- Production deployment and API/database acceptance remain exact-SHA gated. This code cleanup does not itself delete old Cloud Run revisions/services or live business data; audit production resource ownership before any remote deletion.

## Retired references

The previous 2026-10-20 `WWW-only because Admin TLS failed` note and older `alsvid-prod`-as-live claims are historical, not current runtime evidence. `development-deploy.yml`, `promote-development.yml` and `test-build.yml` are retired; no cloud resource cleanup is implied.
