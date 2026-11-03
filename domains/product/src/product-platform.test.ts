import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './application/product-service.js';
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from './core/errors.js';
import type { ProductRepository, ProductAuditPort } from './application/ports.js';

const writer={userId:'00000000-0000-4000-8000-000000000001',permissions:['product.read','product.write']};
const reader={userId:writer.userId,permissions:['product.read']};
const platformId='00000000-0000-4000-8000-000000000002';
function setup() {
  let row={id:platformId,code:'FC',name:'Folding Carbon',description:'',status:'DRAFT' as 'DRAFT'|'ACTIVE'|'RETIRED',
    version:1,created_by:null,updated_by:null,created_at:'',updated_at:''};
  let linked=false;
  const events:string[]=[];
  const repository={
    createPlatform:async(input:{code:string;name:string;description:string})=>{
      row={...row,code:input.code,name:input.name,description:input.description,status:'DRAFT',version:1};
      return {...row};
    },
    updatePlatform:async(input:{expectedVersion:number;name:string|null;descriptionProvided:boolean;description:string;status:'DRAFT'|'ACTIVE'|'RETIRED'|null})=>{
      if(input.expectedVersion!==row.version || (input.status==='RETIRED' && linked))return null;
      row={...row,name:input.name??row.name,description:input.descriptionProvided?input.description:row.description,
        status:input.status??row.status,version:row.version+1};
      return {...row};
    },
    platformExists:async()=>true,
    platformHasUnretiredModels:async()=>linked,
  } as unknown as ProductRepository;
  const audit:ProductAuditPort={record:async(event)=>{events.push(event.action);}};
  return {service:new ProductService(repository,audit),events,setLinked:(flag:boolean)=>{linked=flag;}};
}

test('writing a new platform requires product.write, normalizes code, and audits create',async()=>{
  const {service,events}=setup();
  await assert.rejects(()=>service.createPlatform(reader,{code:' fc ',name:'Platform'}),/product.write/);
  const row=await service.createPlatform(writer,{code:' fc ',name:' Carbon folding ',description:' description '});
  assert.equal(row.code,'FC'); assert.equal(row.name,'Carbon folding'); assert.equal(row.status,'DRAFT');
  assert.deepEqual(events,['product.platform_created']);
});

test('invalid or empty platform master data is rejected before database writes',async()=>{
  const {service}=setup();
  await assert.rejects(()=>service.createPlatform(writer,{code:'F C',name:'Name'}),ProductValidationError);
  await assert.rejects(()=>service.createPlatform(writer,{code:'X',name:'   '}),ProductValidationError);
  await assert.rejects(()=>service.updatePlatform(writer,platformId,{expectedVersion:1,status:'INVALID' as 'DRAFT'}),ProductValidationError);
  await assert.rejects(()=>service.updatePlatform(writer,platformId,{expectedVersion:0}),ProductValidationError);
});

test('platform version checks protect concurrent edits and changed fields are audited',async()=>{
  const {service,events}=setup();
  const active=await service.updatePlatform(writer,platformId,{expectedVersion:1,name:'Folding carbon',status:'ACTIVE'});
  assert.equal(active.status,'ACTIVE'); assert.equal(active.version,2);
  await assert.rejects(()=>service.updatePlatform(writer,platformId,{expectedVersion:1,name:'Stale'}),ProductConflictError);
  assert.deepEqual(events,['product.platform_updated']);
});

test('non-retired related bike models prohibit platform archive; historical links are preserved',async()=>{
  const {service,setLinked}=setup();
  setLinked(true);
  await assert.rejects(()=>service.updatePlatform(writer,platformId,{expectedVersion:1,status:'RETIRED'}),ProductValidationError);
  setLinked(false);
  const archived=await service.updatePlatform(writer,platformId,{expectedVersion:1,status:'RETIRED'});
  assert.equal(archived.status,'RETIRED');
});

test('unknown platform gives not-found rather than silent success',async()=>{
  const {service}=setup();
  const repository={updatePlatform:async()=>null,platformExists:async()=>false} as unknown as ProductRepository;
  const audit:ProductAuditPort={record:async()=>{}};
  await assert.rejects(()=>new ProductService(repository,audit)
    .updatePlatform(writer,platformId,{expectedVersion:1,name:'Name'}),ProductNotFoundError);
});

test('platform repository SQL has optimistic lock, archive guard and active-platform bike lock',async()=>{
  const {PostgresProductRepository}=await import('./infrastructure/postgres-product-repository.js');
  const statements:string[]=[];
  const fakeDb={query:async(sql:string)=>{
    statements.push(sql);
    return {rows:sql.includes('INSERT INTO product.models')?[]:[{id:platformId,code:'FC',name:'FC',status:'ACTIVE',version:2}]};
  }};
  const repository=new PostgresProductRepository(fakeDb as never);
  await repository.updatePlatform({id:platformId,expectedVersion:1,name:null,status:'RETIRED',descriptionProvided:false,description:'',actorUserId:writer.userId});
  await repository.createModel({platformId,productTypeCode:'BIKE',code:'FC1',name:'Bike',description:'',actorUserId:writer.userId});
  assert.match(statements[0]!,/p\.version=\$2/);
  assert.match(statements[0]!,/m\.status <> 'RETIRED'/);
  assert.match(statements[1]!,/p\.status='ACTIVE'/);
  assert.match(statements[1]!,/FOR UPDATE OF p/);
  assert.match(statements[1]!,/product\.series/);
});
