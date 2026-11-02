import { headers } from 'next/headers';
import './design-system.css';
import type { Screen } from './types';
import { screens } from './index';
import { AdminLogout } from './live-operations';
import { AdminGlobalSearch } from './admin-global-search';
import { IntegratedOperations, hasIntegratedOperations } from './integrated-operations';
import { VehicleRecordDetail } from './vehicle-record-detail';
import { portalUrlFor } from '../_lib/portal-routing';
import { ArchitectureOverview } from './architecture-overview';
import { ADMIN_MODULES } from './business-module-registry';
import { AdminThemePicker } from './admin-theme-picker';
import { AdminSecondaryNavigation, WorkspaceTabs } from '@alsvid/ui';
import ProductClient from '../product/product-client';
import { BusinessAnalyticsOverview } from './business-analytics-overview';
import { backendFetch } from '../api/_lib/backend';

const AREAS = ADMIN_MODULES;
// Keep all business modules directly accessible; no hidden More dropdown.
const PRIMARY_AREAS = AREAS;
const PRIMARY_AREA_ICONS: Record<string, string> = {
  '工作台': '🏠', '产品研发': '🧩', '商城运营': '🛒', '经销商管理': '🏢',
  '生产制造': '🏭', '库存管理': '📦', '跨境物流': '🚢', '采购管理': '📋',
  '客户与车主': '👤', '售后服务': '🛠️', '财务管理': '💳', '经营分析': '📈', '设置': '⚙️',
};

const QUICK_LINKS: readonly { label: string; portal: 'www' | 'dealer' | 'my'; localHref: string }[] = [
  { label: '官方首页', portal: 'www', localHref: '/home' },
  { label: '经销商平台', portal: 'dealer', localHref: '/dealer' },
  { label: '车主中心', portal: 'my', localHref: '/my' },
];

function isAreaActive(area: string, label: string): boolean {
  return AREAS.some(item => item.label === label && item.legacyAreas.includes(area));
}

const scopedMenus: Readonly<Record<string, readonly { group: string; items: string[] }[]>> = {
  '工作台': [
    { group: '工作台', items: ['经营总览', '待办任务', '异常预警', '最近访问'] },
  ],
  '数据': [
    { group: '数据分析', items: ['数据总览', '销售分析', '生产与库存分析', '售后与经销商分析'] },
    { group: '已接入专题', items: ['FC1 颜色偏好'] },
  ],
  '电商': [
    { group: '电商工作台', items: ['电商工作台'] },
    { group: '商品管理', items: ['商城商品列表', '首页商品编排', '商城装修', '商品分类'] },
    { group: '订单与库存', items: ['B2C 订单管理', '电商库存查询'] },
    { group: '后续能力', items: ['营销运营（后续开发）', '支付配置（后续开发）'] },
  ],
  '财务': [
    { group: '财务工作区', items: ['应收 / 应付与资金', '到岸成本与汇率'] },
  ],
  '物流': [
    { group: '出口与跨境交付', items: ['出口物流与清关'] },
  ],
  '库存': [
    { group: '库存查询', items: ['库存总览', '仓库列表', '库存余额'] },
    { group: '仓库操作', items: ['仓库与库位维护', '库存流水', '库存盘点'] },
  ],
  '经销商': [
    { group: '经销商运营', items: ['经销商列表', '合作伙伴主体', '合作申请', '客户试骑与合作网点'] },
    { group: '计划接入', items: ['B2B订单（待接入）', '区域授权（待接入）', '经销商库存（待接入）'] },
  ],
  '生产': [
    { group: '生产制造', items: ['生产工作台', '生产订单', '装配与质检', '车辆档案'] },
  ],
  '供应链': [
    { group: '采购业务', items: ['采购订单', '采购报价', '收货记录'] },
    { group: '供应商', items: ['供应商目录'] },
    { group: '后续能力', items: ['采购申请（待接入）', '赠品采购（待接入）'] },
  ],
  '客户': [
    { group: '客户与车主', items: ['客户列表', '车辆绑定（待接入）', '购买记录（待接入）'] },
  ],
  '售后': [
    { group: '售后业务', items: ['售后工单', 'VIN查询'] },
  ],
  '订单': [
    { group: '销售订单', items: ['全部订单', 'B2C消费者订单', 'B2B经销商订单', '配件订单'] },
    { group: '生产关联', items: ['待排产订单', '生产中订单', '待交付订单'] },
    { group: '履约管理', items: ['发货管理', '物流跟踪', '交付完成'] },
    { group: '售后订单', items: ['维修订单', '保养订单', '配件补发'] },
  ],
  '设置': [
    { group: '人员与权限', items: ['员工管理', '用户与访问权限', '角色与权限'] },
    { group: '安全与审计', items: ['安全与登录', '审计日志'] },
    { group: '系统与集成', items: ['通信与邮件', '系统集成', '环境与基础设施'] },
    { group: '架构与知识', items: ['系统架构'] },
  ],
};


