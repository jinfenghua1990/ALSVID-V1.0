import type { AppNavItem } from '@alsvid/ui';
import { ADMIN_MODULES } from './business-module-registry';

/**
 * The single code-owned navigation for ALL ALSVID internal shells.
 * Top-level links come only from ADMIN_MODULES; secondary links are explicit
 * live /admin destinations. A missing href means planned, never a fake page.
 * Legacy AppShell screens reuse this registry until their UAT is complete.
 */
export type AdminSecondaryItem = { label: string; href?: string; nested?: boolean };
export type AdminSecondaryGroup = { group: string; items: readonly AdminSecondaryItem[] };
type MenuEntry = readonly [label: string, href?: string];
const group = (name: string, entries: readonly MenuEntry[]): AdminSecondaryGroup => ({
  group: name,
  items: entries.map(([label, href]) => href ? { label, href } : { label }),
});

export const ADMIN_SECONDARY_NAVIGATION: Readonly<Record<string, readonly AdminSecondaryGroup[]>> = {
  '工作台': [
    group('工作台', [['经营总览', '/admin'], ['待办任务'], ['异常预警'], ['最近访问']]),
  ],
  '产品': [
    { group: '', items: [
      { label: '整车产品（车辆明细）', href: '/admin/product?type=BIKE#vehicle-details' },
      { label: '车辆型号', href: '/admin/product?type=BIKE#vehicle-models', nested: true },
      { label: '零配件', href: '/admin/product?type=PARTS#parts' },
      { label: '产品系列', href: '/admin/product#series' },
      { label: '技术平台', href: '/admin/product#product-types' },
    ] },
  ],
  '电商': [
    group('电商工作台', [['电商工作台', '/admin/ecommerce']]),
    group('商品管理', [
      ['商城商品列表', '/admin/ecommerce/products'],
      ['首页商品编排', '/admin/ecommerce/homepage'],
      ['商城装修', '/admin/ecommerce/page-builder'],
      ['商品分类'],
    ]),
    group('订单与库存', [
      ['B2C 订单管理', '/admin/ecommerce/orders'],
      ['电商库存查询', '/admin/ecommerce/inventory'],
      ['商城价格管理', '/admin/ecommerce/pricing'],
      ['官网商品发布与审核', '/admin/ecommerce/publications'],
    ]),
    group('后续能力', [['营销运营（后续开发）'], ['支付配置（后续开发）']]),
  ],
  '经销商': [
    group('经销商运营', [
      ['经销商列表', '/admin/dealers'],
      ['合作伙伴主体', '/admin/partners'],
      ['合作申请', '/admin/dealers/applications'],
      ['客户试骑与合作网点', '/admin/dealers/test-rides'],
    ]),
    group('计划接入', [['B2B订单（待接入）'], ['区域授权（待接入）'], ['经销商库存（待接入）']]),
  ],
  '生产': [
    group('生产制造', [
      ['生产工作台', '/admin/production'],
      ['生产订单', '/admin/production#work-orders'],
      ['BOM / 生产用料清单', '/admin/production#production-bom'],
      ['装配与质检', '/admin/production#quality'],
      ['车辆档案', '/admin/production/vin'],
    ]),
  ],
  '库存': [
    group('仓库管理', [
      ['仓库设置', '/admin/inventory/warehouses'],
      ['仓库库存', '/admin/inventory/stock'],
    ]),
    group('库存作业', [
      ['出入库 / 调拨', '/admin/inventory#movement-history'],
      ['库存盘点', '/admin/inventory#stocktake'],
    ]),
  ],
  '物流': [
    group('出口与跨境交付', [['出口物流与清关', '/admin/logistics']]),
  ],
  '供应链': [
    group('生产交付', [
      ['生产交付总单', '/admin/supply'],
      ['原采购工作台', '/admin/supply/legacy'],
      ['生产 / VIN 质检明细', '/admin/production'],
      ['出口物流 / 清关明细', '/admin/logistics'],
    ]),
    group('主数据', [['供应商与工厂', '/admin/supply/partners'], ['仓库设置', '/admin/inventory/warehouses'], ['仓库库存', '/admin/inventory/stock']]),
  ],
  '客户': [
    group('客户与车主', [['客户列表', '/admin/customers'], ['车辆绑定（待接入）'], ['购买记录（待接入）']]),
  ],
  '售后': [
    group('售后业务', [['售后工单', '/admin/after-sales'], ['VIN查询', '/admin/production/vin-detail']]),
  ],
  '订单': [
    group('销售订单', [
      ['全部订单', '/admin/orders'],
      ['B2C消费者订单', '/admin/ecommerce/orders'],
      ['B2B经销商订单'],
      ['配件订单', '/admin/ecommerce/orders'],
    ]),
    group('生产关联', [
      ['待排产订单', '/admin/production'],
      ['生产中订单', '/admin/production'],
      ['待交付订单', '/admin/inventory'],
    ]),
    group('履约管理', [
      ['发货管理', '/admin/logistics'],
      ['物流跟踪', '/admin/logistics'],
      ['交付完成', '/admin/logistics'],
    ]),
    group('售后订单', [
      ['维修订单', '/admin/after-sales'],
      ['保养订单', '/admin/after-sales'],
      ['配件补发'],
    ]),
  ],
  '财务': [
    group('财务工作区', [['应收 / 应付与资金', '/admin/finance'], ['到岸成本与汇率', '/admin/finance']]),
  ],
  '数据': [
    group('数据分析', [['数据总览', '/admin/analytics'], ['销售分析'], ['生产与库存分析'], ['售后与经销商分析']]),
    group('已接入专题', [['FC1 颜色偏好', '/admin/analytics/color-interest']]),
  ],
  '设置': [
    group('人员与权限', [['员工管理'], ['用户与访问权限', '/admin/settings'], ['角色与权限']]),
    group('安全与审计', [['安全与登录'], ['审计日志']]),
    group('系统与集成', [['通信与邮件'], ['系统集成'], ['环境与基础设施']]),
    group('架构与知识', [['系统架构', '/admin/architecture']]),
  ],
};

// This is an identity/highlight bridge ONLY for the old authenticated URL
// bookmarks. It never turns old root paths into navigation destinations.
const legacyAreas: readonly (readonly [string, string])[] = [
  ['/product', '产品研发'], ['/commerce', '商城运营'],
  ['/production', '供应链管理'], ['/vehicle360', '供应链管理'],
  ['/inventory', '库存管理'], ['/logistics', '供应链管理'],
  ['/dealers', '经销商管理'], ['/dealer', '经销商管理'], ['/partners', '经销商管理'],
  ['/supply', '供应链管理'], ['/finance', '财务管理'],
  ['/customers', '客户与车主'], ['/after-sales', '售后服务'],
  ['/overview', '经营分析'], ['/settings', '设置'], ['/people', '设置'],
  ['/admin/orders', '商城运营'],
];

export function navigationFor(activeHref: string): readonly AppNavItem[] {
  const path = activeHref.split(/[?#]/)[0] || '/admin';
  const canonical = ADMIN_MODULES.find(module =>
    path === module.href || (module.href !== '/admin' && path.startsWith(module.href + '/')));
  const legacy = legacyAreas.find(([prefix]) => path === prefix || path.startsWith(prefix + '/'));
  const active = canonical?.label ?? legacy?.[1] ?? (path === '/admin' ? '工作台' : '');
  return ADMIN_MODULES.map(module => ({
    label: module.label,
    href: module.href,
    area: module.label,
    section: '业务模块',
    active: module.label === active,
  }));
}
