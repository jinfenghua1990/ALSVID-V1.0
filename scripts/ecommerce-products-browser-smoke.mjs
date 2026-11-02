import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Browser fixtures run only on disposable CI');
const { chromium } = createRequire(path.join(process.env.FC1_PLAYWRIGHT_ROOT, 'package.json'))('playwright');
const base = 'http://127.0.0.1:3000';
const output = process.env.FC1_REVIEW_OUTPUT || '.tmp/fc1-v4-review';
const auth = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/api/v1/auth/me' && request.headers.authorization === 'Bearer products-review-ci') {
    response.end(JSON.stringify({ data: { userId: 'ci-products', email: 'ci@example.invalid', displayName: 'CI', roles: ['system_admin'], permissions: ['product.publish'] } }));
  } else { response.statusCode = 401; response.end('{}'); }
});
await new Promise((resolve, reject) => { auth.once('error', reject); auth.listen(4000, '127.0.0.1', resolve); });
await mkdir(output, { recursive: true });

const model = (id, code, type, created) => ({ id, product_id: id === 'model-f8' ? '100001' : '100002', code, name: code + ' 产品', description: '', status: 'ACTIVE', product_type_code: type, platform_id: 'platform-1', created_at: created, updated_at: created });
const catalog = {
  models: [model('model-f8', 'F8', 'BIKE', '2026-10-10T10:00:00Z'), model('model-x9', 'X9', 'ACCESSORY', '2026-10-20T10:00:00Z')],
  variants: [{ id: 'var-f8', model_id: 'model-f8', code: 'F8-STD', name: '标准', status: 'ACTIVE' }, { id: 'var-x9', model_id: 'model-x9', code: 'X9-STD', name: '标准', status: 'ACTIVE' }],
  skus: [{ id: 'sku-f8', variant_id: 'var-f8', sku: 'F8-BLK', name: 'F8 黑色', status: 'ACTIVE', market_code: 'DE', color_code: 'BLACK', size_code: null }, { id: 'sku-x9', variant_id: 'var-x9', sku: 'X9-RED', name: 'X9 红色', status: 'ACTIVE', market_code: 'AT', color_code: 'RED', size_code: null }],
  platforms: [{ id: 'platform-1', code: 'FC', name: 'Folding Carbon' }],
};
let publications = [
  { model_id: 'model-f8', model_code: 'F8', model_status: 'ACTIVE', status: 'IN_REVIEW', title_zh: 'F8 城市电单车', title_de: 'F8 Stadt', title_en: 'F8 City', image_path: '/home/original/fc1-product.webp', evidence_note: 'CI fixture', version: 1, published_at: null, withdrawn_at: null },
  { model_id: 'model-x9', model_code: 'X9', model_status: 'ACTIVE', status: 'PUBLISHED', title_zh: 'X9 零配件', title_de: 'X9', title_en: 'X9', image_path: '', evidence_note: 'CI fixture', version: 1, published_at: '2026-10-21T10:00:00Z', withdrawn_at: null },
];
const summary = { skus: [{ id: 'sku-f8', sku: 'F8-BLK', name: 'F8 黑色', colorCode: 'BLACK' }, { id: 'sku-x9', sku: 'X9-RED', name: 'X9 红色', colorCode: 'RED' }], orders: [], orderTotal: 0, orderStatusCounts: {}, prices: [
  { id: 'draft-f8', skuId: 'sku-f8', sku: 'F8-BLK', skuName: 'F8', status: 'DRAFT', marketCountry: 'DE', currency: 'EUR', unitPriceGross: '999.00', effectiveFrom: null },
  { id: 'price-f8', skuId: 'sku-f8', sku: 'F8-BLK', skuName: 'F8', status: 'ACTIVE', marketCountry: 'DE', currency: 'EUR', unitPriceGross: '1200.00', effectiveFrom: '2026-10-01T00:00:00Z' },
  { id: 'price-x9', skuId: 'sku-x9', sku: 'X9-RED', skuName: 'X9', status: 'ACTIVE', marketCountry: 'AT', currency: 'EUR', unitPriceGross: '45.00', effectiveFrom: '2026-10-01T00:00:00Z' },
] };
const inventory = { balances: [{ item_kind: 'SKU', sku_id: 'sku-f8', sku: 'F8-BLK', sku_name: 'F8 黑色', warehouse_code: 'WH', warehouse_name: '仓库', location_code: 'A1', on_hand: '5', reserved: '2', available: '3', frame_number: null }] };
let canPublish = true;
const transitions = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addCookies([{ name: 'alsvid_session', value: 'products-review-ci', url: base, httpOnly: true }]);
  await page.route('**/api/control/v1/auth/me', route => route.fulfill({ json: { data: { permissions: canPublish ? ['product.publish'] : [] } } }));
  await page.route('**/api/control/v1/product/catalog', route => route.fulfill({ json: { data: catalog } }));
  await page.route('**/api/control/v1/product/publications', route => route.fulfill({ json: { data: publications } }));
  await page.route('**/api/control/v1/product/catalog-publish-assets', route => route.fulfill({ json: { data: [{ modelCode: 'F8', imagePath: '/home/original/fc1-product.webp' }] } }));
  await page.route('**/api/control/v1/commerce/storefront/summary', route => route.fulfill({ json: { data: summary } }));
  await page.route('**/api/control/v1/inventory', route => route.fulfill({ json: { data: inventory } }));
  const priceWrites = [];
  await page.route('**/api/control/v1/commerce/storefront/prices', async route => {
    const body = route.request().postDataJSON();
    priceWrites.push(body);
    summary.prices.unshift({ id: 'draft-at', skuId: body.skuId, sku: 'F8-BLK', skuName: 'F8', status: 'DRAFT', marketCountry: body.marketCountry, currency: 'EUR', unitPriceGross: body.unitPriceGross, effectiveFrom: null });
    await route.fulfill({ json: { data: { id: 'draft-at' } } });
  });
  await page.route('**/api/control/v1/product/publications/*/transition', async route => {
    const body = route.request().postDataJSON();
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    transitions.push({ id, ...body });
    if (id === 'model-x9' && body.action === 'WITHDRAW') return route.fulfill({ status: 409, json: { message: '版本冲突' } });
    const current = publications.find(item => item.model_id === id);
    assert.equal(body.expectedVersion, current.version);
    current.status = body.action === 'PUBLISH' ? 'PUBLISHED' : body.action === 'SUBMIT' ? 'IN_REVIEW' : 'WITHDRAWN';
    current.version++;
    return route.fulfill({ json: { data: current } });
  });

  await page.goto(base + '/admin/ecommerce/products');
  const list = page.getByRole('region', { name: '商城商品列表' });
  await list.getByText('F8 城市电单车').waitFor({ timeout: 30000 });
  assert.equal(await list.getByText('数字商品 ID：100001').count(), 1, 'show numeric product ID');
  assert.equal(await list.getByText('数字商品 ID：model-f8').count(), 0, 'do not show internal UUID as product ID');
  await page.getByRole('navigation', { name: '工作区标签页' }).getByRole('link', { name: '商城商品列表' }).waitFor();
  assert.equal(await list.locator('table thead th').count(), 10);
  assert.equal(await list.getByRole('button', { name: '待审核 1' }).count(), 1);
  assert.equal(await list.getByRole('button', { name: '已上架 1' }).count(), 1);
  const f8 = list.getByRole('checkbox', { name: '选择 F8' }).locator('xpath=ancestor::tr');
  assert.match(await f8.innerText(), /1200.00 EUR/);
  assert.doesNotMatch(await f8.innerText(), /999.00 EUR/, 'draft price must not appear as active');
  assert.match(await f8.innerText(), /仓库台账/);
  assert.match(await list.innerText(), /无库存记录/);
  async function assertActionsInView() {
    const viewport = await list.locator('table').locator('..').boundingBox();
    const action = await f8.getByRole('button', { name: '配置' }).boundingBox();
    assert.ok(viewport && action && action.x >= viewport.x && action.x + action.width <= viewport.x + viewport.width + 1, 'product actions remain visible in the table viewport');
  }
  await assertActionsInView();
  await page.screenshot({ path: path.join(output, 'ecommerce-products-table.png'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await assertActionsInView();
  await page.setViewportSize({ width: 1440, height: 1000 });

  await list.getByLabel('SKU 编码').fill('F8-BLK');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  await list.getByText('F8 城市电单车').waitFor();
  assert.equal(await list.getByText('X9 零配件').count(), 0);
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByLabel('数字商品 ID', { exact: true }).fill('100001');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  assert.equal(await list.getByText('X9 零配件').count(), 0, 'product ID filter');
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByLabel('商品编码', { exact: true }).fill('X9');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  assert.equal(await list.getByText('F8 城市电单车').count(), 0, 'product code filter');
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByLabel('商品名称', { exact: true }).fill('城市');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  assert.equal(await list.getByText('X9 零配件').count(), 0, 'publication title filter');
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByLabel('创建时间从').fill('2026-10-15');
  await list.getByLabel('创建时间至').fill('2026-10-25');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  assert.equal(await list.getByText('F8 城市电单车').count(), 0, 'creation date range filter');
  await list.getByText('X9 零配件').waitFor();
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByRole('button', { name: '更多筛选' }).click();
  await list.getByLabel('销售市场').selectOption('DE');
  await list.getByLabel('库存台账').selectOption('AVAILABLE');
  await list.getByRole('button', { name: '查询', exact: true }).click();
  assert.equal(await list.getByText('X9 零配件').count(), 0, 'market and inventory filters');
  await list.getByRole('button', { name: '重置' }).click();
  await list.getByRole('button', { name: '待审核 1' }).click();
  assert.equal(await list.getByRole('checkbox', { name: '选择 X9' }).count(), 0);
  await list.getByRole('button', { name: '全部 2' }).click();
  await list.getByRole('checkbox', { name: '选择当前全部商品' }).check();
  page.once('dialog', dialog => dialog.accept());
  await list.getByRole('button', { name: '批量审核并上架' }).click();
  await page.getByText('已审核上架 1 个商品。').waitFor();
  assert.deepEqual(transitions, [{ id: 'model-f8', action: 'PUBLISH', expectedVersion: 1 }], 'only selected in-review product is published');

  await list.getByRole('checkbox', { name: '选择当前全部商品' }).check();
  page.once('dialog', dialog => dialog.accept());
  await list.getByRole('button', { name: '批量下架' }).click();
  await page.getByText('已下架 1 个商品，失败 1 个。').waitFor();
  await page.getByRole('alert').getByText('X9：版本冲突').waitFor();
  assert.deepEqual(transitions.slice(1), [
    { id: 'model-f8', action: 'WITHDRAW', expectedVersion: 2 },
    { id: 'model-x9', action: 'WITHDRAW', expectedVersion: 1 },
  ], 'batch reports individual stale or permission failures');

  await list.getByRole('checkbox', { name: '选择 F8' }).locator('xpath=ancestor::tr').getByRole('button', { name: '配置' }).click();
  const f8config = page.getByRole('region', { name: 'F8 商品配置工作区' });
  await f8config.getByRole('button', { name: '提交审核' }).click();
  await list.getByRole('button', { name: '待审核 1' }).waitFor();
  assert.deepEqual(transitions.at(-1), { id: 'model-f8', action: 'SUBMIT', expectedVersion: 3 }, 'editing refreshes publication status');

  const priceForm = f8config.locator('[aria-label="新增价格版本"]');
  await priceForm.getByLabel('销售市场').selectOption('AT');
  await priceForm.getByLabel('EUR 含税单价').fill('1400.00');
  await priceForm.getByLabel('税率（基点）').fill('2000');
  await priceForm.getByRole('button', { name: '保存草稿' }).click();
  await f8config.getByText('价格草稿已保存，请核对后启用。').waitFor();
  assert.deepEqual(priceWrites, [{ skuId: 'sku-f8', marketCountry: 'AT', unitPriceGross: '1400.00', taxRateBasisPoints: 2000 }], 'price draft stays with its SKU and market');
  assert.equal(await f8config.getByText('X9-RED').count(), 0, 'other product prices are not included in this product editor');

  canPublish = false;
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await list.getByText('F8 城市电单车').waitFor();
  await list.getByRole('checkbox', { name: '选择 X9' }).check();
  assert.equal(await list.getByRole('button', { name: '批量下架' }).isDisabled(), true, 'publish permission is required');

  const x9 = list.getByRole('checkbox', { name: '选择 X9' }).locator('xpath=ancestor::tr');
  await x9.getByRole('button', { name: '配置' }).click();
  await page.getByRole('region', { name: 'X9 商品配置工作区' }).waitFor();
  assert.deepEqual(errors, [], 'product workspace must not produce browser runtime errors');
  console.log('Product table, real status/price/stock, filters, permissions and batch outcomes passed');
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => auth.close(resolve));
}
