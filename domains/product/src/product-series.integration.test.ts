import assert from 'node:assert/strict';
import test from 'node:test';
import { Database } from '@alsvid/database';

test('FC commercial series is separate from the Folding Carbon technical platform', {skip:!process.env.DATABASE_URL}, async()=>{
 const db = new Database();
 try {
   const r = await db.query<{name_zh:string;name_en:string;tech_name:string}>(
     `SELECT s.name_zh,s.name_en,p.name AS tech_name FROM product.series s
      JOIN product.platforms p ON p.id=s.default_platform_id WHERE s.code='FC'`);
   assert.equal(r.rows.length,1);
   assert.equal(r.rows[0]?.name_zh,'折叠系列');
   assert.equal(r.rows[0]?.name_en,'Folding Series');
   assert.notEqual(r.rows[0]?.name_en,r.rows[0]?.tech_name);
   const q = await db.query<{n:string}>(`SELECT count(*)::text AS n FROM product.models m
      LEFT JOIN product.series s ON s.series_id=m.series_id
      WHERE m.product_type_code='BIKE' AND m.code IN ('A1-ULTRA','L1-PRO','A1','L1') AND s.series_id IS NULL`);
   assert.equal(q.rows[0]?.n,'0');
 } finally {await db.close();}
});