const SECONDARY_MENU_ICONS: readonly [RegExp, string][] = [
  [/工作台|总览|概览|最近访问/, '🏠'],
  [/产品类型|产品平台|技术平台|型号|配置|SKU|BOM|零件库|工程文件|版本控制|开发中|量产|停产|归档/, '📦'],
  [/订单|履约|发货|交付/, '🧾'],
  [/商城|商品|首页|发布|促销|支付/, '🛒'],
  [/生产|排产|工单|装配|质检|出厂|VIN/, '🏭'],
  [/库存|仓库|库位|调拨|周转|呆滞|物流/, '🚚'],
  [/经销商|渠道|区域授权|合作协议/, '🏢'],
  [/客户|车主|车辆|购买记录/, '👤'],
  [/售后|保修|维修|配件|故障|服务质量/, '🛠️'],
  [/供应商|采购|到货|来料|缺料|供应关系/, '📦'],
  [/财务|应收|应付|资金|成本|汇率|对账|发票|付款/, '💳'],
  [/数据|分析|报表|销售/, '📈'],
  [/员工|用户|角色|权限|安全|审计|日志|系统|环境|集成|通信|邮件/, '⚙️'],
];

function secondaryMenuIcon(label: string): string {
  return SECONDARY_MENU_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? '📄';
}

type VehicleModelMenuRecord = { code: string; name: string; product_type_code: string };

function vehicleModelShortName(model: Pick<VehicleModelMenuRecord, 'name' | 'code'>): string {
  const match = model.name.match(/\bALSVID\s+([A-Z0-9]+)\b/i);
  return match?.[1] ?? model.code;
}

async function readVehicleModelMenu(): Promise<readonly { label: string; shortName: string }[]> {
  try {
    const response = await backendFetch('/v1/product/catalog');
    if (!response.ok) return [];
    const payload = await response.json() as { data?: { models?: VehicleModelMenuRecord[] } };
    return (payload.data?.models ?? [])
      .filter(model => model.product_type_code === 'BIKE')
      .map(model => ({ label: `${vehicleModelShortName(model)} · 技术参数`, shortName: vehicleModelShortName(model) }))
      .filter((model, index, models) => models.findIndex(item => item.label === model.label) === index);
  } catch {
    return [];
  }
}

