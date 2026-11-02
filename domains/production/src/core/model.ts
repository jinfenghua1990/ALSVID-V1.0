export const ProductionCapability={Read:'production.read',Write:'production.write',Release:'production.release',QcInspect:'qc.inspect'} as const;
export type QcResult='PASS'|'FAIL'|'HOLD';
export interface CreateProductionOrderInput{buildSpecId:string;factoryPartnerId:string;sourcePurchaseOrderId?:string;plannedQuantity:number;plannedStartDate?:string;plannedCompletionDate?:string;note?:string;sourceStorefrontOrderLineId?:string}
export interface QcInspectionInput{result:QcResult;checklistCode?:string;checklist?:Record<string,unknown>;note?:string}
export interface ProductionDeviationInput{expectedPartId:string;actualPartId:string;quantity:string|number;serialNumber?:string;reason:string}
export interface ProductionSummary{orders:any[];units:any[];inspections:any[];deviations:any[];history:any[];factoryReceipts?:any[]}
