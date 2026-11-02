import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { CreateProductionOrderInput, ProductionDeviationInput, QcInspectionInput } from '@alsvid/production';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { productionService } from './runtime.js';

@Controller('v1/production')
export class ProductionController {
  @Get()
  async summary(@Req() request: AuthenticatedRequest) {
    return { data: await productionService.summary(requireAuth(request)) };
  }

  @Post('orders')
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreateProductionOrderInput) {
    return { data: await productionService.createOrder(requireAuth(request), input) };
  }

  @Post('orders/:id/factory-receipts')
  async factoryReceipt(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: {locationId:string;quantity:number;note?:string}) {
    return {data:await productionService.receiveFinishedGoods(requireAuth(request),id,input)};
  }

  @Post('orders/from-storefront/:id')
  async createFromStorefront(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: { factoryPartnerId: string }) {
    return { data: await productionService.createFromStorefrontOrder(requireAuth(request), id, input?.factoryPartnerId ?? '') };
  }

  @Post('orders/:id/release')
  async release(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await productionService.releaseOrder(requireAuth(request), id) };
  }

  @Post('orders/:id/start')
  async start(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await productionService.startOrder(requireAuth(request), id) };
  }

  @Post('orders/:id/qc')
  async qc(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await productionService.moveOrderToQc(requireAuth(request), id) };
  }

  @Post('orders/:id/complete')
  async complete(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await productionService.completeOrder(requireAuth(request), id) };
  }

  @Post('units/:id/assembled')
  async assembled(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await productionService.markUnitAssembled(requireAuth(request), id) };
  }

  @Post('units/:id/inspect')
  async inspect(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: QcInspectionInput) {
    return { data: await productionService.inspectUnit(requireAuth(request), id, input) };
  }

  @Post('units/:id/deviations')
  async deviation(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ProductionDeviationInput) {
    return { data: await productionService.recordDeviation(requireAuth(request), id, input) };
  }
}
