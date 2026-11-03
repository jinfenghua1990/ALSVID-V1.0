-- ALSVID product identity reconciliation: legacy F8 (100001) -> canonical L1 (100006).
-- One business product, two historical identities. Never renumber or delete a historical
-- Product/SKU ID, and never rewrite completed transaction snapshots.
-- This migration is a deliberate, data-specific change: fresh databases without F8
-- legitimately skip the data merge while still receiving the alias schema.

CREATE TABLE product.model_merge_aliases (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_product_id bigint NOT NULL UNIQUE
    REFERENCES product.models(product_id) ON DELETE RESTRICT,
  canonical_product_id bigint NOT NULL
    REFERENCES product.models(product_id) ON DELETE RESTRICT,
  legacy_sku_number bigint NOT NULL UNIQUE
    REFERENCES product.skus(sku_number) ON DELETE RESTRICT,
  canonical_sku_number bigint NOT NULL
    REFERENCES product.skus(sku_number) ON DELETE RESTRICT,
  legacy_model_code text NOT NULL,
  reason text NOT NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (legacy_product_id<>canonical_product_id),
  CHECK (legacy_sku_number<>canonical_sku_number)
);
CREATE INDEX model_merge_aliases_canonical_idx
  ON product.model_merge_aliases(canonical_product_id);

DO $merge_f8_l1$
DECLARE
  old_model product.models%ROWTYPE;
  new_model product.models%ROWTYPE;
  old_variant product.variants%ROWTYPE;
  new_variant product.variants%ROWTYPE;
  old_sku product.skus%ROWTYPE;
  new_sku product.skus%ROWTYPE;
