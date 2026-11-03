# ALSVID L1 (100006) editorial and engineering readiness — 2026-11-03

## Verified starting point
- Production main migration 0062 merged historical F8 (100001) into L1 (100006), with immutable SKU 100006001 and alias from 100001001. Historical F8 SKU is RETIRED.
- L1 model description and DEFAULT variant description were empty. L1 had **no** linked BOM, approved Build Specification, catalogue publication or DB asset links.
- L1's existing detail page renders `/products/l8/retouched-side.webp`, `/products/l8/retouched-folded.webp` and two original reference PNGs. All four files were verified in GitHub under `apps/web/public/products/l8/`. They are **manufacturer reference art**, not verified final ALSVID mass-production photography.
- The only existing SKU and configuration are DEFAULT and 100006001; no confirmed PRO/commercial alternative was found.

## 0063 migration
1. Only applies editorial data if the owner-approved immutable F8→L1 alias exists. Fresh test databases without F8 do not manufacture a fake L1.
2. Fills a missing L1 product description with factual identity only; confirms final specification, color and price are still pending.
3. Marks the existing DEFAULT variant description as unconfirmed (does not add SKU or rename any ID).
4. Registers real website reference image path in `product.catalog_publish_assets` with `enabled=false`, requiring manual image provenance and final-production review.
5. Creates an **internal DRAFT** catalog publication with zh/de/en titles and that real image path. Does **not** submit or publish.
6. Creates L1-BOM and revision A as **DRAFT with zero BOM lines**, a structured place to enter verified factory parts and quantities. Does **not** create/approve a manufacturing Build Specification.
7. Adds global DB guard preventing any empty BOM revision from being released.

## Isolated production-clone test
Neon branch `l1-editorial-draft-test-20261103`:
- Original content migration executed.
- L1 description and DEFAULT variant note populated; F8 and old SKU still RETIRED; L1 SKU remains 100006001 ACTIVE.
- Exactly 1 L1 image-allowlist record (`enabled=false`), 1 DRAFT catalog publication, 1 L1-BOM and 1 DRAFT revision A with **0 lines**; no Build Specification.
- Reapplying the business-data block created **no duplicate records**.
- Direct attempt to release the 0-line BOM revision raised `Cannot release BOM revision without at least one BOM line` and status remained DRAFT.
- UI table adds a real BOM-readiness column, distinguishing missing, draft-empty, draft-with-lines and released states.

## Remaining external inputs
- Manufacturer's confirmed assembly BOM: part numbers, quantities, approved revision, component approvals and drawings.
- Final approved market/version/SKU options and production specs.
- Image rights/provenance and approved production photography.
- Formal publication review and production release remain human-authorized steps.

**Important:** DB draft creation is NOT approved catalogue publication or manufacturing readiness. No prices, inventory, historical orders, or actual production facts are fabricated.
