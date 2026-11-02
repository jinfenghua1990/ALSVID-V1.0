# Shopify runtime retirement — ALSVID

Status: code removal proposed in this branch; production deployment requires separate matched-SHA verification.

## Owner decision

ALSVID runs its **own** Next.js/NestJS first-party ecommerce flow, with **one** Neon PostgreSQL source of truth, Cloudflare R2 for assets, and Google Cloud Run as a supported production runtime. Shopify must not be reintroduced as the checkout engine, a separate business data authority, or a second deployable backend.

The previous Shopify webhook ingestion and replay service, payload normalizer, developer UI, legacy environment keys and new-channel registration are retired. No code or UI may re-enable them implicitly. If the owner later authorizes an external marketplace integration, use a newly reviewed ADR, explicitly scoped endpoints, consent and production acceptance tests.

## Historical business facts are not deleted

Older migrations, the `SHOPIFY` provider label, legacy `commerce.channels` rows and retained `integrations.webhook_receipts`, `integrations.ingestion_attempts`, externally sourced orders, mappings and audit trails remain in the database **if they were created historically**. They must remain available as read-only evidence while existing obligations are assessed. Do not issue `DROP`, `DELETE`, or destructive backfill operations on the production database merely to remove a runtime adapter.

The Admin commerce workspace can display the legacy channel provenance and historical receipts, but no longer offers Shopify registration, manual webhook writes or event replay. `commerce.createChannel` rejects Shopify and unknown providers server-side; bypassing the UI must not re-enable it.

Warehouse-provider settings and SKU/warehouse mappings remain supported via the shared Integrations domain. Existing Amazon/OTHER channel definitions are not a claim that an Amazon adapter is operational.

## Deployment and residual checks

- CI must pass both code/typecheck and container smoke tests for the **same commit**; run the authenticated browser check.
- A successful merge is not a successful release. Verify the final main SHA and Cloud Run revision(s), `/release-check`, Admin and WWW health.
- Inspect historical Cloud Run services, revision traffic and external webhook subscriptions separately before deleting any cloud resources or revoking credentials. This commit does not establish they are absent or disabled at third-party providers.
- Prevent reintroduction using `scripts/retired-architecture.test.mjs` in the standard CI pipeline.

Source of current truth: [ADR 0005](adr/0005-alsvid-owned-storefront-and-third-party-payments.md), [Release Flow](RELEASE_FLOW.md), and [Single-system Contract](ONE_SYSTEM_DEVELOPMENT_CONTRACT.md). Old Shopify-first docs are archives, not build instructions.
