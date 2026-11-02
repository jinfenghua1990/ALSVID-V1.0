# Product model rename — corrective follow-up

## Canonical model codes
The business model codes after migration 0049 are `A1-ULTRA`, `L1-PRO`, `A1` and `L1`.
Legacy URL slugs and homepage slot identifiers (`fc1`, `FC1_HERO`, etc.) remain stable routing / configuration keys; they are **not** product model codes.

## Colour preference
`v1/colour-interest` accepts `A1-ULTRA`, matching the existing SQL CHECK constraint.
The storefront selector only posts a pseudonymous model/colour selection after the visitor clicks the opt-in Save button. Previewing colours, opening the page and selecting swatches do not transmit a preference. One random session UUID is retained in browser sessionStorage; no email, customer identity or purchase is implied.

## Historic business seed (0050)
Migration `0050_seed_initial_alsvid_models.sql` is already part of the versioned migration/checksum history. **Do not edit, rename or delete it** on applied databases. The runner now skips its SQL when it has not previously been applied, without marking it as applied. Provisioning new databases does not inject DRAFT product/variant/SKU placeholders. If explicitly needed for demos, an operator can run `scripts/manual-seeds/seed-initial-alsvid-draft-models.sql` after approval.

Previously inserted product rows are **not** automatically deleted. They might now have custom fields, associated business records, or changed statuses; cleanup must reconcile UUID references and actual production data before a reviewed, targeted change.

## Production read-only verification (requires authorized DB connection)

```sql
SELECT filename, applied_at
FROM platform.schema_migrations
WHERE filename IN ('0049_rename_product_models.sql', '0050_seed_initial_alsvid_models.sql', '0051_shared_product_sku_links.sql')
ORDER BY filename;

SELECT code, status, count(*) AS model_count
FROM product.models
WHERE code IN ('FC1','FC2','L7','L8','A1-ULTRA','L1-PRO','A1','L1')
GROUP BY code, status
ORDER BY code, status;
```

A successful workflow migration job alone does not expose these query results and cannot prove the production row counts.

## Migration numbering
`0021`, `0025`, `0030`, `0032` each contain two historical files. Their exact filenames and ordering are pinned and tested; future collisions or renames fail early. Do not renumber already-applied migrations. New schema changes must use a fresh unique number.
