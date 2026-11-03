import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { PartnerRoles, type CreatePartnerInput, type PartnerRole, type UpdatePartnerInput } from '@alsvid/partners';
import { requireAuth, type AuthenticatedRequest } from './auth.guard.js';
import { partnerService } from './runtime.js';

function parseRole(value?: string): PartnerRole | undefined {
  if (!value) return undefined;
  const role = value.trim().toUpperCase();
  return (PartnerRoles as readonly string[]).includes(role) ? (role as PartnerRole) : undefined;
}

@Controller('v1/partners')
export class PartnersController {
  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query('q') query?: string, @Query('role') role?: string) {
    return { data: await partnerService.list(requireAuth(request), query ?? '', parseRole(role)) };
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await partnerService.get(requireAuth(request), id) };
  }

  @Get(':id/factories')
  async listFactories(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return { data: await partnerService.listFactories(requireAuth(request), id) };
  }

  @Put(':id/factories')
  async replaceFactories(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { factoryIds?: unknown }) {
    const factoryIds = Array.isArray(body?.factoryIds) ? body.factoryIds.map(String) : [];
    return { data: await partnerService.replaceFactories(requireAuth(request), id, factoryIds) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() input: CreatePartnerInput) {
    return { data: await partnerService.create(requireAuth(request), input) };
  }

  @Patch(':id')
  async update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdatePartnerInput) {
    return { data: await partnerService.update(requireAuth(request), id, input) };
  }
}
