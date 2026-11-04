import type { DatabasePort, QueryExecutor } from '@alsvid/database';
import type { CreateServiceCaseInput, ServiceCase, ServiceCaseHistory, ServiceCaseStatus, ServiceCaseCategory, ServiceCaseSource, OwnerServiceCase, ServiceActivity, RecordServiceActivityInput, PreliminaryWarrantyAssessment, ServiceActivityKind } from '../core/model.js';
import { ServiceCaseConflictError } from '../core/errors.js';
import type { ServiceCaseRepository } from '../application/ports.js';

type CaseRow = {
 id:string;case_number:string;vehicle_id:string;frame_number:string;sku:string;
 category:ServiceCase['category'];title:string;description:string;status:ServiceCaseStatus;
 source:ServiceCaseSource;version:number;created_at:Date;updated_at:Date;
};
type HistoryRow = {
 id:string;case_id:string;from_status:ServiceCaseStatus|null;to_status:ServiceCaseStatus;
 case_version:number;actor_user_id:string;reason:string;occurred_at:Date;
};
type ActivityRow={
 id:string;case_id:string;client_request_id:string;kind:ServiceActivityKind;note:string;
 labor_minutes:number|null;assessment:PreliminaryWarrantyAssessment|null;actor_user_id:string;occurred_at:Date;
};
function mapActivity(row:ActivityRow):ServiceActivity {
 return {
  id:row.id,caseId:row.case_id,clientRequestId:row.client_request_id,kind:row.kind,
  note:row.note,laborMinutes:row.labor_minutes,assessment:row.assessment,
  actorUserId:row.actor_user_id,occurredAt:row.occurred_at.toISOString()
 };
}
const selectActivity='SELECT id,case_id,client_request_id,kind,note,labor_minutes,assessment,actor_user_id,occurred_at FROM service.case_activities';
// The owner submission row is the only proof that a case came from My ALSVID; a case
// without it was registered by internal staff.
const selectCases = `SELECT c.*,v.frame_number,s.sku,
  CASE WHEN o.id IS NULL THEN 'INTERNAL' ELSE 'OWNER' END AS source
  FROM service.cases c
  JOIN vehicle.vehicles v ON v.id=c.vehicle_id
  JOIN product.skus s ON s.id=v.sku_id
  LEFT JOIN service.owner_submission_requests o ON o.case_id=c.id`;
function mapCase(row:CaseRow):ServiceCase {
  return {
    id:row.id,caseNumber:row.case_number,vehicleId:row.vehicle_id,
    frameNumber:row.frame_number,sku:row.sku,category:row.category,
    title:row.title,description:row.description,status:row.status,
    source:row.source ?? 'INTERNAL',
    version:row.version,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()
  };
}
export class PostgresServiceCaseRepository implements ServiceCaseRepository {
 constructor(private readonly db:DatabasePort){}
 transaction<T>(fn:(e:QueryExecutor)=>Promise<T>):Promise<T>{return this.db.transaction(fn);}
 async list():Promise<ServiceCase[]>{
  const r=await this.db.query<CaseRow>(selectCases+' ORDER BY c.created_at DESC,c.id DESC LIMIT 200');
  return r.rows.map(mapCase);
 }
 async get(id:string,e:QueryExecutor=this.db):Promise<ServiceCase|null>{
  const r=await e.query<CaseRow>(selectCases+' WHERE c.id=$1',[id]);
  return r.rows[0]?mapCase(r.rows[0]):null;
 }
 async history(caseId:string):Promise<ServiceCaseHistory[]>{
  const r=await this.db.query<HistoryRow>(
   'SELECT id,case_id,from_status,to_status,case_version,actor_user_id,reason,occurred_at FROM service.case_history WHERE case_id=$1 ORDER BY case_version ASC',[caseId]);
  return r.rows.map(row=>({id:row.id,caseId:row.case_id,fromStatus:row.from_status,toStatus:row.to_status,caseVersion:row.case_version,actorUserId:row.actor_user_id,reason:row.reason,occurredAt:row.occurred_at.toISOString()}));
 }
 async ownerCases(userId:string):Promise<OwnerServiceCase[]>{
  // Projection only: Service never changes Vehicle ownership truth. Latest immutable owner event controls scope.
  const r=await this.db.query<{
    id:string;case_number:string;vehicle_id:string;title:string;status:ServiceCaseStatus;
    created_at:Date;updated_at:Date;
   }>(`SELECT c.id,c.case_number,c.vehicle_id,c.title,c.status,c.created_at,c.updated_at
     FROM service.cases c JOIN LATERAL (
       SELECT customer_user_id,event_kind,occurred_at FROM vehicle.owner_access_events
       WHERE vehicle_id=c.vehicle_id ORDER BY event_no DESC LIMIT 1
     ) owner ON true
     JOIN identity.users u ON u.id=owner.customer_user_id AND u.status='ACTIVE'
     WHERE owner.event_kind='GRANTED' AND owner.customer_user_id=$1
       -- Free-text service titles can include previous owners' private details.
       -- New owners see cases from their *current* grant period only.
       AND c.created_at >= owner.occurred_at
       AND EXISTS(SELECT 1 FROM identity.user_roles ur WHERE ur.user_id=u.id AND ur.role_id='customer_user')
     ORDER BY c.created_at DESC,c.id DESC LIMIT 200`,[userId]);
  return r.rows.map(row=>({id:row.id,caseNumber:row.case_number,vehicleId:row.vehicle_id,
   title:row.title,status:row.status,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString()}));
 }
 async activities(caseId:string):Promise<ServiceActivity[]> {
  const r=await this.db.query<ActivityRow>(selectActivity+' WHERE case_id=$1 ORDER BY occurred_at ASC,id ASC',[caseId]);
  return r.rows.map(mapActivity);
 }
 async findActivityByRequest(caseId:string,requestId:string,e:QueryExecutor):Promise<ServiceActivity|null> {
  const r=await e.query<ActivityRow>(selectActivity+' WHERE case_id=$1 AND client_request_id=$2',[caseId,requestId]);
  return r.rows[0]?mapActivity(r.rows[0]):null;
 }
 async createActivity(caseId:string,input:RecordServiceActivityInput,actorId:string,e:QueryExecutor):Promise<ServiceActivity|null> {
  const r=await e.query<ActivityRow>(
   'INSERT INTO service.case_activities(case_id,client_request_id,kind,note,labor_minutes,assessment,actor_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(case_id,client_request_id) DO NOTHING RETURNING id,case_id,client_request_id,kind,note,labor_minutes,assessment,actor_user_id,occurred_at',
   [caseId,input.clientRequestId,input.kind,input.note,input.laborMinutes??null,input.assessment??null,actorId]);
  return r.rows[0]?mapActivity(r.rows[0]):null;
 }
 async vehicleExists(vehicleId:string,e:QueryExecutor):Promise<boolean>{
  const r=await e.query('SELECT id FROM vehicle.vehicles WHERE id=$1',[vehicleId]);
  return r.rowCount!==null&&r.rowCount>0;
 }

