export const IntegrationCapability={Admin:'integrations.admin'} as const;

export type WarehouseProviderConnectionStatus='NOT_CONFIGURED'|'PENDING_REVIEW'|'CONNECTED'|'ERROR'|'PAUSED';
export type WarehouseProviderMappingStatus='PENDING'|'VERIFIED'|'REJECTED'|'INACTIVE';
export type WarehouseProviderSyncStatus='QUEUED'|'RUNNING'|'SUCCEEDED'|'PARTIAL'|'FAILED'|'CANCELLED';
export interface CreateWarehouseProviderConnectionInput {
  providerCode:string;
  displayName:string;
  accountRef:string;
  credentialsSecretRef?:string;
}

export interface CreateExternalWarehouseMappingInput {
  internalWarehouseId:string;
  externalWarehouseId:string;
  externalCode:string;
  externalName:string;
}
export interface CreateExternalSkuMappingInput {
  internalSkuId:string;
  externalSku:string;
  externalItemId:string;
}
