import assert from 'node:assert/strict';
import test from 'node:test';
import { Database } from './index.js';

test('supply-chain transaction tables use numeric canonical primary keys with validated legacy references',
 {skip:!process.env.DATABASE_URL},async()=>{
  const db=new Database();
  try {
    const rows=await db.query<{rel:string;pk:string}>(`SELECT conrelid::regclass::text AS rel,
      pg_get_constraintdef(oid) AS pk FROM pg_constraint
      WHERE contype='p' AND conrelid IN (
      'procurement.purchase_orders'::regclass,'production.production_orders'::regclass,
      'logistics.shipments'::regclass,'inventory.movements'::regclass)`);
    assert.deepEqual(Object.fromEntries(rows.rows.map(x=>[x.rel,x.pk])),{
      'procurement.purchase_orders':'PRIMARY KEY (purchase_order_id)',
      'production.production_orders':'PRIMARY KEY (production_order_id)',
      'logistics.shipments':'PRIMARY KEY (shipment_id)',
      'inventory.movements':'PRIMARY KEY (movement_id)'
    });
    const checks=await db.query<{uuid_keys:string;invalid_fks:string;numeric_links:string}>(`SELECT
      (SELECT count(*)::text FROM pg_constraint c WHERE c.contype='u' AND c.conname IN(
       'procurement_purchase_orders_legacy_uuid_unique','production_production_orders_legacy_uuid_unique',
       'logistics_shipments_legacy_uuid_unique','inventory_movements_legacy_uuid_unique')) AS uuid_keys,
      (SELECT count(*)::text FROM pg_constraint c WHERE c.contype='f' AND NOT c.convalidated
       AND c.confrelid IN('procurement.purchase_orders'::regclass,'production.production_orders'::regclass,
       'logistics.shipments'::regclass,'inventory.movements'::regclass)) AS invalid_fks,
      (SELECT count(*)::text FROM pg_constraint c WHERE c.contype='f' AND c.conname IN(
        'production_source_po_number_fk','logistics_source_po_number_fk','logistics_origin_location_number_fk',
        'logistics_destination_location_number_fk','inventory_source_location_number_fk',
        'inventory_destination_location_number_fk') AND c.convalidated) AS numeric_links`);
    assert.equal(Number(checks.rows[0]!.uuid_keys),4);
    assert.equal(Number(checks.rows[0]!.invalid_fks),0);
    assert.equal(Number(checks.rows[0]!.numeric_links),6);
  } finally {await db.close();}
});
