# ALSVID Extraction Inventory

Source baseline: `jinfenghua1990/ChaiBen-OS@5cb68246f5049be90f9acdb4d6dc89b7decec803`

This ledger decides what is rewritten, migrated, deferred or explicitly rejected from the standalone ALSVID repository.

## Status legend

- `REWRITE` — business meaning is useful, but monolith coupling or implementation quality requires a new implementation.
- `MIGRATE` — behavior is ALSVID-owned and can be moved after namespace/dependency cleanup.
- `DEFER` — belongs to ALSVID eventually but is not required for the current extraction slice.
- `REJECT` — belongs to another business and must not enter ALSVID runtime.

## Foundation

| Source | Disposition | Reason |
|---|---|---|
| `apps/api/chaiben/ids.py` | REWRITE | Keep stable prefix semantics needed by ALSVID; drop unrelated company/domestic identifiers |
| `apps/api/chaiben/db.py` | REWRITE | New `alsvid` package and standalone database lifecycle |
| `apps/api/chaiben/models/core.py` | REWRITE | Keep User/Role/Permission; remove Organization/Workspace switching assumptions |
| `apps/api/chaiben/models/auth.py` | REWRITE | Session must not require `current_workspace_id` |
| `apps/api/chaiben/models/catalog.py` | REWRITE | Product/SKU remain canonical, but `workspace_id` and old shared-brand assumptions are obsolete |
| `apps/api/chaiben/models/partners.py` | REWRITE | Keep canonical Partner; remove Workspace-coupled source links and domestic matching assumptions |

## ALSVID engineering and assets

| Source | Disposition | Reason |
|---|---|---|
| `models/alsvid.py` | REWRITE | Split large mixed model file into catalog/engineering/vehicle/customer/service/assets domains |
| `services/alsvid_engineering.py` | MIGRATE | Preserve released BOM semantics after dependency cleanup |
| `routers/alsvid_product_center.py` / `alsvid_products_web.py` | MIGRATE | ALSVID-owned UI/API |
| `routers/alsvid_asset_storage.py` / `alsvid_assets_web.py` | MIGRATE | Preserve signed R2 asset flow; rename package/config |
| migration `20261007_0008_alsvid_engineering.py` | REWRITE | New standalone baseline migration should create only ALSVID-owned dependencies |

## Vehicle lifecycle

| Source | Disposition | Reason |
|---|---|---|
| `services/vehicle_lifecycle.py` | REWRITE | Durable rules are valid, but event lookups and monolith dependencies must be corrected |
| `routers/alsvid_vehicle_center.py` / `alsvid_vehicles_web.py` | MIGRATE | Vehicle 360 belongs to ALSVID |
| migration `20261008_0013_alsvid_vehicle_lifecycle.py` | REWRITE | Fold into standalone migration chain |
| `tests/test_alsvid_vehicle_lifecycle.py` | MIGRATE + EXPAND | Preserve invariants and add regression for latest receipt/PDI event ordering |

### Confirmed vehicle defect eliminated in standalone code

Legacy `RETAIL_SOLD` validation assigns a variable named `latest_pdi` from an unordered query. It does not explicitly order PDI events by descending `sequence_no` and limit to one row, while the corresponding receipt lookup does. The standalone implementation now resolves the latest relevant event deterministically and includes regression coverage for receipt/PDI ordering.

## Dealer

| Source | Disposition | Reason |
|---|---|---|
| `models/dealer.py` | MIGRATE after foundation | DealerProfile and DealerPortalMember are ALSVID-owned |
| `routers/dealer_portal.py` | MIGRATE | ALSVID dealer portal despite generic filename |
| `services/dealer_portal.py` | MIGRATE + REVIEW | Preserve dealer isolation and PDI/handover behavior |
| `schemas_dealer_portal.py` | MIGRATE | ALSVID-owned contract |
| migration `20261008_0015_dealer_portal_members.py` | REWRITE | Fold into standalone chain |
| dealer portal tests | MIGRATE | Preserve custody/PII authorization regressions |

## Customer / My ALSVID

| Source | Disposition | Reason |
|---|---|---|
| `routers/my_alsvid.py` / `services/my_alsvid.py` | MIGRATE + REVIEW | ALSVID buyer experience |
| `routers/alsvid_customer_center.py` / `alsvid_customers_web.py` | MIGRATE | ALSVID internal Customer Center |
| `schemas_my_alsvid.py` | MIGRATE | Customer claim/Garage contracts |
| migration `20261008_0014_my_alsvid_claim_and_consent.py` | REWRITE | Fold into standalone chain |
| My ALSVID/customer tests | MIGRATE | Preserve claim ownership and consent evidence |

## Warranty / service

| Source | Disposition | Reason |
|---|---|---|
| `routers/alsvid_service_center.py` / `alsvid_service_web.py` | MIGRATE | ALSVID after-sales |
| `services/alsvid_service.py` | REWRITE | Legacy case opening mutates Partner dealer role as a side effect; standalone service validates role instead |
| Warranty / ServiceCase portions of `models/alsvid.py` | REWRITE | Separate into after-sales domain |

### Confirmed after-sales defect eliminated in standalone code

Legacy `open_service_case()` sets `dealer.is_dealer = True` whenever a partner ID is supplied. A service transaction must not silently change master-data identity/roles. The standalone service rejects an inactive/non-dealer partner and has a regression test proving the failed service operation leaves the partner role unchanged.

## Supply chain / finance

Old Procurement, Inventory, Logistics and Finance code is not copied wholesale. ALSVID needs these capabilities, but they will be extracted domain-by-domain with foreign-trade/EU scope. Domestic accounting and channel assumptions are not automatically authoritative here.

## Explicitly rejected

- `apps/api/chaiben/integrations/alibaba1688.py` — REJECT
- `apps/api/chaiben/integrations/jackyun.py` — REJECT
- DOMESTIC/卖咖啡的熊 workspace UI and synchronization jobs — REJECT
- ChaiBen multi-workspace selector and `Workspace`-scoped authorization — REJECT
- company-wide monthly delivery/reporting automation that is unrelated to ALSVID — REJECT unless later specified

## Source removal gate

Do not remove an ALSVID capability from ChaiBen-OS until all of the following are true:
1. corresponding standalone code exists;
2. migrated/rewritten regression tests pass;
3. database/data migration is documented and reversible;
4. the standalone entrance is verified;
5. an explicit source-removal PR is reviewed separately.
