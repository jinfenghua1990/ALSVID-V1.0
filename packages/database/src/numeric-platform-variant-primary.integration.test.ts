import assert from 'node:assert/strict';
import test from 'node:test';
import { Database } from './index.js';

test('Platform/Variant numeric primary keys retain full legacy FK integrity', {skip:!process.env.DATABASE_URL}, async()=>{
 const db=new Database();
 try{
   const keys=await db.query<{relation:string;definition:string}>(`SELECT conrelid::regclass::text AS relation,
     pg_get_constraintdef(oid) AS definition FROM pg_constraint
     WHERE contype='p' AND conrelid IN
       ('product.platforms'::regclass,'product.variants'::regclass)`);
   assert.deepEqual(Object.fromEntries(keys.rows.map(x=>[x.relation,x.definition])),{
     'product.platforms':'PRIMARY KEY (platform_number)',
     'product.variants':'PRIMARY KEY (variant_number)'
   });
   const counts=await db.query<{invalid_fks:string;invalid_mappings:string}>(`SELECT
     (SELECT count(*) FROM pg_constraint c WHERE c.contype='f' AND NOT c.convalidated
       AND c.confrelid IN('product.platforms'::regclass,'product.variants'::regclass))::text AS invalid_fks,
     ((SELECT count(*) FROM product.models m JOIN product.platforms p ON p.id=m.platform_id
       WHERE m.platform_number IS DISTINCT FROM p.platform_number)
      +(SELECT count(*) FROM product.skus s JOIN product.variants v ON v.id=s.variant_id
       WHERE s.variant_number IS DISTINCT FROM v.variant_number))::text AS invalid_mappings`);
   assert.equal(Number(counts.rows[0]!.invalid_fks),0);
   assert.equal(Number(counts.rows[0]!.invalid_mappings),0);
   const uuids=await db.query<{constraint_name:string}>(`SELECT conname AS constraint_name
     FROM pg_constraint WHERE conname IN
       ('product_platforms_legacy_uuid_unique','product_variants_legacy_uuid_unique') AND contype='u'`);
   assert.equal(uuids.rows.length,2,'historic UUID links must be preserved until API migration');
 }finally{await db.close();}
});
