# ALSVID Deployment Architecture

Status: current deployment decision for the initial low-traffic phase

## Operating context

ALSVID is primarily an internal bicycle-business and after-sales system. Its main day-to-day users are internal staff, with secondary dealer/service/customer Vehicle access. Shopify remains the external storefront/commerce/OMS system.

ALSVID therefore does not need an always-hot ecommerce runtime. A managed serverless container platform that can scale to zero is preferred during the initial low-traffic phase.

## Current deployment target

Google Cloud Run is the current preferred compute/runtime target.

Reasons:

- mature managed platform;
- runs the existing containerized Python/FastAPI application without turning ALSVID into a platform-specific application;
- automatic HTTPS and managed container runtime;
- request-based billing and scale-to-zero fit a low-frequency internal system;
- broad global region availability;
- runtime can later be moved without moving ALSVID business authority.

Cloud Run is **compute only**. It must never become the authority for ALSVID business records or binary assets.

## Initial topology

```text
GitHub private repository
        |
        v
Google Cloud Run
ALSVID FastAPI / UI runtime
        |
        +--> managed PostgreSQL (initial target: Supabase)
        |
        +--> Cloudflare R2 / S3-compatible object storage
        |
        +<-> Shopify / future OMS / WMS / logistics connectors

PostgreSQL + R2 + GitHub
        |
        v
Q4 scheduled backup / disaster-recovery copy
```

## Test and production isolation

Keep exactly two environments during the current company stage:

### Test

- separate Cloud Run service/revision environment;
- separate managed PostgreSQL Test project/database;
- separate R2 Test bucket;
- non-production credentials;
- safe synthetic/test external integrations.

### Production

- separate Cloud Run service;
- separate managed PostgreSQL Production project/database;
- separate R2 Production bucket;
- production credentials stored only as deployment secrets;
- production external integrations.

Test and Production must never share the same database or R2 bucket.

## Initial Cloud Run cost posture

The initial objective is normal monthly Cloud Run compute cost of approximately $0 while usage stays inside the free allowance. This is a cost target, not a guarantee.

Configure conservatively:

- request-based billing;
- minimum instances: `0`;
- maximum instances: `1` initially;
- smallest CPU/memory configuration that passes realistic ALSVID tests;
- no always-on worker process in the web container;
- no unnecessary VPC connector or other continuously billed infrastructure;
- use R2 for binary delivery instead of sending large files through Cloud Run.

Google Cloud budgets/alerts must be enabled before Production. Where Budget Spend Caps are available for the billing account/project, configure a low cap so Cloud Run pauses rather than continuing to accumulate Cloud Run charges. Spend Caps are a platform feature and availability must be verified in the actual billing account before relying on them as the only cost guardrail.

Maximum instances is a secondary cost/safety guardrail, not a precise spending limit.

## Region selection

Do not hard-code the business architecture to a single region.

Initial candidates are Hong Kong or Singapore because internal staff are primarily in China while European access is secondary. Before Production, test the actual Cloud Run URL from the company's normal mainland-China networks and from at least one European network.

The acceptance criterion is reliable normal access, not minimum latency. If a selected Google Cloud region/domain is unreliable from mainland China, switch region or runtime provider without changing PostgreSQL/R2/business architecture.

## Container contract

The Cloud Run container must:

- listen on `0.0.0.0`;
- use the platform-provided `PORT` value (defaulting to `8080` only for local/container convenience);
- expose `GET /health`;
- not store persistent business data on the container filesystem;
- read database/R2/provider credentials from environment/secrets;
- start without creating or mutating the database schema implicitly.

Schema changes are deployed through Alembic as a separate controlled step before/with an application release. Do not use `Base.metadata.create_all()`.

## Environment and secrets

The repository may contain names/examples of environment variables but never live values.

Core variables include:

- `ALSVID_ENVIRONMENT`
- `ALSVID_DATABASE_URL`
- `ALSVID_R2_ENDPOINT_URL`
- `ALSVID_R2_BUCKET`
- `ALSVID_R2_ACCESS_KEY_ID`
- `ALSVID_R2_SECRET_ACCESS_KEY`
- `ALSVID_R2_REGION`
- `ALSVID_R2_PUBLIC_BASE_URL`

Future Shopify/WMS/OMS/provider credentials follow the same rule: deployment secret only, never committed.

## Managed PostgreSQL

PostgreSQL is the architectural dependency; Supabase is the current initial managed-provider choice because it is simple to operate and provides a free starting tier.

Create independent Test and Production projects/databases. The application remains portable because it connects through `ALSVID_DATABASE_URL` and standard PostgreSQL/Alembic.

## Object storage

Cloudflare R2 remains the initial binary-object provider.

Create independent Test and Production buckets. Store images, manuals, PDFs, videos, 3D files, service attachments and similar binary objects in R2; PostgreSQL stores metadata/references.

## Q4 role

Q4 is not a customer-facing production runtime.

Its role is local backup/disaster recovery and optional internal tooling. Scheduled backup should eventually cover:

- PostgreSQL dumps/exports;
- R2 object copies or verified incremental sync;
- Git repository mirror/bundle;
- critical configuration inventory (never plaintext secrets in Git).

A second off-site backup may be added later; Q4 must not become the only copy of production data.

## Runtime portability

Cloud Run is a replaceable compute layer. If cost, mainland-China reachability, platform policy or business needs change, ALSVID may move to another Docker/container runtime without redefining the business architecture.

The durable authorities remain:

- GitHub: source code/history;
- PostgreSQL: structured business facts;
- R2/S3-compatible object storage: binary objects;
- Shopify / OMS / WMS / logistics providers: their respective external execution facts;
- ALSVID: Vehicle, VIN, Warranty, ServiceCase and other explicitly ALSVID-owned domain facts.
