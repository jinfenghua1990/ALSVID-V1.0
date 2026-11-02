import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exists = path => existsSync(join(root, path));
const read = path => readFileSync(join(root, path), 'utf8');

test('retired parallel frameworks cannot be reintroduced into ALSVID production', () => {
  const removed = [
    '.github/workflows/crmeb-native.yml',
    '.github/workflows/commerce-source-import.yml',
    'infra/commerce-lab',
    'scripts/commerce-lab',
    'scripts/build-commerce-lab-static.mjs',
    'apps/web/public/commerce-lab-native.stale-20261029',
    'external/crmeb/crmeb',
    'external/crmeb/template',
    'docs/COMMERCE_SOURCE_LOCK.json',
    'apps/web/app/_design/screens-a.ts',
    'apps/web/app/_design/screens-b.ts',
    'apps/web/app/_design/screens-c.ts',
    'apps/web/app/_design/design-form.tsx',
    'apps/web/app/_design/design-table.tsx',
    'apps/web/app/_design/sync-manifest.json',
    'scripts/sync-admin-design.cjs',
    'scripts/admin-design-refinements.cjs',
    'apps/web/app/theme-legacy.css',
    'apps/web/app/admin/workbench-v2/page.tsx',
    'apps/web/app/admin/workbench-v3/page.tsx',
  ];
  for (const path of removed) assert.equal(exists(path), false, 'Retired path revived: ' + path);
  const source = read('apps/web/app/_design/renderer.tsx');
  assert.doesNotMatch(source, /BlockView|DesignTable|DesignForm|<Blocks/);
  assert.doesNotMatch(read('apps/web/app/_design/index.ts'), /screens-a|screens-b|screens-c/);
  assert.equal(JSON.parse(read('apps/web/app/_design/synced-screens.json')).length, 13);
});

test('one guarded Admin shell and production release target remain authoritative', () => {
  assert.match(read('apps/web/app/admin/layout.tsx'), /requirePortalSession\('admin'/);
  assert.match(read('apps/web/app/admin/[...designPath]/page.tsx'), /redirect\(destination\)/);
  for (const workflow of ['production-deploy.yml', 'www-deploy.yml']) {
    const source = read('.github/workflows/' + workflow);
    assert.ok(source.includes('"$GCP_PROJECT_ID" != "alsvid-production"'), workflow);
    assert.ok(source.includes('"$GCP_REGION" != "europe-west1"'), workflow);
  }
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.scripts['infra:up'], 'node scripts/local-production.mjs up');
  assert.ok(exists('infra/docker-compose.test.yml'), 'ephemeral CI fixtures remain supported');
  assert.ok(exists('infra/docker-compose.local-production.yml'), 'shared Neon/R2 local runtime remains supported');
  assert.ok(exists('apps/web/app/api/control/[...path]/route.ts'), 'shared authenticated API proxy remains');
});

test('retired subdomain cookie scopes and old framework source locks are forbidden', () => {
  const source = read('apps/web/app/_lib/session-cookie.ts');
  assert.doesNotMatch(source, /\\.chaibenn\\.com|\\.alsvid\\.com/);
  assert.match(source, /host\\.endsWith\\('\\.alsvidbike\\.com'\\)/);
  assert.equal(exists('docs/COMMERCE_SOURCE_LOCK.json'), false);
});
