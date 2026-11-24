# ALSVID Agent Constitution

These rules are mandatory for all human and AI contributors.

## 1. Repository purpose

`jinfenghua1990/ALSVID` is the standalone, sole long-term implementation authority for the ALSVID bicycle business. It is not a DOMESTIC workspace and must not depend on the ChaiBen-OS multi-workspace runtime.

No new ALSVID feature belongs in `jinfenghua1990/ChaiBen-OS`. Legacy ChaiBen ALSVID code is retirement/history only.

## 2. Pre-work protocol

Before meaningful code changes:
1. Read latest `main`.
2. Read this file.
3. Read `docs/CURRENT_STATE.md`.
4. Read `docs/ARCHITECTURE.md`.
5. Read `docs/DATA_OWNERSHIP.md`.
6. For product/domain/Vehicle work, read `docs/PRODUCT_ARCHITECTURE.md`.
7. For Dealer Portal, My ALSVID, QR, public/service routing or authorization work, read `docs/PORTAL_ARCHITECTURE.md`.
8. For Internal Admin/UI work, read `docs/ADMIN_UI_SPEC.md`.
9. For Shopify/OMS/WMS/logistics/order-mirror/after-sales-fulfillment work, read `docs/EXTERNAL_SYSTEM_BOUNDARIES.md`.
10. For runtime/hosting/environment/backup/deployment work, read `docs/DEPLOYMENT_ARCHITECTURE.md`.
11. Check relevant Issue/PR and current code before creating a second implementation.
12. Meaningful feature/fix work uses Issue -> branch -> PR.

`docs/MIGRATION_INVENTORY.md`, `docs/DATA_CUTOVER.md` and other extraction notes are historical records unless a current Issue explicitly reactivates migration work. They must not override `CURRENT_STATE.md`.

## 3. Zero-data cutover and migration rule

The legacy ChaiBen-OS ALSVID workspace contains no business data that needs preservation. Standalone ALSVID therefore starts from its own clean schema/bootstrap. Do not invent dummy legacy data or treat source-to-target row migration as a release blocker.

When consulting legacy code, use **rewrite-while-migrating**, not copy-and-freeze. Preserve validated business invariants, but rewrite code when it contains:
- `chaiben.*` package coupling;
- GLOBAL/DOMESTIC/ALSVID workspace switching that no longer applies;
- 1688 or JackYun dependencies;
- assumptions that ALSVID is only a view over another repository;
- duplicated business authority;
- ambiguous event ordering or lifecycle logic;
- stale naming or architecture comments.

## 4. Frozen domain rules

- One physical bicycle = one canonical Vehicle.
- `frame_number` is immutable and globally unique within ALSVID.
- Vehicle creation happens no later than factory outbound.
- Product definition and physical Vehicle identity are separate.
- Released BOM/build evidence for an existing Vehicle is immutable.
- Material lifecycle history is append-only/auditable.
- Dealer and customer are relationships to canonical partner identities, not duplicate masters.
- Warranty and ServiceCase are canonical after-sales authorities.
- Shopify remains external OMS; do not recreate Shopify order management.
- Future third-party OMS remains external order-orchestration authority; ALSVID stores only selected confirmed facts/references needed for Vehicle, Partner, dealer and after-sales context.
- WMS/3PL remains external warehouse-execution authority. ALSVID may issue narrowly scoped after-sales replacement/repair-parts fulfillment requests tied to ServiceCase without becoming a general OMS.
- Binary files live in R2/S3-compatible object storage; database stores metadata.
- External IDs are mappings only.
- Money uses PostgreSQL NUMERIC / Python Decimal, never float.
- Schema changes require migrations.

## 5. Infrastructure rules

- PostgreSQL is the authoritative business database. Connection configuration comes from `ALSVID_DATABASE_URL`.
- R2/S3-compatible storage owns binary objects. Configuration comes from `ALSVID_R2_*` environment variables.
- Live PostgreSQL URLs, passwords, R2 access keys and other production secrets must never be committed to Git.
- Browser clients never receive R2 credentials; use dedicated object-storage APIs and short-lived signed URLs where appropriate.
- Do not use `Base.metadata.create_all()` as a deployment path. Schema changes go through Alembic.
- Google Cloud Run is the current preferred managed compute target for the initial low-traffic phase, using request-based billing and scale-to-zero. It is a replaceable runtime layer, not a business-data authority.
- Test and Production must use separate runtime services, PostgreSQL environments and R2 buckets; never share the same production database/bucket with Test.
- Q4 is backup/disaster-recovery/internal-tooling infrastructure, not the customer-facing production runtime.

## 6. Product boundary

Runtime/UI code must not introduce DOMESTIC-only integrations or concepts. Specifically, 1688, 吉客云/JackYun and 卖咖啡的熊 are prohibited from ALSVID runtime packages unless a future explicit architecture decision changes the boundary.

Future procurement, inventory, logistics and finance capabilities must be designed for ALSVID export operations, not copied from DOMESTIC workflows.

## 7. Entrances and authorization

Internal Admin, Dealer Portal, My ALSVID and public/service routes may present different experiences, but they must use the same authoritative domain records. Hidden UI is never authorization; backend scope is authoritative.

Portal/domain separation must not create duplicate Product, Partner, Vehicle, Warranty, ServiceCase or business-rule authorities.

## 8. Testing

Every domain must retain or improve regression coverage. Vehicle lifecycle changes require explicit tests for event order, duplicate frame rejection, dealer custody, PDI/handover sequencing, ownership changes and immutable birth facts.

Architecture boundary tests must continue to reject `chaiben.*`, legacy workspace identity contracts, 1688, JackYun/吉客云 and other DOMESTIC contamination.

## 9. Destructive changes

Stable-ID changes, authentication, finance, inventory-ledger semantics, schema migrations and production deployment are high-risk. Stage and verify before destructive changes.

## 10. Project memory

GitHub Issues, PRs and repository docs are durable project memory. Chat is not the authoritative implementation record.

When documentation conflicts, current authority order is:
1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/ARCHITECTURE.md` and `docs/DATA_OWNERSHIP.md`
4. `docs/PRODUCT_ARCHITECTURE.md`, `docs/PORTAL_ARCHITECTURE.md`, `docs/ADMIN_UI_SPEC.md` for their respective product surfaces
5. `docs/EXTERNAL_SYSTEM_BOUNDARIES.md` and `docs/DEPLOYMENT_ARCHITECTURE.md` for their respective integration/deployment scopes
6. current code/tests and active Issue/PR decisions
7. historical migration/extraction notes
