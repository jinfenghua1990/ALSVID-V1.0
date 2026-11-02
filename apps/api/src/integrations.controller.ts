import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { integrationService } from './runtime.js';

@Controller('v1/integrations')
export class IntegrationsController{
  @Get()
  async summary(@Req() request:AuthenticatedRequest){return{data:await integrationService.summary(requireAuth(request))};}
  @Post('channels/:channelId/cursors')
  async cursor(@Req() request:AuthenticatedRequest,@Param('channelId') channelId:string,@Body() input:any){return{data:await integrationService.setCursor(requireAuth(request),channelId,input)};}

  @Get('warehouse-providers')
  async warehouseProviderSummary(@Req() request:AuthenticatedRequest){return{data:await integrationService.warehouseProviderSummary(requireAuth(request))};}
  @Post('warehouse-providers')
  async createWarehouseProvider(@Req() request:AuthenticatedRequest,@Body() input:{providerCode:string;displayName:string;accountRef:string;credentialsSecretRef?:string}){return{data:await integrationService.createWarehouseProviderConnection(requireAuth(request),input)};}

  @Post('warehouse-providers/:connectionId/warehouse-mappings')
  async createWarehouseMapping(@Req() request:AuthenticatedRequest,@Param('connectionId') connectionId:string,@Body() input:{internalWarehouseId:string;externalWarehouseId:string;externalCode:string;externalName:string}){return{data:await integrationService.createExternalWarehouseMapping(requireAuth(request),connectionId,input)};}
  @Post('warehouse-providers/:connectionId/sku-mappings')
  async createSkuMapping(@Req() request:AuthenticatedRequest,@Param('connectionId') connectionId:string,@Body() input:{internalSkuId:string;externalSku:string;externalItemId:string}){return{data:await integrationService.createExternalSkuMapping(requireAuth(request),connectionId,input)};}
}
