import { ForbiddenError } from '@alsvid/kernel';
import { postgresErrorCode } from '@alsvid/database';
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from '../core/errors.js';
import { ProductCapability, type HomepageBinding, type HomepageBindingMode, type HomepageSlotCode, type ModelFieldDefinition, type CustomFieldType, type CustomFieldValue, type ProductCatalog, type ProductEntityKind, type ProductStatus, type ProductTypeCode } from '../core/model.js';
import { normalizeProductCode, normalizeProductCountry, normalizeSkuDimension, normalizeMnemonicSku, normalizeMnemonicPrefix } from '../core/normalization.js';
import {approvedCatalogAssets,mergeCatalogAssets,assertPublicationTransition,curatedCatalogImage,toPublicCatalogItem,validatePublicationDraft,type PublicationAction,type PublicationDraft} from '../core/publication.js';
import type { ProductActor, ProductAuditPort, ProductRepository } from './ports.js';

export class ProductService {
  constructor(private readonly repository: ProductRepository, private readonly audit: ProductAuditPort) {}

  async catalog(actor: ProductActor): Promise<ProductCatalog> {
    requireCapability(actor, ProductCapability.Read);
    return this.repository.catalog();
  }

  async homepageBindings(actor: ProductActor): Promise<HomepageBinding[]> {
    requireCapability(actor, ProductCapability.Read);
    return this.repository.homepageBindings();
  }

  /** Public projection contains only the validated internal model ID and fixed code; no inventory, price or sale status. */
  async publicHomepageBindings(): Promise<Array<{slot: HomepageSlotCode; modelId: string | null; modelCode: string | null}>> {
    const bindings = await this.repository.homepageBindings();
    return bindings.map(row => ({slot:row.slot_code,modelId:row.resolved_model_id,modelCode:row.resolved_model_code}));
  }

  async setHomepageBinding(actor: ProductActor, input: {slot: HomepageSlotCode; mode: HomepageBindingMode; modelId?: string | null; expectedVersion: number}): Promise<HomepageBinding> {
    requireCapability(actor, ProductCapability.Write);
    if (!['FC1_HERO','FC1_FEATURED','FC2_LAUNCH'].includes(input.slot)) throw new ProductValidationError('Unknown homepage slot');
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ProductValidationError('Expected binding version');
    if (input.mode !== 'AUTO' && input.mode !== 'MANUAL') throw new ProductValidationError('Unknown binding mode');
    const modelId = input.mode === 'MANUAL' ? input.modelId : null;
    if (input.mode === 'MANUAL') {
      if (!modelId || !await this.repository.modelForHomepageSlot(input.slot, modelId)) {
        throw new ProductValidationError('Selected model does not match this homepage slot or is not ACTIVE');
      }
    } else if (input.modelId) {
      throw new ProductValidationError('AUTO mode cannot specify a manual model');
    }
    const updated = await this.repository.updateHomepageBinding({slot:input.slot,mode:input.mode,modelId:modelId ?? null,
      expectedVersion:input.expectedVersion,actorUserId:actor.userId});
    if (!updated) {
      if (!await this.repository.homepageBindingExists(input.slot)) throw new ProductNotFoundError('Homepage slot not found');
      throw new ProductConflictError('Homepage binding changed; reload before saving');
    }
    await this.audit.record({actorUserId:actor.userId,action:'product.homepage_binding_updated',targetType:'product.homepage_slot',
      targetId:input.slot,metadata:{mode:input.mode,modelId:modelId ?? null}});
    return updated;
  }

  async publications(actor:ProductActor) {
    requireCapability(actor,ProductCapability.Read);
    return this.repository.publications();
  }

  /** Read-only view of the effective catalogue artwork allowlist (floor merged with overrides). */
  async catalogPublishAssets(actor:ProductActor) {
    requireCapability(actor,ProductCapability.Read);
    const assets=await this.effectiveCatalogAssets();
    return Object.entries(assets)
      .map(([modelCode,imagePath])=>({modelCode,imagePath}))
      .sort((left,right)=>left.modelCode.localeCompare(right.modelCode));
  }

