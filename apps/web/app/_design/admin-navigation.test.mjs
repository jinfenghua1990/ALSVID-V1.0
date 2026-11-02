import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'admin-navigation.ts'), 'utf8');
const registry = readFileSync(join(here, 'business-module-registry.ts'), 'utf8');
const modules = [...registry.matchAll(/\{ label: '([^']+)', href: '(\/admin[^']*)'/g)]
  .map(([, label, href]) => ({ label, href }));
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const mod = { exports: {} };
runInNewContext(outputText, {
  module: mod,
  exports: mod.exports,
  require(specifier) {
    assert.equal(specifier, './business-module-registry');
    return { ADMIN_MODULES: modules };
  },
});
const { navigationFor, ADMIN_SECONDARY_NAVIGATION } = mod.exports;

test('every internal shell exposes the same 13 canonical Admin modules', () => {
  assert.equal(modules.length, 13);
  for (const oldPath of ['/product', '/commerce', '/production', '/inventory', '/supply',
    '/finance', '/dealers', '/overview', '/vehicle360', '/settings/integrations',
    '/after-sales', '/partners', '/people/employees']) {
    const menu = navigationFor(oldPath);
    assert.equal(menu.length, 13);
    assert.ok(menu.every(item => item.href.startsWith('/admin')));
    assert.equal(menu.filter(item => item.active).length, 1, oldPath);
  }
  for (const [oldPath, livePath] of [
    ['/product', '/admin/product'], ['/commerce', '/admin/ecommerce'],
    ['/overview', '/admin/analytics'], ['/settings/integrations', '/admin/settings'],
    ['/production', '/admin/production'], ['/vehicle360', '/admin/production'],
  ]) assert.ok(navigationFor(oldPath).some(item => item.active && item.href === livePath), oldPath);
});

test('all enabled secondary items resolve to existing real Admin routes', () => {
  const ecommerceSections = new Set(['products', 'publications', 'homepage', 'inventory', 'pricing', 'orders']);
  let enabled = 0, planned = 0;
  for (const [area, groups] of Object.entries(ADMIN_SECONDARY_NAVIGATION)) {
    assert.ok(groups.length, area);
    for (const group of groups) for (const item of group.items) {
      if (!item.href) { planned++; continue; }
      enabled++;
      assert.ok(item.href.startsWith('/admin'), item.label);
      const pathname = item.href.split(/[?#]/)[0];
      const folder = join(here, '..', pathname.slice(1));
      const direct = existsSync(join(folder, 'page.tsx'));
      const dynamic = pathname.startsWith('/admin/ecommerce/') &&
        ecommerceSections.has(pathname.split('/')[3]) &&
        existsSync(join(here, '..', 'admin/ecommerce/[section]/page.tsx'));
      assert.ok(direct || dynamic, item.label + ' is not a live route: ' + item.href);
    }
  }
  assert.ok(enabled > 20);
  assert.ok(planned > 4);
});

test('product, inventory, production and procurement deep links retain their real targets', () => {
  const links = Object.values(ADMIN_SECONDARY_NAVIGATION).flatMap(groups =>
    groups.flatMap(group => group.items.filter(item => item.href)));
  for (const [label, href] of [
    ['整车产品（车辆明细）', '/admin/product?type=BIKE#vehicle-details'],
    ['零配件', '/admin/product?type=PARTS#parts'],
    ['商城装修', '/admin/ecommerce/page-builder'],
    ['生产订单', '/admin/production#work-orders'],
    ['采购订单', '/admin/supply#purchasing'],
    ['仓库列表', '/admin/inventory#warehouses'],
    ['VIN查询', '/admin/production/vin-detail'],
  ]) assert.ok(links.some(item => item.label === label && item.href === href), label);
  for (const [file, anchors] of [
    ['inventory/inventory-client.tsx', ['warehouse-setup','warehouses','balances','stocktake','movement-history']],
    ['product/product-client.tsx', ['vehicle-details','vehicle-models','parts','series']],
    ['production/production-client.tsx', ['work-orders','quality']],
  ]) {
    const content = readFileSync(join(here, '..', file), 'utf8');
    for (const anchor of anchors) assert.ok(content.includes('id="' + anchor + '"'), file + ':' + anchor);
  }
});

test('live and legacy shells no longer import or resurrect the old navigation', () => {
  const ops = readFileSync(join(here, '..', '_components/operations-frame.tsx'), 'utf8');
  const renderer = readFileSync(join(here, 'renderer.tsx'), 'utf8');
  assert.match(ops, /from '\.\.\/_design\/admin-navigation'/);
  assert.match(renderer, /ADMIN_SECONDARY_NAVIGATION/);
  assert.doesNotMatch(renderer, /scopedMenus|menuDestination|screens\.find/);
  assert.equal(existsSync(join(here, '..', 'app-navigation.ts')), false);
});
