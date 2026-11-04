import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryExecutor } from '@alsvid/database';
import { ServiceCaseService } from './application/service-case-service.js';
import { ServiceCaseConflictError,ServiceCaseValidationError,ServiceCaseNotFoundError } from './core/errors.js';
import type { ServiceCase,ServiceCaseHistory,ServiceCaseStatus,ServiceActivity } from './core/model.js';
import type { ServiceCaseActor,ServiceCaseRepository,ServiceCaseAuditPort } from './application/ports.js';

const internal:ServiceCaseActor={userId:'11111111-1111-4111-8111-111111111111',roles:['internal_user','service_agent'],permissions:['service.read','service.write']};
const viewer:ServiceCaseActor={...internal,permissions:['service.read']};
const outside:ServiceCaseActor={...internal,roles:['dealer_user']};
const vehicleId='22222222-2222-4222-8222-222222222222';
const caseId='33333333-3333-4333-8333-333333333333';
const ownerUser='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerActor:ServiceCaseActor={userId:ownerUser,roles:['customer_user'],permissions:[]};

function fixture() {
 let current:ServiceCase|null=null;
 const logs:ServiceCaseHistory[]=[];
 const activities:ServiceActivity[]=[];
 const submissions=new Map<string,{vehicleId:string;caseId:string;category:'ISSUE'|'WARRANTY_REVIEW'|'REPAIR_REQUEST';title:string;description:string}>();
 let ownerEnabled=true;
 const audits:string[]=[];
 const executor={} as QueryExecutor;
 const repo:ServiceCaseRepository={
  transaction:async run=>run(executor),
  list:async()=>current?[current]:[],
  get:async()=>current,
  history:async()=>logs,
  activities:async()=>activities,
  ownerCases:async()=>[],
  vehicleExists:async id=>id===vehicleId,
  ownerVehicleAccessible:async(user,id)=>ownerEnabled&&user===ownerUser&&id===vehicleId,
  findOwnerSubmission:async(user,requestId)=>submissions.get(user+':'+requestId)??null,
  recordOwnerSubmission:async(user,requestId,id,cid,payload)=>{submissions.set(user+':'+requestId,{vehicleId:id,caseId:cid,...payload});},
  create:async(input,actor)=>{
   current={id:caseId,caseNumber:'SR-00000001',vehicleId:input.vehicleId,frameNumber:'FC1-001',sku:'FC1',
    category:input.category,title:input.title,description:input.description??'',status:'NEW',
    source:actor===ownerUser?'OWNER':'INTERNAL',version:1,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
   assert.ok(actor===internal.userId||actor===ownerUser);
   return current;
  },
  lockedCase:async()=>current,
  transition:async(_id,_version,_from,to)=>{
   if(!current)throw Error('missing');
   current={...current,status:to,version:current.version+1};
   return current;
  },
  findActivityByRequest:async(_id,requestId)=>activities.find(a=>a.clientRequestId===requestId)??null,
  createActivity:async(_id,input,actor)=>{
    const row:ServiceActivity={
      id:'55555555-5555-4555-8555-555555555555',
      caseId,clientRequestId:input.clientRequestId,kind:input.kind,note:input.note,
      laborMinutes:input.laborMinutes??null,assessment:input.assessment??null,
      actorUserId:actor,occurredAt:'2026-10-01T00:00:00Z',
    };
    activities.push(row);return row;
  },
  recordHistory:async(row)=>{
   logs.push({id:String(logs.length+1),caseId:row.caseId,fromStatus:row.fromStatus,toStatus:row.toStatus,
    caseVersion:row.caseVersion,reason:row.reason,actorUserId:row.actorId,occurredAt:'2026-10-01T00:00:00Z'});
  },
 };
 const audit:ServiceCaseAuditPort={record:async row=>{audits.push(row.action);}};
 return {service:new ServiceCaseService(repo,audit),logs,audits,activities,submissions,disableOwner:()=>{ownerEnabled=false;}};
}
const input={vehicleId,category:'ISSUE' as const,title:'刹车存在持续异响',description:'等待技术检查'};
test('internal agent creates service case with immutable first history and audit',async()=>{
 const f=fixture();
 const record=await f.service.create(internal,input);
 assert.equal(record.status,'NEW');
 assert.equal(record.vehicleId,vehicleId);
 assert.equal(f.logs[0]?.toStatus,'NEW');
 assert.equal(f.logs[0]?.caseVersion,1);
 assert.deepEqual(f.audits,['service.case_created']);
});
test('unverified or missing vehicles and malformed titles cannot create cases',async()=>{
 const f=fixture();
 await assert.rejects(f.service.create(internal,{...input,title:'x'}),ServiceCaseValidationError);
 await assert.rejects(f.service.create(internal,{...input,vehicleId:'44444444-4444-4444-8444-444444444444'}),ServiceCaseNotFoundError);
 assert.equal(f.logs.length,0);
});
test('transition preserves chronological history and rejects stale versions and illegal steps',async()=>{
 const f=fixture();
 await f.service.create(internal,input);
 await assert.rejects(f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'CLOSED',reason:'跳过流程'}),ServiceCaseConflictError);
 const result=await f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'TRIAGED',reason:'已经核验车辆故障'});
 assert.equal(result.version,2);
 assert.equal(f.logs.at(-1)?.fromStatus,'NEW');
 assert.equal(f.logs.at(-1)?.toStatus,'TRIAGED');
 assert.deepEqual(f.audits,['service.case_created','service.case_status_changed']);
 await assert.rejects(f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'IN_PROGRESS',reason:'并发修改'}),ServiceCaseConflictError);
 await assert.rejects(f.service.transition(internal,caseId,{expectedVersion:2,toStatus:'IN_PROGRESS',reason:'x'}),ServiceCaseValidationError);
});
test('read-only and external role users cannot write or read restricted service cases',async()=>{
 const f=fixture();
 await assert.rejects(f.service.create(viewer,input),{code:'SERVICE_CASE_FORBIDDEN'});
 await assert.rejects(f.service.list(outside),{code:'SERVICE_CASE_INTERNAL_ONLY'});
 await assert.rejects(f.service.create(outside,input),{code:'SERVICE_CASE_INTERNAL_ONLY'});
});
test('resolved case can reopen; closed case is terminal',async()=>{
 const f=fixture();
 await f.service.create(internal,input);
 const steps:ServiceCaseStatus[]=['TRIAGED','IN_PROGRESS','RESOLVED','IN_PROGRESS','RESOLVED','CLOSED'];
 let version=1;
 for(const toStatus of steps){
  const row=await f.service.transition(internal,caseId,{expectedVersion:version,toStatus,reason:'真实处理流程记录'});
  version=row.version;
 }
 assert.equal(f.logs.length,7);
 await assert.rejects(f.service.transition(internal,caseId,{expectedVersion:version,toStatus:'IN_PROGRESS',reason:'尝试重启已关闭工单'}),ServiceCaseConflictError);
});