 async ownerVehicleAccessible(userId:string,vehicleId:string,e:QueryExecutor):Promise<boolean>{
  // Vehicle row lock serializes submission with any verified owner grant/revoke.
  // Current owner is always derived from the newest immutable Vehicle owner event.
  const r=await e.query(`SELECT v.id FROM vehicle.vehicles v
   JOIN LATERAL(SELECT customer_user_id,event_kind FROM vehicle.owner_access_events
     WHERE vehicle_id=v.id ORDER BY event_no DESC LIMIT 1) owner ON true
   JOIN identity.users u ON u.id=owner.customer_user_id AND u.status='ACTIVE'
   WHERE v.id=$1 AND owner.event_kind='GRANTED' AND owner.customer_user_id=$2
    AND EXISTS(SELECT 1 FROM identity.user_roles ur WHERE ur.user_id=u.id AND ur.role_id='customer_user')
   FOR UPDATE OF v`,[vehicleId,userId]);
  return r.rowCount===1;
 }
 async findOwnerSubmission(userId:string,clientRequestId:string,e:QueryExecutor):Promise<{vehicleId:string;caseId:string;category:ServiceCaseCategory;title:string;description:string}|null>{
  const r=await e.query<{vehicle_id:string;case_id:string;payload:{category:ServiceCaseCategory;title:string;description:string}}>(
    'SELECT vehicle_id,case_id,payload FROM service.owner_submission_requests WHERE customer_user_id=$1 AND client_request_id=$2',
    [userId,clientRequestId]);
  const row=r.rows[0];return row?{vehicleId:row.vehicle_id,caseId:row.case_id,category:row.payload.category,title:row.payload.title,description:row.payload.description}:null;
 }
 async recordOwnerSubmission(userId:string,clientRequestId:string,vehicleId:string,caseId:string,payload:{category:ServiceCaseCategory;title:string;description:string},e:QueryExecutor):Promise<void>{
  await e.query('INSERT INTO service.owner_submission_requests(customer_user_id,client_request_id,vehicle_id,case_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
   [userId,clientRequestId,vehicleId,caseId,JSON.stringify(payload)]);
 }
 async create(input:CreateServiceCaseInput,actorId:string,e:QueryExecutor):Promise<ServiceCase>{
  const r=await e.query<{id:string}>('INSERT INTO service.cases(vehicle_id,category,title,description,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING id',
   [input.vehicleId,input.category,input.title,input.description??'',actorId]);
  const row=r.rows[0];
  if(!row)throw new Error('Service case creation returned no identity');
  const saved=await this.get(row.id,e);
  if(!saved)throw new Error('Service case missing immediately after creation');
  return saved;
 }
 async lockedCase(id:string,e:QueryExecutor):Promise<ServiceCase|null>{
  const r=await e.query<CaseRow>(selectCases+' WHERE c.id=$1 FOR UPDATE OF c',[id]);
  return r.rows[0]?mapCase(r.rows[0]):null;
 }
 async transition(id:string,expectedVersion:number,fromStatus:ServiceCaseStatus,toStatus:ServiceCaseStatus,actorId:string,e:QueryExecutor):Promise<ServiceCase>{
  const r=await e.query<{id:string}>(
   'UPDATE service.cases SET status=$4,version=version+1,updated_by=$5,updated_at=now() WHERE id=$1 AND version=$2 AND status=$3 RETURNING id',
   [id,expectedVersion,fromStatus,toStatus,actorId]);
  if(r.rowCount!==1)throw new ServiceCaseConflictError('Service case changed; reload and retry');
  const saved=await this.get(id,e);
  if(!saved)throw new Error('Updated service case missing');
  return saved;
 }
 async recordHistory(input:{caseId:string;fromStatus:ServiceCaseStatus|null;toStatus:ServiceCaseStatus;caseVersion:number;actorId:string;reason:string},e:QueryExecutor):Promise<void>{
  await e.query('INSERT INTO service.case_history(case_id,from_status,to_status,case_version,actor_user_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
    [input.caseId,input.fromStatus,input.toStatus,input.caseVersion,input.actorId,input.reason]);
 }
}
