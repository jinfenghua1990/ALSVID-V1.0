import {ComparisonMediaService} from './comparison-media.js';
import {comparisonStorageFromEnv} from './comparison-media-storage.js';
import { createAssetService } from '@alsvid/assets';
import { createAuditService } from '@alsvid/audit';
import { createCommerceService,createComparisonCatalogService,type ComparisonCatalogService,CommerceOrderOperationsService,StorefrontOrderService,StorefrontLayoutService } from '@alsvid/commerce';
import {StorefrontReadinessService} from '@alsvid/commerce';
import { Database } from '@alsvid/database';
import { createDealerService } from '@alsvid/dealer';
import { createEngineeringService } from '@alsvid/engineering';
import { createFinanceService } from '@alsvid/finance';
import { createIdentityService } from '@alsvid/identity';
import { createIntegrationService } from '@alsvid/integrations';
import { createInventoryService } from '@alsvid/inventory';
import { createLogisticsService } from '@alsvid/logistics';
import { createPartnerService,createTestRideService } from '@alsvid/partners';
import { createProcurementService, createSupplierPortalService } from '@alsvid/procurement';
import { createProductService } from '@alsvid/product';
import { createProductionService } from '@alsvid/production';
import { createVehicleService } from '@alsvid/vehicle';
import { createServiceCaseService } from '@alsvid/service';
import { createWarehouseService } from '@alsvid/warehouse';
import { createIdentityPasswordResetDelivery, createIdentityVerificationDelivery, identityRegistrationConfigFromEnv } from './identity-email-delivery.js';
import { ContextualAuditService } from './platform/contextual-audit-service.js';

export const database = new Database();
const persistedAuditService = createAuditService(database);
export const auditService = new ContextualAuditService(persistedAuditService);

export const identityService = createIdentityService(database, auditService, {
  ...identityRegistrationConfigFromEnv(),
  verificationDelivery: createIdentityVerificationDelivery(),
  passwordResetDelivery: createIdentityPasswordResetDelivery(),
});
export const partnerService = createPartnerService(database, auditService);
export const testRideService = createTestRideService(database);
export const productService = createProductService(database, auditService);
export const engineeringService = createEngineeringService(database, auditService);
export const assetService = createAssetService(database, auditService);
export const procurementService = createProcurementService(database, auditService);
export const supplierPortalService = createSupplierPortalService(database, auditService);
export const inventoryService = createInventoryService(database, auditService);
export const productionService = createProductionService(database, auditService, inventoryService);
export const vehicleService = createVehicleService(database, auditService);
export const serviceCaseService = createServiceCaseService(database, auditService);

export const warehouseService = createWarehouseService(database, auditService, inventoryService);
export const logisticsService = createLogisticsService(database, auditService, inventoryService);
export const dealerService = createDealerService(database, auditService);
export const commerceService = createCommerceService(database, auditService);
export const commerceOrderOperationsService = new CommerceOrderOperationsService(database, auditService);
export const storefrontOrderService = new StorefrontOrderService(database, auditService);
export const storefrontLayoutService = new StorefrontLayoutService(database, auditService);
export const storefrontReadinessService = new StorefrontReadinessService(database);
export const integrationService = createIntegrationService(database, auditService);
export const financeService = createFinanceService(database, auditService);

export const comparisonCatalogService: ComparisonCatalogService = createComparisonCatalogService(database, auditService);

export const comparisonMediaService:ComparisonMediaService=new ComparisonMediaService(comparisonCatalogService,assetService,comparisonStorageFromEnv());
