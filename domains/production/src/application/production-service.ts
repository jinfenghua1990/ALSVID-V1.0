import{postgresErrorCode}from'@alsvid/database';import{ForbiddenError}from'@alsvid/kernel';
import{ProductionCapability,type CreateProductionOrderInput,type ProductionDeviationInput,type ProductionSummary,type QcInspectionInput}from'../core/model.js';import{ProductionConflictError,ProductionNotFoundError,ProductionValidationError}from'../core/errors.js';import{assertQcResult,positiveProductionDecimal,positiveProductionInteger}from'../core/validation.js';import type{ProductionActor,ProductionAuditPort,ProductionInventoryPort,ProductionRepository}from'./ports.js';
export class ProductionService{
 constructor(private readonly repository:ProductionRepository,private readonly audit:ProductionAuditPort,private readonly inventory?:ProductionInventoryPort){}
 async summary(actor:ProductionActor):Promise<ProductionSummary>{requireCapability(actor,ProductionCapability.Read);return this.repository.summary()}
 async receiveFinishedGoods(actor:ProductionActor,orderId:string,input:{locationId:string;quantity:number;note?:string}):Promise<any>{
  requireCapability(actor,ProductionCapability.Release);
  if(!actor.permissions.includes('inventory.move'))throw new ForbiddenError('PRODUCTION_INVENTORY_FORBIDDEN','Missing permission: inventory.move');
  const inventory=this.inventory;
  if(!inventory)throw new ProductionConflictError('Production inventory integration is not configured');
  if(!Number.isSafeInteger(input?.quantity)||input.quantity<=0||!input.locationId)throw new ProductionValidationError('Factory receipt requires a valid warehouse and positive integer quantity');
  return this.repository.transaction(async e=>{
    const order=await this.repository.lockFactoryOrder(orderId,e);
    if(!order)throw new ProductionNotFoundError('Production order not found');
    if(order.status!=='COMPLETED')throw new ProductionConflictError('Factory receiving requires completed and QC-passed production');
    if(!await this.repository.verifyFactoryLocation(input.locationId,order.factory_partner_id,e))throw new ProductionValidationError('Choose an active factory-managed China warehouse');
    const already=await this.repository.receivedFactoryQuantity(orderId,e);
    if(already+input.quantity>Number(order.planned_quantity))throw new ProductionConflictError('Factory received quantity cannot exceed completed quantity');
    const movement=await inventory.postMovement(actor,{movementType:'RECEIPT',itemKind:'SKU',itemId:order.sku_id,unit:'EA',quantity:String(input.quantity),destinationLocationId:input.locationId,referenceType:'PRODUCTION_ORDER',referenceId:orderId,reason:input.note?.trim()||'Verified factory finished-goods physical receipt',idempotencyKey:`factory-finished:${orderId}:${already}:${input.quantity}`,correlationId:orderId},e);
    await this.repository.addFactoryReceipt(orderId,input.locationId,input.quantity,movement.id,actor.userId,e);
    await this.audit.record({actorUserId:actor.userId,action:'production.factory_finished_goods_received',targetType:'production.order',targetId:orderId,metadata:{quantity:input.quantity,locationId:input.locationId}},e);
    return {received:input.quantity,totalReceived:already+input.quantity,remaining:Number(order.planned_quantity)-already-input.quantity};
  })
 }
 async createOrder(actor:ProductionActor,input:CreateProductionOrderInput):Promise<any>{requireCapability(actor,ProductionCapability.Write);positiveProductionInteger(input.plannedQuantity,'plannedQuantity');if(!input.buildSpecId||!input.factoryPartnerId)throw new ProductionValidationError('buildSpecId and factoryPartnerId are required');if(input.sourceStorefrontOrderLineId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sourceStorefrontOrderLineId))throw new ProductionValidationError('sourceStorefrontOrderLineId must be a valid UUID');try{const row=await this.repository.createOrder({...input,actorUserId:actor.userId});await this.audit.record({actorUserId:actor.userId,action:'production.order_created',targetType:'production.order',targetId:row.id});return row}catch(error){const message=error instanceof Error?error.message:'';if(message.includes('released Build Specification'))throw new ProductionValidationError('Production Order requires a released Build Specification');if(message.includes('FACTORY Partner role'))throw new ProductionValidationError('Selected Partner is not a Factory');if(message.includes('source purchase order'))throw new ProductionValidationError(message);if(message.includes('storefront order')||message.includes('Production demand')||message.includes('Verified PSP evidence')||message.includes('Production quantity must match'))throw new ProductionValidationError(message);if(postgresErrorCode(error)==='23503')throw new ProductionNotFoundError('Build Specification, Factory or source PO not found');throw error}}
 async createFromStorefrontOrder(actor:ProductionActor,orderId:string,factoryPartnerId:string):Promise<any[]>{
  requireCapability(actor,ProductionCapability.Write);
  if(!actor.permissions.includes('commerce.storefront.production'))throw new ForbiddenError('PRODUCTION_FORBIDDEN','Missing permission: commerce.storefront.production');
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!uuid.test(orderId)||!uuid.test(factoryPartnerId))throw new ProductionValidationError('A valid storefront order ID and factory Partner ID are required');
  orderId=orderId.toLowerCase();factoryPartnerId=factoryPartnerId.toLowerCase();
  return this.repository.transaction(async executor=>{
   const context=await this.repository.getStorefrontOrderProductionContext(orderId,factoryPartnerId,executor);
   const order=context.order;
   if(!order)throw new ProductionNotFoundError('First-party storefront order not found');
   if(!['PAYMENT_VERIFIED','FULFILLMENT_PENDING','IN_PRODUCTION'].includes(order.status)
     ||order.payment_status!=='VERIFIED'||order.tax_configuration_status!=='VERIFIED'){
    throw new ProductionConflictError('Production demand requires a PSP-verified order and approved tax configuration; draft or unverified orders are blocked');
   }
   if(!context.paymentEvidence)throw new ProductionConflictError('Matching signed PSP payment evidence is required before creating production demand');
   if(!context.factoryValid)throw new ProductionValidationError('Selected Partner is not a Factory');
   if(!context.lines.length)throw new ProductionValidationError('First-party order has no immutable order lines');
   const missing=context.lines.find((line:any)=>!line.build_spec_id);
   if(missing)throw new ProductionConflictError('No released Build Specification matches storefront SKU '+missing.sku_id);
   if(context.existing.length&&context.existing.length!==context.lines.length)
    throw new ProductionConflictError('Partial production demand already exists; reconcile linked production orders before retrying');
   if(context.existing.length===context.lines.length){
    if(context.existing.some((row:any)=>row.factory_partner_id!==factoryPartnerId))
     throw new ProductionConflictError('Production demand already exists for a different Factory; do not create duplicates');
    if(order.status==='PAYMENT_VERIFIED'){
     const advanced=await this.repository.advanceStorefrontOrderToFulfillment(orderId,actor.userId,executor);
     if(!advanced)throw new ProductionConflictError('Storefront order state changed; reload and retry');
     await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_ready_for_fulfillment',
      targetType:'commerce.storefront_order',targetId:orderId,metadata:{orderNumber:order.order_number}},executor);
    }
    return context.existing;
   }
   if(order.status==='IN_PRODUCTION')throw new ProductionConflictError('Order is marked in production but its linked production orders are missing');
   if(order.status==='PAYMENT_VERIFIED'){
    const advanced=await this.repository.advanceStorefrontOrderToFulfillment(orderId,actor.userId,executor);
    if(!advanced)throw new ProductionConflictError('Storefront order state changed; reload and retry');
    await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_ready_for_fulfillment',
     targetType:'commerce.storefront_order',targetId:orderId,metadata:{orderNumber:order.order_number}},executor);
   }
   const created:any[]=[];
   for(const line of context.lines){
    const row=await this.repository.createOrder({
     buildSpecId:line.build_spec_id,factoryPartnerId,plannedQuantity:Number(line.quantity),
     sourceStorefrontOrderLineId:line.line_id,
     note:`ALSVID storefront ${order.order_number}; sales line ${line.line_id}`,
     actorUserId:actor.userId,
    },executor);
    created.push(row);
    await this.audit.record({actorUserId:actor.userId,action:'production.order_created_from_storefront',
     targetType:'production.order',targetId:row.id,
     metadata:{orderId,orderNumber:order.order_number,orderLineId:line.line_id,skuId:line.sku_id,
      plannedQuantity:Number(line.quantity),buildSpecId:line.build_spec_id,factoryPartnerId}},executor);
   }
   return created;
  });
 }
 async releaseOrder(actor:ProductionActor,orderId:string):Promise<any>{requireCapability(actor,ProductionCapability.Release);return this.repository.transaction(async executor=>{const row=await this.repository.releaseOrder(orderId,actor.userId,executor);if(!row)throw new ProductionConflictError('Production Order is missing or no longer draft');await this.repository.createUnits(orderId,row.planned_quantity,actor.userId,executor);await this.audit.record({actorUserId:actor.userId,action:'production.order_released',targetType:'production.order',targetId:orderId,metadata:{plannedQuantity:row.planned_quantity}},executor);if(row.source_storefront_order_line_id){const order=await this.repository.advanceStorefrontOrderToInProductionIfReady(row.source_storefront_order_line_id,actor.userId,executor);if(order)await this.audit.record({actorUserId:actor.userId,action:'commerce.storefront_order_entered_production',targetType:'commerce.storefront_order',targetId:order.id,metadata:{orderNumber:order.order_number,productionOrderId:orderId}},executor)}return row})}
 async startOrder(actor:ProductionActor,orderId:string):Promise<any>{requireCapability(actor,ProductionCapability.Write);const row=await this.repository.startOrder(orderId,actor.userId);if(!row)throw new ProductionConflictError('Only released Production Orders can start');await this.audit.record({actorUserId:actor.userId,action:'production.order_started',targetType:'production.order',targetId:orderId});return row}
 async markUnitAssembled(actor:ProductionActor,unitId:string):Promise<any>{requireCapability(actor,ProductionCapability.Write);const row=await this.repository.markUnitAssembled(unitId,actor.userId);if(!row)throw new ProductionConflictError('Unit must belong to an in-progress order and not already be assembled');await this.audit.record({actorUserId:actor.userId,action:'production.unit_assembled',targetType:'production.unit',targetId:unitId});return row}
 async moveOrderToQc(actor:ProductionActor,orderId:string):Promise<any>{requireCapability(actor,ProductionCapability.Write);return this.repository.transaction(async executor=>{if(await this.repository.countUnitsBlockingQc(orderId,executor)!==0)throw new ProductionConflictError('All production units must be assembled before QC');const row=await this.repository.moveOrderToQc(orderId,actor.userId,executor);if(!row)throw new ProductionConflictError('Only in-progress Production Orders can enter QC');await this.repository.markAssembledUnitsQcPending(orderId,actor.userId,executor);await this.audit.record({actorUserId:actor.userId,action:'production.order_qc_pending',targetType:'production.order',targetId:orderId},executor);return row})}
 async inspectUnit(actor:ProductionActor,unitId:string,input:QcInspectionInput):Promise<any>{requireCapability(actor,ProductionCapability.QcInspect);assertQcResult(input.result);return this.repository.transaction(async executor=>{const unit=await this.repository.lockUnit(unitId,executor);if(!unit)throw new ProductionNotFoundError('Production unit not found');if(unit.order_status!=='QC_PENDING')throw new ProductionConflictError('Production Order must be QC_PENDING');if(['QC_FAILED','HOLD','ASSEMBLED'].includes(unit.status))await this.repository.setUnitStatus(unitId,'QC_PENDING',actor.userId,executor);const inspection=await this.repository.createInspection(unitId,input,actor.userId,executor);const next=input.result==='PASS'?'QC_PASSED':input.result==='FAIL'?'QC_FAILED':'HOLD';await this.repository.setUnitStatus(unitId,next,actor.userId,executor);await this.audit.record({actorUserId:actor.userId,action:'production.qc_inspected',targetType:'production.unit',targetId:unitId,metadata:{inspectionId:inspection.id,result:input.result}},executor);return inspection})}
 async recordDeviation(actor:ProductionActor,unitId:string,input:ProductionDeviationInput):Promise<any>{requireCapability(actor,ProductionCapability.Write);if(!input.reason?.trim())throw new ProductionValidationError('Deviation reason is required');const row=await this.repository.recordDeviation(unitId,{...input,quantity:positiveProductionDecimal(input.quantity,'quantity')},actor.userId);await this.audit.record({actorUserId:actor.userId,action:'production.deviation_recorded',targetType:'production.unit',targetId:unitId,metadata:{deviationId:row.id}});return row}
 async completeOrder(actor:ProductionActor,orderId:string):Promise<any>{requireCapability(actor,ProductionCapability.Release);if(await this.repository.countUnitsNotQcPassed(orderId)!==0)throw new ProductionConflictError('Every production unit must be QC_PASSED before completion');const row=await this.repository.completeOrder(orderId,actor.userId);if(!row)throw new ProductionConflictError('Only QC-pending Production Orders can complete');await this.audit.record({actorUserId:actor.userId,action:'production.order_completed',targetType:'production.order',targetId:orderId});return row}
}
function requireCapability(actor:ProductionActor,capability:string):void{if(!actor.permissions.includes(capability))throw new ForbiddenError('PRODUCTION_FORBIDDEN',`Missing permission: ${capability}`)}
