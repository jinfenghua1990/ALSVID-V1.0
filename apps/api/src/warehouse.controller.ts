import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { warehouseService } from './runtime.js';

interface CreateWarehouseBody { code: string; name: string; partnerId?: string; countryCode: string; timezone?: string }
interface UpdateWarehouseBody { name: string; timezone: string; expectedName: string; expectedTimezone: string }
interface DeleteWarehouseBody { expectedCode: string }
interface CreateLocationBody { warehouseId: string; parentLocationId?: string; code: string; name: string; locationType: string }
interface OpenStocktakeBody { warehouseId: string; note?: string }
interface RecordCountBody { locationId: string; itemKind: 'PART' | 'SKU' | 'VEHICLE'; itemId: string; countedQuantity: string | number; unit: string }

@Controller('v1/warehouse')
export class WarehouseController {
  @Get()
  async summary(@Req() request: AuthenticatedRequest) {
    return { data: await warehouseService.summary(requireAuth(request)) };
  }

  @Post('warehouses')
  async warehouse(@Req() request: AuthenticatedRequest, @Body() input: CreateWarehouseBody) {
    return { data: await warehouseService.createWarehouse(requireAuth(request), input) };
  }

  @Patch('warehouses/:id')
  async updateWarehouse(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateWarehouseBody) {
    return { data: await warehouseService.updateWarehouse(requireAuth(request), id, input) };
  }

  @Delete('warehouses/:id')
  async deleteWarehouse(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: DeleteWarehouseBody) {
    return { data: await warehouseService.deleteWarehouse(requireAuth(request), id, input) };
  }

  @Post('locations')
  async location(@Req() request: AuthenticatedRequest, @Body() input: CreateLocationBody) {
    return { data: await warehouseService.createLocation(requireAuth(request), input) };
  }

  @Post('stocktakes')
  async stocktake(@Req() request: AuthenticatedRequest, @Body() input: OpenStocktakeBody) {
    return { data: await warehouseService.openStocktake(requireAuth(request), input) };
  }

  @Post('stocktakes/:id/counts')
  async count(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: RecordCountBody) {
    return { data: await warehouseService.recordCount(requireAuth(request), id, input) };
  }

  @Post('stocktakes/:id/close')
  async close(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await warehouseService.closeStocktake(requireAuth(request), id) };
  }

  @Post('stocktakes/:id/cancel')
  async cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await warehouseService.cancelStocktake(requireAuth(request), id) };
  }
}
