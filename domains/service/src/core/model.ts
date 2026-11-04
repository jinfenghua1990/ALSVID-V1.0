export const ServiceCaseCapabilities = { Read: 'service.read', Write: 'service.write' } as const;
export const ServiceCaseStatuses = ['NEW','TRIAGED','IN_PROGRESS','RESOLVED','CLOSED'] as const;
export type ServiceCaseStatus = (typeof ServiceCaseStatuses)[number];
export type ServiceCaseCategory = 'ISSUE'|'WARRANTY_REVIEW'|'REPAIR_REQUEST';
/** OWNER = submitted by the verified owner through My ALSVID; INTERNAL = registered by staff. */
export type ServiceCaseSource = 'OWNER'|'INTERNAL';
export interface ServiceCase {
  id: string;
  caseNumber: string;
  vehicleId: string;
  frameNumber: string;
  sku: string;
  category: ServiceCaseCategory;
  title: string;
  description: string;
  status: ServiceCaseStatus;
  source: ServiceCaseSource;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ServiceCaseHistory {
 id: string; caseId: string; fromStatus: ServiceCaseStatus|null; toStatus: ServiceCaseStatus;
 caseVersion: number; actorUserId: string; reason: string; occurredAt: string;
}
export type CreateServiceCaseInput = { vehicleId: string; category: ServiceCaseCategory; title: string; description?: string };
export type TransitionServiceCaseInput = { expectedVersion: number; toStatus: ServiceCaseStatus; reason: string };

export interface OwnerServiceCase {
 id:string;caseNumber:string;vehicleId:string;title:string;status:ServiceCaseStatus;
 createdAt:string;updatedAt:string;
}
export type ServiceActivityKind = 'DIAGNOSIS'|'REPAIR_NOTE'|'WARRANTY_ASSESSMENT';
export type PreliminaryWarrantyAssessment = 'EVIDENCE_REQUIRED'|'POSSIBLY_COVERED'|'POSSIBLY_EXCLUDED';
export interface ServiceActivity {
 id:string; caseId:string; clientRequestId:string; kind:ServiceActivityKind;
 note:string; laborMinutes:number|null; assessment:PreliminaryWarrantyAssessment|null;
 actorUserId:string; occurredAt:string;
}
export interface RecordServiceActivityInput {
 clientRequestId:string; kind:ServiceActivityKind; note:string;
 laborMinutes?:number; assessment?:PreliminaryWarrantyAssessment;
}

/** Customer-submitted case intake is tied to verified current Vehicle owner access. */
export type OwnerServiceSubmissionInput = CreateServiceCaseInput & {clientRequestId:string};
