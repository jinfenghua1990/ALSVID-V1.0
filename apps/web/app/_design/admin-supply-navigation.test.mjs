import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('procurement sidebar targets the existing real workbench tabs', () => {
  const ui = read('./admin-navigation.ts');
  const supply = read('../supply/supply-client.tsx');
  const menuStart = ui.indexOf("  '供应链': [");
  const menuEnd = ui.indexOf("  '客户': [", menuStart);
  assert.ok(menuStart >= 0 && menuEnd > menuStart, 'procurement menu exists');
  const menu = ui.slice(menuStart, menuEnd);

  assert.match(menu, /采购订单[\s\S]*采购报价[\s\S]*收货记录/);
  assert.match(menu, /供应商目录/);
  assert.match(menu, /采购申请（待接入）/);
  assert.match(menu, /赠品采购（待接入）/);
  assert.doesNotMatch(menu, /\['采购申请', '\/admin/);
  for (const [label, route] of [
    ['采购订单', '/admin/supply#purchasing'],
    ['采购报价', '/admin/supply#quotations'],
    ['收货记录', '/admin/supply#receipts'],
    ['供应商目录', '/admin/supply'],
  ]) {
    assert.ok(ui.includes("['" + label + "', '" + route + "']"), label + ' must open real procurement view');
  }
  assert.match(supply, /type SupplyView = 'suppliers' \| 'quotations' \| 'orders' \| 'receipts'/);
  assert.match(supply, /const anchor = hash\.replace/);
  assert.match(supply, /if \(anchor === 'purchasing'\) return 'orders'/);
  assert.match(supply, /onHashChange\(\); \/\/ Also resolve an initial/);
  assert.match(supply, /useState<SupplyView>\('suppliers'\)/);
  assert.match(supply, /<h1>采购管理<\/h1>/);
});

test('parts menu opens the actual user-maintained parts registry', () => {
  const ui = read('./admin-navigation.ts');
  const product = read('../product/product-client.tsx');
  assert.ok(ui.includes("label: '零配件', href: '/admin/product?type=PARTS#parts'"));
  assert.match(product, /id="parts-library-panel"/);
  assert.match(product, /id="parts"/);
  assert.match(product, /const panel = target\?\.closest\('details'\)/);
  assert.match(product, /if \(panel\) panel\.open = true/);
  assert.match(product, /filteredParts\.map\(part =>/);
});
