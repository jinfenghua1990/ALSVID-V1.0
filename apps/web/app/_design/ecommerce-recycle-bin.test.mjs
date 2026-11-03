import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync(new URL('./ecommerce-product-workspace.tsx', import.meta.url), 'utf8');

test('商城商品列表 provides a delete action that moves the product into the recycle bin', () => {
  assert.match(workspace, /onClick=\{\(\) => onRecycle\(model\)\}/);
  assert.match(workspace, /async function recycleProduct\(model: Model\)/);
  assert.match(workspace, /method: 'DELETE'/);
  assert.match(workspace, /\/api\/control\/v1\/product\/models\/\$\{encodeURIComponent\(model\.id\)\}/);
  assert.match(workspace, /已移入回收站/);
});

test('the recycle bin lists removed products and can restore or purge them', () => {
  assert.match(workspace, /商品回收站/);
  assert.match(workspace, /\/api\/control\/v1\/product\/recycle-bin/);
  assert.match(workspace, /async function restoreProduct\(item: RecycledItem\)/);
  assert.match(workspace, /models\/\$\{encodeURIComponent\(item\.id\)\}\/restore/);
  assert.match(workspace, /models\/\$\{encodeURIComponent\(item\.id\)\}\/purge/);
  assert.match(workspace, />还原</);
  assert.match(workspace, />彻底删除</);
});
