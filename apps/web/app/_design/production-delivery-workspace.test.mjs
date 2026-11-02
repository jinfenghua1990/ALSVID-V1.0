import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');

test('production delivery uses real domain APIs and never fabricates cost quotes or stock',()=>{
  const ui=read('./production-delivery-workspace.tsx');
  const core=read('../../../domains/logistics/src/core/model.ts');
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
