import { createHash } from 'node:crypto';
import { postgresErrorCode, type DatabasePort, type QueryExecutor } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from './core/errors.js';
import type { CommerceAuditPort } from './application/ports.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const grossPattern=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
const allowedMarkets=['DE','AT'] as const;

export interface CreateStorefrontPriceInput {
 skuId:string;marketCountry:'DE'|'AT';unitPriceGross:string;taxRateBasisPoints:number;
}
export interface CreateStorefrontOrderInput {
 clientRequestId:string;customerEmail:string;marketCountry:'DE'|'AT';
 items:Array<{skuId:string;quantity:number}>;
}
export interface StorefrontActor {userId:string;permissions:readonly string[]}
export interface StorefrontPrice {
 id:string;skuId:string;sku:string;skuName:string;marketCountry:string;currency:string;
 unitPriceGross:string;taxRateBasisPoints:number;status:'DRAFT'|'ACTIVE'|'RETIRED';
 version:number;effectiveFrom:string|null;retiredAt:string|null;createdAt:string;
}
export interface StorefrontOrderLine {
 id:string;skuId:string;skuCode:string;skuName:string;colorCode:string|null;quantity:number;
 unitPriceGross:string;taxRateBasisPoints:number;lineNetAmount:string;lineTaxAmount:string;lineGrossAmount:string;
}
export interface StorefrontOrder {
 id:string;orderNumber:string;source:'ALSVID_WWW';customerEmail:string;marketCountry:string;currency:string;
 status:string;paymentStatus:string;taxConfigurationStatus:string;totalNetAmount:string;totalTaxAmount:string;
 totalGrossAmount:string;version:number;createdAt:string;lines:StorefrontOrderLine[];
 checkoutEnabled:false;productionDemandAllowed:false;blockers:string[];
}
export interface StorefrontOrderEvent {
 id:string;eventType:'ORDER_CREATED'|'STATUS_CHANGED'|'PAYMENT_STATUS_CHANGED';
 fromStatus:string|null;toStatus:string;fromPaymentStatus:string|null;toPaymentStatus:string;
 actorUserId:string|null;metadata:Record<string,unknown>;occurredAt:string;
}
export interface StorefrontOrderDetail extends StorefrontOrder {events:StorefrontOrderEvent[]}
type StorefrontOrderEventRow={id:string;event_type:StorefrontOrderEvent['eventType'];
 from_status:string|null;to_status:string;from_payment_status:string|null;to_payment_status:string;
 actor_user_id:string|null;metadata:Record<string,unknown>;occurred_at:Date};
type PriceRow={id:string;sku_id:string;sku:string;sku_name:string;market_country:string;currency:string;
 unit_price_gross:string;tax_rate_basis_points:number;status:'DRAFT'|'ACTIVE'|'RETIRED';
 version:number;effective_from:Date|null;retired_at:Date|null;created_at:Date};
type SkuPriceRow={price_id:string;sku_id:string;sku:string;sku_name:string;color_code:string|null;
 market_country:string;currency:string;unit_price_gross:string;tax_rate_basis_points:number};
type OrderRow={id:string;order_number:string;source:'ALSVID_WWW';customer_email:string;market_country:string;
 currency:string;status:string;payment_status:string;tax_configuration_status:string;
 total_net_amount:string;total_tax_amount:string;total_gross_amount:string;version:number;created_at:Date;cancel_reason?:string|null;lines?:StorefrontOrderLine[]};
