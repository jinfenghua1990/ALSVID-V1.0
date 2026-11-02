import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type {
  AllocateCargoInput,
  CustomsDeclarationInput,
  CustomsDraftUpdateInput,
  CustomsEventInput,
  CustomsLineInput,
  CreateShipmentInput,
  MilestoneInput,
} from '@alsvid/logistics';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { logisticsService } from './runtime.js';

interface ReasonBody { reason?: string }

@Controller('v1/logistics')
export class LogisticsController {
  @Get()
  async summary(@Req() request: AuthenticatedRequest) {
    return { data: await logisticsService.summary(requireAuth(request)) };
  }

  @Post('shipments')
  async createShipment(@Req() request: AuthenticatedRequest, @Body() input: CreateShipmentInput) {
    return { data: await logisticsService.createShipment(requireAuth(request), input) };
  }

  @Post('shipments/:id/cargo')
  async allocateCargo(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: AllocateCargoInput) {
    return { data: await logisticsService.allocateCargo(requireAuth(request), id, input) };
  }

  @Post('cargo/:id/remove')
  async removeCargo(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await logisticsService.removeCargo(requireAuth(request), id);
    return { data: { removed: true } };
  }

  @Post('shipments/:id/release')
  async releaseShipment(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await logisticsService.releaseShipment(requireAuth(request), id) };
  }

  @Post('shipments/:id/dispatch')
  async dispatchShipment(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await logisticsService.dispatchShipment(requireAuth(request), id) };
  }

  @Post('shipments/:id/milestones')
  async milestone(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: MilestoneInput) {
    return { data: await logisticsService.addMilestone(requireAuth(request), id, input) };
  }

  @Post('shipments/:id/cancel')
  async cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: ReasonBody) {
    return { data: await logisticsService.cancelShipment(requireAuth(request), id, input) };
  }

  @Post('shipments/:id/receive-warehouse')
  async receiveWarehouse(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await logisticsService.receiveWarehouseShipment(requireAuth(request), id) };
  }

  @Post('shipments/:id/receive-germany')
  async receiveGermany(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await logisticsService.receiveGermanyShipment(requireAuth(request), id) };
  }

  @Post('shipments/:id/customs')
  async createCustoms(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CustomsDeclarationInput) {
    return { data: await logisticsService.createCustomsDeclaration(requireAuth(request), id, input) };
  }

  @Post('customs/:id/update')
  async updateCustoms(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CustomsDraftUpdateInput) {
    return { data: await logisticsService.updateCustomsDraft(requireAuth(request), id, input) };
  }

  @Post('customs/:id/lines')
  async customsLine(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CustomsLineInput) {
    return { data: await logisticsService.addCustomsLine(requireAuth(request), id, input) };
  }

  @Post('customs/:id/events')
  async customsEvent(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: CustomsEventInput) {
    return { data: await logisticsService.addCustomsEvent(requireAuth(request), id, input) };
  }
}
