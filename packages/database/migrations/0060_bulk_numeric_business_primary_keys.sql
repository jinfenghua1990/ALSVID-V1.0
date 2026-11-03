-- Consolidated ALSVID 2026-11-03 business ID migration.
-- Atomic, no data deletes. Preserve original UUID unique keys and exact FK semantics during API cutover.
-- Authentication/session/audit and platform infrastructure are excluded for separate review.
DO $alsvid_bulk$
DECLARE item record; n integer; old_fk_count integer; restored_count integer; old_uuid_name text; definition text;
BEGIN
 CREATE TEMP TABLE alsvid_bulk_targets ON COMMIT DROP AS
 SELECT c.conrelid AS rel_oid,c.conrelid::regclass AS rel,nsp.nspname AS schema_name,
        t.relname AS table_name,c.conname AS previous_pk_name,a.attname AS old_pk_column
 FROM pg_constraint c
 JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace nsp ON nsp.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
 WHERE c.contype='p' AND cardinality(c.conkey)=1 AND a.atttypid='uuid'::regtype
   AND t.relkind='r'
   AND nsp.nspname NOT IN('pg_catalog','information_schema','identity','audit','platform');

 SELECT count(*) INTO n FROM alsvid_bulk_targets;
 IF n<80 OR n>100 THEN RAISE EXCEPTION 'Unexpected UUID business PK count %, abort',n; END IF;
 IF EXISTS(SELECT 1 FROM alsvid_bulk_targets b JOIN pg_attribute a ON a.attrelid=b.rel_oid
   WHERE a.attname='record_id' AND NOT a.attisdropped) THEN
   RAISE EXCEPTION 'record_id already exists: schema drift; abort';
 END IF;

 CREATE TEMP TABLE alsvid_bulk_original_fks ON COMMIT DROP AS
 SELECT c.conrelid::regclass::text AS child_table,c.conname AS constraint_name,
        pg_get_constraintdef(c.oid) AS definition,c.convalidated AS validated
 FROM pg_constraint c JOIN alsvid_bulk_targets b ON c.confrelid=b.rel_oid
 WHERE c.contype='f'
   AND EXISTS(SELECT 1 FROM unnest(c.confkey) x(attnum)
              JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=x.attnum
              WHERE a.attname=b.old_pk_column);
 SELECT count(*) INTO old_fk_count FROM alsvid_bulk_original_fks;
 IF EXISTS(SELECT 1 FROM alsvid_bulk_original_fks WHERE NOT validated) THEN
   RAISE EXCEPTION 'Unvalidated legacy foreign key detected; abort';
 END IF;

 -- Finance aggregate views currently GROUP BY old UUID primary keys.
 -- Make grouping explicit, preserving the exact view fields without relying on UUID PK constraints.
 IF EXISTS(SELECT 1 FROM pg_depend d JOIN pg_constraint c ON c.oid=d.refobjid
   WHERE d.refclassid='pg_constraint'::regclass AND d.classid='pg_rewrite'::regclass
     AND d.deptype='n' AND c.conrelid IN (SELECT rel_oid FROM alsvid_bulk_targets)
     AND d.objid NOT IN(
       SELECT oid FROM pg_rewrite
       WHERE ev_class IN ('finance.v_obligations'::regclass,'finance.v_payments'::regclass)
     )) THEN
   RAISE EXCEPTION 'Unexpected views depend on UUID primary key constraints';
 END IF;
 DECLARE
  view_sql text;
 BEGIN
  SELECT pg_get_viewdef('finance.v_obligations'::regclass,true) INTO view_sql;
  IF view_sql !~ 'GROUP BY o\.id, ov\.id;?\s*$' THEN
    RAISE EXCEPTION 'Unknown finance.v_obligations definition; abort';
  END IF;
  view_sql:=regexp_replace(view_sql,'GROUP BY o\.id, ov\.id;?\s*$',
    'GROUP BY o.id, o.obligation_number, o.direction, o.partner_id, o.document_id, o.currency, o.original_amount, o.due_date, o.source_type, o.source_id, o.note, o.created_by, o.created_at, ov.id;');
  EXECUTE 'CREATE OR REPLACE VIEW finance.v_obligations AS '||view_sql;

  SELECT pg_get_viewdef('finance.v_payments'::regclass,true) INTO view_sql;
  IF view_sql !~ 'GROUP BY p\.id, pr\.id;?\s*$' THEN
    RAISE EXCEPTION 'Unknown finance.v_payments definition; abort';
  END IF;
  view_sql:=regexp_replace(view_sql,'GROUP BY p\.id, pr\.id;?\s*$',
    'GROUP BY p.id, p.payment_number, p.direction, p.partner_id, p.currency, p.amount, p.value_date, p.provider, p.account_reference, p.external_reference, p.idempotency_key, p.note, p.posted_by, p.created_at, pr.id;');
  EXECUTE 'CREATE OR REPLACE VIEW finance.v_payments AS '||view_sql;
 END;

 -- BIGINT record_id is the formal table primary key; old UUID remains a guarded compatibility key.
 FOR item IN SELECT * FROM alsvid_bulk_targets ORDER BY schema_name,table_name LOOP
   old_uuid_name:='alsvid_uuid_'||substr(md5(item.rel::text),1,20);
   EXECUTE format('ALTER TABLE %s ADD COLUMN record_id BIGINT GENERATED ALWAYS AS IDENTITY',item.rel);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE(%I)',item.rel,old_uuid_name,item.old_pk_column);
 END LOOP;
 FOR item IN SELECT * FROM alsvid_bulk_original_fks ORDER BY child_table,constraint_name LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.child_table,item.constraint_name);
 END LOOP;
 FOR item IN SELECT * FROM alsvid_bulk_targets ORDER BY schema_name,table_name LOOP
   EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.rel,item.previous_pk_name);
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I PRIMARY KEY(record_id)',item.rel,item.previous_pk_name);
 END LOOP;
 FOR item IN SELECT * FROM alsvid_bulk_original_fks ORDER BY child_table,constraint_name LOOP
   EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',item.child_table,item.constraint_name,item.definition);
 END LOOP;

 SELECT count(*) INTO restored_count
 FROM pg_constraint c JOIN alsvid_bulk_original_fks f
   ON f.child_table=c.conrelid::regclass::text AND f.constraint_name=c.conname
 WHERE c.contype='f' AND c.convalidated;
 IF restored_count<>old_fk_count THEN
   RAISE EXCEPTION 'Legacy UUID foreign key restore failed: %/%',restored_count,old_fk_count;
 END IF;
 FOR item IN SELECT * FROM alsvid_bulk_targets LOOP
   SELECT pg_get_constraintdef(oid) INTO definition
   FROM pg_constraint WHERE contype='p' AND conrelid=item.rel_oid;
   IF definition IS DISTINCT FROM 'PRIMARY KEY (record_id)' THEN
     RAISE EXCEPTION 'Numeric primary key not set for %',item.rel;
   END IF;
   old_uuid_name:='alsvid_uuid_'||substr(md5(item.rel::text),1,20);
   IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=item.rel_oid
       AND conname=old_uuid_name AND contype='u') THEN
     RAISE EXCEPTION 'Legacy UUID uniqueness missing for %',item.rel;
   END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace ns ON ns.oid=t.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='p' AND cardinality(c.conkey)=1 AND a.atttypid='uuid'::regtype
     AND ns.nspname NOT IN('identity','audit','platform','pg_catalog','information_schema')) THEN
   RAISE EXCEPTION 'Unconverted single-column UUID business primary key remains';
 END IF;
 RAISE NOTICE 'Converted % business PKs to numeric; validated % original foreign keys',n,restored_count;
END
$alsvid_bulk$;
