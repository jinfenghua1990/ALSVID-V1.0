import {CommerceLabMediaController} from './commerce-lab-media.controller.js';
import { CommerceLabController } from './commerce-lab.controller.js';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AssetsController } from './assets.controller.js';
import { AuditController } from './audit.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { CommerceController } from './commerce.controller.js';
import { CommerceOrderOperationsController } from './commerce-order-operations.controller.js';
import { StorefrontOrdersController } from './storefront-orders.controller.js';
import { ColourInterestController } from './colour-interest.controller.js';
import { DealerController } from './dealer.controller.js';
import { DealerPartnershipController } from './dealer-partnership.controller.js';
import { EngineeringController } from './engineering.controller.js';
import { FinanceController } from './finance.controller.js';
import { Fc1ReservationController } from './fc1-reservation.controller.js';
import { PublicHomeLayoutController } from './public-home-layout.controller.js';
import { TestRideAdminController } from './fc1-trial-lead-admin.controller.js';
import { HealthController } from './health.controller.js';
import { IntegrationsController } from './integrations.controller.js';
import { InventoryController } from './inventory.controller.js';
import { LogisticsController } from './logistics.controller.js';
import { PartnersController } from './partners.controller.js';
import { ProcurementController } from './procurement.controller.js';
import { SupplierPortalController } from './supplier-portal.controller.js';
import { ProductController } from './product.controller.js';
import { ProductionController } from './production.controller.js';
import { VehicleController } from './vehicle.controller.js';
import { OwnerGarageController, VehicleOwnerAccessController } from './owner-garage.controller.js';
import { ServiceCasesController } from './service-cases.controller.js';
import { MyOwnerServiceController } from './my-owner-service.controller.js';
import { WarehouseController } from './warehouse.controller.js';
import { DomainExceptionFilter } from './platform/domain-exception.filter.js';
import { PublicRateLimitGuard } from './platform/public-rate-limit.guard.js';
import { RequestContextInterceptor } from './platform/request-context.interceptor.js';

@Module({
  controllers: [
    HealthController,
    AuthController,
    PartnersController,
    AuditController,
    ProductController,
    EngineeringController,
    AssetsController,
    ProcurementController,
    SupplierPortalController,
    ProductionController,
    VehicleController,
    OwnerGarageController,
    VehicleOwnerAccessController,
    ServiceCasesController,
    MyOwnerServiceController,
    InventoryController,
    WarehouseController,
    LogisticsController,
    DealerController,
    DealerPartnershipController,
    CommerceController,
    CommerceLabController,
    CommerceLabMediaController,
    CommerceOrderOperationsController,
    StorefrontOrdersController,
    ColourInterestController,
    IntegrationsController,
    FinanceController,
    Fc1ReservationController,
    PublicHomeLayoutController,
    TestRideAdminController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PublicRateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
