-- ALSVID numeric ID standard, phase 4: canonical supply-chain transaction primary keys.
-- Existing human-readable PO-/MO-/SHP-/IM- numbers remain display/trace fields.
-- One atomic migration: no UUID deletion, no renumbering of product/SKU or inventory,
-- existing FK semantics (including ON DELETE) are captured and restored unchanged.
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='warehouse.locations'::regclass
      AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (location_number)')
     OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='product.skus'::regclass
      AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (sku_number)') THEN
    RAISE EXCEPTION 'Numeric supply-chain cutover needs completed Product/SKU and Warehouse/Location migrations';
  END IF;
END;
$$;

CREATE TEMP TABLE alsvid_numeric_supply_targets (
  parent regclass PRIMARY KEY,
  new_pk text NOT NULL,
  old_pk text NOT NULL
) ON COMMIT DROP;
INSERT INTO alsvid_numeric_supply_targets(parent,new_pk,old_pk) VALUES
  ('procurement.purchase_orders'::regclass,'purchase_order_id','purchase_orders_pkey'),
  ('production.production_orders'::regclass,'production_order_id','production_orders_pkey'),
  ('logistics.shipments'::regclass,'shipment_id','shipments_pkey'),
  ('inventory.movements'::regclass,'movement_id','movements_pkey');

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM alsvid_numeric_supply_targets LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid=item.parent AND conname=item.old_pk
                     AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN
      RAISE EXCEPTION 'Unexpected legacy primary key on %',item.parent;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute
               WHERE attrelid=item.parent AND attname=item.new_pk AND NOT attisdropped) THEN
      RAISE EXCEPTION 'Canonical numeric ID already exists on %',item.parent;
    END IF;
  END LOOP;
END;
$$;

CREATE TEMP TABLE alsvid_supply_uuid_fks ON COMMIT DROP AS
SELECT c.conrelid::regclass::text AS child_table,c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS original_definition
FROM pg_constraint c
WHERE c.contype='f'
  AND c.confrelid IN (SELECT parent FROM alsvid_numeric_supply_targets)
  AND EXISTS (SELECT 1 FROM unnest(c.confkey) AS k(attnum)
              JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum
              WHERE a.attname='id');

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM alsvid_numeric_supply_targets LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN %I bigint GENERATED ALWAYS AS IDENTITY',
       item.parent,item.new_pk);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE(id)',
       item.parent,replace(item.parent::text,'.','_')||'_legacy_uuid_unique');
  END LOOP;
  FOR item IN SELECT * FROM alsvid_supply_uuid_fks LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.child_table,item.constraint_name);
  END LOOP;
  FOR item IN SELECT * FROM alsvid_numeric_supply_targets LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.parent,item.old_pk);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I PRIMARY KEY(%I)',
       item.parent,item.old_pk,item.new_pk);
  END LOOP;
  FOR item IN SELECT * FROM alsvid_supply_uuid_fks LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
       item.child_table,item.constraint_name,item.original_definition);
  END LOOP;
END;
$$;

-- Cross-workflow numeric references. Old UUID columns are transitional only:
-- the trigger always projects the authoritative numeric ID and FKs enforce it.
ALTER TABLE production.production_orders ADD COLUMN source_purchase_order_number bigint;
UPDATE production.production_orders r SET source_purchase_order_number=p.purchase_order_id
  FROM procurement.purchase_orders p WHERE p.id=r.source_purchase_order_id;
ALTER TABLE production.production_orders ADD CONSTRAINT production_source_po_number_fk
  FOREIGN KEY(source_purchase_order_number) REFERENCES procurement.purchase_orders(purchase_order_id) ON DELETE RESTRICT;

ALTER TABLE logistics.shipments
  ADD COLUMN source_purchase_order_number bigint,
  ADD COLUMN origin_location_number bigint,
  ADD COLUMN destination_location_number bigint;
UPDATE logistics.shipments r
SET source_purchase_order_number=p.purchase_order_id
FROM procurement.purchase_orders p WHERE p.id=r.source_purchase_order_id;
UPDATE logistics.shipments r
SET origin_location_number=l.location_number
FROM warehouse.locations l WHERE l.id=r.origin_location_id;
UPDATE logistics.shipments r
SET destination_location_number=l.location_number
FROM warehouse.locations l WHERE l.id=r.destination_location_id;
ALTER TABLE logistics.shipments ALTER COLUMN origin_location_number SET NOT NULL;
ALTER TABLE logistics.shipments
 ADD CONSTRAINT logistics_source_po_number_fk FOREIGN KEY(source_purchase_order_number) REFERENCES procurement.purchase_orders(purchase_order_id) ON DELETE RESTRICT,
 ADD CONSTRAINT logistics_origin_location_number_fk FOREIGN KEY(origin_location_number) REFERENCES warehouse.locations(location_number) ON DELETE RESTRICT,
 ADD CONSTRAINT logistics_destination_location_number_fk FOREIGN KEY(destination_location_number) REFERENCES warehouse.locations(location_number) ON DELETE RESTRICT;

ALTER TABLE inventory.movements
  ADD COLUMN source_location_number bigint,
  ADD COLUMN destination_location_number bigint;
UPDATE inventory.movements r SET source_location_number=l.location_number
  FROM warehouse.locations l WHERE l.id=r.source_location_id;
UPDATE inventory.movements r SET destination_location_number=l.location_number
  FROM warehouse.locations l WHERE l.id=r.destination_location_id;
