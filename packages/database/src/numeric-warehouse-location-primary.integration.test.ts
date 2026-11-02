import assert from 'node:assert/strict';
import test from 'node:test';
import {Database} from './index.js';

test('Warehouse and Location numeric primary keys preserve legacy UUID references', {skip:!process.env.DATABASE_URL}, async()=>{
 const db=new Database();
 try {
  const keys=await db.query<{relation:string;definition:string}>(`SELECT conrelid::regclass::text AS relation,
   pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='p'
   AND conrelid IN('warehouse.warehouses'::regclass,'warehouse.locations'::regclass)`);
  assert.deepEqual(Object.fromEntries(keys.rows.map(x=>[x.relation,x.definition])),{
   'warehouse.warehouses':'PRIMARY KEY (warehouse_number)',
   'warehouse.locations':'PRIMARY KEY (location_number)'
  });
  const refs=await db.query<{invalid:string;drift:string;legacy:number}>(`SELECT
   (SELECT count(*)::text FROM pg_constraint WHERE contype='f' AND NOT convalidated
    AND confrelid IN('warehouse.warehouses'::regclass,'warehouse.locations'::regclass)) AS invalid,
   (SELECT count(*)::text FROM warehouse.locations l JOIN warehouse.warehouses w
    ON w.id=l.warehouse_id WHERE l.warehouse_number IS DISTINCT FROM w.warehouse_number) AS drift,
   (SELECT count(*)::int FROM pg_constraint WHERE contype='u'
    AND conname IN('warehouse_legacy_uuid_unique','warehouse_location_legacy_uuid_unique')) AS legacy`);
  assert.equal(Number(refs.rows[0]!.invalid),0);
  assert.equal(Number(refs.rows[0]!.drift),0);
  assert.equal(refs.rows[0]!.legacy,2);
 } finally {await db.close();}
});
