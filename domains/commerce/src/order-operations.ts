import { postgresErrorCode, type DatabasePort, type QueryExecutor } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from './core/errors.js';
import type { CommerceActor, CommerceAuditPort } from './application/ports.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyPattern=/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export interface ExternalOrderReadiness {
 orderId:string; orderName:string; sourceChannel:string; sourceOrderStatus:string;
 sourceFinancialStatus:string|null; currency:string; totalAmount:string;
 lineCount:number; unmappedLines:number; customerMapped:boolean;
 paymentVerifiedByPsp:false; productionReleaseAllowed:false;
 refundExecutionAllowed:false; blockers:string[];
}
export interface RefundReviewRequest {
 id:string;externalOrderId:string;clientRequestId:string;requestedBy:string;
 requestedAmount:string;currency:string;reason:string;state:'REVIEW_REQUESTED';requestedAt:string;
}
export interface RequestRefundReviewInput {
 externalOrderId:string;clientRequestId:string;requestedAmount:string;currency:string;reason:string;
}
type ReadyRow={
 id:string;external_order_name:string|null;external_order_id:string;
 channel_key:string;order_status:string;financial_status:string|null;currency:string;
 total_amount:string;customer_partner_id:string|null;line_count:string;unmapped_lines:string;
};
type OrderRow={id:string;total_amount:string;currency:string};
type RefundRow={id:string;external_order_id:string;client_request_id:string;requested_by:string;
 requested_amount:string;currency:string;reason:string;state:'REVIEW_REQUESTED';requested_at:Date};
