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
    'apps/web/app/admin/workbench-panels.tsx',
    'apps/web/app/admin/workbench.module.css',
    'apps/web/app/_design/live-operations.tsx',
    'apps/web/app/_design/live-operations.json',
    'apps/web/app/admin-preview/page.tsx',
    'apps/web/public/admin-preview',
    'apps/web/app/_experiments/commerce-lab/crmeb-catalog.ts',
    'apps/web/app/_experiments/commerce-lab/crmeb-catalog.test.mjs',
    'apps/web/app/_experiments/commerce-lab/catalog.server.ts',
    'apps/web/app/_experiments/commerce-lab/catalog-panel.tsx',
    'apps/web/app/_experiments/commerce-lab/catalog-panel.module.css',
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
  assert.ok(!source.includes('.chaibenn.com'), 'legacy ChaiBen cookies must not return');
  assert.ok(!source.includes('.alsvid.com'), 'legacy ALSVID alias cookies must not return');
  assert.ok(source.includes("host.endsWith('.alsvidbike.com')"));
  assert.equal(exists('docs/COMMERCE_SOURCE_LOCK.json'), false);
});

test('retired Shopify runtime cannot accept or replay orders or create new channels', () => {
  const api = read('apps/api/src/integrations.controller.ts');
  const service = read('domains/integrations/src/application/integration-service.ts');
  const factory = read('domains/integrations/src/infrastructure/index.ts');
  const commerce = read('domains/commerce/src/application/commerce-service.ts');
  const ui = read('apps/web/app/commerce/commerce-client.tsx');
  const env = read('.env.example');
  const integrationPkg = read('domains/integrations/package.json');
  for (const [name, source] of [['API',api],['integration service',service],['commerce UI',ui]]) {
    for (const retired of ['integrations/shopify/', 'ingestShopify', 'replayShopify']) {
      assert.ok(!source.includes(retired), name + ' must not use ' + retired);
    }
  }
  assert.equal(exists('domains/integrations/src/infrastructure/shopify-normalizer.ts'), false);
  assert.equal(exists('domains/integrations/src/infrastructure/sha256-evidence-hasher.ts'), false);
  assert.ok(!factory.includes('ShopifyNormalizer'));
  assert.ok(!factory.includes('CommerceIngestionPort'));
  assert.ok(commerce.includes("input.provider!=='AMAZON'&&input.provider!=='OTHER'"));
  assert.ok(read('domains/commerce/src/core/model.ts').includes("CommerceProvider='AMAZON'|'OTHER'"));
  assert.ok(!read('domains/commerce/src/core/model.ts').includes("CommerceProvider='SHOPIFY'"));
  for (const retired of ['<option value="SHOPIFY">', 'SHOPIFY ADAPTER', 'onSubmit={ingestShopify}', '>重放</button>']) {
    assert.ok(!ui.includes(retired), 'retired UI: ' + retired);
  }
  for (const retired of ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ACCESS_TOKEN', 'ALSVID_SHOPIFY_FC1_PRODUCT_URL']) {
    assert.ok(!env.includes(retired), 'retired env: ' + retired);
  }
  assert.ok(!integrationPkg.includes('@alsvid/commerce'));
  // Historic evidence and schema are retained, not dropped.
  assert.ok(exists('packages/database/migrations/0015_shopify_delivery_metadata.sql'));
  assert.ok(read('domains/integrations/src/infrastructure/postgres-integration-repository.ts').includes('SELECT r.*,c.provider'));
});
