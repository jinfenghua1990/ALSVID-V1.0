import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('customer overview uses existing Partner + Vehicle API with capability checks', () => {
  const ui = read('./admin-records.tsx');
  const controller = read('../../../api/src/partners.controller.ts');
  const vehicleController = read('../../../api/src/vehicle.controller.ts');
  const partnerService = read('../../../../domains/partners/src/application/partner-service.ts');
  const vehicleService = read('../../../../domains/vehicle/src/application/vehicle-service.ts');
  assert.match(ui, /listData<Partner>\('\/v1\/partners'/);
  assert.match(ui, /listData<Vehicle>\('\/v1\/vehicles'/);
  assert.match(ui, /item\.roles\.includes\('CUSTOMER'\)/);
  assert.match(ui, /readData<PartnerDetail>/);
  assert.match(ui, /不能根据客户邮箱或 VIN 自动建立/);
  assert.match(controller, /@Get\(':id'\)/);
  assert.match(controller, /partnerService\.get\(requireAuth\(request\), id\)/);
  assert.match(vehicleController, /vehicleService\.list\(requireAuth\(request\)\)/);
  assert.match(partnerService, /requireCapability\(actor,PartnerCapability\.Read\)/);
  assert.match(vehicleService, /requireCapability\(actor,VehicleCapability\.Read\)/);
});

test('staff and audit overview relies on permissions and does not allow role writes', () => {
  const ui = read('./admin-records.tsx');
  const integrated = read('./integrated-operations.tsx');
  const auditController = read('../../../api/src/audit.controller.ts');
  const identityController = read('../../../api/src/auth.controller.ts');
  assert.match(ui, /listData<StaffUser>\('\/v1\/auth\/users'/);
  assert.match(ui, /listData<AuditEvent>\('\/v1\/audit\?limit=100'/);
  assert.match(auditController, /Permission\.AuditRead/);
  assert.match(identityController, /identityService\.listUsers\(requireAuth\(request\)\)/);
  assert.match(integrated, /case '客户': return <CustomerRecords \/>/);
  assert.match(integrated, /case '设置': return <><AccessAuditRecords \/><PortalBindingsAdmin \/><\/>/);
  assert.ok(!ui.includes('/v1/auth/users/roles'));
  assert.ok(!ui.includes('setUserRoles'));
  assert.ok(!ui.includes('fetch(' + "'/api/control/v1/auth/users'" + ', { method: ' + "'PUT'"));
});

test('client read states distinguish error/unauthorized from true empty record lists', () => {
  const ui = read('./admin-records.tsx');
  assert.match(ui, /state === 'ready'/);
  assert.match(ui, /state: code === 401 \|\| code === 403 \? 'unauthorized' : 'failed'/);
  assert.match(ui, /接口返回 0 条账户记录/);
  assert.match(ui, /读取失败，请刷新重试/);
});


test('legacy directory and settings subroutes converge on canonical authorized Admin views', () => {
  const routes = [
    ['../settings/access/page.tsx', '/admin/settings'],
    ['../settings/roles/page.tsx', '/admin/settings'],
    ['../settings/audit/page.tsx', '/admin/settings'],
  ];
  for (const [path, target] of routes) {
    const content = read(path);
    assert.ok(content.includes("redirect('" + target + "')"), path);
    assert.ok(!content.includes('PortalSectionPage'), path);
  }
  // /customers is retired as a route and now resolves through the permanent redirect map.
  assert.equal(existsSync(new URL('../customers/page.tsx', import.meta.url)), false);
  assert.match(read('../../next.config.ts'), /\['\/customers', '\/admin\/customers'\]/);
});
