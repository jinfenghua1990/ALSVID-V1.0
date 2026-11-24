# ALSVID Infrastructure Contract

This document defines the durable infrastructure boundary. It does not contain live credentials.

## PostgreSQL

- Purpose: authoritative ALSVID business data and metadata.
- Runtime setting: `ALSVID_DATABASE_URL`.
- ORM: SQLAlchemy 2.x.
- Schema authority: Alembic migrations in this repository.
- Production rule: live URL, username, password and certificates are deployment secrets; do not commit them.
- Deployment rule: apply `alembic upgrade head`; do not use ORM `create_all()` as schema deployment.

## Cloudflare R2 / S3-compatible object storage

- Purpose: binary images, video, manuals, 3D/GLB, exploded views and other assets.
- Metadata authority: PostgreSQL `Asset` records and related domain references.
- Byte authority: R2/S3-compatible bucket.
- Runtime settings:
  - `ALSVID_R2_ENDPOINT_URL`
  - `ALSVID_R2_BUCKET`
  - `ALSVID_R2_ACCESS_KEY_ID`
  - `ALSVID_R2_SECRET_ACCESS_KEY`
  - `ALSVID_R2_REGION`
  - `ALSVID_R2_PUBLIC_BASE_URL`
  - `ALSVID_R2_PRESIGN_SECONDS`
- Production rule: access keys remain outside Git and never reach browser clients.
- Access rule: use the repository object-storage service to create signed upload/download URLs; public assets may use a configured public base URL.

## Shopify

- Purpose: external storefront/order-management system.
- ALSVID must not duplicate Shopify OMS behavior.
- Shopify IDs are references/mappings, never canonical ALSVID primary keys.

## Deployment state

Code support for PostgreSQL and R2 is present in the repository. Live production infrastructure is a separate deployment concern: a real database instance, real bucket, DNS/domains, runtime host and secrets must be provisioned/configured outside Git.

A contributor must never interpret blank values in `.env.example` as “R2 functionality is missing”; they intentionally mean that credentials are environment-specific secrets.
