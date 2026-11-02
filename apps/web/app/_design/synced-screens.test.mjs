import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const screens = JSON.parse(read('./synced-screens.json'));

test('production Admin registry exposes only live module metadata, never Ardot sample records', () => {
  assert.equal(screens.length, 13);
  assert.equal(new Set(screens.map(screen => screen.id)).size, screens.length);
  assert.equal(new Set(screens.map(screen => screen.route)).size, screens.length);
  for (const screen of screens) {
    assert.ok(screen.route.startsWith('/admin'), screen.route);
    assert.ok(screen.title && screen.area && screen.id, screen.route);
    assert.deepEqual(screen.blocks, [], `${screen.route} must not embed fixture business records`);
    assert.doesNotMatch(screen.id, /^ardot-/);
    assert.ok(existsSync(new URL('../' + screen.route.replace(/^\\/admin\\/?/, 'admin/') + '/page.tsx', import.meta.url)), screen.route);
  }
});

test('retired Admin dynamic routes never load demo screen registry', () => {
  const archived = read('../admin/[...designPath]/page.tsx');
  assert.match(archived, /redirect\\(destination\\)/);
  assert.doesNotMatch(archived, /synced-screens|screenById|AdminScreen|DesignTable/);
  assert.match(read('../admin/layout.tsx'), /requirePortalSession\\('admin'/);
  assert.match(read('./index.ts'), /activeScreens as Screen\\[\\]/);
  assert.doesNotMatch(read('./renderer.tsx'), /function BlockView|<DesignTable|<DesignForm|<Blocks/);
});

test('deprecated Admin workbench, theme and sample generators cannot be served or rebuilt', () => {
  for (const path of [
    '../admin/workbench-v2/page.tsx',
    '../admin/workbench-v3/page.tsx',
    './screens-a.ts', './screens-b.ts', './screens-c.ts',
    './design-form.tsx', './design-table.tsx',
    '../../../../scripts/sync-admin-design.cjs',
    '../../../../scripts/admin-design-refinements.cjs',
  ]) assert.equal(existsSync(new URL(path, import.meta.url)), false, path);
  const config = read('../../next.config.ts');
  for (const name of ['admin-legacy', 'admin/workbench-v2', 'admin/workbench-v3']) {
    assert.ok(config.includes(`source: '/${name}'`), name);
  }
  assert.equal(existsSync(new URL('../theme-legacy.css', import.meta.url)), false);
});
