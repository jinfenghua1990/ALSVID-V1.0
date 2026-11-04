import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { HomepageBindingMode, HomepageSlotCode, PublicationAction, ProductStatus, ProductTypeCode } from '@alsvid/product';
import { Public } from './public.decorator.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { requireAuth } from './auth.guard.js';
import { productService } from './runtime.js';

interface CreatePlatformBody { code: string; name: string; description?: string }
interface UpdatePlatformBody { expectedVersion: number; name?: string; description?: string; status?: ProductStatus }
interface CreateSeriesBody { code: string; nameZh: string; nameEn: string; status?: ProductStatus; defaultPlatformId: string }
interface UpdateSeriesBody { nameZh?: string; nameEn?: string; status?: ProductStatus; defaultPlatformId?: string }
interface CreateModelFieldBody {
  productTypeCode: ProductTypeCode; code:string; label:string;
  fieldType:'TEXT'|'NUMBER'|'BOOLEAN'|'SELECT'; options?:string[]; required?:boolean;
}
interface UpdateModelFieldBody { expectedVersion:number; label?:string; status?:'ACTIVE'|'RETIRED'; required?:boolean }
interface DeleteModelFieldBody { expectedVersion:number }
interface CreateModelBody { platformId?: string | null; seriesId?: string | null; productTypeCode?: ProductTypeCode; code: string; skuPrefix?: string; name: string; description?: string; customFields?: Record<string,unknown>; technicalSpecs?: Record<string,unknown> }
interface UpdateHomepageBindingBody { slot: HomepageSlotCode; mode: HomepageBindingMode; modelId?: string | null; expectedVersion: number }
interface CreateVariantBody { modelId: string; code: string; name: string; description?: string; attributes?: Record<string, unknown> }
interface CreateSkuBody { variantId: string; sku: string; name: string; marketCode?: string; colorCode?: string; sizeCode?: string; attributes?: Record<string, unknown> }
interface PublicationDraftBody { expectedVersion: number; titleZh: string; titleDe: string; titleEn: string; evidenceNote: string }
interface PublicationActionBody { action: PublicationAction; expectedVersion: number }
interface UpdateEntityBody { expectedVersion: number; name?: string; description?: string; status?: ProductStatus; marketCode?: string | null; colorCode?: string | null; sizeCode?: string | null; customFields?:Record<string,unknown>; technicalSpecs?: Record<string,unknown> }

@Controller('v1/product')
export class ProductController {
  @Public()
  @Get('public/homepage-bindings')
  async publicHomepageBindings() {
    return { data: await productService.publicHomepageBindings() };
  }

  @Get('homepage-bindings')
  async homepageBindings(@Req() request: AuthenticatedRequest) {
    return { data: await productService.homepageBindings(requireAuth(request)) };
  }

  @Post('homepage-bindings')
  async setHomepageBinding(@Req() request: AuthenticatedRequest, @Body() input: UpdateHomepageBindingBody) {
    return { data: await productService.setHomepageBinding(requireAuth(request),input) };
  }

  @Public()
  @Get('public/catalog')
  async publishedCatalog() {
    return {data:await productService.publishedCatalog()};
  }

  @Get('publications')
  async publications(@Req() request:AuthenticatedRequest) {
    return {data:await productService.publications(requireAuth(request))};
  }

  @Get('catalog-publish-assets')
  async catalogPublishAssets(@Req() request:AuthenticatedRequest) {
    return {data:await productService.catalogPublishAssets(requireAuth(request))};
  }

  @Post('publications/:modelId/start')
  async startPublication(@Req() request:AuthenticatedRequest,@Param('modelId') modelId:string) {
    return {data:await productService.startPublication(requireAuth(request),modelId)};
  }

  @Patch('publications/:modelId/draft')
  async savePublicationDraft(@Req() request:AuthenticatedRequest,@Param('modelId') modelId:string,
    @Body() input:PublicationDraftBody) {
    return {data:await productService.savePublicationDraft(requireAuth(request),modelId,input)};
  }

  @Post('publications/:modelId/transition')
  async transitionPublication(@Req() request:AuthenticatedRequest,@Param('modelId') modelId:string,
    @Body() input:PublicationActionBody) {
    return {data:await productService.transitionPublication(requireAuth(request),modelId,input)};
  }