const activityId='66666666-6666-4666-8666-666666666666';
test('append-only diagnosis evidence is audited, idempotent and disallows payload reuse',async()=>{
 const f=fixture();
 await f.service.create(internal,input);
 await f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'TRIAGED',reason:'检查进入分诊'});
 const evidence={clientRequestId:activityId,kind:'DIAGNOSIS' as const,note:'刹车系统出现可复现异响'};
 const saved=await f.service.recordActivity(internal,caseId,evidence);
 assert.equal(saved.kind,'DIAGNOSIS');
 assert.equal(f.activities.length,1);
 assert.equal(f.audits.at(-1),'service.case_activity_recorded');
 const again=await f.service.recordActivity(internal,caseId,evidence);
 assert.equal(again.id,saved.id);
 assert.equal(f.activities.length,1);
 assert.equal(f.audits.filter(a=>a==='service.case_activity_recorded').length,1);
 await assert.rejects(f.service.recordActivity(internal,caseId,{...evidence,note:'新故障信息与原请求不同'}),ServiceCaseConflictError);
});
test('repair labor only while in progress; no WMS or inventory changes',async()=>{
 const f=fixture();
 await f.service.create(internal,input);
 await f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'TRIAGED',reason:'进行技师分诊'});
 await assert.rejects(f.service.recordActivity(internal,caseId,{clientRequestId:activityId,kind:'REPAIR_NOTE',note:'进行了刹车卡钳安装复查',laborMinutes:20}),ServiceCaseConflictError);
 await f.service.transition(internal,caseId,{expectedVersion:2,toStatus:'IN_PROGRESS',reason:'开始维修作业'});
 const saved=await f.service.recordActivity(internal,caseId,{clientRequestId:activityId,kind:'REPAIR_NOTE',note:'进行了刹车卡钳安装复查',laborMinutes:20});
 assert.equal(saved.laborMinutes,20);
 await assert.rejects(f.service.recordActivity(internal,caseId,{clientRequestId:'77777777-7777-4777-8777-777777777777',kind:'REPAIR_NOTE',note:'工作分钟不合法',laborMinutes:-5}),ServiceCaseValidationError);
 await f.service.transition(internal,caseId,{expectedVersion:3,toStatus:'RESOLVED',reason:'维修已完成待确认'});
 await assert.rejects(f.service.recordActivity(internal,caseId,{clientRequestId:'88888888-8888-4888-8888-888888888888',kind:'DIAGNOSIS',note:'结案后试图插入诊断内容'}),ServiceCaseConflictError);
});
test('preliminary warranty assessment requires separate permission and cannot approve final warranty',async()=>{
 const f=fixture();
 await f.service.create(internal,input);
 await f.service.transition(internal,caseId,{expectedVersion:1,toStatus:'TRIAGED',reason:'进入保修资料审核'});
 const sample={clientRequestId:activityId,kind:'WARRANTY_ASSESSMENT' as const,
  note:'仍待验证实际交付日期与保修政策',assessment:'EVIDENCE_REQUIRED' as const};
 await assert.rejects(f.service.recordActivity(internal,caseId,sample),{code:'SERVICE_CASE_FORBIDDEN'});
 const reviewer={...internal,permissions:[...internal.permissions,'service.warranty.review']};
 const saved=await f.service.recordActivity(reviewer,caseId,sample);
 assert.equal(saved.assessment,'EVIDENCE_REQUIRED');
 await assert.rejects(f.service.recordActivity(reviewer,caseId,{
  ...sample,clientRequestId:'99999999-9999-4999-8999-999999999999',assessment:'APPROVED' as never,
 }),ServiceCaseValidationError);
 await assert.rejects(f.service.recordActivity(outside,caseId,sample),{code:'SERVICE_CASE_INTERNAL_ONLY'});
});

