/**
 * The public Product catalogue is the sole source for storefront page-builder
 * selections. Numeric Product ID is stable and externally visible; UUID remains
 * an internal reference. This creates draft preview HTML only, not a live sale.
 */
export type PublishedProductForBuilder = {
  productId: string; modelId: string; code: string;
  image: string; type: 'BIKE'|'ACCESSORY'|'SERVICE_PART';
  title: {zh:string;en:string;de:string};
};
export const numericProductId = (value: unknown): value is string =>
  typeof value==='string' && /^[1-9][0-9]{5}$/.test(value);
export function verifiedPublishedProducts(value:unknown): PublishedProductForBuilder[] {
  if(!value||typeof value!=='object'||!('items' in value)||!Array.isArray(value.items))throw new Error('Public catalog response malformed');
  const ids=new Set<string>();
  return value.items.filter((item:unknown):item is PublishedProductForBuilder=>{
    if(!item||typeof item!=='object')return false;
    const p=item as Record<string,unknown>;
    if(!numericProductId(p.productId)||ids.has(p.productId))return false;
    if(!['BIKE','ACCESSORY','SERVICE_PART'].includes(String(p.type)))return false;
    if(typeof p.modelId!=='string'||typeof p.code!=='string'||!p.code)return false;
    if(typeof p.image!=='string'||!/^\/(?!\/)[^"'<>]*$/.test(p.image))return false;
    const t=p.title as Record<string,unknown>|null;
    if(!t||typeof t!=='object'||['zh','en','de'].some(locale=>typeof t[locale]!=='string'||!String(t[locale]).trim()))return false;
    ids.add(p.productId);return true;
  }).sort((a:PublishedProductForBuilder,b:PublishedProductForBuilder)=>Number(a.productId)-Number(b.productId));
}
const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Permanent data-product-id binding is retained in exported/editor draft HTML.
 * Prices and ATP are deliberately NOT embedded as stale static values.
 */
export function numericProductBlock(p:PublishedProductForBuilder,locale:'zh'|'de'|'en'):string {
  if(!numericProductId(p.productId)||!/^\/(?!\/)[^"'<>]*$/.test(p.image))throw new Error('Invalid published product identity');
  const id=p.productId;
  const title=escapeHtml(p.title[locale]);
  return `<section data-alsvid-block="linked-product" data-product-id="${id}" class="model-grid"><article class="model-card"><img src="${escapeHtml(p.image)}" alt="${title}" style="width:100%;object-fit:contain;max-height:280px" /><p class="eyebrow">PRODUCT #${id}</p><h3>${title}</h3><p>商品 ID ${id} · ${escapeHtml(p.code)}</p><a class="text-link" href="/${locale}/explore/${id}">查看商品详情 →</a></article></section>`;
}
