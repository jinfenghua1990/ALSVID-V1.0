import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.join(process.env.FC1_PLAYWRIGHT_ROOT, 'package.json'));
const { chromium } = require('playwright');
const output = process.env.FC1_REVIEW_OUTPUT || '.tmp/fc1-v4-review';
const base = 'http://127.0.0.1:3000';
await mkdir(output, { recursive: true });
// Disposable runner-only authentication fixture. No production flags or auth code change.
const auth = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/api/v1/auth/me' && request.headers.authorization === 'Bearer commerce-lab-ci') {
    response.end(JSON.stringify({ data: { userId: 'ci-admin', email: 'ci@example.invalid',
      displayName: 'CI Admin', roles: ['system_admin'], permissions: [] } }));
  } else { response.statusCode = 401; response.end('{}'); }
});
await new Promise((resolve, reject) => { auth.once('error', reject); auth.listen(4000, resolve); });
const browser = await chromium.launch({ headless: true });
const report = { sha: process.env.FC1_REVIEW_SHA, checks: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The retired commerce comparison UI is no longer a primary Admin module.
  // Keep testing the current Admin shell and the downstream business screens.
  await page.goto(base + '/admin/ecommerce/page-builder');
  await page.waitForURL(/\/login\?/);
  report.checks.push('unauthenticated editor redirects to login');
  await context.addCookies([{ name: 'alsvid_session', value: 'commerce-lab-ci', url: base, httpOnly: true }]);
  await page.goto(base + '/admin/ecommerce/page-builder');
  await page.getByRole('heading', { name: '商城首页装修' }).waitFor();
  const primary = page.getByRole('navigation', { name: '一级导航', exact: true });
  assert.equal(await primary.getByRole('link', { name: '商城方案对比', exact: true }).count(), 0,
    'retired comparison entry must not be visible');
  const secondary = page.getByRole('complementary', { name: '二级导航', exact: true });
  const builderLink = secondary.getByRole('link', { name: '商城装修', exact: true });
  assert.equal(new URL(await builderLink.getAttribute('href'), base).pathname, '/admin/ecommerce/page-builder');
  assert.equal(await page.getByRole('button', { name: '导出装修方案' }).count(), 1);
  await page.screenshot({ path: path.join(output, 'commerce-builder-entry.png'), fullPage: true });
  report.checks.push('independent visual editor is reachable from current commerce navigation');
  // Deterministic read-only fixtures prove that a real product renders as one table row.
  await page.route('**/api/control/v1/product/catalog', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: {
      productTypes: [{ code: 'BIKE', name: '整车', description: '', status: 'ACTIVE' }],
      platforms: [{ id: 'platform-ci', code: 'FC', name: 'Folding Carbon', description: '', status: 'ACTIVE', version: 1 }],
      models: [{ id: 'model-ci', platform_id: 'platform-ci', product_type_code: 'BIKE', code: 'FC1', name: 'CI 商品档案测试', description: '', status: 'ACTIVE', version: 1 }],
      variants: [], skus: [],
    } }),
  }));
  await page.route('**/api/control/v1/engineering', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { parts: [], boms: [], buildSpecs: [] } }),
  }));
  // Canonical admin product route must show the live, compact archive rather than design fixtures.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + '/admin/product');
  const archive = page.locator('[data-area="product"]');
  await archive.waitFor();
  await archive.getByRole('heading', { name: '整车产品', exact: true }).waitFor();
  assert.equal(await archive.locator('#model-register').count(), 1, 'bicycle archive is the focused initial list');
  await archive.getByRole('row', { name: /FC1/ }).waitFor();
  assert.equal(await archive.locator('#model-register tbody tr').count(), 1, 'one bicycle occupies one data row');
  assert.equal(await archive.locator('.unused-kpi-placeholder').count(), 0);
  assert.equal(await archive.locator('#product-info-panel').count(), 0, 'no duplicated product-category accordion');
  assert.equal(await archive.locator('#product-maintenance-panel').count(), 0, 'legacy variant/SKU accordion is deleted');
  await archive.getByRole('row', { name: /FC1/ }).getByRole('button', { name: '编辑 FC1 配置版本与 SKU' }).click();
  const configurationDialog = archive.getByRole('dialog', { name: '编辑车型配置及 SKU' });
  await configurationDialog.waitFor();
  assert.equal(await configurationDialog.getByRole('heading', { name: '新增商业版本' }).count(), 1);
  assert.equal(await configurationDialog.getByRole('heading', { name: '新增 SKU 规格' }).count(), 1);
  await configurationDialog.getByRole('button', { name: '关闭' }).click();
  assert.equal(await archive.getByRole('dialog').count(), 0, 'closing version/SKU editor returns to compact table');
  await page.screenshot({ path: path.join(output, 'admin-product-archive-desktop.png'), fullPage: true });
  await archive.getByRole('button', { name: '＋ 新建整车' }).first().click();
  const createBicycle = archive.getByRole('dialog', { name: '新建整车' });
  await createBicycle.waitFor();
  assert.equal(await createBicycle.getByRole('textbox', { name: '商品编码' }).count(), 1);
  await createBicycle.getByRole('button', { name: '取消' }).click();
  assert.equal(await archive.getByRole('dialog').count(), 0, 'cancelling new product does not write data');
  await archive.getByRole('button', { name: '自定义字段管理' }).click();
  await archive.getByRole('dialog', { name: '管理商品字段' }).waitFor();
  await archive.getByRole('button', { name: '新建字段' }).click();
  await archive.getByRole('dialog', { name: '新建商品字段' }).waitFor();
  await archive.getByRole('dialog', { name: '新建商品字段' }).getByRole('button', { name: '取消' }).click();
  await archive.getByRole('dialog', { name: '管理商品字段' }).getByRole('button', { name: '关闭' }).click();
  report.checks.push('model custom field management and create dialogs render without fixture writes');

  await page.goto(base + '/admin/product?type=PARTS#parts');
  await archive.getByRole('heading', { name: '零配件', exact: true }).waitFor();
  await archive.getByRole('button', { name: '生产零件' }).waitFor();
  await archive.getByRole('button', { name: '＋ 新建零件' }).first().click();
  await archive.getByRole('dialog', { name: '新建零件' }).waitFor();
  await archive.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await archive.getByRole('button', { name: '可售配件' }).click();
  await archive.getByRole('heading', { name: '零配件', exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'admin-product-parts-desktop.png'), fullPage: true });

  await page.goto(base + '/admin/product#series');
  await archive.getByRole('heading', { name: '技术平台', exact: true }).waitFor();
  await archive.locator('#series').waitFor();
  await archive.getByRole('table', { name: '技术平台档案' }).waitFor();
  assert.equal(await archive.getByRole('row', { name: /Folding Carbon/ }).count(), 1, 'only backed technical platforms are shown');
  await archive.getByRole('button', { name: '新建技术平台' }).click();
  await archive.getByRole('dialog', { name: '新建技术平台' }).waitFor();
  await archive.getByRole('dialog', { name: '新建技术平台' }).getByRole('button', { name: '取消' }).click();
  await archive.getByRole('row', { name: /Folding Carbon/ }).getByRole('button', { name: '编辑' }).click();
  await archive.getByRole('dialog', { name: '编辑技术平台' }).waitFor();
  await archive.getByRole('dialog', { name: '编辑技术平台' }).getByRole('button', { name: '取消' }).click();
  await page.screenshot({ path: path.join(output, 'admin-product-platforms-desktop.png'), fullPage: true });
  report.checks.push('product archive has focused bicycle, parts and platform views; create dialogs open without writes');

  // Inventory now opens as two real-source tables rather than an unstructured wall of forms.
  await page.route('**/api/control/v1/warehouse', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: {
      warehouses: [{ id: 'warehouse-ci', code: 'DE-CI', name: 'CI warehouse', country_code: 'DE', timezone: 'Europe/Berlin', partner_name: null, active: true }],
      locations: [], stocktakes: [], counts: [],
    } }),
  }));
  await page.route('**/api/control/v1/inventory', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: {
      balances: [{
        item_kind: 'SKU', part_id: null, sku_id: 'sku-ci', vehicle_id: null,
        warehouse_code: 'DE-CI', warehouse_name: 'CI warehouse', location_code: 'A-01', location_name: 'A-01',
        unit: 'EA', on_hand: '3', reserved: '1', available: '2',
        part_number: null, part_name: null, sku: 'CI-SKU', sku_name: 'CI product', frame_number: null,
      }],
      movements: [], reservations: [],
    } }),
  }));
  // InventoryClient loads five sources concurrently. The vehicles source must also be
  // intercepted or its mock-auth 401 can redirect away before the stock tables settle.
  await page.route('**/api/control/v1/vehicles', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: [] }),
  }));
  await page.goto(base + '/admin/inventory');
  const stock = page.locator('[data-area="inventory"]');
  await stock.waitFor();
  await stock.getByRole('cell', { name: 'CI warehouse', exact: true }).first().waitFor();
  await stock.locator('#warehouses tbody tr').first().waitFor({ state: 'visible' });
  assert.equal(await stock.locator('#warehouses tbody tr').count(), 1, 'one warehouse occupies one row');
  await stock.locator('#balances tbody tr').first().waitFor({ state: 'visible' });
  assert.equal(await stock.locator('#balances tbody tr').count(), 1, 'one stock position occupies one row');
  assert.equal(await stock.locator('#inventory-advanced').evaluate(node => node.open), false, 'operational forms start collapsed');
  assert.equal(new URL(page.url()).pathname, '/admin/inventory', 'the isolated inventory page must not redirect to login');
  await page.screenshot({ path: path.join(output, 'admin-inventory-archive-desktop.png'), fullPage: true });
  report.checks.push('warehouse and stock balances render from fixture API, advanced forms collapsed');

  // Admin dealer center: the full workspace must be within one Admin shell,
  // show only real API facts and never turn an API outage into a fabricated 0.
  const dealerRows = [
    { id: 'dealer-ci', partner_id: 'partner-ci', partner_code: 'PARTNER-CI',
      display_name: 'CI 德国经销商', country_code: 'DE', status: 'ACTIVE',
      market_countries: ['DE'], sales_enabled: true, service_enabled: false,
      note: '', version: 1, default_shipping_line1: null,
      default_shipping_city: null, default_shipping_country: null,
      default_contact_type: null, default_contact_value: null,
      default_inventory_location_code: null, default_inventory_warehouse_code: null },
    { id: 'dealer-ci-2', partner_id: 'partner-ci-2', partner_code: 'PARTNER-CI-2',
      display_name: 'CI 奥地利经销商', country_code: 'AT', status: 'PROSPECT',
      market_countries: ['AT'], sales_enabled: false, service_enabled: true,
      note: '', version: 1, default_shipping_line1: null,
      default_shipping_city: null, default_shipping_country: null,
      default_contact_type: null, default_contact_value: null,
      default_inventory_location_code: null, default_inventory_warehouse_code: null },
  ];
  const partnerRows = [
    { id: 'partner-ci', partnerCode: 'PARTNER-CI', displayName: 'CI 德国经销商', countryCode: 'DE', roles: ['DEALER'] },
    { id: 'partner-ci-2', partnerCode: 'PARTNER-CI-2', displayName: 'CI 奥地利经销商', countryCode: 'AT', roles: ['DEALER'] },
    { id: 'partner-ci-3', partnerCode: 'PARTNER-CI-3', displayName: 'CI 合作伙伴', countryCode: 'DE', roles: ['DEALER'] },
  ];
  await page.route('**/api/control/v1/dealers', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { dealers: dealerRows, history: [] } }),
  }));
  await page.route('**/api/control/v1/partners', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: partnerRows }),
  }));
  await page.goto(base + '/admin/dealers');
  const dealerCenter = page.locator('[data-area="dealers"]');
  await dealerCenter.getByRole('heading', { name: '经销商管理', exact: true }).waitFor();
  assert.equal(await page.locator('body > div[style*="background"]').count(), 0,
    'dealer module must not render detached top banners');
  const dealerNav = page.getByRole('complementary', { name: '二级导航', exact: true });
  assert.equal(await dealerNav.getByRole('link', { name: '合作申请', exact: true }).count(), 1);
  assert.equal(await dealerNav.getByRole('link', { name: '客户试骑与合作网点', exact: true }).count(), 1);
  assert.equal(await dealerNav.getByRole('link', { name: /B2B订单/ }).count(), 0,
    'unimplemented B2B capability must not be an active link');
  const metricValues = dealerCenter.locator('[class*="metrics"] b');
  await page.waitForFunction(() =>
    document.querySelector('[data-area="dealers"] [class*="metrics"] b')?.textContent === '2');
  assert.deepEqual(await metricValues.allTextContents(), ['2', '1', '1', '2']);
  await dealerCenter.getByRole('searchbox', { name: '搜索经销商' }).fill('奥地利');
  assert.equal(await dealerCenter.getByRole('button', { name: /CI 奥地利经销商/ }).count(), 1);
  assert.equal(await dealerCenter.getByRole('button', { name: /CI 德国经销商/ }).count(), 0);
  await dealerCenter.getByRole('searchbox', { name: '搜索经销商' }).clear();
  await dealerCenter.getByRole('combobox', { name: '合作状态' }).selectOption('ACTIVE');
  assert.equal(await dealerCenter.getByRole('button', { name: /CI 奥地利经销商/ }).count(), 0);
  await dealerCenter.getByRole('combobox', { name: '合作状态' }).selectOption('ALL');
  await dealerCenter.getByRole('button', { name: '＋ 新建经销商' }).click();
  const createDealer = dealerCenter.getByRole('form', { name: '新建经销商档案' });
  await createDealer.waitFor();
  assert.equal(await createDealer.getByRole('combobox', { name: '已存在的合作伙伴（必填）' })
    .locator('option').count(), 2, 'create form only lists unassigned DEALER partners');
  await page.screenshot({ path: path.join(output, 'admin-dealers-operations-desktop.png'), fullPage: true });
  await page.unroute('**/api/control/v1/dealers');
  await page.route('**/api/control/v1/dealers', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Dealer API unavailable' }),
  }));
  await page.reload();
  await dealerCenter.getByRole('alert').filter({ hasText: 'Dealer API unavailable' }).waitFor();
  assert.deepEqual(await metricValues.allTextContents(), ['—', '—', '—', '—'],
    'failed API reads must not be displayed as zero dealers');
  // A new dealer must first have an existing Partner legal entity; keep that
  // workflow inside the authenticated Admin shell, using the one Partner API.
  await page.route('**/api/partners*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }),
  }));
  await page.goto(base + '/admin/partners');
  await page.getByRole('navigation', { name: '一级导航', exact: true }).waitFor();
  await page.locator('[data-area="partners"]').waitFor();
  const partnerNav = page.getByRole('complementary', { name: '二级导航', exact: true });
  assert.equal(await partnerNav.getByRole('link', { name: '合作伙伴主体', exact: true }).count(), 1);
  assert.equal(await page.locator('.partnerWorkspace').count(), 1,
    'Partner master is embedded once; the legacy AppShell is not nested');
  await page.getByRole('button', { name: '新建合作伙伴', exact: true }).click();
  assert.equal(await page.locator('.modalCard input[name="DEALER"]').isChecked(), true,
    'Dealer-origin Partner creation preselects the DEALER role');
  assert.equal(await page.locator('[data-area="partners"] a[href="/admin/dealers"]').count(), 1,
    'guided onboarding returns to Dealer setup');
  await page.unroute('**/api/partners*');
  await page.route('**/api/partners*', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ message: 'Partner API unavailable' }),
  }));
  await page.reload();
  await page.locator('[data-area="partners"]').getByRole('alert', {
    name: '',
  }).filter({ hasText: 'Partner API unavailable' }).waitFor();
  assert.deepEqual(await page.locator('[data-area="partners"] .metricRow .metric b').allTextContents(),
    ['—', '—', '—', '—', '—', '—'],
    'unavailable Partner API must not pretend there are zero companies');
  report.checks.push('Dealer onboarding: existing Partner master opens inside Admin, preselects DEALER, and fails honestly when API is unavailable');
  // Real intake and test-ride modules must retain the same Admin shell when opened.
  await page.goto(base + '/admin/dealers/applications');
  await page.getByRole('navigation', { name: '一级导航', exact: true }).waitFor();
  await page.getByRole('heading', { name: '经销商合作申请', exact: true }).waitFor();
  assert.equal(await page.getByRole('complementary', { name: '二级导航', exact: true }).count(), 1);
  await page.goto(base + '/admin/dealers/test-rides');
  await page.getByRole('navigation', { name: '一级导航', exact: true }).waitFor();
  await page.getByRole('heading', { name: '客户试骑申请', exact: true }).waitFor();
  assert.equal(await page.getByRole('complementary', { name: '二级导航', exact: true }).count(), 1);
  report.checks.push('Admin dealer center: real fixture totals, filter, linked menu, existing Partner-only creation, API outage does not show 0, same shell on subpages');

  // The official B2C Admin inventory workspace now shows a SERVER-SIDE join
  // of approved Product, active Commerce price, and Inventory balances.
  // It remains a read-only gate; no public checkout or stock mutation.
  const readinessFixture = (market, query = '') => ({ data: {
    market, query, checkedAt: '2026-10-28T10:00:00.000Z', checkoutEnabled: false, truncated: false,
    rows: [{ skuId: '11111111-1111-4111-8111-111111111111',
      sku: query === 'FC2' ? 'FC2-GREY-DE' : 'FC1-BLACK-DE',
      skuName: query === 'FC2' ? 'FC2 Grey' : 'FC1 Black',
      modelCode: query === 'FC2' ? 'FC2' : 'FC1', variantCode: 'STANDARD',
      colorCode: 'BLACK', marketCode: market, publicationStatus: 'PUBLISHED',
      priceGross: market === 'DE' ? '2999.00' : null, currency: 'EUR',
      locationCount: market === 'DE' ? 1 : 0,
      onHand: market === 'DE' ? '4.000000' : null,
      reserved: market === 'DE' ? '1.000000' : null,
      ledgerAvailable: market === 'DE' ? '3.000000' : null,
      checkoutEnabled: false, inventoryReservable: false,
      blockers: market === 'DE' ? ['CHANNEL_ALLOCATION_UNVERIFIED','TAX_SHIPPING_UNVERIFIED','PSP_NOT_CONFIGURED']
        : ['NO_ACTIVE_PRICE','NO_MARKET_STOCK_POSITION','CHANNEL_ALLOCATION_UNVERIFIED','PSP_NOT_CONFIGURED'],
    }],
  } });
  const readinessRoute = '**/api/control/v1/commerce/storefront/readiness?*';
  await page.route(readinessRoute, route => {
    const url = new URL(route.request().url());
    const market = url.searchParams.get('marketCountry');
    const query = url.searchParams.get('query') ?? '';
    return route.fulfill({status: 200, contentType: 'application/json',
      body: JSON.stringify(readinessFixture(market === 'AT' ? 'AT' : 'DE', query))});
  });
  await page.goto(base + '/admin/ecommerce/inventory');
  const readiness = page.getByRole('region', { name: '官网可售条件核对表' });
  await readiness.getByRole('row', { name: /FC1-BLACK-DE/ }).waitFor();
  assert.equal(await readiness.getByText('不可下单').count(), 1);
  assert.equal(await readiness.getByText('3.000000 台账可用').count(), 1);
  // Search is a server query, not a filter over the first 500 returned SKUs.
  await page.getByRole('searchbox', { name: /从数据库查询型号/ }).fill('FC2');
  await page.getByRole('button', { name: '查询 SKU' }).click();
  await readiness.getByRole('row', { name: /FC2-GREY-DE/ }).waitFor();
  assert.equal(await readiness.getByRole('row', { name: /FC1-BLACK-DE/ }).count(), 0,
    'the SKU result must reflect the server query, not stale initial rows');
  await page.getByRole('button', { name: '清除查询' }).click();
  await readiness.getByRole('row', { name: /FC1-BLACK-DE/ }).waitFor();
  await page.getByRole('combobox', { name: '目标市场' }).selectOption('AT');
  await readiness.getByText('未核实库存位置').waitFor();
  const atMarketRow = readiness.getByRole('row', { name: /FC1-BLACK-DE/ });
  assert.match(await atMarketRow.locator('td').nth(2).innerText(), /^未配置/,
    'AT has no price, and the same market row must show that fact');
  const issueFilters = page.getByRole('group', { name: '未达成条件筛选' });
  await issueFilters.getByRole('button', { name: /市场\/售价问题/ }).click();
  assert.equal(await readiness.getByRole('row', { name: /FC1-BLACK-DE/ }).count(), 1,
    'market/price filter reveals the AT price blocker');
  await issueFilters.getByRole('button', { name: /发布及状态问题/ }).click();
  assert.equal(await readiness.getByRole('row', { name: /FC1-BLACK-DE/ }).count(), 0,
    'published items must not appear in the publication issue filter');
  await issueFilters.getByRole('button', { name: /全部结果/ }).click();
  await page.unroute(readinessRoute);
  await page.route(readinessRoute, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({message: 'Temporary readiness failure'}),
  }));
  await page.reload();
  await page.getByRole('alert').filter({hasText:'Temporary readiness failure'}).waitFor();
  assert.equal(await page.getByRole('region', { name: '官网可售条件核对表' }).count(), 0,
    'failed cross-domain read must not show stale stock or a false purchasable state');
  report.checks.push('WWW/Commerce readiness: full-catalog server SKU search, DE/AT issue filters, no checkout, API failure clears stale stock');

  assert.deepEqual(errors, [], 'no browser runtime errors');
  await writeFile(path.join(output, 'commerce-lab-report.json'), JSON.stringify(report, null, 2));
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => auth.close(resolve));
}
