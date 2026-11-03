import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('product archive is product and parts only; BOM editor is manufacturing-only', () => {
  const client = read('./product-client.tsx');
  const integrated = read('../_design/integrated-operations.tsx');
  const navigation = read('../_design/admin-navigation.ts');

  assert.match(client, /view\?: 'archive' \| 'engineering'/);
  assert.match(client, /\{view === "archive" \? <>/);
  assert.match(client, /id="parts-library-panel"/);
  assert.match(client, /\{view === "engineering" \? <>/);
  assert.match(client, /id="production-bom"/);
  assert.ok(client.indexOf('id="production-bom"') > client.indexOf('{view === "engineering" ? <>'));
  assert.match(client, /router\.replace\('\/admin\/production#production-bom'\)/);
  assert.doesNotMatch(client, /id="engineering-panel"/);
  assert.match(integrated, /case '生产': return <><ProductionClient embedded \/><ProductClient embedded view="engineering" \/><\/>;/);
  assert.match(navigation, /'BOM \/ 生产用料清单', '\/admin\/production#production-bom'/);
  assert.match(navigation, /group\('生产制造'/);
  assert.ok(navigation.includes("'整车产品（车辆明细）'"));
  assert.ok(navigation.includes("'车辆型号'"));
  assert.ok(navigation.includes("'零配件'"));
  assert.ok(navigation.includes("'技术平台'"));
});

test('product platform labels are exclusively user-authored records', () => {
  const client = read('./product-client.tsx');
  assert.doesNotMatch(client, /PLATFORM_PRESENTATION/);
  assert.match(client, /platform\.name/);
  assert.match(client, /platform\.description/);
  assert.match(client, /a\.code\.localeCompare\(b\.code\)/);
  assert.doesNotMatch(client, /<th>关联 BOM<\/th>/);
  assert.match(client, /<table className=\{styles\.platformTable\} aria-label="技术平台档案"/);
  assert.match(client, /\[\.\.\.filteredPlatforms\]\.sort/);
  assert.match(client, /catalog\.platforms\.filter\(platform =>/);
  assert.match(client, /catalog\.models\.filter\(\(model\) => model\.platform_id === platform\.id\)/);
  assert.doesNotMatch(client, /固定平台顺序/);
  assert.doesNotMatch(client, /className=\{styles\.platforms\}/);
  assert.doesNotMatch(client, /新增与编辑接口尚未开放/);
  assert.match(client, /setPlatformDraft\('new'\)/);
  assert.match(client, /按技术平台状态筛选/);
  // Product-series selection is independent of the engineering-platform manager.
  assert.match(client, /series\.status === 'ACTIVE'/);
  assert.match(client, /name="seriesId"/);
  assert.match(client, /产品系列/);
});
