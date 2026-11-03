import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const read = (path) => readFileSync(join(app, path), 'utf8');
const screens = JSON.parse(read('./_design/synced-screens.json'));

const connected = [
  ['产品', 'product', 'ProductClient', 'product-client.tsx'],
  ['订单', 'commerce', 'CommerceClient', 'commerce-client.tsx'],
  ['生产', 'production', 'ProductionClient', 'production-client.tsx'],
  ['库存', 'inventory', 'InventoryClient', 'inventory-client.tsx'],
  ['经销商', 'dealers', 'DealersClient', 'dealers-client.tsx'],
  ['供应链', 'supply', 'SupplyClient', 'supply-client.tsx'],
];

test('canonical /admin module overview has an existing reviewed screen for every live workspace', () => {
  for (const [label, area] of connected) {
    const route = area === 'commerce' ? '/admin/orders' : area === 'supply' ? '/admin/supply' : '/admin/' + area;
    const screen = screens.find((item) => item.route === route);
    assert.ok(screen && (screen.sourceNode || route === '/admin/production'), route);
    assert.equal(screen.area, label, route);
    assert.ok(existsSync(join(app, route.slice(1), 'page.tsx')), route);
  }
});

test('all six existing live workspaces share the embedded / legacy frame without duplicating domain code', () => {
  const integrated = read('_design/integrated-operations.tsx');
  const frame = read('_components/operations-frame.tsx');
  assert.match(frame, /if \(embedded\)/);
  assert.match(frame, /<AppShell/);
  assert.match(integrated, /export function IntegratedOperations/);
  const renderer = read('_design/renderer.tsx');
  assert.match(renderer, /isIntegratedOverview/);
  assert.match(renderer, /<IntegratedOperations area=\{screen\.area\} route=\{screen\.route\} \/>/);
  assert.match(renderer, /<VehicleRecordDetail \/>/);
  assert.doesNotMatch(renderer, /av-design-archive/);
  assert.doesNotMatch(renderer, /<Blocks blocks=\{screen\.blocks\} stacked \/>/);

  for (const [label, area, component, file] of connected) {
    const source = read(area + '/' + file);
    assert.ok(integrated.includes('<' + component + ' embedded />'), label);
    if (area === 'product') {
      assert.ok(source.includes("view?: 'archive' | 'engineering'"), 'product supports archive and production BOM views');
      assert.ok(source.includes('view === "engineering" ? "production" : "product"'), 'product production BOM inherits production area');
      assert.ok(integrated.includes('<ProductClient embedded view="engineering" />'), 'BOM editor is in production');
    } else {
      assert.ok(source.includes('export default function ' + component + '({ embedded = false }'), area);
      assert.ok(source.includes('<OperationsFrame embedded={embedded} area="' + area + '"'), area);
    }
    assert.ok(source.includes('</OperationsFrame>'), area);
    assert.ok(!source.includes('<AppShell'), area);
    assert.ok(!source.includes('synced-screens.json'), area);
    // The legacy route shell is retired; the workspace now renders only inside /admin.
    assert.equal(existsSync(join(app, area, 'layout.tsx')), false, 'retired layout: ' + area);
  }
});