function menuDestination(screen: Screen, label: string): string | undefined {
  if (screen.area === '经销商') {
    const dealerDestinations: Readonly<Record<string, string>> = {
      '经销商列表': '/admin/dealers',
      '合作伙伴主体': '/admin/partners',
      '合作申请': '/admin/dealers/applications',
      '客户试骑与合作网点': '/admin/dealers/test-rides',
    };
    if (dealerDestinations[label]) return dealerDestinations[label];
  }
  if (screen.area === '经销商' && ['联系信息', '合作状态'].includes(label)) return '/admin/dealers';
  if (screen.area === '供应链' && label === '合作状态') return '/admin/supply';
  if (screen.area === '客户' && label === '联系信息') return '/admin/customers';
  const operational: Record<string, string> = {
    '经营总览': '/admin',
    '电商工作台': '/admin/ecommerce',
    '商城商品列表': '/admin/ecommerce/products',
    '官网商品发布': '/admin/ecommerce/publications',
    '官网商品发布与审核': '/admin/ecommerce/publications',
    '首页商品绑定': '/admin/ecommerce/homepage',
    '首页商品编排': '/admin/ecommerce/homepage',
    '商城装修': '/admin/ecommerce/page-builder',
    '商城售价与 B2C 订单': '/admin/ecommerce/orders',
    '商城价格管理': '/admin/ecommerce/pricing',
    'B2C 订单管理': '/admin/ecommerce/orders',
    '电商库存': '/admin/ecommerce/inventory',
    '电商库存查询': '/admin/ecommerce/inventory',
    'FC1 颜色偏好': '/admin/analytics/color-interest',
    '数据总览': '/admin/analytics', '销售分析': '/admin/analytics/sales', '生产分析': '/admin/analytics/production',
    '生产与库存分析': '/admin/analytics/production', '售后与经销商分析': '/admin/analytics/service',
    '质量分析': '/admin/supply/score', '交付分析': '/admin/supply/score', '成本分析': '/admin/supply/score',
    '应收 / 应付与资金': '/admin/finance',
    '到岸成本与汇率': '/admin/finance',
    '库存总览': '/admin/inventory',
    '仓库列表': '/admin/inventory#warehouses',
    '库存余额': '/admin/inventory#balances',
    '仓库与库位维护': '/admin/inventory#warehouse-setup',
    '库存流水': '/admin/inventory#movement-history',
    '库存盘点': '/admin/inventory#stocktake',
    '库存台账': '/admin/inventory',
    '库存详情': '/admin/inventory/detail', '库存预警': '/admin/inventory/warnings', '经销商库存': '/admin/inventory/dealer-stock',
    '成品车辆': '/admin/inventory', '待交付车辆': '/admin/inventory', '零件库存': '/admin/inventory',
    '半成品库存': '/admin/inventory', '原材料库存': '/admin/inventory', '仓库管理': '/admin/inventory',
    '库位管理': '/admin/inventory', '库存调拨': '/admin/inventory/transfers/new', '周转分析': '/admin/inventory', '呆滞库存': '/admin/inventory',
    '出口物流与清关': '/admin/logistics',
    '经销商档案': '/admin/dealers',
    '渠道与区域授权': '/admin/dealers/regions', 'B2B采购申请': '/admin/dealers/purchase/request', 'B2B采购审核': '/admin/dealers/purchase/approval',
    'B2B采购审核与履约': '/admin/dealers/purchase/fulfillment', 'B2B收货与入库结果': '/admin/dealers/purchase/received',
    '区域授权': '/admin/dealers/regions', '销售区域': '/admin/dealers/regions', '渠道等级': '/admin/dealers/regions', '合作协议': '/admin/dealers/regions',
    '经销商列表': '/admin/dealers', 'B2B订单': '/admin/dealers/purchase/fulfillment', '采购历史': '/admin/dealers/purchase/received',
    '采购预测': '/admin/dealers/purchase/request', '销售数据': '/admin/dealers', '售后能力': '/admin/after-sales', '培训认证': '/admin/dealers/regions',
    '试骑申请与网点': '/admin/dealers/test-rides',
    'BOM / 生产用料清单': '/admin/production#production-bom',
    '生产工作台': '/admin/production',
    '生产订单': '/admin/production#work-orders', '装配与质检': '/admin/production#quality',
    '生产计划': '/admin/production', '排产管理': '/admin/production', '生产工单': '/admin/production', '装配流程': '/admin/production',
    '生产进度': '/admin/production', '来料检验': '/admin/production', '装配质检': '/admin/production', '出厂检测': '/admin/production', '出厂记录': '/admin/production/vin',
    '新建生产计划 · 选择型号': '/admin/production/new/model', '新建生产计划 · 选择 BOM': '/admin/production/new/bom',
    '新建生产计划 · 排产信息': '/admin/production/new/schedule', 'VIN 管理': '/admin/production/vin', '装配异常登记': '/admin/production/assembly/exception',
    '异常处理与复检': '/admin/production/assembly/recheck', '复检通过继续装配': '/admin/production/assembly/passed',
    'VIN / 车辆档案': '/admin/production/vin-detail',
    'VIN 详情 · ALS00001': '/admin/production/vin-detail',
    '新建调拨申请': '/admin/inventory/transfers/new', '调拨审批': '/admin/inventory/transfers/approval',
    '调拨出库': '/admin/inventory/transfers/outbound', '调拨物流跟踪': '/admin/inventory/transfers/tracking',
    '调拨收货入库': '/admin/inventory/transfers/receiving', '调拨申请已退回': '/admin/inventory/transfers/returned',
    '登记运输异常': '/admin/inventory/transfers/exception', '登记收货差异': '/admin/inventory/transfers/difference',
    '调拨入库完成': '/admin/inventory/transfers/completed',
    '供应商与采购订单': '/admin/supply',
    '供应商列表': '/admin/supply', '供应商档案': '/admin/supply/supplier-detail', '认证管理': '/admin/supply/supplier-detail',
    '采购申请': '/admin/supply/purchase/request',
    '采购订单': '/admin/supply#purchasing',
    '采购报价': '/admin/supply#quotations',
    '收货记录': '/admin/supply#receipts',
    '供应商目录': '/admin/supply',
    '到货管理': '/admin/supply/purchase/inspection', '入库记录': '/admin/supply/purchase/received', '零件目录': '/admin/supply/parts',
    '供应关系': '/admin/supply/parts', '交付计划': '/admin/supply', '缺料预警': '/admin/supply/purchase/request', '综合评分': '/admin/supply/score',
    '供应商详情 · 供应商 A': '/admin/supply/supplier-detail', '供应商综合评分': '/admin/supply/score', '采购申请 · 缺料需求': '/admin/supply/purchase/request',
    '采购审批与下单确认': '/admin/supply/purchase/approval', '到货与质量检验': '/admin/supply/purchase/inspection', '采购入库完成': '/admin/supply/purchase/received', '零件供应关系': '/admin/supply/parts',
    '客户与车主档案': '/admin/customers',
    '客户列表': '/admin/customers', '账户状态': '/admin/customers', 'VIN绑定': '/admin/customers/binding/search',
    '我的车辆': '/admin/customers', '车辆状态': '/admin/customers', '车辆历史': '/admin/customers/history', '订单记录': '/admin/orders',
    '交付记录': '/admin/logistics', '经销商来源': '/admin/dealers', '保修状态': '/admin/after-sales/warranty',
    '维修记录': '/admin/after-sales', '保养记录': '/admin/after-sales', '配件记录': '/admin/after-sales/parts/replacement',
    '客户详情': '/admin/customers/detail', '企业客户': '/admin/customers/enterprise', '车辆资产绑定 · 查询 VIN': '/admin/customers/binding/search',
    '车辆资产绑定 · 确认车辆': '/admin/customers/binding/confirm', '购买与服务履历': '/admin/customers/history',
    '售后工单': '/admin/after-sales',
    'VIN查询': '/admin/production/vin-detail', '车辆档案': '/admin/production/vin-detail', '保修申请': '/admin/after-sales/warranty',
    '保修审核': '/admin/after-sales/warranty', '维修工单': '/admin/after-sales', '维修进度': '/admin/after-sales',
    '完成记录': '/admin/after-sales', '配件申请': '/admin/after-sales/parts/request', '配件库存': '/admin/inventory',
    '配件更换记录': '/admin/after-sales/parts/replacement', '售后数据': '/admin/analytics/service', '故障分析': '/admin/analytics/service', '服务质量': '/admin/analytics/service',
    '保修管理': '/admin/after-sales/warranty', '服务网络与工单分派': '/admin/after-sales/network',
    '配件申请与库存核验': '/admin/after-sales/parts/request', '配件审批与发货': '/admin/after-sales/parts/shipping', '缺货与采购处理': '/admin/after-sales/parts/shortage',
    '旧版订单查询': '/admin/orders',
    '订单详情': '/admin/orders/detail', '选择订单类型': '/admin/orders/new',
    '自建商城 B2C 订单': '/admin/ecommerce/orders', '全部订单': '/admin/orders', 'B2C消费者订单': '/admin/ecommerce/orders',
    'B2B经销商订单': '/admin/dealers/purchase/fulfillment', '配件订单': '/admin/ecommerce/orders',
    '待排产订单': '/admin/production', '生产中订单': '/admin/production', '待交付订单': '/admin/inventory',
    '发货管理': '/admin/logistics', '物流跟踪': '/admin/logistics', '交付完成': '/admin/logistics',
    '维修订单': '/admin/after-sales', '保养订单': '/admin/after-sales', '配件补发': '/admin/after-sales/parts/shipping',
  };
  if (label in operational) return operational[label];
  if (label.includes('（待')) return undefined;
  if (screen.area === '产品') {
    const destinations: Record<string, string> = {
      'FC Platform': '/admin/product#series', 'CT Platform': '/admin/product#series', 'FT Platform': '/admin/product#series', 'GT Platform': '/admin/product#series',
      '整车产品': '/admin/product?type=BIKE',
      '整车产品（车辆明细）': '/admin/product?type=BIKE#vehicle-details',
      '车辆型号': '/admin/product?type=BIKE#vehicle-models',
      '零配件': '/admin/product?type=PARTS#parts',
      '产品类型': '/admin/product#product-types', '产品平台': '/admin/product#series', '技术平台': '/admin/product#series', '型号': '/admin/product?type=BIKE#vehicle-models', '配置': '/admin/product#models', 'SKU': '/admin/product#models',
      'BOM': '/admin/product#engineering', '零件库': '/admin/product#parts', '工程文件': '/admin/product#engineering', '版本控制': '/admin/product#engineering',
      '开发中': '/admin/product?type=BIKE#vehicle-models', '量产': '/admin/product?type=BIKE#vehicle-models', '停产': '/admin/product?type=BIKE#vehicle-models', '归档': '/admin/product?type=BIKE#vehicle-models',
    };
    if (destinations[label]) return destinations[label];
  }
  if (screen.area === '设置' && label === '系统架构') return '/admin/architecture';
  if (screen.area === '设置') {
    const settingsRoutes: Record<string, string> = {
      '员工管理': '/admin/settings/employees', '组织管理': '/admin/settings/organization', '角色与数据权限': '/admin/settings/roles',
      '角色与权限': '/admin/settings/roles', '用户与访问权限': '/admin/settings/roles',
      '登录安全': '/admin/settings/security', '安全与登录': '/admin/settings/security', '审计日志': '/admin/settings/audit',
      '第三方集成': '/admin/settings/integrations', '系统集成': '/admin/settings/integrations',
      '通信与邮件': '/admin/settings/messages', '消息中心': '/admin/settings/messages', 'API管理': '/admin/settings/api',
      '环境与基础设施': '/admin/architecture',
    };
    if (settingsRoutes[label]) return settingsRoutes[label];
  }
  if (screen.area === '产品') {
    const productRoutes: Record<string, string> = {
      '新建型号 · 选择产品平台': '/admin/product/new/platform', '新建型号 · 创建型号': '/admin/product/new/model',
      '新建型号 · 创建配置': '/admin/product/new/configuration', '新建型号 · 生成 SKU': '/admin/product/new/sku',
      '新建型号 · 绑定 BOM': '/admin/product/new/bom', 'FC1 Pro · 型号追踪详情': '/admin/product/trace',
    };
    if (productRoutes[label]) return productRoutes[label];
  }
  if (screen.area === '产品' && /商品发布|商品审核|官网发布|产品发布/.test(label)) return '/admin/ecommerce#publications';
  // Go to the persisted first-party Commerce workflow, not a design-only order screen.
  if (screen.area === '订单' && label === '全部订单') return '/admin/orders';
  if (screen.area === '订单' && label === 'B2C消费者订单') return '/admin/orders#b2c';
  const clean = (value: string) => value.replace(/[\s·/]/g, '');
  const term = clean(label);
  const moduleScreens = screens.filter(item => item.area === screen.area);
  return moduleScreens.find(item => clean(item.title) === term)?.route
    ?? moduleScreens.find(item => clean(item.title).startsWith(term) && term.length > 2)?.route;
}

