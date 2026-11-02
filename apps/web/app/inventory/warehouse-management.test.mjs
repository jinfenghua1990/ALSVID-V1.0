import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./warehouse-management-client.tsx',import.meta.url),'utf8');
const api=readFileSync(new URL('../../../api/src/warehouse.controller.ts',import.meta.url),'utf8');
test('warehouse settings and stock remain one warehouse ledger with country-based categorization',()=>{
  assert.match(source,/country==='CN'/);
  assert.match(source,/item_kind/);
  assert.match(source,/\/v1\/warehouse/);
  assert.match(source,/\/v1\/inventory/);
  assert.match(source,/on_hand/);
  assert.match(source,/reserved/);
  assert.match(source,/available/);
  assert.match(source,/仓库台账可用量 ≠ 官网可售库存/);
});
test('create and edit use real protected Warehouse API, with no silent stock insertion',()=>{
  assert.match(source,/新建仓库/);
  assert.match(source,/编辑仓库/);
  assert.match(source,/expectedName:draft.name/);
  assert.match(source,/method='GET'/);
  assert.match(api,/@Patch\('warehouses\/:id'\)/);
  assert.doesNotMatch(source,/\/v1\/inventory\/movements/);
});
