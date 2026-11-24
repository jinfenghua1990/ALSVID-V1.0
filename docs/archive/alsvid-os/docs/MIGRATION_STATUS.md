# ALSVID Standalone Extraction Status

Status: extraction complete; zero-data cutover selected; ChaiBen ALSVID runtime retired.

This file records parity for ALSVID-specific capabilities from the former ChaiBen-OS implementation. It does not treat future export features as migration debt.

| Capability | Standalone status | Disposition |
|---|---|---|
| Repository/runtime/database boundary | DONE | REWRITE |
| Authentication / authorization | DONE | REWRITE |
| Product / SKU foundation | DONE | REWRITE |
| FC / FT / CT / GT engineering | DONE | REWRITE |
| Parts / BOM / released revisions | DONE | REWRITE |
| R2 asset storage service/API | DONE | REWRITE |
| Vehicle identity / lifecycle | DONE | REWRITE |
| Vehicle Center / Vehicle 360 API | DONE | REWRITE |
| Dealer Portal | DONE | MIGRATE + REVIEW |
| My ALSVID claim / Garage | DONE | MIGRATE + REVIEW |
| Warranty / Service domain service | DONE | REWRITE |
| Internal Customer Center API | DONE | REWRITE projection |
| Internal Service Center API | DONE | REWRITE projection |
| Commercial channels / external order facts | DONE | ALSVID-native |
| Export shipments / milestones | DONE | ALSVID-native |
| Commercial finance facts | DONE | ALSVID-native |
| Inventory locations / append-only movements | DONE | ALSVID-native |
| Dealer inventory reservations | DONE | ALSVID-native |
| EU customs / import VAT / export-refund facts | DONE | ALSVID-native |
| Legacy HTML/Web ALSVID pages | REJECT | Replace with standalone UI |
| Legacy ALSVID business-data migration | NOT REQUIRED | Zero-data cutover: no legacy ALSVID business rows require preservation |
| Legacy data-cutover tooling | RETAINED | Historical/contingency tooling only; not runtime authority |
| ChaiBen-OS ALSVID runtime | RETIRED | Old routes/UI/runtime removed; no new ALSVID work allowed |
| 1688 / JackYun / DOMESTIC workspace logic | REJECT | Must never enter ALSVID runtime |
| Generic DOMESTIC procurement/inventory/finance | REJECT AS MIGRATION | ALSVID export-specific capabilities are built independently |

## Existing ALSVID runtime parity

All ALSVID-specific domain/API capabilities from the extraction baseline have standalone replacements. `jinfenghua1990/ALSVID` is the sole authority for future ALSVID development.

The legacy ChaiBen-OS ALSVID workspace contained no business data that required preservation. The operational cutover is therefore to initialize the standalone PostgreSQL schema and bootstrap ALSVID reference data, not to invent or copy historical business rows.

`docs/DATA_CUTOVER.md` and the migration engine remain historical/contingency material. They are not blockers for the current zero-data path and do not make ChaiBen-OS an active authority.

## Export operations added after extraction

Standalone ALSVID now also includes native export-operation foundations that did not exist as a migration requirement:

- commercial channels and external order facts while Shopify remains the external OMS;
- export shipments and milestone tracking;
- commercial finance facts;
- inventory locations, append-only movements and dealer reservations;
- structured importer/EORI/customs classification/duty/import VAT/port/last-mile/export-refund facts.

These are ALSVID-native capabilities and must not be copied back into CoffeeBear or ChaiBen-OS.

## Remaining product development

The future company platform still needs normal product work such as:

- polished Internal Admin UI;
- ALSVID-specific factory procurement and production execution;
- China factory -> Germany warehouse workflow;
- China factory -> dealer direct-shipping workflow;
- richer warehouse execution, transfers and stocktake controls;
- deeper Shopify synchronization and reconciliation;
- production deployment and live EU logistics/payment/tax integrations.

These are not missing migration items.

## Migration / deletion rule

A migrated capability is complete only when:

1. the standalone replacement works and is tested;
2. runtime/data authority has cut over;
3. the old repository removes the corresponding runtime code, route, UI, tests and misleading documentation;
4. no second active implementation remains.

Historical Alembic revisions are treated as database upgrade history and may be removed only after a safe baseline/cutover is established.

For current authoritative state and infrastructure boundaries, read `docs/CURRENT_STATE.md`.