ALTER TABLE inventory.movements
 ADD CONSTRAINT inventory_source_location_number_fk FOREIGN KEY(source_location_number) REFERENCES warehouse.locations(location_number) ON DELETE RESTRICT,
 ADD CONSTRAINT inventory_destination_location_number_fk FOREIGN KEY(destination_location_number) REFERENCES warehouse.locations(location_number) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION procurement.sync_production_purchase_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_purchase_order_id IS NULL THEN
    NEW.source_purchase_order_number:=NULL;
  ELSE
    SELECT purchase_order_id INTO NEW.source_purchase_order_number
    FROM procurement.purchase_orders WHERE id=NEW.source_purchase_order_id;
    IF NEW.source_purchase_order_number IS NULL THEN
      RAISE EXCEPTION 'Production source purchase order has no numeric ID' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER production_source_po_number_sync BEFORE INSERT OR UPDATE
ON production.production_orders FOR EACH ROW EXECUTE FUNCTION procurement.sync_production_purchase_order_number();

CREATE OR REPLACE FUNCTION logistics.sync_shipment_numeric_relations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.source_purchase_order_number:=NULL;
  IF NEW.source_purchase_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO NEW.source_purchase_order_number
      FROM procurement.purchase_orders WHERE id=NEW.source_purchase_order_id;
    IF NEW.source_purchase_order_number IS NULL THEN
      RAISE EXCEPTION 'Shipment source PO numeric mapping missing' USING ERRCODE='23503';
    END IF;
  END IF;
  SELECT location_number INTO NEW.origin_location_number
    FROM warehouse.locations WHERE id=NEW.origin_location_id;
  IF NEW.origin_location_number IS NULL THEN
    RAISE EXCEPTION 'Shipment origin numeric location missing' USING ERRCODE='23503';
  END IF;
  NEW.destination_location_number:=NULL;
  IF NEW.destination_location_id IS NOT NULL THEN
    SELECT location_number INTO NEW.destination_location_number
      FROM warehouse.locations WHERE id=NEW.destination_location_id;
    IF NEW.destination_location_number IS NULL THEN
      RAISE EXCEPTION 'Shipment destination numeric location missing' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER logistics_shipment_numeric_relations_sync BEFORE INSERT OR UPDATE
ON logistics.shipments FOR EACH ROW EXECUTE FUNCTION logistics.sync_shipment_numeric_relations();

CREATE OR REPLACE FUNCTION inventory.sync_movement_numeric_locations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.source_location_number:=NULL;
  IF NEW.source_location_id IS NOT NULL THEN
    SELECT location_number INTO NEW.source_location_number
      FROM warehouse.locations WHERE id=NEW.source_location_id;
    IF NEW.source_location_number IS NULL THEN
      RAISE EXCEPTION 'Inventory source location numeric mapping missing' USING ERRCODE='23503';
    END IF;
  END IF;
  NEW.destination_location_number:=NULL;
  IF NEW.destination_location_id IS NOT NULL THEN
    SELECT location_number INTO NEW.destination_location_number
      FROM warehouse.locations WHERE id=NEW.destination_location_id;
    IF NEW.destination_location_number IS NULL THEN
      RAISE EXCEPTION 'Inventory destination location numeric mapping missing' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_movement_numeric_locations_sync BEFORE INSERT OR UPDATE
ON inventory.movements FOR EACH ROW EXECUTE FUNCTION inventory.sync_movement_numeric_locations();

-- Canonical numeric IDs cannot be reassigned after creation.
CREATE OR REPLACE FUNCTION platform.reject_numeric_business_pk_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF to_jsonb(NEW)->>TG_ARGV[0] IS DISTINCT FROM to_jsonb(OLD)->>TG_ARGV[0] THEN
    RAISE EXCEPTION 'Numeric business identity is immutable for %.%',TG_TABLE_SCHEMA,TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM alsvid_numeric_supply_targets LOOP
    EXECUTE format('CREATE TRIGGER alsvid_supply_numeric_pk_immutable BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION platform.reject_numeric_business_pk_change(%L)',
      item.parent,item.new_pk);
  END LOOP;
END;
$$;

DO $$
DECLARE item record; restored bigint; saved bigint;
BEGIN
  SELECT count(*) INTO saved FROM alsvid_supply_uuid_fks;
  SELECT count(*) INTO restored FROM pg_constraint c
    JOIN alsvid_supply_uuid_fks old
      ON old.child_table=c.conrelid::regclass::text AND old.constraint_name=c.conname
    WHERE c.contype='f' AND c.convalidated;
  IF restored<>saved THEN
    RAISE EXCEPTION 'Supply legacy foreign key restore incomplete: % of %',restored,saved;
  END IF;
  FOR item IN SELECT * FROM alsvid_numeric_supply_targets LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_constraint
      WHERE conrelid=item.parent AND contype='p'
      AND pg_get_constraintdef(oid)=format('PRIMARY KEY (%I)',item.new_pk)) THEN
      RAISE EXCEPTION 'Numeric supply primary key failed for %',item.parent;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM production.production_orders r
    LEFT JOIN procurement.purchase_orders p ON p.id=r.source_purchase_order_id
    WHERE r.source_purchase_order_number IS DISTINCT FROM p.purchase_order_id
  ) OR EXISTS (
    SELECT 1 FROM logistics.shipments r
    LEFT JOIN procurement.purchase_orders p ON p.id=r.source_purchase_order_id
    WHERE r.source_purchase_order_number IS DISTINCT FROM p.purchase_order_id
  ) OR EXISTS (
    SELECT 1 FROM logistics.shipments r
    LEFT JOIN warehouse.locations l ON l.id=r.origin_location_id
    WHERE r.origin_location_number IS DISTINCT FROM l.location_number
  ) THEN
    RAISE EXCEPTION 'Canonical numeric source association mismatch in supply orders';
  END IF;
END;
$$;
