-- MANUAL ONLY. Not invoked by migrations or deployment. Inserts DRAFT placeholder models.
-- Requires explicit authorization from the business data owner.
WITH requested_models(code,name) AS (
  VALUES
    ('A1-ULTRA','A1 Ultra'),
    ('L1-PRO','L1 Pro'),
    ('A1','A1'),
    ('L1','L1')
), inserted_models AS (
  INSERT INTO product.models(platform_id,product_type_code,code,name,description,status)
  SELECT p.id,'BIKE',requested.code,requested.name,'','DRAFT'
  FROM requested_models requested
  JOIN product.platforms p ON p.code='FC' AND p.status='ACTIVE'
  WHERE NOT EXISTS (
    SELECT 1 FROM product.models existing WHERE existing.code=requested.code
  )
  RETURNING id,code,name,status
), inserted_variants AS (
  INSERT INTO product.variants(model_id,code,name,status)
  SELECT id,'DEFAULT','Default',status
  FROM inserted_models
  RETURNING id,model_id
)
INSERT INTO product.skus(variant_id,sku,name,status)
SELECT variant.id,'ALS-DEF-'||model.code,model.name||' - Default',model.status
FROM inserted_variants variant
JOIN inserted_models model ON model.id=variant.model_id;
