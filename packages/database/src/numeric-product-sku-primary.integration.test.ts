import assert from 'node:assert/strict';
import test from 'node:test';
import {Database} from './index.js';

const hasDatabase=Boolean(process.env.DATABASE_URL);
test('Product and SKU canonical numbers are their PostgreSQL primary keys', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const r=await db.query<{table_name:string;definition:string}>(
      `SELECT conrelid::regclass::text AS table_name,pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE contype='p' AND conrelid IN ('product.models'::regclass,'product.skus'::regclass)
       ORDER BY table_name`
    );
    assert.deepEqual(Object.fromEntries(r.rows.map(x=>[x.table_name,x.definition])),{
      'product.models':'PRIMARY KEY (product_id)',
      'product.skus':'PRIMARY KEY (sku_number)'
    });
    const legacy=await db.query<{table_name:string}>(`SELECT conrelid::regclass::text AS table_name
      FROM pg_constraint WHERE contype='u' AND conname IN
      ('product_models_legacy_uuid_unique','product_skus_legacy_uuid_unique')`);
    assert.deepEqual(new Set(legacy.rows.map(r=>r.table_name)),
      new Set(['product.models','product.skus']));
    const mapped=await db.query<{errors:string}>(`SELECT count(*)::text AS errors
      FROM product.skus s JOIN product.variants v ON v.id=s.variant_id
      JOIN product.models m ON m.id=v.model_id
      WHERE s.product_id<>m.product_id OR s.sku_number<>s.product_id*1000+s.sku_sequence`);
    assert.equal(Number(mapped.rows[0]!.errors),0);
    const checks=await db.query<{invalid:string}>(`SELECT count(*)::text AS invalid
      FROM pg_constraint c WHERE c.contype='f'
      AND c.confrelid IN ('product.models'::regclass,'product.skus'::regclass)
      AND NOT c.convalidated`);
    assert.equal(Number(checks.rows[0]!.invalid),0,'old UUID and numeric cross-domain FKs must remain validated');
  }finally{await db.close();}
});
