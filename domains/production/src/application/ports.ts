import type{QueryExecutor}from'@alsvid/database';import type{CreateProductionOrderInput,ProductionDeviationInput,ProductionSummary,QcInspectionInput,QcResult}from'../core/model.js';
export interface ProductionActor{userId:string;permissions:readonly string[]}
export interface ProductionInventoryPort{postMovement(actor:ProductionActor,input:{movementType:'RECEIPT';itemKind:'SKU';itemId:string;quantity:string;unit:'EA';destinationLocationId:string;referenceType:string;referenceId:string;reason:string;idempotencyKey:string;correlationId:string},executor?:QueryExecutor):Promise<{id:string}>}
export interface ProductionAuditPort{record(input:{actorUserId:string;action:string;targetType:string;targetId:string;metadata?:Record<string,unknown>},executor?:QueryExecutor):Promise<void>}
export interface ProductionRepository{
 transaction<T>(work:(executor:QueryExecutor)=>Promise<T>):Promise<T>;
 summary():Promise<ProductionSummary>;
 lockFactoryOrder(orderId:string,executor:QueryExecutor):Promise<{id:string;status:string;planned_quantity:number;factory_partner_id:string;sku_id:string}|null>;
 verifyFactoryLocation(locationId:string,factoryId:string,executor:QueryExecutor):Promise<boolean>;
 receivedFactoryQuantity(orderId:string,executor:QueryExecutor):Promise<number>;
 addFactoryReceipt(orderId:string,locationId:string,quantity:number,movementId:string,actorUserId:string,executor:QueryExecutor):Promise<void>;
 createOrder(input:CreateProductionOrderInput&{actorUserId:string},executor?:QueryExecutor):Promise<any>;getStorefrontOrderProductionContext(orderId:string,factoryPartnerId:string,executor:QueryExecutor):Promise<{order:any|null;paymentEvidence:boolean;factoryValid:boolean;lines:any[];existing:any[]}>;advanceStorefrontOrderToFulfillment(orderId:string,userId:string,executor:QueryExecutor):Promise<boolean>;advanceStorefrontOrderToInProductionIfReady(orderLineId:string,userId:string,executor:QueryExecutor):Promise<{id:string;order_number:string}|null>;
 releaseOrder(orderId:string,userId:string,executor:QueryExecutor):Promise<any|null>;createUnits(orderId:string,count:number,userId:string,executor:QueryExecutor):Promise<void>;
 startOrder(orderId:string,userId:string):Promise<any|null>;markUnitAssembled(unitId:string,userId:string):Promise<any|null>;
 countUnitsBlockingQc(orderId:string,executor:QueryExecutor):Promise<number>;moveOrderToQc(orderId:string,userId:string,executor:QueryExecutor):Promise<any|null>;markAssembledUnitsQcPending(orderId:string,userId:string,executor:QueryExecutor):Promise<void>;
 lockUnit(unitId:string,executor:QueryExecutor):Promise<any|null>;setUnitStatus(unitId:string,status:string,userId:string,executor:QueryExecutor):Promise<void>;createInspection(unitId:string,input:QcInspectionInput,userId:string,executor:QueryExecutor):Promise<any>;
 recordDeviation(unitId:string,input:ProductionDeviationInput&{quantity:string},userId:string):Promise<any>;
 countUnitsNotQcPassed(orderId:string):Promise<number>;completeOrder(orderId:string,userId:string):Promise<any|null>;
}
