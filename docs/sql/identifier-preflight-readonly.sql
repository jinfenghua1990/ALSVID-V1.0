-- ALSVID identity migration PRECHECK: READ ONLY; runs on the authorized DB only.
-- This script makes no changes and does not authorize schema migration.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS database_name, current_schema() AS active_schema;
SELECT ns.nspname AS schema_name,c.relname AS table_name,a.attname AS pk_column,
  pg_catalog.format_type(a.atttypid,a.atttypmod) AS pk_type
FROM pg_constraint pk
JOIN pg_class c ON c.oid=pk.conrelid
JOIN pg_namespace ns ON ns.oid=c.relnamespace
JOIN LATERAL unnest(pk.conkey) AS key(attnum) ON TRUE
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum
WHERE pk.contype='p' AND ns.nspname IN ('product','engineering','partners','procurement','production','vehicle','warehouse','inventory','logistics','finance','commerce','dealer','service','identity')
ORDER BY ns.nspname,c.relname,a.attname;

SELECT child_ns.nspname AS child_schema,child.relname AS child_table,
  parent_ns.nspname AS parent_schema,parent.relname AS parent_table, con.conname,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class child ON child.oid=con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid=child.relnamespace
JOIN pg_class parent ON parent.oid=con.confrelid
JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
WHERE con.contype='f'
ORDER BY child_ns.nspname,child.relname,con.conname;

SELECT 'models' AS entity,count(*) AS total,count(DISTINCT product_id) AS unique_numeric_id
  FROM product.models
UNION ALL SELECT 'skus',count(*),count(DISTINCT sku_number) FROM product.skus;

SELECT s.id AS legacy_sku_uuid,s.product_id,s.sku_number,s.sku_sequence,
  m.product_id AS expected_product_id
FROM product.skus s
JOIN product.variants v ON v.id=s.variant_id
JOIN product.models m ON m.id=v.model_id
WHERE s.product_id IS DISTINCT FROM m.product_id
  OR s.sku_number IS DISTINCT FROM s.product_id*1000+s.sku_sequence;

SELECT 'inventory.movements' AS source,count(*) AS mismatch_count
  FROM inventory.movements m JOIN product.skus s ON s.id=m.sku_id
  WHERE m.product_id IS DISTINCT FROM s.product_id OR m.sku_number IS DISTINCT FROM s.sku_number
UNION ALL SELECT 'logistics.shipment_cargo',count(*)
  FROM logistics.shipment_cargo m JOIN product.skus s ON s.id=m.sku_id
  WHERE m.product_id IS DISTINCT FROM s.product_id OR m.sku_number IS DISTINCT FROM s.sku_number;
COMMIT;