type ExistingRequestRow={id:string;request_sha256:string};
function requirePermission(actor:StorefrontActor,permission:string):void{
 if(!actor.permissions.includes(permission))throw new ForbiddenError('COMMERCE_FORBIDDEN',`Missing ${permission}`);
}
function requireId(value:unknown,name:string):string{
 if(typeof value!=='string'||!uuid.test(value))throw new CommerceValidationError(`${name} must be a valid UUID`);
 return value.toLowerCase();
}
function normalizeMarket(value:unknown):'DE'|'AT'{
 if(typeof value!=='string'||!allowedMarkets.includes(value as 'DE'|'AT'))throw new CommerceValidationError('First-release market must be DE or AT');
 return value as 'DE'|'AT';
}
function normalizeGross(value:unknown):string{
 if(typeof value!=='string'||!grossPattern.test(value))throw new CommerceValidationError('Gross unit price must be a positive EUR amount with at most two decimals');
 const cents=toCents(value);
 if(cents<=0n)throw new CommerceValidationError('Gross unit price must be greater than zero');
 return centsToString(cents);
}
function toCents(value:string):bigint{
 const [whole,fraction='']=value.split('.');
 return BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0'));
}
function centsToString(value:bigint):string{
 const whole=value/100n,fraction=(value%100n).toString().padStart(2,'0');
 return `${whole}.${fraction}`;
}
function calculateLine(unitPriceGross:string,quantity:number,taxRateBasisPoints:number){
 const gross=toCents(unitPriceGross)*BigInt(quantity);
 const denominator=10000n+BigInt(taxRateBasisPoints);
 const tax=(gross*BigInt(taxRateBasisPoints)+denominator/2n)/denominator;
 return {lineGrossAmount:centsToString(gross),lineTaxAmount:centsToString(tax),lineNetAmount:centsToString(gross-tax)};
}
function mapPrice(row:PriceRow):StorefrontPrice{
 return {id:row.id,skuId:row.sku_id,sku:row.sku,skuName:row.sku_name,marketCountry:row.market_country,
  currency:row.currency,unitPriceGross:row.unit_price_gross,taxRateBasisPoints:row.tax_rate_basis_points,
  status:row.status,version:row.version,effectiveFrom:row.effective_from?.toISOString()??null,
  retiredAt:row.retired_at?.toISOString()??null,createdAt:row.created_at.toISOString()};
}
function mapOrder(row:OrderRow):StorefrontOrder{
 const blockers:string[]=[];
 if(row.status==='DRAFT')blockers.push('内部草稿：尚未向客户提交或创建支付会话');
 if(row.status==='SUBMITTED')blockers.push('已提交：等待支付通道接入，尚未发起任何支付尝试');
 if(row.payment_status!=='VERIFIED')blockers.push('没有经过服务端签名与订单金额绑定核验的 PSP 成功付款证据');
 if(row.tax_configuration_status!=='VERIFIED')blockers.push('税率为管理员配置值，尚未完成正式结账合规核验');
 blockers.push('正式消费者结账尚未启用');
 return {id:row.id,orderNumber:row.order_number,source:row.source,customerEmail:row.customer_email,
  marketCountry:row.market_country,currency:row.currency,status:row.status,paymentStatus:row.payment_status,
  taxConfigurationStatus:row.tax_configuration_status,totalNetAmount:row.total_net_amount,
  totalTaxAmount:row.total_tax_amount,totalGrossAmount:row.total_gross_amount,version:row.version,
  createdAt:row.created_at.toISOString(),lines:row.lines??[],checkoutEnabled:false,productionDemandAllowed:false,blockers};
}
export function calculateStorefrontLineTotals(unitPriceGross:string,quantity:number,taxRateBasisPoints:number){
 if(!Number.isInteger(quantity)||quantity<1||quantity>1000)throw new CommerceValidationError('Quantity must be an integer from 1 to 1000');
 if(!Number.isInteger(taxRateBasisPoints)||taxRateBasisPoints<0||taxRateBasisPoints>10000)throw new CommerceValidationError('Tax rate basis points must be between 0 and 10000');
 return calculateLine(unitPriceGross,quantity,taxRateBasisPoints);
}
/** Every status the database actually permits; the filter rejects anything else instead of returning an empty list. */
export const storefrontOrderStatuses=[
 'DRAFT','SUBMITTED','AWAITING_PAYMENT','PAYMENT_PENDING','PAYMENT_VERIFIED',
 'FULFILLMENT_PENDING','IN_PRODUCTION','FULFILLED','CLOSED','CANCELLED'] as const;