  /** No authentication is necessary: repository and projection expose ONLY approved public fields. */
  async publishedCatalog() {
    const [rows,suppressedCodes,assets]=await Promise.all([
      this.repository.publishedPublications(),this.repository.suppressedPublishedCodes(),
      this.effectiveCatalogAssets(),
    ]);
    return {items:rows.map(row=>toPublicCatalogItem(row,assets)).filter((item):item is NonNullable<typeof item>=>item!==null),
      suppressedCodes};
  }

  /**
   * Reviewed artwork overrides merged over the built-in floor. A failure to read the
   * override table must never empty the public catalogue, so the built-in floor wins.
   */
  private async effectiveCatalogAssets():Promise<Readonly<Record<string,string>>> {
    try{return mergeCatalogAssets(await this.repository.catalogPublishAssets());}
    catch{return approvedCatalogAssets;}
  }

  async startPublication(actor:ProductActor,modelId:string) {
    requireCapability(actor,ProductCapability.Write);
    const created=await this.repository.createPublication(modelId,actor.userId);
    if(!created){
      if(await this.repository.publication(modelId))throw new ProductConflictError('Publication already exists; reload');
      throw new ProductValidationError('Only draft or active catalogue products can be prepared for publication');
    }
    await this.audit.record({actorUserId:actor.userId,action:'product.catalog_draft_created',
      targetType:'product.model',targetId:modelId});
    return created;
  }

