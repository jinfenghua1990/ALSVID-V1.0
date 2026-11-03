-- F8 (100001) -> L1 (100006). Product/SKU numbers are immutable.
-- The source model, variant and SKU remain RETIRED as historical evidence.
-- No orders, BOMs, assets, prices or inventory are rewritten by assumption.
-- Runs atomically through packages/database/src/migrate.ts.
DO $f8_l1$
DECLARE
  source_model product.models%ROWTYPE;
  target_model product.models%ROWTYPE;
  source_variant product.variants%ROWTYPE;
  target_variant product.variants%ROWTYPE;
  source_sku product.skus%ROWTYPE;
  target_sku product.skus%ROWTYPE;
  dependency record;
  predicate text;
  has_dependency boolean;
BEGIN
  SELECT * INTO source_model FROM product.models WHERE product_id=100001 FOR UPDATE;
  SELECT * INTO target_model FROM product.models WHERE product_id=100006 FOR UPDATE;

  IF source_model.product_id IS NULL AND target_model.product_id IS NULL THEN
    RAISE NOTICE 'F8/L1 sample products absent: no business seed on this environment';
    RETURN;
  END IF;
  IF source_model.product_id IS NULL OR target_model.product_id IS NULL
     OR source_model.code <> 'F-20-20261028' OR target_model.code <> 'L1' THEN
    RAISE EXCEPTION 'F8/L1 merge preflight: identities missing or changed; abort';
  END IF;
  IF source_model.status='RETIRED' AND target_model.status='ACTIVE' THEN
    RAISE NOTICE 'F8/L1 already retired/active: no repeat mutation';
    RETURN;
  END IF;
  IF source_model.status NOT IN ('ACTIVE','DRAFT')
     OR target_model.status NOT IN ('DRAFT','ACTIVE')
     OR source_model.platform_id IS DISTINCT FROM target_model.platform_id
     OR source_model.product_type_code IS DISTINCT FROM target_model.product_type_code THEN
    RAISE EXCEPTION 'F8/L1 merge preflight: status/platform/type conflict';
  END IF;

  IF (SELECT count(*) FROM product.variants WHERE product_id=100001)<>1
     OR (SELECT count(*) FROM product.variants WHERE product_id=100006)<>1
     OR (SELECT count(*) FROM product.skus WHERE product_id=100001)<>1
     OR (SELECT count(*) FROM product.skus WHERE product_id=100006)<>1 THEN
    RAISE EXCEPTION 'F8/L1 changed variant or SKU counts; review mapping manually';
  END IF;
  SELECT * INTO source_variant FROM product.variants
    WHERE product_id=100001 AND code='DEFAULT' FOR UPDATE;
  SELECT * INTO target_variant FROM product.variants
    WHERE product_id=100006 AND code='DEFAULT' FOR UPDATE;
  SELECT * INTO source_sku FROM product.skus
    WHERE product_id=100001 AND sku_number=100001001 FOR UPDATE;
  SELECT * INTO target_sku FROM product.skus
    WHERE product_id=100006 AND sku_number=100006001 FOR UPDATE;
  IF source_variant.id IS NULL OR target_variant.id IS NULL
     OR source_sku.id IS NULL OR target_sku.id IS NULL
     OR source_sku.variant_id<>source_variant.id
     OR target_sku.variant_id<>target_variant.id THEN
    RAISE EXCEPTION 'F8/L1 default variant and SKU mapping changed; abort';
  END IF;

  -- No silent overwrite where both products have different values for the same key.
  IF EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(source_model.custom_fields,'{}'::jsonb)) AS old(k,v)
    JOIN jsonb_each(COALESCE(target_model.custom_fields,'{}'::jsonb)) AS dest(k,v) USING(k)
    WHERE old.v IS DISTINCT FROM dest.v
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(source_variant.attributes,'{}'::jsonb)) AS old(k,v)
    JOIN jsonb_each(COALESCE(target_variant.attributes,'{}'::jsonb)) AS dest(k,v) USING(k)
    WHERE old.v IS DISTINCT FROM dest.v
  ) OR EXISTS (
    SELECT 1 FROM jsonb_each(COALESCE(source_sku.attributes,'{}'::jsonb)) AS old(k,v)
    JOIN jsonb_each(COALESCE(target_sku.attributes,'{}'::jsonb)) AS dest(k,v) USING(k)
    WHERE old.v IS DISTINCT FROM dest.v
  ) THEN
    RAISE EXCEPTION 'F8/L1 attribute collision; manual review required';
  END IF;

  -- Inspect every known business FK/identity projection, including newly added columns.
  -- Never repoint historical financial, inventory, production or order evidence.
  FOR dependency IN
    SELECT c.table_schema,c.table_name,
      string_agg(format('%I::text = %L',c.column_name,
        CASE c.column_name
          WHEN 'product_id' THEN '100001'
          WHEN 'product_id_snapshot' THEN '100001'
          WHEN 'sku_number' THEN '100001001'
          WHEN 'sku_number_snapshot' THEN '100001001'
          WHEN 'model_id' THEN source_model.id::text
          WHEN 'manual_model_id' THEN source_model.id::text
          WHEN 'variant_id' THEN source_variant.id::text
          WHEN 'sku_id' THEN source_sku.id::text
          WHEN 'internal_sku_id' THEN source_sku.id::text
          WHEN 'entity_id' THEN source_model.id::text
        END), ' OR ') AS conditions
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      AND t.table_type='BASE TABLE'
    WHERE c.table_schema NOT IN ('pg_catalog','information_schema')
      AND c.column_name IN (
        'product_id','product_id_snapshot','sku_number','sku_number_snapshot',
        'model_id','manual_model_id','variant_id','sku_id','internal_sku_id','entity_id')
      AND (c.table_schema,c.table_name) NOT IN (
        ('product','models'),('product','variants'),('product','skus'))
    GROUP BY c.table_schema,c.table_name
  LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %s)',
      dependency.table_schema,dependency.table_name,dependency.conditions)
      INTO has_dependency;
    IF has_dependency THEN
      RAISE EXCEPTION 'F8/L1 still has dependent business records in %.%; abort',
        dependency.table_schema,dependency.table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM commerce.storefront_layout_drafts
    WHERE project::text LIKE '%100001%' OR project::text LIKE '%F-20-20261028%'
  ) OR EXISTS (
    SELECT 1 FROM product.catalog_publish_assets
    WHERE model_code IN ('F8','F-20-20261028')
  ) OR EXISTS (
    SELECT 1 FROM marketing.product_colour_preferences
    WHERE model_code IN ('F8','F-20-20261028')
  ) THEN
    RAISE EXCEPTION 'F8/L1 has unmapped content references; abort';
  END IF;

  -- L1 is the only active sales identity. Preserve L1 product_id, variant_number,
  -- SKU 100006001, and all original UUID compatibility keys unchanged.
  UPDATE product.models
  SET name=CASE WHEN btrim(target_model.name)='L1'
            THEN replace(source_model.name,'F8','L1') ELSE target_model.name END,
      description=CASE WHEN btrim(target_model.description)=''
            THEN source_model.description ELSE target_model.description END,
      custom_fields=COALESCE(target_model.custom_fields,'{}'::jsonb)
                    || COALESCE(source_model.custom_fields,'{}'::jsonb),
      status='ACTIVE',version=version+1,updated_at=now()
  WHERE product_id=100006;

  UPDATE product.variants
  SET description=CASE WHEN btrim(target_variant.description)=''
            THEN source_variant.description ELSE target_variant.description END,
      attributes=COALESCE(target_variant.attributes,'{}'::jsonb)
                 || COALESCE(source_variant.attributes,'{}'::jsonb),
      status='ACTIVE',version=version+1,updated_at=now()
  WHERE id=target_variant.id;

  UPDATE product.skus
  SET name=CASE WHEN target_sku.name='L1 - Default'
            THEN replace(source_sku.name,'F8','L1') ELSE target_sku.name END,
      attributes=COALESCE(target_sku.attributes,'{}'::jsonb)
                 || COALESCE(source_sku.attributes,'{}'::jsonb),
      status='ACTIVE',version=version+1,updated_at=now()
  WHERE sku_number=100006001;

  UPDATE product.skus SET status='RETIRED',version=version+1,updated_at=now()
    WHERE sku_number=100001001;
  UPDATE product.variants SET status='RETIRED',version=version+1,updated_at=now()
    WHERE id=source_variant.id;
  UPDATE product.models SET status='RETIRED',version=version+1,updated_at=now()
    WHERE product_id=100001;

  IF (SELECT status FROM product.models WHERE product_id=100006)<>'ACTIVE'
     OR (SELECT status FROM product.models WHERE product_id=100001)<>'RETIRED'
     OR (SELECT status FROM product.skus WHERE sku_number=100006001)<>'ACTIVE'
     OR (SELECT status FROM product.skus WHERE sku_number=100001001)<>'RETIRED' THEN
    RAISE EXCEPTION 'F8/L1 post-merge verification failed; transaction rolled back';
  END IF;
END
$f8_l1$;
