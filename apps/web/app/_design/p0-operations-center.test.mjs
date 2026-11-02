import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  P0_AREAS,
  P0_READ_SOURCES,
  parseP0Source,
} from './p0-operations-contract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');
const time = '2026-10-23 18:00:00';

test('P0 stays within five priority areas and the comparison module is absent', () => {
  assert.deepEqual(P0_AREAS.map(item => item.key), ['product', 'orders', 'inventory', 'production', 'settings']);
  assert.equal(new Set(P0_AREAS.map(item => item.key)).size, 5);
  const allowed = new Set(P0_READ_SOURCES.map(source => source.key));
  for (const area of P0_AREAS) {
    assert.ok(area.href.startsWith('/admin/'), area.href);
    assert.ok(area.owner && area.action && area.existing.length && area.gates.length, area.key);
    assert.ok(area.sourceKeys.every(key => allowed.has(key)), area.key);
    assert.ok(area.gates.every(gate => ['pending', 'external', 'verify'].includes(gate.state)));
  }
  const registry = read('business-module-registry.ts');
  const entries = [...registry.matchAll(/\{ label: '([^']+)', href: '(\/admin[^']*)'/g)];
  assert.equal(entries.length, 13);
  assert.equal(entries.filter(([, label]) => label === '商城方案对比').length, 0);
  assert.deepEqual(new Set(entries.map(([, label]) => label)), new Set([
    '工作台', '产品研发', '商城运营', '经销商管理', '生产制造', '库存管理',
    '跨境物流', '采购管理', '客户与车主', '售后服务', '财务管理', '经营分析', '设置',
  ]));
});

test('P0 authorized data sources point to existing bounded business controllers', () => {
  assert.deepEqual(P0_READ_SOURCES.map(item => item.path), [
    '/v1/product/catalog',
    '/v1/commerce/storefront/summary',
    '/v1/inventory',
    '/v1/production',
    '/v1/auth/users',
    '/v1/audit?limit=100',
  ]);
  const api = join(here, '..', '..', '..', 'api', 'src');
  const checks = [
    ['product.controller.ts', "@Get('catalog')"],
    ['storefront-orders.controller.ts', "@Get('summary')"],
    ['inventory.controller.ts', '@Get()'],
    ['production.controller.ts', '@Get()'],
    ['auth.controller.ts', "@Get('users')"],
    ['audit.controller.ts', '@Get()'],
  ];
  for (const [file, marker] of checks)
    assert.ok(readFileSync(join(api, file), 'utf8').includes(marker), file);
});

test('P0 metrics accept record lists only and never turn missing data into zero', () => {
  const source = P0_READ_SOURCES[0];
  const good = parseP0Source(source, { data: { models: [{ id: 'm' }], skus: [{ id: 's1' }, { id: 's2' }] } }, time);
  assert.deepEqual(good, { state: 'ready', count: 1, secondaryCount: 2, checkedAt: time });

  for (const bad of [null, {}, { data: null }, { data: {} }, { data: { models: [], skus: null } }])
    assert.equal(parseP0Source(source, bad, time).state, 'unavailable');

  const zero = parseP0Source(source, { data: { models: [], skus: [] } }, time);
  assert.deepEqual(zero, { state: 'ready', count: 0, secondaryCount: 0, checkedAt: time });
  const staff = P0_READ_SOURCES.find(item => item.key === 'staff');
  assert.deepEqual(parseP0Source(staff, { data: [{}] }, time), { state: 'ready', count: 1, checkedAt: time });
  assert.equal(parseP0Source(staff, { data: { users: [] } }, time).state, 'unavailable');
});

test('retired P0 component is not mounted in active Admin renderer', () => {
  const renderer = read('renderer.tsx');
  assert.doesNotMatch(renderer, /<P0OperationsCenter \/>/);
  assert.doesNotMatch(renderer, /<LiveWorkbench \/>/);
});
