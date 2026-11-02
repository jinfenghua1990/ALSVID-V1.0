import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('production delivery is one workbench while legacy purchasing remains accessible', () => {
  const navigation = read('./admin-navigation.ts');
  const registry = read('./business-module-registry.ts');
  const integrated = read('./integrated-operations.tsx');
  const workspace = read('./production-delivery-workspace.tsx');
  assert.match(navigation, /'生产交付总单', '\/admin\/supply'/);
  assert.match(navigation, /'原采购工作台', '\/admin\/supply\/legacy'/);
  assert.match(navigation, /'供应商与工厂', '\/admin\/supply\/partners'/);
  assert.match(registry, /label: '供应链管理'/);
  assert.match(registry, /legacyAreas: \['供应链','生产','物流'\]/);
  assert.match(integrated, /<ProductionDeliveryWorkspace \/>/);
  assert.match(integrated, /<PartnersClient embedded scope="supply" \/>/);
  assert.match(integrated, /<SupplyClient embedded \/>/);
  assert.match(workspace, /sourcePurchaseOrderId/);
  assert.match(workspace, /production-delivery:opened/);
  assert.match(workspace, /\/admin\/supply\/partners/);
  for (const name of ['采购信息','生产进度','发运与费用','仓库入库']) assert.ok(workspace.includes(name));
  const supply = read('../supply/supply-client.tsx');
  assert.match(supply, /type SupplyView = 'suppliers' \| 'quotations' \| 'orders' \| 'receipts'/);
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