test('verified owner can submit case and retry same request without double-writing or audit',async()=>{
 const f=fixture();
 const input={vehicleId,clientRequestId:'88888888-8888-4888-8888-888888888888',category:'ISSUE' as const,
  title:'车辆制动检查申请',description:'后制动发生间歇异响'};
 const first=await f.service.ownerCreateCase(ownerActor,input);
 assert.deepEqual(first,{id:caseId,caseNumber:'SR-00000001',vehicleId,status:'NEW'});
 assert.equal(f.submissions.size,1);
 assert.equal(f.audits.filter(a=>a==='service.owner_case_created').length,1);
 const retry=await f.service.ownerCreateCase(ownerActor,input);
 assert.deepEqual(retry,first);
 assert.equal(f.audits.filter(a=>a==='service.owner_case_created').length,1);
 await assert.rejects(f.service.ownerCreateCase(ownerActor,{...input,title:'另一份售后申请'}),ServiceCaseConflictError);
});

test('owner submissions reject unowned VIN, dealer role and revoked access',async()=>{
 const f=fixture();
 const input={vehicleId,clientRequestId:'88888888-8888-4888-8888-888888888888',category:'REPAIR_REQUEST' as const,
  title:'车架部分需要检修'};
 await assert.rejects(f.service.ownerCreateCase({...ownerActor,userId:'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},input),ServiceCaseNotFoundError);
 await assert.rejects(f.service.ownerCreateCase({...ownerActor,roles:['dealer_user']},input),{code:'MY_SERVICE_FORBIDDEN'});
 f.disableOwner();
 await assert.rejects(f.service.ownerCreateCase(ownerActor,input),ServiceCaseNotFoundError);
 assert.equal(f.submissions.size,0);
 assert.equal(f.audits.length,0);
});

test('case listing marks owner submissions apart from internal registrations',async()=>{
 const {PostgresServiceCaseRepository}=await import('./infrastructure/postgres-service-case-repository.js');
 const statements:string[]=[];
 const fakeDb={query:async(sql:string)=>{
  statements.push(sql);
  return {rows:[{id:'11111111-1111-4111-8111-111111111111',case_number:'SR-00000001',
   vehicle_id:'22222222-2222-4222-8222-222222222222',frame_number:'FC1-001',sku:'FC1',
   category:'ISSUE',title:'制动异响',description:'',status:'NEW',source:'OWNER',version:1,
   created_at:new Date('2026-10-01T00:00:00Z'),updated_at:new Date('2026-10-01T00:00:00Z')}]};
 }};
 const repository=new PostgresServiceCaseRepository(fakeDb as never);
 const [row]=await repository.list();
 assert.equal(row?.source,'OWNER');
 assert.match(statements[0]!,/LEFT JOIN service\.owner_submission_requests o ON o\.case_id=c\.id/);
});
