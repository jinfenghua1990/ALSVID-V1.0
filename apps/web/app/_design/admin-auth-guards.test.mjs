import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

test('retired legacy internal workspaces no longer render and redirect to canonical Admin modules', () => {
  // Retired 2026-11-03: the 14 internal workbench shells were replaced by the
  // canonical /admin modules. Their old URLs must stay reachable through the
  // permanent redirect map, never through a resurrected page or guard layout.
  const retired = {
    product: '/admin/product',
    commerce: '/admin/ecommerce',
    production: '/admin/production',
    inventory: '/admin/inventory',
    dealers: '/admin/dealers',
    supply: '/admin/supply',
    finance: '/admin/finance',
    logistics: '/admin/logistics',
    partners: '/admin/partners',
    vehicle360: '/admin/production/vin',
    people: '/admin/settings',
    overview: '/admin/analytics',
    'after-sales': '/admin/after-sales',
    customers: '/admin/customers',
  };
  const nextConfig = readFileSync(join(app, '..', 'next.config.ts'), 'utf8');
  for (const [area, destination] of Object.entries(retired)) {
    assert.equal(existsSync(join(app, area, 'page.tsx')), false, 'legacy page removed: ' + area);
    assert.equal(existsSync(join(app, area, 'layout.tsx')), false, 'legacy layout removed: ' + area);
    assert.ok(nextConfig.includes(`['/${area}', '${destination}']`), 'redirect defined: ' + area);
  }
  // Settings subroutes remain a guarded compatibility surface until they converge.
  assert.match(readFileSync(join(app, 'settings', 'layout.tsx'), 'utf8'), /requirePortalSession\('admin'/);
});

test('retired Admin mock operations widgets stay removed, logout remains live', () => {
  assert.equal(existsSync(join(here, 'live-operations.tsx')), false);
  assert.equal(existsSync(join(here, 'live-operations.json')), false);
  const renderer = readFileSync(join(here, 'renderer.tsx'), 'utf8');
  assert.ok(renderer.includes("from './admin-logout'"));
  assert.ok(readFileSync(join(here, 'admin-logout.tsx'), 'utf8').includes('export function AdminLogout()'));
});
