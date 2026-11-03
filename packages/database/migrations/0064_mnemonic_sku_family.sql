-- ALSVID mnemonic SKU family; preserve numeric primary keys, historic SKU strings and all business references.
ALTER TABLE product.models ADD COLUMN sku_prefix varchar(2);
UPDATE product.models SET sku_prefix=CASE code
 WHEN 'A1' THEN 'A1' WHEN 'A1-ULTRA' THEN 'AU'
 WHEN 'L1' THEN 'L1' WHEN 'L1-PRO' THEN 'LP'
 ELSE NULL END
WHERE product_type_code='BIKE' AND code IN ('A1','A1-ULTRA','L1','L1-PRO');
ALTER TABLE product.models
 ADD CONSTRAINT product_models_sku_prefix_shape CHECK(sku_prefix IS NULL OR sku_prefix ~ '^[A-Z][A-Z0-9]$'),
 ADD CONSTRAINT product_models_bike_prefix_reserved CHECK(product_type_code <> 'BIKE' OR sku_prefix IS NULL OR sku_prefix NOT IN ('AL','UN'));
CREATE UNIQUE INDEX product_models_bike_sku_prefix_unique ON product.models(sku_prefix)
 WHERE product_type_code='BIKE' AND sku_prefix IS NOT NULL;
