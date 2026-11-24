# ChaiBen-OS → standalone ALSVID data cutover (historical contingency runbook)

> Current decision: **zero-data cutover**. The legacy ChaiBen-OS ALSVID workspace contains no business data that needs preservation, so this runbook is **not** the active production cutover path and is **not** a release blocker. See `docs/CURRENT_STATE.md`.
>
> Keep this document and its tooling only as historical/contingency material in case a future audit discovers legacy ALSVID business rows that actually require preservation. Future contributors must not invent dummy legacy business data merely to exercise this path.

## Safety model

If this contingency path is ever explicitly reactivated by a current Issue, the migration tool is **dry-run by default**. It opens the target transaction, executes the same mapping/conflict checks as a real migration, and rolls the transaction back unless `--apply` is supplied.

The source database is never modified.

The migration deliberately excludes:

- Organization / LegalEntity / Workspace records;
- DOMESTIC/卖咖啡的熊 data;
- 1688 and JackYun/吉客云 integrations;
- generic domestic procurement, inventory, banking, tax and finance facts;
- active ChaiBen authentication sessions.

Only ALSVID-owned catalog/engineering/vehicle/dealer/customer/service/assets facts and the exact Partner/User identities they reference are eligible.

## Preconditions

Use these steps only if a current Issue explicitly reactivates the contingency migration path.

1. Take a verified backup/snapshot of the standalone target database.
2. Apply the current standalone schema:

```bash
alembic upgrade head
```

3. Seed reference roles, permissions and FC/FT/CT/GT platforms:

```bash
python -m alsvid.bootstrap
```

4. Supply database URLs outside Git. Prefer environment variables rather than command-line URLs:

```bash
export CHAIBEN_DATABASE_URL='postgresql+psycopg://...'
export ALSVID_DATABASE_URL='postgresql+psycopg://...'
```

Never commit either value.

## Step 1 — dry-run

```bash
python tools/migrate_from_chaiben.py
```

A successful dry-run must return `ready: true` and explicitly state that the target transaction was rolled back.

The migration is blocked rather than guessing when it finds, for example:

- an ALSVID model linked to a Product outside the ALSVID Workspace;
- an ALSVID Vehicle/SKU linked outside that Workspace;
- duplicate normalized frame numbers;
- a Vehicle without a frozen BOM revision or build snapshot;
- broken Vehicle lifecycle sequences/references;
- missing Dealer/Customer/User references;
- a stable-ID or business-key conflict in the standalone target.

Repair the historical source fact or document an explicit remediation before continuing. Do not synthesize a birth BOM for an already-built bicycle merely to make the migration pass.

## Step 2 — apply

Only after the dry-run is clean:

```bash
python tools/migrate_from_chaiben.py --apply
```

The write is one target transaction. Any migration exception rolls the target transaction back.

Reference rows already seeded in the standalone database are mapped by business identity:

- Product platforms: `code` (FC/FT/CT/GT);
- authorization roles: `code`.

Business records preserve stable IDs where the standalone model supports them, including Product/SKU, model/part/BOM revision, Vehicle/lifecycle, BusinessPartner, Warranty/ServiceCase, claims/consent and Asset metadata.

Legacy Vehicle columns are transformed as follows:

```text
customer_partner_id -> current_customer_partner_id
dealer_partner_id   -> current_dealer_partner_id
```

Legacy table names are also mapped to standalone names, such as `alsvid_models -> bicycle_models` and `alsvid_marketing_consent_events -> marketing_consent_events`.

## Step 3 — post-apply verification

Run the same command again **without** `--apply`:

```bash
python tools/migrate_from_chaiben.py
```

It must still return `ready: true`, with the migrated stable rows reported as already existing rather than duplicated.

Then verify the standalone application with real data:

- Product Center opens FC/FT/CT/GT products and released BOM history;
- Vehicle Center searches every migrated frame number and Vehicle 360 shows birth/lifecycle facts;
- Dealer Portal sees only its assigned vehicles;
- Customer Center preserves current/former ownership and explicit marketing consent evidence;
- My ALSVID account sign-in works with the migrated credential hash and receives a fresh standalone session;
- Service Center shows migrated warranty/service cases;
- R2 Asset metadata resolves to the expected object keys.

Do not reuse old ChaiBen auth sessions. The standalone application issues its own sessions after login.

## Rollback

Before `--apply`, rollback is automatic because dry-run writes are never committed.

If post-apply business verification fails, stop traffic to the standalone target and restore the pre-cutover target backup/snapshot. The legacy source remains unchanged while the migration defect is repaired.

Do not delete or rewrite ChaiBen migration history as a rollback mechanism.

## Current disposition

This source-to-target business-row migration is **not required** under the current zero-data decision. Legacy ChaiBen ALSVID runtime retirement is governed by the current ChaiBen retirement work, not by completion of this contingency runbook.

If future evidence proves that legacy ALSVID business rows do exist and must be preserved, create a current Issue first, revalidate this tool against both current schemas, then apply the safety sequence above.
