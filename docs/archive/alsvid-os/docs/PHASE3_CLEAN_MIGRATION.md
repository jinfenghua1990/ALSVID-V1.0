# Phase 3 Clean Migration — Product, Assets and Vehicle 360

Status: implementation branch `feat/product-assets-vehicle360`.

## Migrated and rewritten

This phase replaces the ChaiBen-OS ALSVID-specific product, asset and Vehicle Center runtime with standalone ALSVID authorities.

- Product / SKU identity is standalone and has no Workspace dimension.
- FC / FT / CT / GT platform and bicycle engineering models are standalone.
- Parts, editable BOM and released immutable BOM revisions are standalone.
- BOM release allocation locks the model row before assigning the next revision number; the old max-without-lock race is not carried over.
- R2/S3-compatible asset storage uses direct browser upload tickets, object verification and database metadata. File bytes are not stored in PostgreSQL.
- Vehicle Center list and Vehicle 360 project the canonical Vehicle, birth/build evidence, dealer/customer custody, warranty, service cases, assets and append-only lifecycle events.
- Every non-factory Vehicle lifecycle event requires a recorded FACTORY_OUTBOUND. Empty or malformed build snapshots cannot bypass the outbound gate.

## Deliberately not copied

The old ChaiBen-OS HTML/Web pages are not migrated. They were coupled to the multi-Workspace shell and do not meet the standalone ALSVID UI direction. The new ALSVID UI will consume the standalone APIs instead of preserving legacy page markup.

The following are also excluded:

- ChaiBen Workspace access/scope helpers;
- DOMESTIC navigation/dashboard assumptions;
- 1688 and JackYun/吉客云 integrations;
- generic domestic procurement/inventory/finance code copied wholesale;
- Shopify OMS duplication.

## Standalone API entrances

- `/api/v1/product-center/*`
- `/api/v1/assets/*`
- `/api/v1/vehicle-center/*`

Authentication and authorization use standalone ALSVID sessions and permissions.

## Remaining extraction work after this phase

- internal Customer Center API projection;
- internal Warranty / Service Center API projection;
- legacy ALSVID data import/cutover plan and verification;
- source-removal PR in ChaiBen-OS after standalone parity and data migration are proven.

Supply chain, Germany warehouse/logistics and finance are separate ALSVID export-domain work. They are not eligible for blind migration from the DOMESTIC monolith.
