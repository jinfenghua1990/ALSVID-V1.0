-- Allow deleting an unreferenced product model.
--
-- 0047_stable_product_sku_numbers.sql made product.models reject every DELETE
-- ("Products are retired, never physically deleted"), which also blocked cleaning
-- up placeholder or duplicated models that never produced SKUs, BOMs or orders.
--
-- The guard now keeps only the invariant that actually protects history: product_id
-- is immutable. Deletion safety comes from the schema itself — every dependent
-- relation (variants, BOM, publication, homepage binding, SKU snapshots, storefront
-- order line snapshots, merge aliases) is ON DELETE RESTRICT, so a referenced model
-- still cannot be removed. Admin additionally probes those tables and returns an
-- actionable conflict before attempting the delete.
CREATE OR REPLACE FUNCTION product.guard_stable_product_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    RAISE EXCEPTION 'Product ID is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