export async function AdminScreen({ screen, theme, children, hidePageHeading = false }: { screen: Screen; theme?: string; children?: React.ReactNode; hidePageHeading?: boolean }) {
  const requestHost = (await headers()).get('host') ?? '';
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestHost);
  const quickLinks = QUICK_LINKS.map(link => ({
    label: link.label,
    href: isLocal ? link.localHref : portalUrlFor(requestHost, link.portal),
  }));
  const actions = screen.actions ?? [];
  const isLiveProductRoot = screen.id === 'product' && screen.route === '/admin/product';
  const vehicleModelMenu = isLiveProductRoot ? await readVehicleModelMenu() : [];
  const vehicleModelRoutes = new Map(vehicleModelMenu.map(model => [model.label, `/admin/product?type=BIKE&model=${encodeURIComponent(model.shortName)}#vehicle-models`]));
  const isCustomLiveModule = Boolean(screen.sourceNode?.startsWith('module:'));
  const isLiveProductionWorkspace = screen.id === 'production' && screen.route === '/admin/production';
  const secondaryNavigation = isLiveProductRoot
    ? [{ group: '', items: ['整车产品（车辆明细）', ...(vehicleModelMenu.length ? vehicleModelMenu.map(model => model.label) : ['车辆型号']), '零配件', '技术平台'] }]
    : [...(scopedMenus[screen.area] ?? screen.secondary ?? [])];
  const menuRouteFor = (item: string) => vehicleModelRoutes.get(item) ?? menuDestination(screen, item) ?? screens.find(candidate => candidate.area === screen.area && candidate.route.endsWith(`#${item}`))?.route;
  const hasSecondaryNavigation = secondaryNavigation.length > 0;
  const isIntegratedOverview = Boolean((screen.sourceNode || isLiveProductionWorkspace) && hasIntegratedOperations(screen.area) && (
    (screen.route.split('/').length === 3 && screen.area !== '订单') ||
    (screen.area === '订单' && screen.route === '/admin/orders') ||
    (screen.area === '电商' && screen.route.startsWith('/admin/ecommerce/'))
  ));
  const isEcommerceWorkspace = screen.area === '电商' && isIntegratedOverview;
  const isVehicleDetail = screen.route === '/admin/production/vin-detail' || screen.route === '/admin/production/vin';
  const moduleLabel = AREAS.find(area => area.legacyAreas.includes(screen.area))?.label ?? screen.area;
  const secondaryNavGroups = [
    ...secondaryNavigation.map(group => ({
      label: group.group,
      items: group.items.map(item => {
        const href = menuRouteFor(item);
        return {
          key: [screen.area, group.group, item].join('::'),
          label: item,
          ...(screen.area === '产品' && (item === '车辆型号' || vehicleModelRoutes.has(item)) ? { nested: true } : {}),
          ...(href ? { href } : {}),
          icon: secondaryMenuIcon(item),
          ...(!href ? { status: '待开发' } : {}),
          disabled: !href,
        };
      }),
    })),

  ];

  return (
    <div className="av av-ambient" data-admin-theme data-theme={theme ?? 'day'}>
      <header className="av-topbar">
        <a className="av-brand" href="/admin">
          <span className="av-brandmark" aria-hidden="true">A</span>
          <span className="av-brandcopy">ALSVID <small>OPERATIONS</small></span>
        </a>
        <nav className="av-primarynav" aria-label="一级导航">
          {PRIMARY_AREAS.map((area) => (
            <a className="av-navitem" key={area.label} href={area.href} title={area.description}
              data-active={isAreaActive(screen.area, area.label)}
              aria-current={isAreaActive(screen.area, area.label) ? 'page' : undefined}>
              <span className="av-navicon" aria-hidden="true">{PRIMARY_AREA_ICONS[area.label] ?? '▦'}</span>{area.label}
            </a>
          ))}
        </nav>
        <div className="av-toputils">
          <div className="av-quicklinks">
            {quickLinks.map((link, index) => (
              <span key={link.label} style={{ display: 'contents' }}>
                {index > 0 ? <i /> : null}
                <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
              </span>
            ))}
          </div>
          <AdminGlobalSearch />
          <button className="av-iconbtn" type="button" aria-label="通知尚未接入" title="通知中心尚未接入" disabled>
            ◔
          </button>
          <AdminThemePicker initialTheme={theme ?? 'day'} />
          <AdminLogout />
          <div className="av-user">
            <span className="av-avatar" aria-hidden="true">
              A
            </span>
            <span className="av-username">
              管理员
              <small>ALSVID</small>
            </span>
          </div>
        </div>
      </header>

      <div className={`av-body${hasSecondaryNavigation ? '' : ' av-body--wide'}${isLiveProductRoot ? ' av-body--product' : ''}${isEcommerceWorkspace ? ' av-body--ecommerce' : ''}`}>
        {hasSecondaryNavigation ? (
          <AdminSecondaryNavigation moduleLabel={moduleLabel} groups={secondaryNavGroups} />
        ) : null}

        <main className="av-workspace">
          <WorkspaceTabs />
          {screen.id !== 'workbench' && screen.sourceNode && !isIntegratedOverview && !isLiveProductRoot && !isCustomLiveModule && <p className="av-fixture-note">{screen.area === '数据' ? '分析布局预览 · 除已接入的 FC1 颜色偏好外，经营指标与报表数据源尚未接入。' : '流程布局预览 · 本页内容为设计示例；可保存操作请使用对应模块的真实业务工作台。'}</p>}
          {!hidePageHeading && !isEcommerceWorkspace && !isIntegratedOverview && !isLiveProductRoot && <div className="av-pagehead">
            <div>
              <p className="av-eyebrow">ALSVID OPERATIONS</p>
              <h1 className="av-pagetitle">{isVehicleDetail ? 'VIN / 车辆档案' : screen.title}</h1>
              <p className="av-pagesub">{isVehicleDetail ? '真实车辆主键查询与售后导航；未确认的客户归属不在这里自动生成。' : screen.subtitle}</p>
            </div>
            {actions.length > 0 && !isIntegratedOverview && !isVehicleDetail ? (
              <div className="av-pageactions">
                {actions.map((action, index) => {
                  // Only route business actions to real persisted workflows. Design-state pages remain accessible as previews.
                  const targets: Record<string, string> = { '新建型号': '/product', '新建生产计划': '/production' };
                  const href = targets[action.replace(/^[+＋↓\s]+/g,'')];
                  return href ? <a key={action} className="av-btn" data-variant="primary" href={href}>{action}</a> : <button
                    className="av-btn"
                    type="button"
                    key={action}
                    data-variant={index === actions.length - 1 ? 'primary' : undefined}
                    disabled
                    title="此操作尚无可保存的真实业务流程；请使用下方已接入业务工作台"
                  >
                    {action}
                  </button>;
                })}
              </div>
            ) : null}
          </div>}

          {screen.steps && !isVehicleDetail && !screen.sourceNode && <nav className="av-workflow-pages" aria-label="流程画面">{screen.steps.map((step,i) => <a key={step.href} href={step.href} className="av-chip" aria-current={step.href===screen.route?'step':undefined} data-active={step.href===screen.route}>{i+1}. {step.label}</a>)}</nav>}
          {children ?? (screen.id === 'workbench' ? (
            <section className="av-card" aria-label="ALSVID 业务模块入口">
              <h1 className="av-pagetitle">ALSVID 工作台</h1>
              <p className="av-pagesub">业务模块使用现有权限与正式数据接口，不提供历史演示记录。</p>
              <nav className="av-pageactions" aria-label="业务模块">
                {AREAS.filter(area => area.href !== '/admin').map(area => (
                  <a className="av-btn" href={area.href} key={area.href}>{area.label}</a>
                ))}
              </nav>
            </section>
          ) : screen.id === 'system-architecture' ? (
            <ArchitectureOverview />
          ) : isVehicleDetail ? (
            <VehicleRecordDetail />
          ) : isLiveProductRoot ? (
            <ProductClient embedded />
          ) : isIntegratedOverview ? (
            <>
              {screen.area === '订单' ? (
                <nav className="av-card av-order-channel-links" aria-label="订单业务入口">
                  <h2 className="av-cardtitle">订单业务入口</h2>
                  <p className="av-pagesub">按订单来源进入真实业务工作台；各业务域继续维护自身订单事实。</p>
                  <div className="av-pageactions">
                    <a className="av-btn" href="/admin/ecommerce/orders">自建商城 B2C 订单 →</a>
                    <a className="av-btn" href="/admin/dealers">经销商 B2B 订单 →</a>
                    <a className="av-btn" href="/admin/production">生产与排产 →</a>
                    <a className="av-btn" href="/admin/inventory">库存与交付 →</a>
                  </div>
                </nav>
              ) : null}
              <IntegratedOperations area={screen.area} route={screen.route} />
            </>
          ) : screen.area === '数据' ? (
            <BusinessAnalyticsOverview />
          ) : (
            <section className="av-fixture-note" role="status" aria-label="尚未接入的业务页面">
              <strong>{screen.title} · 尚未接入真实业务</strong>
              <p>旧设计流程的演示卡片和虚构记录已从内部后台隐藏。请返回业务主列表处理真实数据。</p>
              <a href={AREAS.find(area=>area.legacyAreas.includes(screen.area))?.href??'/admin'}>返回{moduleLabel}业务列表</a>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}

export default AdminScreen;

