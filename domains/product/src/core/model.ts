export const ProductCapability = {
  Read: 'product.read',
  Write: 'product.write',
  Publish: 'product.publish',
} as const;

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type ProductTypeCode = 'BIKE' | 'ACCESSORY' | 'SERVICE_PART';
export type HomepageSlotCode = 'FC1_HERO' | 'FC1_FEATURED' | 'FC2_LAUNCH';
export type HomepageBindingMode = 'AUTO' | 'MANUAL';
export type HomepageBinding = {
  slot_code: HomepageSlotCode; target_model_code: string; mode: HomepageBindingMode;
  manual_model_id: string | null; resolved_model_id: string | null;
  resolved_model_code: string | null; version: number;
};
export type ProductEntityKind = 'model' | 'variant' | 'sku';
export type CustomFieldType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
export type CustomFieldValue = string | number | boolean;
export interface ModelFieldDefinition {
  id: string;
  product_type_code: ProductTypeCode;
  code: string;
  label: string;
  field_type: CustomFieldType;
  options: string[];
  required: boolean;
  status: 'ACTIVE' | 'RETIRED';
  version: number;
}

export interface ProductRowBase {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProductStatus;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformRow extends ProductRowBase {}

export interface ModelRow extends ProductRowBase {
  product_id: string;
  sku_prefix: string | null;
  custom_fields: Record<string, CustomFieldValue>;
  platform_id: string | null;
  product_type_code: ProductTypeCode;
}

export interface VariantRow extends ProductRowBase {
  model_id: string;
  attributes: Record<string, unknown>;
}

export interface SkuRow extends ProductRowBase {
  product_id: string;
  sku_number: string;
  sku_sequence: number;
  variant_id: string;
  sku: string;
  market_code: string | null;
  color_code: string | null;
  size_code: string | null;
  attributes: Record<string, unknown>;
}

export interface ProductCatalog {
  productTypes: { code: ProductTypeCode; name: string; description: string; status: ProductStatus }[];
  platforms: PlatformRow[];
  modelFieldDefinitions: ModelFieldDefinition[];
  models: ModelRow[];
  variants: VariantRow[];
  skus: SkuRow[];
}
