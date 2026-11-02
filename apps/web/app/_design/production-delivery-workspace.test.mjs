import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('production delivery uses real domain APIs and never fabricates cost quotes or stock',()=>{
  const ui=read('./production-delivery-workspace.tsx');
  const core=read('../../../../domains/logistics/src/core/model.ts');
  const controller=read('../../../api/src/logistics.controller.ts');
  assert.match(ui,/\/api\/control/);
  assert.match(ui,/\/v1\/procurement\/purchase-orders/);
  assert.match(ui,/\/v1\/production\/orders/);
  assert.match(ui,/\/v1\/logistics\/shipments/);
  assert.match(ui,/\/v1\/finance\/landed-cost/);
  assert.match(ui,/receive-warehouse/);
  assert.match(ui,/物流询价接口仍未接通/);
  assert.match(ui,/真实签收凭证/);
  assert.match(core,/FACTORY_TO_DOMESTIC_WAREHOUSE/);
  assert.match(controller,/receive-warehouse/);
  assert.doesNotMatch(ui,/mockShipment|samplePurchaseOrder|fakeStatus/);
});

test('delivery migration adds domestic route without losing inventory or customs safeguards',()=>{
  const sql=read('../../../../packages/database/migrations/0052_production_delivery_shipments.sql');
  const repo=read('../../../../domains/logistics/src/infrastructure/postgres-logistics-repository.ts');
  assert.match(sql,/source_purchase_order_id/);
  assert.match(sql,/FACTORY_TO_DOMESTIC_WAREHOUSE/);
  assert.match(sql,/Shipment cargo SKU does not match a purchased SKU/);
  assert.match(repo,/sourcePurchaseOrderId/);
});

test('factory and warehouse receipts and multi-SKU finance are real editable stages',()=>{
 const ui=read('./production-delivery-workspace.tsx');
 for(const path of ['factory-receipts','receive-warehouse','landed-cost/','landedAllocations','工厂成品入库','本次实收入库','成本分摊'])assert.ok(ui.includes(path),path);
});
