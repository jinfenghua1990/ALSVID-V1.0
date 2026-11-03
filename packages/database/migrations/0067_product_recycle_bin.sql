-- Recycle bin for commerce products.
--
-- Deleting a product from 商城商品列表 must not destroy history: orders, prices,
-- stock and publications still reference it. A recycled model keeps every row and
-- only disappears from the working catalogues until it is restored or purged.
ALTER TABLE product.models
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES identity.users(id) ON DELETE SET NULL;

CREATE INDEX product_models_recycle_bin_idx
  ON product.models(deleted_at)
  WHERE deleted_at IS NOT NULL;
