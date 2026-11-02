import type{CreateExternalSkuMappingInput,CreateExternalWarehouseMappingInput,CreateWarehouseProviderConnectionInput}from'../core/model.js';
export interface IntegrationActor{userId:string;permissions:readonly string[]}
export interface IntegrationAuditPort{record(input:{actorUserId:string;action:string;targetType:string;targetId:string;metadata?:Record<string,unknown>}):Promise<void>}
// Read-only historical delivery evidence is retained for audit integrity.
export interface IntegrationRepository{
 summary():Promise<any>;
 warehouseProviderSummary():Promise<any>;
 createWarehouseProviderConnection(input:CreateWarehouseProviderConnectionInput & {connectionStatus:'NOT_CONFIGURED'|'PENDING_REVIEW';actorUserId:string}):Promise<any>;
 createExternalWarehouseMapping(input:CreateExternalWarehouseMappingInput & {connectionId:string;actorUserId:string}):Promise<any>;
 createExternalSkuMapping(input:CreateExternalSkuMappingInput & {connectionId:string;actorUserId:string}):Promise<any>;
 setCursor(input:{channelId:string;cursorKey:string;cursorValue:string;sourceUpdatedAt:string|null;actorUserId:string}):Promise<any>;
}
