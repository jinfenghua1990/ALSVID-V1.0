-- ALSVID canonical identifier cutover, phase 1: Product and SKU numeric primary keys.
-- Keep original values (product_id and sku_number). No renumbering, deleting rows or fake inventory.
-- UUID id is temporarily UNIQUE for the legacy application/FKs. Remove it ONLY after
-- API, domain repositories, historical evidence, and every FK switch to numeric values.
-- Entire migration executes within one transaction via packages/database/src/migrate.ts.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='product.models'::regclass AND contype='p' AND conname='models_pkey'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='product.skus'::regclass AND contype='p' AND conname='skus_pkey'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (id)'
  ) THEN
    RAISE EXCEPTION 'Product/SKU numeric PK cutover expects existing UUID primary keys; investigate schema drift';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product.models WHERE product_id IS NULL OR product_id NOT BETWEEN 100001 AND 999999
  ) OR EXISTS (
    SELECT 1 FROM product.skus
    WHERE sku_number IS NULL OR product_id IS NULL
      OR sku_number <> product_id*1000+sku_sequence
  ) THEN
    RAISE EXCEPTION 'Product/SKU numeric identity preflight failed; refusing to modify constraints';
  END IF;
  IF EXISTS (
    SELECT 1 FROM product.skus s
    JOIN product.variants v ON v.id=s.variant_id
    JOIN product.models m ON m.id=v.model_id
    WHERE s.product_id<>m.product_id
  ) THEN
    RAISE EXCEPTION 'Product/SKU owner mismatch; refusing PK cutover';
  END IF;
END;
$$;

-- Record exactly those foreign keys which still explicitly target old UUID ids.
-- Composite numeric references are deliberately untouched.
CREATE TEMP TABLE alsvid_product_uuid_fk_restore ON COMMIT DROP AS
SELECT c.conrelid::regclass::text AS child_table, c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype='f'
  AND c.confrelid IN ('product.models'::regclass,'product.skus'::regclass)
  AND EXISTS (
    SELECT 1 FROM unnest(c.confkey) AS key_column(attnum)
    JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=key_column.attnum
    WHERE a.attname='id'
  );

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM alsvid_product_uuid_fk_restore
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.child_table,item.constraint_name);
  END LOOP;
END;
$$;

-- The numeric numbers are the only formal primary keys. Old UUIDs become
-- temporary compatibility keys only; FK enforcement is restored below.
ALTER TABLE product.models
  ADD CONSTRAINT product_models_legacy_uuid_unique UNIQUE (id);
ALTER TABLE product.skus
  ADD CONSTRAINT product_skus_legacy_uuid_unique UNIQUE (id);

ALTER TABLE product.models DROP CONSTRAINT models_pkey;
ALTER TABLE product.models ADD CONSTRAINT models_pkey PRIMARY KEY (product_id);

ALTER TABLE product.skus DROP CONSTRAINT skus_pkey;
ALTER TABLE product.skus ADD CONSTRAINT skus_pkey PRIMARY KEY (sku_number);

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM alsvid_product_uuid_fk_restore
  LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                   item.child_table,item.constraint_name,item.definition);
  END LOOP;
END;
$$;

-- Fail closed if the numeric PKs were not installed.
DO $$
DECLARE product_key text; sku_key text; preserved_fks bigint; active_fks bigint;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO product_key
  FROM pg_constraint WHERE conrelid='product.models'::regclass AND contype='p';
  SELECT pg_get_constraintdef(oid) INTO sku_key
  FROM pg_constraint WHERE conrelid='product.skus'::regclass AND contype='p';
  IF product_key IS DISTINCT FROM 'PRIMARY KEY (product_id)'
     OR sku_key IS DISTINCT FROM 'PRIMARY KEY (sku_number)' THEN
    RAISE EXCEPTION 'Numeric product/SKU primary key validation failed';
  END IF;

  SELECT count(*) INTO preserved_fks FROM alsvid_product_uuid_fk_restore;
  SELECT count(*) INTO active_fks
  FROM pg_constraint c
  JOIN alsvid_product_uuid_fk_restore old
    ON old.child_table=c.conrelid::regclass::text AND old.constraint_name=c.conname
  WHERE c.contype='f' AND c.convalidated;
  IF active_fks<>preserved_fks THEN
    RAISE EXCEPTION 'Foreign key restoration mismatch: % / %',
      active_fks,preserved_fks;
  END IF;
END;
$$;