function validateId(value:unknown):string {
 if(typeof value!=='string'||!uuid.test(value))throw new CommerceValidationError('A valid UUID is required');
 return value;
}
function normalizeAmount(value:unknown):string {
 if(typeof value!=='string'||!moneyPattern.test(value)||!Number.isFinite(Number(value))||Number(value)<=0)
  throw new CommerceValidationError('Refund review amount must be a positive decimal string, up to six decimals');
 return value;
}
function moneyMinor(value:string):bigint {
 const [whole,fraction='']=value.split('.');
 return BigInt(whole!)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
function mapRefund(row:RefundRow):RefundReviewRequest {
 return {id:row.id,externalOrderId:row.external_order_id,clientRequestId:row.client_request_id,
  requestedBy:row.requested_by,requestedAmount:row.requested_amount,currency:row.currency,
  reason:row.reason,state:row.state,requestedAt:row.requested_at.toISOString()};
}
export function assessExternalOrder(row:ReadyRow):ExternalOrderReadiness {
 const lineCount=Number(row.line_count),unmappedLines=Number(row.unmapped_lines);
 const blockers:string[]=[];
 if(['CANCELLED','CLOSED','VOIDED'].includes(row.order_status.toUpperCase()))blockers.push('订单已取消或关闭，不能自动履约');
 if(lineCount===0)blockers.push('没有真实订单商品行');
 if(unmappedLines>0)blockers.push('仍有商品未绑定 ALSVID SKU');
 if(!row.customer_partner_id)blockers.push('客户 Partner 尚未人工核验');
 // External provider financial_status, even PAID, is a provider-reported *order* field,
 // not an authenticated PSP capture/settlement tied to this internal order.
 blockers.push('没有独立支付机构核验的付款事实');
 return {orderId:row.id,orderName:row.external_order_name||row.external_order_id,
  sourceChannel:row.channel_key,sourceOrderStatus:row.order_status,
  sourceFinancialStatus:row.financial_status,currency:row.currency,totalAmount:row.total_amount,
  lineCount,unmappedLines,customerMapped:Boolean(row.customer_partner_id),
  paymentVerifiedByPsp:false,productionReleaseAllowed:false,refundExecutionAllowed:false,blockers};
}

/** Operates on existing imported orders only; never creates live checkout, refunds, or production. */
export class CommerceOrderOperationsService {
 constructor(private readonly db:DatabasePort,private readonly audit:CommerceAuditPort){}
 async readiness(actor:CommerceActor):Promise<ExternalOrderReadiness[]> {
  if(!actor.permissions.includes('commerce.read'))throw new ForbiddenError('COMMERCE_FORBIDDEN','Missing commerce.read');
  const r=await this.db.query<ReadyRow>(`SELECT o.id,o.external_order_name,o.external_order_id,c.channel_key,o.order_status,
    o.financial_status,o.currency,o.total_amount::text,o.customer_partner_id,
    count(l.id)::text AS line_count,
    count(l.id) FILTER(WHERE l.sku_id IS NULL)::text AS unmapped_lines
   FROM commerce.external_orders o JOIN commerce.channels c ON c.id=o.channel_id
   LEFT JOIN commerce.external_order_lines l ON l.order_id=o.id
   GROUP BY o.record_id,c.channel_key
   ORDER BY o.updated_at DESC,o.id DESC LIMIT 100`);
  return r.rows.map(assessExternalOrder);
 }
 async refundReviews(actor:CommerceActor):Promise<RefundReviewRequest[]> {
  if(!actor.permissions.includes('commerce.read'))throw new ForbiddenError('COMMERCE_FORBIDDEN','Missing commerce.read');
  const r=await this.db.query<RefundRow>(`SELECT id,external_order_id,client_request_id,requested_by,
    requested_amount::text,currency,reason,state,requested_at
    FROM commerce.refund_review_requests ORDER BY requested_at DESC,id DESC LIMIT 100`);
  return r.rows.map(mapRefund);
 }
 async requestRefundReview(actor:CommerceActor,input:RequestRefundReviewInput):Promise<RefundReviewRequest> {
  if(!actor.permissions.includes('commerce.refund.review'))
   throw new ForbiddenError('COMMERCE_FORBIDDEN','Missing commerce.refund.review');
  if(!input||typeof input!=='object')throw new CommerceValidationError('Refund review request is required');
  const orderId=validateId(input.externalOrderId),clientRequestId=validateId(input.clientRequestId);
  const amount=normalizeAmount(input.requestedAmount);
  const currency=typeof input.currency==='string'?input.currency.trim():'';
  if(!/^[A-Z]{3}$/.test(currency))throw new CommerceValidationError('Valid uppercase currency is required');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(reason.length<10||reason.length>1000)throw new CommerceValidationError('Provide a 10-1000 character review reason');
  return this.db.transaction(async (e:QueryExecutor)=>{
   // Serialize retries for the same order BEFORE reading request idempotency state.
   // Lock also stabilizes the source amount/currency while requesting a review.
   const order=await e.query<OrderRow>(`SELECT id,total_amount::text,currency
     FROM commerce.external_orders WHERE id=$1 FOR UPDATE`,[orderId]);
   const source=order.rows[0];
   if(!source)throw new CommerceNotFoundError('Imported order was not found');
   if(currency!==source.currency||moneyMinor(amount)>moneyMinor(source.total_amount))
    throw new CommerceValidationError('Review amount or currency exceeds/mismatches the imported order');
   const existing=await e.query<RefundRow>(`SELECT id,external_order_id,client_request_id,requested_by,
    requested_amount::text,currency,reason,state,requested_at FROM commerce.refund_review_requests
    WHERE requested_by=$1 AND client_request_id=$2`,[actor.userId,clientRequestId]);
   const previous=existing.rows[0];
   if(previous){
    if(previous.external_order_id!==orderId||moneyMinor(previous.requested_amount)!==moneyMinor(amount)
       ||previous.currency!==currency||previous.reason!==reason)
     throw new CommerceConflictError('Request ID already belongs to a different refund review');
    return mapRefund(previous);
   }
   const saved=await e.query<RefundRow>(`INSERT INTO commerce.refund_review_requests
    (external_order_id,client_request_id,requested_by,requested_amount,currency,reason)
    VALUES($1,$2,$3,$4,$5,$6)
    RETURNING id,external_order_id,client_request_id,requested_by,requested_amount::text,currency,reason,state,requested_at`,
    [orderId,clientRequestId,actor.userId,amount,currency,reason]);
   const record=saved.rows[0];
   if(!record)throw new Error('Refund review persistence failed');
   await this.audit.record({actorUserId:actor.userId,action:'commerce.refund_review_requested',
    targetType:'commerce.external_order',targetId:orderId,
    metadata:{refundReviewId:record.id,requestedAmount:amount,currency,requiresPspVerification:true}},e);
   return mapRefund(record);
  }).catch((error:unknown)=>{
   if(postgresErrorCode(error)==='23505')throw new CommerceConflictError('Refund review already submitted; reload before retrying');
   throw error;
  });
 }
}