  async savePublicationDraft(actor:ProductActor,modelId:string,input:PublicationDraft & {expectedVersion:number}) {
    requireCapability(actor,ProductCapability.Write);
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1)
      throw new ProductValidationError('expectedVersion is required');
    const existing=await this.repository.publication(modelId);
    if(!existing)throw new ProductNotFoundError('Publication draft does not exist');
    if(!['DRAFT','WITHDRAWN'].includes(existing.status))
      throw new ProductValidationError('Published or under-review content must first be withdrawn/rejected');
    const body=validatePublicationDraft(input);
    const assets=await this.effectiveCatalogAssets();
    const imagePath=assets[existing.model_code] ?? '';
    const saved=await this.repository.savePublication(modelId,input.expectedVersion,body,imagePath,actor.userId);
    if(!saved)throw new ProductConflictError('Publication draft was updated; reload before saving');
    await this.audit.record({actorUserId:actor.userId,action:'product.catalog_draft_updated',
      targetType:'product.model',targetId:modelId});
    return saved;
  }

  async transitionPublication(actor:ProductActor,modelId:string,
    input:{action:PublicationAction;expectedVersion:number}) {
    if(!input||!['SUBMIT','PUBLISH','WITHDRAW'].includes(input.action))
      throw new ProductValidationError('Unknown publication action');
    requireCapability(actor,input.action==='SUBMIT'?ProductCapability.Write:ProductCapability.Publish);
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1)
      throw new ProductValidationError('expectedVersion is required');
    const existing=await this.repository.publication(modelId);
    if(!existing)throw new ProductNotFoundError('Publication draft not found');
    const next=assertPublicationTransition(existing.status,input.action);
    if(input.action!=='WITHDRAW') {
      const assets=await this.effectiveCatalogAssets();
      const expectedImage=curatedCatalogImage(existing.model_code,existing.model_status,existing.product_type_code,assets);
      validatePublicationDraft({
        titleZh:existing.title_zh,titleDe:existing.title_de,
        titleEn:existing.title_en,evidenceNote:existing.evidence_note,
      });
      if(existing.image_path!==expectedImage)
        throw new ProductValidationError('Catalogue image does not match reviewed model artwork');
    }
    const updated=await this.repository.transitionPublication(modelId,input.expectedVersion,existing.status,next,actor.userId);
    if(!updated)throw new ProductConflictError('Publication changed or model was disabled; reload');
    await this.audit.record({actorUserId:actor.userId,
      action:'product.catalog_'+input.action.toLowerCase(),targetType:'product.model',
      targetId:modelId,metadata:{from:existing.status,to:next}});
    return updated;
  }

  /** Technical platform identity is user-owned. Codes never change after creation. */
  async createPlatform(actor: ProductActor, input: { code: string; name: string; description?: string }) {
    requireCapability(actor, ProductCapability.Write);
    if (!input || typeof input.code !== 'string') throw new ProductValidationError('Platform code is required');
    const code = normalizeProductCode(input.code);
    const name = requirePlatformName(input.name);
    const description = normalizePlatformDescription(input.description);
    try {
      const row = await this.repository.createPlatform({ code, name, description, actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'product.platform_created',
        targetType: 'product.platform', targetId: row.id, metadata: { code } });
      return row;
    } catch (error) {
      mapCreateError(error, 'Platform code already exists', 'Platform creator not found');
    }
  }

  async updatePlatform(actor: ProductActor, id: string, input: {
    expectedVersion: number; name?: string; description?: string; status?: ProductStatus;
  }) {
    requireCapability(actor, ProductCapability.Write);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) throw new ProductValidationError('Invalid platform ID');
    if (!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
      throw new ProductValidationError('expectedVersion is required');
    if (input.status !== undefined && !['DRAFT', 'ACTIVE', 'RETIRED'].includes(input.status))
      throw new ProductValidationError('Unsupported platform status');
    if (input.name === undefined && input.description === undefined && input.status === undefined)
      throw new ProductValidationError('No platform changes supplied');
    const row = await this.repository.updatePlatform({
      id, expectedVersion: input.expectedVersion,
      name: input.name === undefined ? null : requirePlatformName(input.name),
      status: input.status ?? null,
      descriptionProvided: input.description !== undefined,
      description: normalizePlatformDescription(input.description),
      actorUserId: actor.userId,
    });
    if (!row) {
      if (!await this.repository.platformExists(id)) throw new ProductNotFoundError('Platform not found');
      if (input.status === 'RETIRED' && await this.repository.platformHasUnretiredModels(id))
        throw new ProductValidationError('Retire or reassign linked bike models before archiving this platform');
      throw new ProductConflictError('Platform changed since it was loaded; reload before saving');
    }
    await this.audit.record({ actorUserId: actor.userId, action: 'product.platform_updated',
      targetType: 'product.platform', targetId: row.id,
      metadata: { status: row.status, version: row.version } });
    return row;
  }

  async createModelField(actor: ProductActor, input: {
    productTypeCode: ProductTypeCode; code: string; label: string;
    fieldType: CustomFieldType; options?: string[]; required?: boolean;
  }): Promise<ModelFieldDefinition> {
    requireCapability(actor, ProductCapability.Write);
    if (!input || !['BIKE','ACCESSORY','SERVICE_PART'].includes(input.productTypeCode))
      throw new ProductValidationError('Invalid product type for custom field');
    if (typeof input.code !== 'string') throw new ProductValidationError('Field code is required');
    const code = normalizeProductCode(input.code);
    const label = normalizeFieldLabel(input.label);
    if (!['TEXT','NUMBER','BOOLEAN','SELECT'].includes(input.fieldType))
      throw new ProductValidationError('Unsupported custom field type');
    const options = normalizeFieldOptions(input.fieldType,input.options);
    if (input.required !== undefined && typeof input.required !== 'boolean')
      throw new ProductValidationError('Field required flag must be boolean');
    try {
      const row = await this.repository.createModelField({
        productTypeCode: input.productTypeCode,code,label,fieldType:input.fieldType,
        options,required:input.required??false,actorUserId:actor.userId,
      });
      await this.audit.record({actorUserId:actor.userId,action:'product.model_field_created',
        targetType:'product.model_field',targetId:row.id,metadata:{code,productTypeCode:input.productTypeCode}});
      return row;
    } catch(error) {
      mapCreateError(error, 'Custom field code already exists for this product type', 'Product type not found');
    }
  }

  async updateModelField(actor: ProductActor,id:string,input:{
    expectedVersion:number;label?:string;status?:'ACTIVE'|'RETIRED';required?:boolean;
  }):Promise<ModelFieldDefinition> {
    requireCapability(actor, ProductCapability.Write);
    if (!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion<1)
      throw new ProductValidationError('expectedVersion is required');
    if (input.status!==undefined && !['ACTIVE','RETIRED'].includes(input.status))
      throw new ProductValidationError('Invalid custom field status');
    if (input.required!==undefined && typeof input.required!=='boolean')
      throw new ProductValidationError('Required must be boolean');
    if (input.label===undefined && input.status===undefined && input.required===undefined)
      throw new ProductValidationError('No custom field changes supplied');
    const row=await this.repository.updateModelField({
      id,expectedVersion:input.expectedVersion,label:input.label===undefined?null:normalizeFieldLabel(input.label),
      status:input.status??null,required:input.required??null,actorUserId:actor.userId,
    });
    if (!row) {
      if (!await this.repository.modelFieldExists(id)) throw new ProductNotFoundError('Custom field not found');
      throw new ProductConflictError('Custom field changed; reload before saving');
    }
    await this.audit.record({actorUserId:actor.userId,action:'product.model_field_updated',
      targetType:'product.model_field',targetId:row.id,metadata:{version:row.version,status:row.status}});
    return row;
  }

  async deleteModel(actor: ProductActor, id: string, input: { expectedVersion: number }): Promise<{ deleted: true }> {
    requireCapability(actor, ProductCapability.Write);
    if (!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
      throw new ProductValidationError('expectedVersion is required');
    const blockers = await this.repository.modelDeletionBlockers(id);
    if (blockers.length) {
      const label: Record<string, string> = {
        variants: '配置版本', bom: 'BOM', publication: '官网发布记录', homepage: '首页绑定',
        skus: 'SKU', merge_alias: '历史合并别名',
      };
      throw new ProductConflictError(
        `该车型已有${blockers.map(reason => label[reason] ?? reason).join('、')}，不能删除；请改为把状态设为“已退役”`);
    }
    await this.repository.transaction(async executor => {
      const deleted = await this.repository.deleteModel({ id, expectedVersion: input.expectedVersion, actorUserId: actor.userId });
      if (!deleted) {
        if (!await this.repository.exists('model', id)) throw new ProductNotFoundError('Model not found');
        throw new ProductConflictError('Model changed since it was loaded; refresh and retry');
      }
      await this.audit.record({ actorUserId: actor.userId, action: 'product.model_deleted', targetType: 'product.model', targetId: id, metadata: { expectedVersion: input.expectedVersion } }, executor);
    });
    return { deleted: true };
  }

  async deleteModelField(actor: ProductActor,id:string,input:{expectedVersion:number}):Promise<ModelFieldDefinition & {affectedModels:number}> {
    requireCapability(actor, ProductCapability.Write);
    if(!input || !Number.isInteger(input.expectedVersion) || input.expectedVersion<1)
      throw new ProductValidationError('expectedVersion is required');
    const row=await this.repository.transaction(async executor=>{
      const deleted=await this.repository.deleteModelField({
        id,expectedVersion:input.expectedVersion,actorUserId:actor.userId,
      },executor);
      if(deleted) await this.audit.record({actorUserId:actor.userId,action:'product.model_field_deleted',
        targetType:'product.model_field',targetId:deleted.id,metadata:{code:deleted.code,productTypeCode:deleted.product_type_code,affectedModels:deleted.affectedModels}},executor);
      return deleted;
    });
    if(!row) {
      if(!await this.repository.modelFieldExists(id)) throw new ProductNotFoundError('Custom field not found');
      throw new ProductConflictError('Custom field changed; reload before deleting');
    }
    return row;
  }

  async createModel(actor: ProductActor, input: { platformId?: string | null; seriesId?: string | null; productTypeCode?: ProductTypeCode; code: string; skuPrefix?: string; name: string; description?: string; customFields?: Record<string,unknown>; technicalSpecs?: Record<string,unknown> }): Promise<any> {
    requireCapability(actor, ProductCapability.Write);
    const code = normalizeProductCode(input.code);
    const productTypeCode = input.productTypeCode ?? 'BIKE';
    if (!['BIKE','ACCESSORY','SERVICE_PART'].includes(productTypeCode)) throw new ProductValidationError('Unsupported product type');
    if (productTypeCode === 'BIKE' && !input.platformId && !input.seriesId) throw new ProductValidationError('Bicycle requires a product series');
    if (productTypeCode !== 'BIKE' && (input.platformId || input.seriesId)) throw new ProductValidationError('Accessories cannot use a bicycle series or platform');
    if (!input.name?.trim()) throw new ProductValidationError('Model name is required');
    // Existing API callers may omit this until the related model is normalized.
    const skuPrefix = input.skuPrefix ? normalizeMnemonicPrefix(input.skuPrefix) :
      (code.length === 2 && /^[A-Z][A-Z0-9]$/.test(code) ? code : null);
    if (productTypeCode === 'BIKE' && (skuPrefix === 'AL' || skuPrefix === 'UN'))
      throw new ProductValidationError('AL and UN are reserved for shared/universal accessories');
    const customFields = validateModelFields(await this.repository.modelFieldDefinitions(),
      productTypeCode,input.customFields ?? {},{});
    const technicalSpecs = normalizeTechnicalSpecs(input.technicalSpecs);
    try {
      const row = await this.repository.createModel({ platformId: productTypeCode === 'BIKE' ? input.platformId ?? null : null, seriesId: productTypeCode === 'BIKE' ? input.seriesId ?? null : null, productTypeCode, code, skuPrefix, name: input.name.trim(), description: input.description?.trim() ?? '', customFields, technicalSpecs, actorUserId: actor.userId });
      if (!row) throw new ProductValidationError('Selected series or its default engineering platform is inactive');
      await this.audit.record({ actorUserId: actor.userId, action: 'product.model_created', targetType: 'product.model', targetId: row.id, metadata: { code } });
      return row;
    } catch (error) {
      mapCreateError(error, 'Model code already exists', 'Platform not found');
    }
  }

  async createVariant(actor: ProductActor, input: { modelId: string; code: string; name: string; description?: string; attributes?: Record<string, unknown> }): Promise<any> {
    requireCapability(actor, ProductCapability.Write);
    const code = normalizeProductCode(input.code);
    if (!input.name?.trim()) throw new ProductValidationError('Variant name is required');
    validateProductAttributes(input.attributes);
    try {
      const row = await this.repository.createVariant({ modelId: input.modelId, code, name: input.name.trim(), description: input.description?.trim() ?? '', attributes: input.attributes ?? {}, actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'product.variant_created', targetType: 'product.variant', targetId: row.id, metadata: { code } });
      return row;
    } catch (error) {
      mapCreateError(error, 'Variant code already exists for this model', 'Model not found');
    }
  }

  async createSku(actor: ProductActor, input: { variantId: string; sku: string; name: string; marketCode?: string; colorCode?: string; sizeCode?: string; attributes?: Record<string, unknown> }): Promise<any> {
    requireCapability(actor, ProductCapability.Write);
    const sku = normalizeMnemonicSku(input.sku);
    const owner = await this.repository.skuOwnerForVariant(input.variantId);
    if (!owner) throw new ProductNotFoundError('Variant not found');
    if (!owner.skuPrefix) throw new ProductValidationError('Assign a 2-character SKU family prefix to this model first');
    if (sku.slice(0,2) !== owner.skuPrefix)
      throw new ProductValidationError('SKU prefix does not match its model family');
    if (owner.productTypeCode === 'BIKE' && sku.slice(3,6) !== 'EBI')
      throw new ProductValidationError('Bicycle SKU category must be EBI');
    if (owner.productTypeCode !== 'BIKE' && sku.slice(3,6) === 'EBI')
      throw new ProductValidationError('Accessory cannot use EBI category');
    if (!input.name?.trim()) throw new ProductValidationError('SKU name is required');
    validateProductAttributes(input.attributes);
    try {
      const row = await this.repository.createSku({
        variantId: input.variantId,
        sku,
        name: input.name.trim(),
        marketCode: normalizeProductCountry(input.marketCode),
        colorCode: normalizeSkuDimension(input.colorCode,'colorCode'),
        sizeCode: normalizeSkuDimension(input.sizeCode,'sizeCode'),
        attributes: input.attributes ?? {},
        actorUserId: actor.userId,
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'product.sku_created', targetType: 'product.sku', targetId: row.id, metadata: { sku } });
      return row;
    } catch (error) {
      mapCreateError(error, 'SKU code or variant market/color/size combination already exists', 'Variant not found');
    }
  }

  async updateEntity(actor: ProductActor, entity: ProductEntityKind, id: string, input: { expectedVersion: number; name?: string; description?: string; status?: ProductStatus; marketCode?: string | null; colorCode?: string | null; sizeCode?: string | null; customFields?: Record<string,unknown>; technicalSpecs?: Record<string,unknown> }): Promise<any> {
    requireCapability(actor, ProductCapability.Write);
    let customFields:Record<string,CustomFieldValue>={};
    let technicalSpecs:Record<string,unknown>={};
    let technicalSpecsProvided=false;
    if (input.customFields!==undefined || input.technicalSpecs!==undefined || (entity==='model' && input.status==='ACTIVE')) {
      if (entity!=='model')throw new ProductValidationError('Model technical fields belong only to model records');
      const target=await this.repository.modelFieldTarget(id);
      if (!target)throw new ProductNotFoundError('Model not found');
      const existingCustomFields=withoutTechnicalSpecs(target.custom_fields);
      customFields=validateModelFields(await this.repository.modelFieldDefinitions(),
        target.product_type_code,input.customFields ?? existingCustomFields,existingCustomFields);
      technicalSpecsProvided=input.technicalSpecs!==undefined;
      technicalSpecs=technicalSpecsProvided ? normalizeTechnicalSpecs(input.technicalSpecs) : extractTechnicalSpecs(target.custom_fields);
      if (input.status==='ACTIVE') validateTechnicalSpecsForActivation(technicalSpecs);
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ProductValidationError('expectedVersion is required');
    let row: any;
    try { row = await this.repository.update({
      entity,
      id,
      expectedVersion: input.expectedVersion,
      name: input.name?.trim() || null,
      status: input.status ?? null,
      descriptionProvided: input.description !== undefined,
      description: input.description?.trim() ?? '',
      marketCodeProvided: input.marketCode !== undefined,
      marketCode: normalizeProductCountry(input.marketCode),
      colorCodeProvided: input.colorCode !== undefined,
      colorCode: normalizeSkuDimension(input.colorCode,'colorCode'),
      sizeCodeProvided: input.sizeCode !== undefined,
      sizeCode: normalizeSkuDimension(input.sizeCode,'sizeCode'),
      customFieldsProvided: input.customFields!==undefined,
      customFields,
      technicalSpecsProvided,
      technicalSpecs,
      actorUserId: actor.userId,
    }); } catch(error) {
      if (entity === 'sku' && postgresErrorCode(error) === '23505')
        throw new ProductConflictError('Variant market/color/size combination is already in use by another active SKU');
      throw error;
    }
    if (!row) {
      if (!await this.repository.exists(entity, id)) throw new ProductNotFoundError(`${entity} not found`);
      throw new ProductConflictError(`${entity} changed since it was loaded`);
    }
    await this.audit.record({ actorUserId: actor.userId, action: `product.${entity}_updated`, targetType: `product.${entity}`, targetId: id });
    return row;
  }
}

function normalizeFieldLabel(label:unknown):string {
  if(typeof label!=='string'||!label.trim()||label.trim().length>120)
    throw new ProductValidationError('Field label must be 1-120 characters');
  return label.trim();
}
function normalizeFieldOptions(type:CustomFieldType,value:unknown):string[] {
  if(type!=='SELECT'){
    if(value!==undefined && (!Array.isArray(value)||value.length>0))
      throw new ProductValidationError('Only SELECT fields may provide choices');
    return [];
  }
  if(!Array.isArray(value)||value.length<1||value.length>30||
    value.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>80))
    throw new ProductValidationError('SELECT requires 1-30 short options');
  const normalized=value.map(x=>(x as string).trim());
  if(new Set(normalized).size!==normalized.length)
    throw new ProductValidationError('SELECT choices must be unique');
  return normalized;
}
/** Full active-key replacement; do not lose retired field values used by historic records. */
function validateModelFields(definitions:ModelFieldDefinition[],productTypeCode:ProductTypeCode,
  incoming:unknown,existing:Record<string,CustomFieldValue>):Record<string,CustomFieldValue> {
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))
    throw new ProductValidationError('Custom fields must be an object');
  const active=definitions.filter(def=>def.product_type_code===productTypeCode&&def.status==='ACTIVE');
  const allowed=new Map(active.map(def=>[def.code,def]));
  const result={...existing};
  for(const def of active)delete result[def.code];
  for(const [code,value] of Object.entries(incoming)) {
    const def=allowed.get(code);
    if(!def)throw new ProductValidationError('Unknown or inactive custom field: '+code);
    if(value===null||value===''||value===undefined)continue;
    if(def.field_type==='TEXT') {
      if(typeof value!=='string'||value.trim().length>500)
        throw new ProductValidationError(def.label+' requires text of at most 500 characters');
      result[code]=value.trim();
    }else if(def.field_type==='NUMBER') {
      if(typeof value!=='number'||!Number.isFinite(value))
        throw new ProductValidationError(def.label+' must be a finite number');
      result[code]=value;
    }else if(def.field_type==='BOOLEAN') {
      if(typeof value!=='boolean')throw new ProductValidationError(def.label+' must be yes or no');
      result[code]=value;
    }else if(def.field_type==='SELECT') {
      if(typeof value!=='string'||!def.options.includes(value))
        throw new ProductValidationError(def.label+' must match a configured option');
      result[code]=value;
    }
  }
  for(const def of active) if(def.required && result[def.code]===undefined)
    throw new ProductValidationError('Required custom field is missing: '+def.label);
  return result;
}

