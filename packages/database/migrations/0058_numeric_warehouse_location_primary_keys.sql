-- ALSVID numeric-ID migration, phase 3: warehouse and location.
-- Retains all warehouse codes, physical records, and legacy UUID FK behavior.
-- UUID identity fields remain UNIQUE only during the coordinated API transition.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='warehouse.warehouses'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='warehouse.locations'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.models'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (product_id)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='product.platforms'::regclass
   AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (platform_number)')
 THEN
   RAISE EXCEPTION 'Unexpected numeric ID migration state; refusing warehouse cutover';
 END IF;
END;
$$;

CREATE TEMP TABLE alsvid_warehouse_location_old_fks ON COMMIT DROP AS
SELECT c.conrelid::regclass::text AS child_table, c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.contype='f'
 AND c.confrelid IN('warehouse.warehouses'::regclass,'warehouse.locations'::regclass)
 AND EXISTS (
   SELECT 1 FROM unnest(c.confkey) AS referenced_col(attnum)
   JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=referenced_col.attnum
   WHERE a.attname='id'
 );

ALTER TABLE warehouse.warehouses
 ADD COLUMN warehouse_number bigint GENERATED ALWAYS AS IDENTITY,
 ADD CONSTRAINT warehouse_legacy_uuid_unique UNIQUE(id);
ALTER TABLE warehouse.locations
 ADD COLUMN location_number bigint GENERATED ALWAYS AS IDENTITY,
 ADD CONSTRAINT warehouse_location_legacy_uuid_unique UNIQUE(id);

DO $$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT * FROM alsvid_warehouse_location_old_fks LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.child_table,fk.constraint_name);
 END LOOP;
END;
$$;

ALTER TABLE warehouse.warehouses DROP CONSTRAINT warehouses_pkey;
ALTER TABLE warehouse.warehouses ADD CONSTRAINT warehouses_pkey PRIMARY KEY(warehouse_number);
ALTER TABLE warehouse.locations DROP CONSTRAINT locations_pkey;
ALTER TABLE warehouse.locations ADD CONSTRAINT locations_pkey PRIMARY KEY(location_number);

DO $$
DECLARE fk record;
BEGIN
 FOR fk IN SELECT * FROM alsvid_warehouse_location_old_fks LOOP
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',
                  fk.child_table,fk.constraint_name,fk.definition);
 END LOOP;
END;
$$;

-- Align the warehouse -> location relationship on the same numeric authority.
ALTER TABLE warehouse.locations ADD COLUMN warehouse_number bigint;
UPDATE warehouse.locations l SET warehouse_number=w.warehouse_number
FROM warehouse.warehouses w WHERE w.id=l.warehouse_id;
ALTER TABLE warehouse.locations
 ALTER COLUMN warehouse_number SET NOT NULL,
 ADD CONSTRAINT locations_warehouse_number_fk FOREIGN KEY(warehouse_number)
 REFERENCES warehouse.warehouses(warehouse_number) ON DELETE RESTRICT;

-- Old UUID calls still populate the numeric relation without a second number generator.
CREATE OR REPLACE FUNCTION warehouse.sync_location_warehouse_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 SELECT w.warehouse_number INTO NEW.warehouse_number
 FROM warehouse.warehouses w WHERE w.id=NEW.warehouse_id;
 IF NEW.warehouse_number IS NULL THEN
   RAISE EXCEPTION 'Location warehouse UUID has no canonical numeric warehouse'
     USING ERRCODE='23503';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_location_sync_number
BEFORE INSERT OR UPDATE ON warehouse.locations
FOR EACH ROW EXECUTE FUNCTION warehouse.sync_location_warehouse_number();

CREATE OR REPLACE FUNCTION warehouse.immutable_warehouse_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.warehouse_number IS DISTINCT FROM OLD.warehouse_number THEN
   RAISE EXCEPTION 'Warehouse number is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_number_immutable
BEFORE UPDATE ON warehouse.warehouses
FOR EACH ROW EXECUTE FUNCTION warehouse.immutable_warehouse_number();

CREATE OR REPLACE FUNCTION warehouse.immutable_location_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.location_number IS DISTINCT FROM OLD.location_number THEN
   RAISE EXCEPTION 'Location number is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_location_number_immutable
BEFORE UPDATE ON warehouse.locations
FOR EACH ROW EXECUTE FUNCTION warehouse.immutable_location_number();

DO $$
DECLARE old_fks bigint; current_fks bigint;
BEGIN
 SELECT count(*) INTO old_fks FROM alsvid_warehouse_location_old_fks;
 SELECT count(*) INTO current_fks FROM pg_constraint c
 JOIN alsvid_warehouse_location_old_fks x ON
  x.child_table=c.conrelid::regclass::text AND x.constraint_name=c.conname
 WHERE c.contype='f' AND c.convalidated;
 IF old_fks<>current_fks THEN
   RAISE EXCEPTION 'Warehouse UUID FK restoration mismatch (% of %)',current_fks,old_fks;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='warehouse.warehouses'::regclass
  AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (warehouse_number)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='warehouse.locations'::regclass
  AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (location_number)')
 OR EXISTS (SELECT 1 FROM warehouse.locations l
   JOIN warehouse.warehouses w ON w.id=l.warehouse_id
   WHERE l.warehouse_number IS DISTINCT FROM w.warehouse_number)
 THEN
   RAISE EXCEPTION 'Warehouse numeric PK/FK invariant verification failed';
 END IF;
END;
$$;