BEGIN
  -- CI and fresh installs do not have the user's historical F8 record.
  IF NOT EXISTS(SELECT 1 FROM product.models WHERE code='F-20-20261028') THEN
    RAISE NOTICE 'F8 history absent; L1 reconciliation not applicable to this database';
    RETURN;
  END IF;

  SELECT * INTO old_model FROM product.models
    WHERE code='F-20-20261028' FOR UPDATE;
  SELECT * INTO new_model FROM product.models
    WHERE code='L1' FOR UPDATE;
  IF old_model.product_id IS DISTINCT FROM 100001
     OR new_model.product_id IS DISTINCT FROM 100006
     OR old_model.product_type_code IS DISTINCT FROM 'BIKE'
     OR new_model.product_type_code IS DISTINCT FROM 'BIKE'
     OR old_model.platform_id IS DISTINCT FROM new_model.platform_id THEN
    RAISE EXCEPTION 'F8/L1 identities or platform differ from audited production records; manual reconciliation required';
  END IF;

  IF EXISTS(SELECT 1 FROM product.model_merge_aliases
            WHERE legacy_product_id=100001) THEN
    IF EXISTS(SELECT 1 FROM product.model_merge_aliases
              WHERE legacy_product_id=100001
                AND canonical_product_id=100006
                AND legacy_sku_number=100001001
                AND canonical_sku_number=100006001)
       AND old_model.status='RETIRED' THEN
      RETURN; -- already reconciled, never remint an identity
    END IF;
    RAISE EXCEPTION 'Conflicting existing F8 alias, refusing to modify';
  END IF;

  IF (SELECT count(*) FROM product.variants WHERE model_id=old_model.id)<>1
     OR (SELECT count(*) FROM product.variants WHERE model_id=new_model.id)<>1
     OR (SELECT count(*) FROM product.skus WHERE product_id=100001)<>1
     OR (SELECT count(*) FROM product.skus WHERE product_id=100006)<>1 THEN
    RAISE EXCEPTION 'Unexpected F8/L1 variants or SKU counts; stop instead of losing a configuration';
  END IF;

  SELECT * INTO old_variant FROM product.variants WHERE model_id=old_model.id FOR UPDATE;
  SELECT * INTO new_variant FROM product.variants WHERE model_id=new_model.id FOR UPDATE;
  SELECT * INTO old_sku FROM product.skus WHERE product_id=100001 FOR UPDATE;
  SELECT * INTO new_sku FROM product.skus WHERE product_id=100006 FOR UPDATE;

  IF old_variant.code<>'DEFAULT' OR new_variant.code<>'DEFAULT'
     OR old_sku.sku_number<>100001001 OR new_sku.sku_number<>100006001
     OR old_sku.variant_id<>old_variant.id OR new_sku.variant_id<>new_variant.id
     OR new_model.status NOT IN ('DRAFT','ACTIVE')
     OR old_model.status NOT IN ('DRAFT','ACTIVE') THEN
    RAISE EXCEPTION 'F8/L1 default configuration or statuses differ from audit; manual review required';
  END IF;

  -- Never move transaction / warehouse / vehicle rows or reassign immutable SKU IDs.
  -- All of these were verified empty on 2026-11-03; fail CLOSED on later changes.
  IF EXISTS(SELECT 1 FROM engineering.boms WHERE model_id=old_model.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM engineering.build_specs WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM product.catalog_publications WHERE model_id=old_model.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM assets.links WHERE entity_id IN (old_model.id,old_variant.id,old_sku.id))
    OR EXISTS(SELECT 1 FROM product.homepage_product_bindings WHERE manual_model_id=old_model.id OR target_model_code=old_model.code)
    OR EXISTS(SELECT 1 FROM product.catalog_publish_assets WHERE model_code=old_model.code)
    OR EXISTS(SELECT 1 FROM marketing.product_colour_preferences WHERE product_code IN (old_model.code,'F8') OR model_code IN (old_model.code,'F8'))
    OR EXISTS(SELECT 1 FROM commerce.storefront_layout_drafts WHERE project::text LIKE '%100001%' OR project::text LIKE '%F-20-20261028%')
    OR EXISTS(SELECT 1 FROM commerce.storefront_order_lines WHERE sku_id=old_sku.id OR product_id_snapshot=100001)
    OR EXISTS(SELECT 1 FROM commerce.external_order_lines WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM commerce.sku_mappings WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM commerce.storefront_prices WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM integrations.external_sku_mappings WHERE internal_sku_id=old_sku.id)
    OR EXISTS(SELECT 1 FROM procurement.purchase_order_lines WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM procurement.quotation_lines WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM production.production_orders WHERE product_id=100001)
    OR EXISTS(SELECT 1 FROM inventory.movements WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM inventory.reservations WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM logistics.shipment_cargo WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM finance.document_lines WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM warehouse.stocktake_counts WHERE sku_id=old_sku.id OR product_id=100001)
    OR EXISTS(SELECT 1 FROM vehicle.vehicles WHERE sku_id=old_sku.id OR product_id=100001) THEN
    RAISE EXCEPTION 'F8 contains linked business evidence/content not in the audited merge plan; no changes applied';
  END IF;

  -- Preserve the established L1 ID, SKU and model code. Only carry source content
  -- into otherwise empty canonical fields; L1-specific values take priority.
  UPDATE product.models SET
    name=replace(old_model.name,'F8','L1'),
    description=COALESCE(NULLIF(description,''),replace(old_model.description,'F8','L1')),
    custom_fields=old_model.custom_fields || custom_fields,
    status='ACTIVE',
    version=version+1,
    updated_at=now()
  WHERE id=new_model.id;

  UPDATE product.variants SET
    description=COALESCE(NULLIF(description,''),old_variant.description),
    attributes=old_variant.attributes || attributes,
    status='ACTIVE',
    version=version+1,
    updated_at=now()
  WHERE id=new_variant.id;

  UPDATE product.skus SET
    name=replace(old_sku.name,'F8','L1'),
    attributes=old_sku.attributes || attributes,
    market_code=COALESCE(market_code,old_sku.market_code),
    color_code=COALESCE(color_code,old_sku.color_code),
    size_code=COALESCE(size_code,old_sku.size_code),
    status='ACTIVE',
    version=version+1,
    updated_at=now()
  WHERE id=new_sku.id;

  -- Legacy rows remain as immutable history, not selectable active products.
  UPDATE product.skus SET status='RETIRED',version=version+1,updated_at=now()
    WHERE id=old_sku.id;
  UPDATE product.variants SET status='RETIRED',version=version+1,updated_at=now()
    WHERE id=old_variant.id;
  UPDATE product.models SET status='RETIRED',version=version+1,updated_at=now()
    WHERE id=old_model.id;

  INSERT INTO product.model_merge_aliases(
    legacy_product_id,canonical_product_id,legacy_sku_number,
    canonical_sku_number,legacy_model_code,reason)
  VALUES(100001,100006,100001001,100006001,'F-20-20261028',
         'F8 and L1 are one owner-confirmed product; preserve historical IDs');

  IF NOT EXISTS (
    SELECT 1 FROM product.model_merge_aliases a
    JOIN product.models m ON m.product_id=a.canonical_product_id
    JOIN product.skus s ON s.sku_number=a.canonical_sku_number
    WHERE a.legacy_product_id=100001 AND a.canonical_product_id=100006
      AND a.legacy_sku_number=100001001 AND a.canonical_sku_number=100006001
      AND m.status='ACTIVE' AND s.status='ACTIVE'
  ) OR EXISTS(
    SELECT 1 FROM product.models WHERE product_id=100001 AND status<>'RETIRED'
  ) THEN RAISE EXCEPTION 'F8->L1 reconciliation postcondition failed'; END IF;
END;
$merge_f8_l1$;

-- Prevent accidental reactivation of a merged-away product or its old variants/SKUs.
CREATE OR REPLACE FUNCTION product.prevent_merged_model_reactivation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status<>'RETIRED' AND EXISTS(
    SELECT 1 FROM product.model_merge_aliases a
    WHERE a.legacy_product_id=NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Merged legacy product must stay retired; use canonical L1';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_model_merged_reactivation_guard
BEFORE UPDATE OF status ON product.models
FOR EACH ROW EXECUTE FUNCTION product.prevent_merged_model_reactivation();
CREATE TRIGGER product_variant_merged_reactivation_guard
BEFORE UPDATE OF status ON product.variants
FOR EACH ROW EXECUTE FUNCTION product.prevent_merged_model_reactivation();
CREATE TRIGGER product_sku_merged_reactivation_guard
BEFORE UPDATE OF status ON product.skus
FOR EACH ROW EXECUTE FUNCTION product.prevent_merged_model_reactivation();

CREATE OR REPLACE FUNCTION product.protect_model_merge_alias()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Product merge alias is immutable evidence'; END;
$$;
CREATE TRIGGER model_merge_alias_append_only
BEFORE UPDATE OR DELETE ON product.model_merge_aliases
FOR EACH ROW EXECUTE FUNCTION product.protect_model_merge_alias();
