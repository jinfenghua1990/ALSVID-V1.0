import { headers } from 'next/headers';
import './design-system.css';
import type { Screen } from './types';
import { AdminLogout } from './admin-logout';
import { AdminGlobalSearch } from './admin-global-search';
import { IntegratedOperations, hasIntegratedOperations } from './integrated-operations';
import { VehicleRecordDetail } from './vehicle-record-detail';
import { portalUrlFor } from '../_lib/portal-routing';
import { ArchitectureOverview } from './architecture-overview';
import { ADMIN_MODULES } from './business-module-registry';
import { ADMIN_SECONDARY_NAVIGATION } from './admin-navigation';
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
  '生产制造': '🏭', '库存管理': '📦', '跨境物流': '🚢', '供应链管理': '📋', '采购管理': '📋',
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
  // A selected model is a real product workspace deep link, never a retired design URL.
  const isCustomLiveModule = Boolean(screen.sourceNode?.startsWith('module:'));
  const isLiveProductionWorkspace = screen.id === 'production' && screen.route === '/admin/production';
  const secondaryNavigation = (ADMIN_SECONDARY_NAVIGATION[screen.area] ?? []).map(group => ({
    group: group.group,
    items: group.items.flatMap(item =>
      isLiveProductRoot && item.label === '车辆型号' && vehicleModelMenu.length
        ? vehicleModelMenu.map(model => ({
            label: model.label,
            href: '/admin/product?type=BIKE&model=' + encodeURIComponent(model.shortName) + '#vehicle-models',
            nested: true,
          }))
        : [item]),
  }));
  const hasSecondaryNavigation = secondaryNavigation.length > 0;
  const isIntegratedOverview = Boolean((screen.sourceNode || isLiveProductionWorkspace) && hasIntegratedOperations(screen.area) && (
    (screen.route.split('/').length === 3 && screen.area !== '订单') ||
    (screen.area === '订单' && screen.route === '/admin/orders') ||
    (screen.area === '电商' && screen.route.startsWith('/admin/ecommerce/')) ||
    (screen.area === '供应链' && screen.route === '/admin/supply/legacy')
  ));
  const isEcommerceWorkspace = screen.area === '电商' && isIntegratedOverview;
  const isVehicleDetail = screen.route === '/admin/production/vin-detail' || screen.route === '/admin/production/vin';
  const moduleLabel = AREAS.find(area => area.legacyAreas.includes(screen.area))?.label ?? screen.area;
  const secondaryNavGroups = [
    ...secondaryNavigation.map(group => ({
      label: group.group,
      items: group.items.map(item => ({
        key: [screen.area, group.group, item.label].join('::'),
        label: item.label,
        ...(item.nested ? { nested: true } : {}),
        ...(item.href ? { href: item.href } : {}),
        icon: secondaryMenuIcon(item.label),
        ...(!item.href ? { status: '待开发' } : {}),
        disabled: !item.href,
      })),
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

