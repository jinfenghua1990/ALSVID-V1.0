/**
 * Model register projections of the existing Product / Engineering API records.
 * Never infer production, inventory, VIN or customer ownership from these summaries.
 */
type Variant = { id: string; model_id: string; code: string; name: string };
type Sku = {
  id: string; variant_id: string; sku: string; name: string;
  market_code?: string | null; color_code?: string | null; size_code?: string | null;
};
type Bom = {
  model_id: string; code: string; name: string; revision_code: string | null;
  revision_status: string | null;
};
type BuildSpec = { sku_id: string; code: string; status: string };
type Catalog = { variants: readonly Variant[]; skus: readonly Sku[] };
type Engineering = { boms: readonly Bom[]; buildSpecs: readonly BuildSpec[] };

/** One deterministic family-prefix rule for vehicle registration.
 * A1 -> A1; FC1 -> FC; A1-ULTRA -> AU; L1-PRO -> LP.
 * Unknown formats are sent to an administrator rather than guessed.
 */
export function deriveVehicleSkuPrefix(modelCode: string): string | null {
  if (typeof modelCode !== 'string') return null;
  const code = modelCode.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)?$/.test(code)) return null;
  const segments = code.split('-');
  if (segments.length === 2) return `${segments[0]![0]}${segments[1]![0]}`;
  if (code.length === 2) return code;
  if (/^[A-Z]{2}[A-Z0-9]+$/.test(code)) return code.slice(0, 2);
  return null;
}

export function modelEngineeringStage(modelId: string, catalog: Catalog, engineering: Engineering): string {
  const variantIds = new Set(catalog.variants.filter((variant) => variant.model_id === modelId).map((variant) => variant.id));
  const skuIds = new Set(catalog.skus.filter((sku) => variantIds.has(sku.variant_id)).map((sku) => sku.id));
  const specs = engineering.buildSpecs.filter((spec) => skuIds.has(spec.sku_id));
  const boms = engineering.boms.filter((bom) => bom.model_id === modelId);
  if (specs.some((spec) => spec.status === 'RELEASED')) return '生产规格已发布';
  if (specs.some((spec) => spec.status === 'DRAFT')) return '生产规格编制中';
  if (boms.some((bom) => bom.revision_status === 'RELEASED')) return 'BOM 已发布';
  if (boms.some((bom) => bom.revision_status === 'DRAFT')) return 'BOM 编制中';
  if (boms.length) return 'BOM 已建，待建版本';
  return '待建立 BOM';
}

export function modelBomSummary(modelId: string, engineering: Engineering): string {
  const boms = engineering.boms.filter((bom) => bom.model_id === modelId);
  if (!boms.length) return '未关联 BOM';
  return boms.map((bom) => `${bom.code}${bom.revision_code ? ` / ${bom.revision_code}` : '（待建版本）'}`).join('、');
}

export function matchesModelRegisterSearch(
  model: { id: string; code: string; name: string },
  platform: { code: string; name: string } | undefined,
  catalog: Catalog,
  engineering: Engineering,
  query: string,
  engineeringAvailable: boolean,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const variants = catalog.variants.filter((variant) => variant.model_id === model.id);
  const variantIds = new Set(variants.map((variant) => variant.id));
  const skus = catalog.skus.filter((sku) => variantIds.has(sku.variant_id));
  const searchable: (string | null | undefined)[] = [
    model.code, model.name, platform?.code, platform?.name,
    ...variants.flatMap((variant) => [variant.code, variant.name]),
    ...skus.flatMap((sku) => [sku.sku, sku.name, sku.market_code, sku.color_code, sku.size_code]),
  ];
  if (engineeringAvailable) {
    const skuIds = new Set(skus.map((sku) => sku.id));
    searchable.push(...engineering.boms.filter((bom) => bom.model_id === model.id)
      .flatMap((bom) => [bom.code, bom.name, bom.revision_code]));
    searchable.push(...engineering.buildSpecs.filter((spec) => skuIds.has(spec.sku_id))
      .map((spec) => spec.code));
  }
  return searchable.some((value) => value?.toLocaleLowerCase().includes(normalized));
}
