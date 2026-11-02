import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

test('all existing legacy internal workspaces receive a server session guard', () => {
  const internalAreas = [
    'product', 'commerce', 'production', 'inventory', 'dealers',
    'supply', 'finance', 'logistics', 'partners', 'vehicle360',
    'people', 'overview', 'settings',
  ];
  for (const area of internalAreas) {
    const guard = readFileSync(join(app, area, 'layout.tsx'), 'utf8');
    assert.ok(guard.includes("requirePortalSession('admin', '/" + area + "')"), area);
  }
});

test('retired Admin mock operations widgets stay removed, logout remains live', () => {
  assert.equal(existsSync(join(here, 'live-operations.tsx')), false);
  assert.equal(existsSync(join(here, 'live-operations.json')), false);
  const renderer = readFileSync(join(here, 'renderer.tsx'), 'utf8');
  assert.ok(renderer.includes("from './admin-logout'"));
  assert.ok(readFileSync(join(here, 'admin-logout.tsx'), 'utf8').includes('export function AdminLogout()'));
});
