import type { HomepageBinding, HomepageBindingMode, HomepageSlotCode, ModelFieldDefinition, CustomFieldType, CustomFieldValue, PlatformRow, ProductCatalog, ProductEntityKind, ProductStatus, ProductTypeCode , RecycledModel} from '../core/model.js';
import type { CatalogPublishAssetRow,PublicationRow,PublicationStatus,PublicationDraft } from '../core/publication.js';
import type { QueryExecutor } from '@alsvid/database';

export interface ProductActor {
  userId: string;
  permissions: readonly string[];
}

export interface ProductAuditPort {
  record(input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }, executor?: QueryExecutor): Promise<void>;
}

export interface CreatePlatformRecord {
  code: string;
  name: string;
  description: string;
  actorUserId: string;
}

export interface UpdatePlatformRecord {
  id: string;
  expectedVersion: number;
  name: string | null;
  status: ProductStatus | null;
  descriptionProvided: boolean;
  description: string;
  actorUserId: string;
}

export interface CreateModelRecord {
  customFields?: Record<string, CustomFieldValue>;
  technicalSpecs?: Record<string, unknown>;
  platformId: string | null;
  seriesId?: string | null;
  productTypeCode: ProductTypeCode;
  code: string;
  skuPrefix?: string | null;
  name: string;
  description: string;
  actorUserId: string;
}

export interface CreateVariantRecord {
  modelId: string;
  code: string;
  name: string;
  description: string;
  attributes: Record<string, unknown>;
  actorUserId: string;
}

export interface CreateSkuRecord {
  variantId: string;
  sku: string;
  name: string;
  marketCode: string | null;
  colorCode: string | null;
  sizeCode: string | null;
  attributes: Record<string, unknown>;
  actorUserId: string;
}

export interface UpdateProductRecord {
  customFieldsProvided: boolean;
  customFields: Record<string, CustomFieldValue>;
  technicalSpecsProvided: boolean;
  technicalSpecs: Record<string, unknown>;
  entity: ProductEntityKind;
  id: string;
  expectedVersion: number;
  name: string | null;
  status: ProductStatus | null;
  descriptionProvided: boolean;
  description: string;
  marketCodeProvided: boolean;
  marketCode: string | null;
  colorCodeProvided: boolean;
  colorCode: string | null;
  sizeCodeProvided: boolean;
  sizeCode: string | null;
  actorUserId: string;
}

export interface ProductRepository {
  transaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T>;
  publications(): Promise<PublicationRow[]>;
  publishedPublications(): Promise<PublicationRow[]>;
  suppressedPublishedCodes():Promise<string[]>;
  /** Reviewed catalogue artwork overrides; the domain merges them over its built-in floor. */
  catalogPublishAssets(): Promise<CatalogPublishAssetRow[]>;
  publication(modelId:string): Promise<PublicationRow | null>;
  createPublication(modelId:string,actorUserId:string): Promise<PublicationRow | null>;
  savePublication(modelId:string,expectedVersion:number,body:PublicationDraft,imagePath:string,actorUserId:string): Promise<PublicationRow | null>;
  transitionPublication(modelId:string,expectedVersion:number,fromStatus:PublicationStatus,toStatus:PublicationStatus,actorUserId:string): Promise<PublicationRow | null>;
  homepageBindings(): Promise<HomepageBinding[]>;
  updateHomepageBinding(input: {slot: HomepageSlotCode; mode: HomepageBindingMode; modelId: string | null; expectedVersion: number; actorUserId: string}): Promise<HomepageBinding | null>;
  homepageBindingExists(slot: HomepageSlotCode): Promise<boolean>;
  modelForHomepageSlot(slot: HomepageSlotCode, modelId: string): Promise<boolean>;
  catalog(): Promise<ProductCatalog>;
  modelFieldDefinitions(): Promise<ModelFieldDefinition[]>;
  createModelField(input: {
    productTypeCode: ProductTypeCode; code: string; label: string;
    fieldType: CustomFieldType; options: string[]; required: boolean; actorUserId: string;
  }): Promise<ModelFieldDefinition>;
  updateModelField(input: {
    id: string; expectedVersion: number; label: string | null; status: 'ACTIVE' | 'RETIRED' | null;
    required: boolean | null; actorUserId: string;
  }): Promise<ModelFieldDefinition | null>;
  deleteModelField(input: { id: string; expectedVersion: number; actorUserId: string }, executor: QueryExecutor): Promise<(ModelFieldDefinition & { affectedModels: number }) | null>;
  modelFieldExists(id: string): Promise<boolean>;
  modelFieldTarget(id: string): Promise<{ product_type_code: ProductTypeCode; custom_fields: Record<string, unknown> } | null>;
  createPlatform(input: CreatePlatformRecord): Promise<PlatformRow>;
  updatePlatform(input: UpdatePlatformRecord): Promise<PlatformRow | null>;
  platformExists(id: string): Promise<boolean>;
  platformHasUnretiredModels(id: string): Promise<boolean>;
  createModel(input: CreateModelRecord): Promise<any>;
  createVariant(input: CreateVariantRecord): Promise<any>;
  createSku(input: CreateSkuRecord): Promise<any>;
  skuOwnerForVariant(variantId: string): Promise<{modelCode: string; skuPrefix: string | null; productTypeCode: ProductTypeCode} | null>;
  update(input: UpdateProductRecord): Promise<any | null>;
  exists(entity: ProductEntityKind, id: string): Promise<boolean>;
  /** Reasons a model cannot be physically deleted (empty array = deletable). */
  modelDeletionBlockers(id: string): Promise<string[]>;
  deleteModel(input: { id: string; expectedVersion: number; actorUserId: string }): Promise<boolean>;
  recycleModel(input: { id: string; expectedVersion: number; actorUserId: string }): Promise<boolean>;
  restoreModel(input: { id: string; actorUserId: string }): Promise<boolean>;
  listRecycledModels(): Promise<RecycledModel[]>;
}