  @Get('catalog')
  async catalog(@Req() request: AuthenticatedRequest) {
    return { data: await productService.catalog(requireAuth(request)) };
  }

  @Post('model-fields')
  async createModelField(@Req() request:AuthenticatedRequest,@Body() input:CreateModelFieldBody) {
    return {data:await productService.createModelField(requireAuth(request),input)};
  }

  @Patch('model-fields/:id')
  async updateModelField(@Req() request:AuthenticatedRequest,@Param('id') id:string,@Body() input:UpdateModelFieldBody) {
    return {data:await productService.updateModelField(requireAuth(request),id,input)};
  }

  @Delete('model-fields/:id')
  async deleteModelField(@Req() request:AuthenticatedRequest,@Param('id') id:string,@Body() input:DeleteModelFieldBody) {
    return {data:await productService.deleteModelField(requireAuth(request),id,input)};
  }

  /** Removing a product from the catalogue only moves it to the recycle bin. */
  @Delete('models/:id')
  async recycleModel(@Req() request:AuthenticatedRequest,@Param('id') id:string,@Body() input:{expectedVersion?:number}) {
    return {data:await productService.recycleModel(requireAuth(request),id,{expectedVersion:Number(input?.expectedVersion)})};
  }

  @Post('models/:id/restore')
  async restoreModel(@Req() request:AuthenticatedRequest,@Param('id') id:string) {
    return {data:await productService.restoreModel(requireAuth(request),id)};
  }

  /** Permanent removal, only reachable from the recycle bin and only without references. */
  @Delete('models/:id/purge')
  async purgeModel(@Req() request:AuthenticatedRequest,@Param('id') id:string,@Body() input:{expectedVersion?:number}) {
    return {data:await productService.deleteModel(requireAuth(request),id,{expectedVersion:Number(input?.expectedVersion)})};
  }

  @Get('recycle-bin')
  async recycleBin(@Req() request:AuthenticatedRequest) {
    return {data:await productService.listRecycled(requireAuth(request))};
  }

  @Post('platforms')
  async createPlatform(@Req() request: AuthenticatedRequest, @Body() input: CreatePlatformBody) {
    return { data: await productService.createPlatform(requireAuth(request), input) };
  }

  @Patch('platforms/:id')
  async updatePlatform(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdatePlatformBody) {
    return { data: await productService.updatePlatform(requireAuth(request), id, input) };
  }

  /** Commercial series feed the bike registration form; engineering platforms stay separate. */
  @Get('series')
  async listSeries(@Req() request: AuthenticatedRequest) {
    return { data: await productService.listSeries(requireAuth(request)) };
  }

  @Post('series')
  async createSeries(@Req() request: AuthenticatedRequest, @Body() input: CreateSeriesBody) {
    return { data: await productService.createSeries(requireAuth(request), input) };
  }

  /** Must stay above the generic :entity/:id route, otherwise "series" is read as a product entity. */
  @Patch('series/:id')
  async updateSeries(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() input: UpdateSeriesBody) {
    return { data: await productService.updateSeries(requireAuth(request), id, input) };
  }

  @Post('models')
  async createModel(@Req() request: AuthenticatedRequest, @Body() input: CreateModelBody) {
    return { data: await productService.createModel(requireAuth(request), input) };
  }

  @Post('variants')
  async createVariant(@Req() request: AuthenticatedRequest, @Body() input: CreateVariantBody) {
    return { data: await productService.createVariant(requireAuth(request), input) };
  }

  @Post('skus')
  async createSku(@Req() request: AuthenticatedRequest, @Body() input: CreateSkuBody) {
    return { data: await productService.createSku(requireAuth(request), input) };
  }

  @Patch(':entity/:id')
  async update(@Req() request: AuthenticatedRequest, @Param('entity') entity: string, @Param('id') id: string, @Body() input: UpdateEntityBody) {
    if (!['model','variant','sku'].includes(entity)) throw new BadRequestException('Unsupported product entity');
    return { data: await productService.updateEntity(requireAuth(request), entity as 'model' | 'variant' | 'sku', id, input) };
  }
}
