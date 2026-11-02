-- Phase 2 of the approved numeric identifier migration.
-- No existing Product/SKU/Platform/Variant ID is renumbered or deleted.
-- Former UUID id columns remain UNIQUE solely for old code and dependent FKs
-- until the last consumer is migrated. The numeric BIGINT fields become real PKs.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.platforms'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.variants'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.models'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (product_id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.skus'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (sku_number)')
 THEN
   RAISE EXCEPTION 'Unexpected Product numeric-key state: canceling platform/variant cutover';
 END IF;
END; $;

-- Save the original validated FK definitions before dropping UUID PKs.
CREATE TEMP TABLE alsvid_platform_variant_uuid_fks ON COMMIT DROP AS
SELECT c.conrelid::regclass::text AS child_table, c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype='f'
 AND c.confrelid IN('product.platforms'::regclass,'product.variants'::regclass)
 AND EXISTS (
   SELECT 1 FROM unnest(c.confkey) AS referenced_col(attnum)
   JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=referenced_col.attnum
   WHERE a.attname='id'
 );

-- Preserve existing UUID keys but demote them from formal PK to transitional UNIQUE keys.
ALTER TABLE product.platforms
  ADD COLUMN platform_number bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE product.variants
  ADD COLUMN variant_number bigint GENERATED ALWAYS AS IDENTITY;

ALTER TABLE product.platforms
  ADD CONSTRAINT product_platforms_legacy_uuid_unique UNIQUE(id);
ALTER TABLE product.variants
  ADD CONSTRAINT product_variants_legacy_uuid_unique UNIQUE(id);

DO $$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT * FROM alsvid_platform_variant_uuid_fks LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.child_table,fk.constraint_name);
 END LOOP;
END; $;

ALTER TABLE product.platforms DROP CONSTRAINT platforms_pkey;
ALTER TABLE product.platforms ADD CONSTRAINT platforms_pkey PRIMARY KEY(platform_number);
ALTER TABLE product.variants DROP CONSTRAINT variants_pkey;
ALTER TABLE product.variants ADD CONSTRAINT variants_pkey PRIMARY KEY(variant_number);

DO $$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT * FROM alsvid_platform_variant_uuid_fks LOOP
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                  fk.child_table,fk.constraint_name,fk.definition);
 END LOOP;
END; $;

-- These canonical identifiers are immutable even when no child record yet exists.
CREATE OR REPLACE FUNCTION product.reject_platform_number_mutation()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
 IF NEW.platform_number IS DISTINCT FROM OLD.platform_number THEN
   RAISE EXCEPTION 'Platform number is immutable';
 END IF;
 RETURN NEW;
END $;
CREATE TRIGGER product_platform_number_immutable
BEFORE UPDATE ON product.platforms
FOR EACH ROW EXECUTE FUNCTION product.reject_platform_number_mutation();

CREATE OR REPLACE FUNCTION product.reject_variant_number_mutation()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
 IF NEW.variant_number IS DISTINCT FROM OLD.variant_number THEN
   RAISE EXCEPTION 'Variant number is immutable';
 END IF;
 RETURN NEW;
END $;
CREATE TRIGGER product_variant_number_immutable
BEFORE UPDATE ON product.variants
FOR EACH ROW EXECUTE FUNCTION product.reject_variant_number_mutation();

-- New numeric FK projections are canonical references, backed by an FK.
-- Old UUID fields survive only during the coordinated API migration.
ALTER TABLE product.models ADD COLUMN platform_number bigint;
UPDATE product.models m SET platform_number=p.platform_number
 FROM product.platforms p WHERE p.id=m.platform_id;
ALTER TABLE product.models
 ALTER COLUMN platform_number SET NOT NULL,
 ADD CONSTRAINT models_platform_number_fk FOREIGN KEY(platform_number)
   REFERENCES product.platforms(platform_number) ON DELETE RESTRICT;

ALTER TABLE product.skus ADD COLUMN variant_number bigint;
UPDATE product.skus s SET variant_number=v.variant_number
 FROM product.variants v WHERE v.id=s.variant_id;
ALTER TABLE product.skus
 ALTER COLUMN variant_number SET NOT NULL,
 ADD CONSTRAINT skus_variant_number_fk FOREIGN KEY(variant_number)
   REFERENCES product.variants(variant_number) ON DELETE RESTRICT;

-- The legacy write-path may still submit a UUID. Never let the numeric FK drift.
CREATE OR REPLACE FUNCTION product.sync_model_platform_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT p.platform_number INTO NEW.platform_number
 FROM product.platforms p WHERE p.id=NEW.platform_id;
 IF NEW.platform_number IS NULL THEN
   RAISE EXCEPTION 'Model platform UUID has no canonical numeric platform'
     USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END; $;
CREATE TRIGGER product_models_sync_platform_number
BEFORE INSERT OR UPDATE ON product.models
FOR EACH ROW EXECUTE FUNCTION product.sync_model_platform_number();

CREATE OR REPLACE FUNCTION product.sync_sku_variant_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT v.variant_number INTO NEW.variant_number
 FROM product.variants v WHERE v.id=NEW.variant_id;
 IF NEW.variant_number IS NULL THEN
   RAISE EXCEPTION 'SKU variant UUID has no canonical numeric variant'
     USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END; $;
CREATE TRIGGER product_skus_sync_variant_number
BEFORE INSERT OR UPDATE ON product.skus
FOR EACH ROW EXECUTE FUNCTION product.sync_sku_variant_number();

DO $$
DECLARE total_fks bigint; restored_fks bigint;
BEGIN
 SELECT count(*) INTO total_fks FROM alsvid_platform_variant_uuid_fks;
 SELECT count(*) INTO restored_fks FROM pg_constraint c
 JOIN alsvid_platform_variant_uuid_fks fk
   ON fk.child_table=c.conrelid::regclass::text AND fk.constraint_name=c.conname
 WHERE c.contype='f' AND c.convalidated;
 IF restored_fks<>total_fks THEN
   RAISE EXCEPTION 'UUID FK restoration failed: % of %',restored_fks,total_fks;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='product.platforms'::regclass
   AND c.contype='p' AND pg_get_constraintdef(c.oid)='PRIMARY KEY (platform_number)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid='product.variants'::regclass
   AND c.contype='p' AND pg_get_constraintdef(c.oid)='PRIMARY KEY (variant_number)')
 OR EXISTS (
   SELECT 1 FROM product.models m JOIN product.platforms p ON p.id=m.platform_id
   WHERE m.platform_number IS DISTINCT FROM p.platform_number
 )
 OR EXISTS (
   SELECT 1 FROM product.skus s JOIN product.variants v ON v.id=s.variant_id
   WHERE s.variant_number IS DISTINCT FROM v.variant_number
 ) THEN
   RAISE EXCEPTION 'Product platform/variant numeric PK and reference consistency check failed';
 END IF;
END; $;
