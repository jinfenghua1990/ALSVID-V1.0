import assert from 'node:assert/strict';
import test from 'node:test';
import {Database} from './index.js';

// CI uses an isolated PostgreSQL instance; no production database mutation here.
test('all business UUID primary keys are migrated in one batch without invalidating foreign keys', {skip:!process.env.DATABASE_URL},async()=>{
 const db=new Database();
 try{
  const check=await db.query<{remaining_uuid_pks:number;business_numeric_pks:number;legacy_uuid_keys:number;invalid_fks:number}>(
   "SELECT "+
   "(SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] WHERE c.contype='p' AND cardinality(c.conkey)=1 AND a.atttypid='uuid'::regtype AND n.nspname NOT IN('identity','audit','platform','pg_catalog','information_schema')) AS remaining_uuid_pks,"+
   "(SELECT count(*)::int FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1] WHERE c.contype='p' AND cardinality(c.conkey)=1 AND a.atttypid='int8'::regtype AND a.attname='record_id' AND n.nspname NOT IN('identity','audit','platform')) AS business_numeric_pks,"+
   "(SELECT count(*)::int FROM pg_constraint WHERE contype='u' AND conname LIKE 'alsvid_uuid_%') AS legacy_uuid_keys,"+
   "(SELECT count(*)::int FROM pg_constraint WHERE contype='f' AND NOT convalidated) AS invalid_fks"
  );
  const row=check.rows[0]!;
  assert.equal(row.remaining_uuid_pks,0);
  assert.ok(row.business_numeric_pks>=80);
  assert.equal(row.legacy_uuid_keys,row.business_numeric_pks);
  assert.equal(row.invalid_fks,0);
  const retained=await db.query<{table_name:string;definition:string}>(
   "SELECT conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='p' AND conrelid IN ('product.models'::regclass,'product.skus'::regclass,'procurement.purchase_orders'::regclass,'warehouse.warehouses'::regclass)"
  );
  const definitions=Object.fromEntries(retained.rows.map(x=>[x.table_name,x.definition]));
  assert.equal(definitions['product.models'],'PRIMARY KEY (product_id)');
  assert.equal(definitions['product.skus'],'PRIMARY KEY (sku_number)');
  assert.equal(definitions['procurement.purchase_orders'],'PRIMARY KEY (purchase_order_id)');
  assert.equal(definitions['warehouse.warehouses'],'PRIMARY KEY (warehouse_number)');
  const views=await db.query<{obligations:number;payments:number}>(
   "SELECT (SELECT count(*)::int FROM finance.v_obligations) AS obligations,(SELECT count(*)::int FROM finance.v_payments) AS payments"
  );
  assert.ok(views.rows.length===1);
 }finally{await db.close();}
});