export type StorefrontOrderStatus=typeof storefrontOrderStatuses[number];
export interface StorefrontOrderQuery {
 query?:string;status?:string;marketCountry?:string;limit?:number|string;
}
export const STOREFRONT_ORDER_PAGE_LIMIT=100;
export const STOREFRONT_ORDER_MAX_LIMIT=200;
const escapeLike=(value:string)=>value.replace(/[\\%_]/g,'\\$&');
/**
 * Server-side filter for the first-party order list. Returns a fully parameterised
 * WHERE fragment so callers never interpolate operator input into SQL.
 * `query` matches order number, buyer email and purchased SKU snapshots.
 */
export function buildStorefrontOrderFilter(filters:StorefrontOrderQuery={}):{where:string;params:unknown[]}{
 if(!filters||typeof filters!=='object'||Array.isArray(filters))
  throw new CommerceValidationError('Order filter must be an object');
 const clauses:string[]=[];const params:unknown[]=[];
 const status=typeof filters.status==='string'?filters.status.trim().toUpperCase():'';
 if(status&&status!=='ALL'){
  if(!(storefrontOrderStatuses as readonly string[]).includes(status))
   throw new CommerceValidationError('Unsupported storefront order status filter');
  params.push(status);clauses.push(`o.status=$${params.length}`);
 }
 const market=typeof filters.marketCountry==='string'?filters.marketCountry.trim().toUpperCase():'';
 if(market&&market!=='ALL'){
  if(!(allowedMarkets as readonly string[]).includes(market))
   throw new CommerceValidationError('Order market filter must be DE or AT');
  params.push(market);clauses.push(`o.market_country=$${params.length}`);
 }
 const term=typeof filters.query==='string'?filters.query.trim().slice(0,100):'';
 if(term){
  params.push('%'+escapeLike(term)+'%');
  const i=params.length;
  clauses.push(`(o.order_number ILIKE $${i} OR o.customer_email ILIKE $${i} OR EXISTS(
    SELECT 1 FROM commerce.storefront_order_lines f WHERE f.order_id=o.id
     AND (f.sku_code_snapshot ILIKE $${i} OR f.sku_name_snapshot ILIKE $${i})))`);
 }
 return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',params};
}
/** Page size is clamped, never trusted: an absurd limit must not become an unbounded read. */
export function resolveStorefrontOrderLimit(limit:unknown):number{
 if(limit===undefined||limit===null||limit==='')return STOREFRONT_ORDER_PAGE_LIMIT;
 const parsed=typeof limit==='number'?limit:Number(String(limit).trim());
 if(!Number.isInteger(parsed)||parsed<1)throw new CommerceValidationError('Order limit must be a positive integer');
 return Math.min(parsed,STOREFRONT_ORDER_MAX_LIMIT);
}
export class StorefrontOrderService{
 constructor(private readonly db:DatabasePort,private readonly audit:CommerceAuditPort){}
 async summary(actor:StorefrontActor,filters:StorefrontOrderQuery={}){
  requirePermission(actor,'commerce.storefront.read');
  const {where,params}=buildStorefrontOrderFilter(filters);
  const limit=resolveStorefrontOrderLimit(filters?.limit);
  const [skus,prices,orders,orderTotal,statusCounts,factories]=await Promise.all([
   this.db.query<any>(`SELECT s.id,s.sku,s.name,s.color_code,s.market_code,m.code AS model_code,v.code AS variant_code
    FROM product.skus s JOIN product.variants v ON v.id=s.variant_id
    JOIN product.models m ON m.id=v.model_id WHERE s.status='ACTIVE' ORDER BY m.code,v.code,s.sku LIMIT 500`),
   this.db.query<PriceRow>(`SELECT p.*,s.sku,s.name AS sku_name FROM commerce.storefront_prices p
    JOIN product.skus s ON s.id=p.sku_id ORDER BY p.created_at DESC,p.id DESC LIMIT 500`),
   this.db.query<OrderRow>(`SELECT o.*,COALESCE(json_agg(json_build_object(
    'id',l.id,'skuId',l.sku_id,'skuCode',l.sku_code_snapshot,'skuName',l.sku_name_snapshot,
    'colorCode',l.color_code_snapshot,'quantity',l.quantity,'unitPriceGross',l.unit_price_gross::text,
    'taxRateBasisPoints',l.tax_rate_basis_points,'lineNetAmount',l.line_net_amount::text,
    'lineTaxAmount',l.line_tax_amount::text,'lineGrossAmount',l.line_gross_amount::text)
    ORDER BY l.created_at,l.id) FILTER(WHERE l.id IS NOT NULL),'[]'::json) AS lines
    FROM commerce.storefront_orders o LEFT JOIN commerce.storefront_order_lines l ON l.order_id=o.id
    ${where} GROUP BY o.record_id ORDER BY o.created_at DESC,o.id DESC LIMIT ${limit}`,params),
   // Reported total is the count of ALL rows matching the filter, so a truncated
   // page can never be mistaken for "there are only this many orders".
   this.db.query<{total:string}>(`SELECT count(*)::text AS total FROM commerce.storefront_orders o ${where}`,params),
   // Whole-book status distribution (never filtered) so the overview describes the real book.
   this.db.query<{status:string;total:string}>(`SELECT status,count(*)::text AS total
    FROM commerce.storefront_orders GROUP BY status`),
   this.db.query<any>(`SELECT p.id,p.partner_code,p.display_name FROM partners.partners p
    JOIN partners.roles r ON r.partner_id=p.id WHERE r.role='FACTORY'
    ORDER BY p.display_name,p.partner_code LIMIT 100`)
  ]);
  const mappedOrders=orders.rows.map(mapOrder).map(order=>actor.permissions.includes('commerce.storefront.write')
   ?order:{...order,customerEmail:'已隐藏'});
  const orderStatusCounts:Record<string,number>={};
  for(const row of statusCounts.rows)orderStatusCounts[row.status]=Number(row.total);
  return {checkoutEnabled:false,skus:skus.rows.map(r=>({id:r.id,sku:r.sku,name:r.name,colorCode:r.color_code,
    marketCode:r.market_code,modelCode:r.model_code,variantCode:r.variant_code})),
   prices:prices.rows.map(mapPrice),orders:mappedOrders,
   orderTotal:Number(orderTotal.rows[0]?.total??0),orderLimit:limit,orderStatusCounts,
   factories:factories.rows.map(r=>({id:r.id,code:r.partner_code,name:r.display_name}))};
 }
 async createPrice(actor:StorefrontActor,input:CreateStorefrontPriceInput):Promise<StorefrontPrice>{
  requirePermission(actor,'commerce.price.manage');
  if(!input||typeof input!=='object')throw new CommerceValidationError('Price input is required');
  const skuId=requireId(input.skuId,'skuId'),marketCountry=normalizeMarket(input.marketCountry);
  const unitPriceGross=normalizeGross(input.unitPriceGross),taxRateBasisPoints=input.taxRateBasisPoints;
  if(!Number.isInteger(taxRateBasisPoints)||taxRateBasisPoints<0||taxRateBasisPoints>10000)
   throw new CommerceValidationError('Tax rate basis points must be between 0 and 10000');
  try{
   return await this.db.transaction(async e=>{
    const sku=await e.query<{id:string;status:string}>(`SELECT id,status FROM product.skus WHERE id=$1 FOR SHARE`,[skuId]);
    if(!sku.rows[0])throw new CommerceNotFoundError('SKU not found');
    if(sku.rows[0].status!=='ACTIVE')throw new CommerceValidationError('Only active SKUs may be priced');
    const saved=await e.query<PriceRow>(`INSERT INTO commerce.storefront_prices
      (sku_id,market_country,currency,unit_price_gross,tax_rate_basis_points,status,created_by,updated_by)
      VALUES($1,$2,'EUR',$3,$4,'DRAFT',$5,$5)
      RETURNING *,''::text AS sku,''::text AS sku_name`,
      [skuId,marketCountry,unitPriceGross,taxRateBasisPoints,actor.userId]);
    const row=saved.rows[0];if(!row)throw new Error('Price draft was not persisted');
    await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_price_draft_created',
     targetType:'commerce.storefront_price',targetId:row.id,metadata:{skuId,marketCountry,unitPriceGross,currency:'EUR',taxRateBasisPoints}},e);
    const name=await e.query<{sku:string;sku_name:string}>(`SELECT sku,name AS sku_name FROM product.skus WHERE id=$1`,[skuId]);
    return mapPrice({...row,sku:name.rows[0]!.sku,sku_name:name.rows[0]!.sku_name});
   });
  }catch(error){if(postgresErrorCode(error)==='23505')throw new CommerceConflictError('An active price already exists for this SKU and market; retire it before activating a replacement');throw error;}
 }
 async activatePrice(actor:StorefrontActor,id:string,expectedVersion:number):Promise<StorefrontPrice>{
  requirePermission(actor,'commerce.price.manage');requireId(id,'priceId');
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new CommerceValidationError('expectedVersion is required');
  try{return await this.db.transaction(async e=>{
   const current=await e.query<PriceRow>(`SELECT p.*,s.sku,s.name AS sku_name FROM commerce.storefront_prices p
    JOIN product.skus s ON s.id=p.sku_id WHERE p.id=$1 FOR UPDATE OF p`,[id]);
   const row=current.rows[0];if(!row)throw new CommerceNotFoundError('Price revision not found');
   if(row.version!==expectedVersion||row.status!=='DRAFT')throw new CommerceConflictError('Price revision changed or is no longer a draft');
   const updated=await e.query<PriceRow>(`UPDATE commerce.storefront_prices SET status='ACTIVE',
    effective_from=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3
    RETURNING *,''::text AS sku,''::text AS sku_name`,[id,actor.userId,expectedVersion]);
   if(!updated.rows[0])throw new CommerceConflictError('Price revision changed; reload and retry');
   await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_price_activated',
    targetType:'commerce.storefront_price',targetId:id,metadata:{skuId:row.sku_id,marketCountry:row.market_country,
     unitPriceGross:row.unit_price_gross,currency:row.currency,taxRateBasisPoints:row.tax_rate_basis_points}},e);
   return mapPrice({...updated.rows[0],sku:row.sku,sku_name:row.sku_name});
  });}catch(error){if(postgresErrorCode(error)==='23505')throw new CommerceConflictError('An active price already exists for this SKU and market; retire it first');throw error;}
 }
 async retirePrice(actor:StorefrontActor,id:string,expectedVersion:number):Promise<StorefrontPrice>{
  requirePermission(actor,'commerce.price.manage');requireId(id,'priceId');
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new CommerceValidationError('expectedVersion is required');
  return this.db.transaction(async e=>{
   const current=await e.query<PriceRow>(`SELECT p.*,s.sku,s.name AS sku_name FROM commerce.storefront_prices p
    JOIN product.skus s ON s.id=p.sku_id WHERE p.id=$1 FOR UPDATE OF p`,[id]);
   const row=current.rows[0];if(!row)throw new CommerceNotFoundError('Price revision not found');
   if(row.version!==expectedVersion||row.status!=='ACTIVE')throw new CommerceConflictError('Price revision changed or is no longer active');
   const updated=await e.query<PriceRow>(`UPDATE commerce.storefront_prices SET status='RETIRED',
    retired_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3
    RETURNING *,''::text AS sku,''::text AS sku_name`,[id,actor.userId,expectedVersion]);
   if(!updated.rows[0])throw new CommerceConflictError('Price revision changed; reload and retry');
   await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_price_retired',
    targetType:'commerce.storefront_price',targetId:id,metadata:{skuId:row.sku_id,marketCountry:row.market_country}},e);
   return mapPrice({...updated.rows[0],sku:row.sku,sku_name:row.sku_name});
  });
 }
 async createDraftOrder(actor:StorefrontActor,input:CreateStorefrontOrderInput):Promise<StorefrontOrder>{
  requirePermission(actor,'commerce.storefront.write');
  if(!input||typeof input!=='object')throw new CommerceValidationError('Order draft input is required');
  const clientRequestId=requireId(input.clientRequestId,'clientRequestId');
  const customerEmail=typeof input.customerEmail==='string'?input.customerEmail.trim().toLowerCase():'';
  if(customerEmail.length>254||!emailPattern.test(customerEmail))throw new CommerceValidationError('A valid customer email is required');
  const marketCountry=normalizeMarket(input.marketCountry);
  if(!Array.isArray(input.items)||input.items.length<1||input.items.length>25)throw new CommerceValidationError('An order draft must contain 1 to 25 distinct SKU lines');
  const items=input.items.map(item=>({skuId:requireId(item?.skuId,'skuId'),quantity:item?.quantity}));
  if(items.some(item=>!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000))throw new CommerceValidationError('Quantity must be an integer from 1 to 1000');
  if(new Set(items.map(item=>item.skuId)).size!==items.length)throw new CommerceValidationError('Each SKU must appear once; combine quantities into one line');
  items.sort((a,b)=>a.skuId.localeCompare(b.skuId));
  const requestSha=createHash('sha256').update(JSON.stringify({customerEmail,marketCountry,items})).digest('hex');
  try{return await this.db.transaction(async e=>{
   await e.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`storefront-order:${actor.userId}:${clientRequestId}`]);
   const existing=await e.query<ExistingRequestRow>(`SELECT id,request_sha256 FROM commerce.storefront_orders WHERE created_by=$1 AND client_request_id=$2`,[actor.userId,clientRequestId]);
   if(existing.rows[0]){
    if(existing.rows[0].request_sha256!==requestSha)throw new CommerceConflictError('clientRequestId already belongs to a different order payload');
    return this.loadOrder(e,existing.rows[0].id);
   }
   const prices=await e.query<SkuPriceRow>(`SELECT p.id AS price_id,p.sku_id,s.sku,s.name AS sku_name,s.color_code,
     p.market_country,p.currency,p.unit_price_gross::text,p.tax_rate_basis_points
    FROM commerce.storefront_prices p JOIN product.skus s ON s.id=p.sku_id
    WHERE p.sku_id=ANY($1::uuid[]) AND p.market_country=$2 AND p.currency='EUR'
     AND p.status='ACTIVE' AND p.effective_from<=now() AND s.status='ACTIVE'
    ORDER BY p.sku_id`,[items.map(x=>x.skuId),marketCountry]);
   const bySku=new Map(prices.rows.map(row=>[row.sku_id,row]));
   for(const item of items)if(!bySku.has(item.skuId))throw new CommerceValidationError(`No active EUR price is configured for SKU ${item.skuId} in ${marketCountry}`);
   const lines=items.map(item=>{
    const price=bySku.get(item.skuId)!;
    const totals=calculateLine(price.unit_price_gross,item.quantity,price.tax_rate_basis_points);
    return {item,price,totals};
   });
   const totalNet=lines.reduce((sum,line)=>sum+toCents(line.totals.lineNetAmount),0n);
   const totalTax=lines.reduce((sum,line)=>sum+toCents(line.totals.lineTaxAmount),0n);
   const totalGross=lines.reduce((sum,line)=>sum+toCents(line.totals.lineGrossAmount),0n);
   const saved=await e.query<OrderRow>(`INSERT INTO commerce.storefront_orders
    (customer_email,market_country,currency,status,payment_status,total_net_amount,total_tax_amount,total_gross_amount,
     client_request_id,request_sha256,created_by,updated_by)
    VALUES($1,$2,'EUR','DRAFT','NOT_CONFIGURED',$3,$4,$5,$6,$7,$8,$8)
    RETURNING *,now() AS created_at`,
    [customerEmail,marketCountry,centsToString(totalNet),centsToString(totalTax),centsToString(totalGross),clientRequestId,requestSha,actor.userId]);
   const order=saved.rows[0];if(!order)throw new Error('Storefront order draft was not persisted');
   for(const {item,price,totals} of lines){
    await e.query(`INSERT INTO commerce.storefront_order_lines
     (order_id,price_id,sku_id,sku_code_snapshot,sku_name_snapshot,color_code_snapshot,quantity,currency,
      unit_price_gross,tax_rate_basis_points,line_net_amount,line_tax_amount,line_gross_amount)
     VALUES($1,$2,$3,$4,$5,$6,$7,'EUR',$8,$9,$10,$11,$12)`,
     [order.id,price.price_id,price.sku_id,price.sku,price.sku_name,price.color_code,item.quantity,
      price.unit_price_gross,price.tax_rate_basis_points,totals.lineNetAmount,totals.lineTaxAmount,totals.lineGrossAmount]);
   }
   await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_draft_created',
    targetType:'commerce.storefront_order',targetId:order.id,
    metadata:{orderNumber:order.order_number,marketCountry,customerEmail,currency:'EUR',
     totalNetAmount:centsToString(totalNet),totalTaxAmount:centsToString(totalTax),totalGrossAmount:centsToString(totalGross),
     lineCount:lines.length,paymentStatus:'NOT_CONFIGURED',checkoutEnabled:false}},e);
   return this.loadOrder(e,order.id);
  });}catch(error){if(postgresErrorCode(error)==='23505')throw new CommerceConflictError('Order draft was created concurrently; retry with the same clientRequestId');throw error;}
 }
 async cancelDraftOrder(actor:StorefrontActor,id:string,expectedVersion:number,reason:string):Promise<StorefrontOrder>{
  requirePermission(actor,'commerce.storefront.write');requireId(id,'orderId');
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new CommerceValidationError('expectedVersion is required');
  const note=typeof reason==='string'?reason.trim():'';
  if(note.length<10||note.length>500)throw new CommerceValidationError('Cancellation reason must be 10 to 500 characters');
  return this.db.transaction(async e=>{
   const current=await e.query<OrderRow>(`SELECT * FROM commerce.storefront_orders WHERE id=$1 FOR UPDATE`,[id]);
   const row=current.rows[0];if(!row)throw new CommerceNotFoundError('Storefront order draft not found');
   if(row.status==='CANCELLED'){
    if(row.cancel_reason!==note)throw new CommerceConflictError('Order was already cancelled for a different reason');
    return this.loadOrder(e,id);
   }
   if(row.status!=='DRAFT'||row.payment_status!=='NOT_CONFIGURED')throw new CommerceConflictError('Only an unpaid internal draft can be cancelled; paid-order cancellation needs a separate refund workflow');
   if(row.version!==expectedVersion)throw new CommerceConflictError('Order changed since it was loaded; reload before cancelling');
   const updated=await e.query(`UPDATE commerce.storefront_orders SET status='CANCELLED',cancelled_at=now(),
    cancel_reason=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND version=$4 AND status='DRAFT' RETURNING id`,
    [id,note,actor.userId,expectedVersion]);
   if(!updated.rows[0])throw new CommerceConflictError('Order changed before cancellation; reload and retry');
   await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_draft_cancelled',
    targetType:'commerce.storefront_order',targetId:id,metadata:{reason:note,expectedVersion}},e);
   return this.loadOrder(e,id);
  });
 }
 async submitOrder(actor:StorefrontActor,id:string,expectedVersion:number):Promise<StorefrontOrder>{
  requirePermission(actor,'commerce.storefront.submit');requireId(id,'orderId');
  if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw new CommerceValidationError('expectedVersion is required');
  return this.db.transaction(async e=>{
   const current=await e.query<OrderRow>(`SELECT * FROM commerce.storefront_orders WHERE id=$1 FOR UPDATE`,[id]);
   const row=current.rows[0];if(!row)throw new CommerceNotFoundError('Storefront order draft not found');
   if(row.status==='SUBMITTED')return this.loadOrder(e,id);
   if(row.status!=='DRAFT')throw new CommerceConflictError('Only an internal draft can be submitted; a cancelled or paid order needs a separate workflow');
   if(row.payment_status!=='NOT_CONFIGURED')throw new CommerceConflictError('Order already carries a payment status and cannot be submitted again');
   if(row.version!==expectedVersion)throw new CommerceConflictError('Order changed since it was loaded; reload before submitting');
   const updated=await e.query(`UPDATE commerce.storefront_orders SET status='SUBMITTED',version=version+1,
    updated_by=$2,updated_at=now() WHERE id=$1 AND version=$3 AND status='DRAFT' RETURNING id`,
    [id,actor.userId,expectedVersion]);
   if(!updated.rows[0])throw new CommerceConflictError('Order changed before submission; reload and retry');
   await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_submitted',
    targetType:'commerce.storefront_order',targetId:id,
    metadata:{orderNumber:row.order_number,expectedVersion,paymentStatus:'NOT_CONFIGURED',
     checkoutEnabled:false,note:'Submitted for a payment channel that is not connected yet'}},e);
   return this.loadOrder(e,id);
  });
 }
 async loadOrderDetail(actor:StorefrontActor,id:string):Promise<StorefrontOrderDetail>{
  requirePermission(actor,'commerce.storefront.read');requireId(id,'orderId');
  return this.db.transaction(async e=>{
   const order=await this.loadOrder(e,id);
   const events=await e.query<StorefrontOrderEventRow>(`SELECT id,event_type,from_status,to_status,
     from_payment_status,to_payment_status,actor_user_id,metadata,occurred_at
     FROM commerce.storefront_order_events WHERE order_id=$1 ORDER BY occurred_at,id`,[id]);
   const visible=actor.permissions.includes('commerce.storefront.write')?order:{...order,customerEmail:'已隐藏'};
   return {...visible,events:events.rows.map(row=>({id:row.id,eventType:row.event_type,
    fromStatus:row.from_status,toStatus:row.to_status,fromPaymentStatus:row.from_payment_status,
    toPaymentStatus:row.to_payment_status,actorUserId:row.actor_user_id,metadata:row.metadata,
    occurredAt:row.occurred_at.toISOString()}))};
  });
 }
 private async loadOrder(e:QueryExecutor,id:string):Promise<StorefrontOrder>{
  const result=await e.query<OrderRow>(`SELECT o.*,COALESCE(json_agg(json_build_object(
   'id',l.id,'skuId',l.sku_id,'skuCode',l.sku_code_snapshot,'skuName',l.sku_name_snapshot,
   'colorCode',l.color_code_snapshot,'quantity',l.quantity,'unitPriceGross',l.unit_price_gross::text,
   'taxRateBasisPoints',l.tax_rate_basis_points,'lineNetAmount',l.line_net_amount::text,
   'lineTaxAmount',l.line_tax_amount::text,'lineGrossAmount',l.line_gross_amount::text)
   ORDER BY l.created_at,l.id) FILTER(WHERE l.id IS NOT NULL),'[]'::json) AS lines
   FROM commerce.storefront_orders o LEFT JOIN commerce.storefront_order_lines l ON l.order_id=o.id
   WHERE o.id=$1 GROUP BY o.record_id`,[id]);
  const row=result.rows[0];if(!row)throw new CommerceNotFoundError('Storefront order draft not found');
  return mapOrder(row);
 }
}
