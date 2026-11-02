import ProductClient from '../product/product-client';
import CommerceClient from '../commerce/commerce-client';
import { EcommerceAdminWorkspace } from './ecommerce-admin-workspace';
import FinanceClient from '../finance/finance-client';
import LogisticsClient from '../logistics/logistics-client';
import ProductionClient from '../production/production-client';
import InventoryClient from '../inventory/inventory-client';
import DealersClient from '../dealers/dealers-client';
import SupplyClient from '../supply/supply-client';
import PartnersClient from '../partners/partners-client';
import { ProductionDeliveryWorkspace } from './production-delivery-workspace';
import { CustomerRecords, AccessAuditRecords } from './admin-records';
import { ServiceCaseClient } from './service-cases';
import { PortalBindingsAdmin } from './portal-bindings-admin';

export const integratedAreas = ['产品', '订单', '电商', '生产', '库存', '物流', '财务', '经销商', '供应链', '客户', '设置', '售后'] as const;

export function hasIntegratedOperations(area: string): boolean {
  return integratedAreas.some((name) => name === area);
}

/**
 * Render existing business components directly inside the Admin navigation,
 * without nesting a second legacy AppShell. This keeps the existing API writes
 * and avoids duplicate domain logic or fixture-powered "success" screens.
 */
export function IntegratedOperations({ area, route }: { area: string; route?: string }) {
  switch (area) {
    case '产品': return <ProductClient embedded />;
    case '订单': return <CommerceClient embedded />; // Legacy bookmarked order lookup remains valid.
    case '电商': return <EcommerceAdminWorkspace route={route ?? '/admin/ecommerce'} />;
    case '财务': return <FinanceClient embedded />;
    case '物流': return <LogisticsClient embedded />;
    case '生产': return <><ProductionClient embedded /><ProductClient embedded view="engineering" /></>;
    case '库存': return <InventoryClient embedded />;
    case '经销商': return <DealersClient embedded />;
    case '供应链': return route === '/admin/supply/partners' ? <PartnersClient embedded scope="supply" /> : route === '/admin/supply/legacy' ? <SupplyClient embedded /> : <ProductionDeliveryWorkspace />;
    case '客户': return <CustomerRecords />;
    case '设置': return <><AccessAuditRecords /><PortalBindingsAdmin /></>;
    case '售后': return <ServiceCaseClient />;
    default: return null;
  }
}