function requirePlatformName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160)
    throw new ProductValidationError('Platform name must be 1–160 characters');
  return value.trim();
}

function normalizePlatformDescription(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > 2000)
    throw new ProductValidationError('Platform description must be at most 2000 characters');
  return value.trim();
}

function requireCapability(actor: ProductActor, capability: string): void {
  if (!actor.permissions.includes(capability)) throw new ForbiddenError('PRODUCT_FORBIDDEN', `Missing permission: ${capability}`);
}

function mapCreateError(error: unknown, duplicateMessage: string, parentMessage: string): never {
  const code = postgresErrorCode(error);
  if (code === '23505') throw new ProductConflictError(duplicateMessage);
  if (code === '23503') throw new ProductNotFoundError(parentMessage);
  throw error;
}

/** Reject malformed client JSON before it reaches the repository JSONB adapter. */
function validateProductAttributes(value: unknown): void {
  if (value === undefined) return;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProductValidationError('Product attributes must be a JSON object');
  }
}

const TECHNICAL_SPECS_KEY = '__technical_specs';

function extractTechnicalSpecs(value: Record<string, unknown>): Record<string, unknown> {
  const specs = value[TECHNICAL_SPECS_KEY];
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? specs as Record<string, unknown> : {};
}

function withoutTechnicalSpecs(value: Record<string, unknown>): Record<string, CustomFieldValue> {
  const result: Record<string, CustomFieldValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === TECHNICAL_SPECS_KEY) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') result[key] = item;
  }
  return result;
}

function normalizeTechnicalSpecs(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProductValidationError('Technical specs must be an object');
  const encoded = JSON.stringify(value);
  if (!encoded || encoded.length > 500_000) throw new ProductValidationError('Technical specs are too large');
  return value as Record<string, unknown>;
}

function validateTechnicalSpecsForActivation(specs: Record<string, unknown>): void {
  const basic = specs.basic;
  if (!basic || typeof basic !== 'object' || Array.isArray(basic))
    throw new ProductValidationError('启用型号前必须填写型号基本信息');
  const required = ['productType', 'structureType', 'foldable', 'electricAssist'];
  if (required.some(key => (basic as Record<string, unknown>)[key] === undefined || (basic as Record<string, unknown>)[key] === ''))
    throw new ProductValidationError('启用型号前必须补齐基本信息中的产品类型、结构类型、折叠属性和助力属性');
}
