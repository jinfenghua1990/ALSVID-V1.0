import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './application/product-service.js';
import { ProductConflictError, ProductNotFoundError, ProductValidationError } from './core/errors.js';
import type { ProductRepository, ProductAuditPort } from './application/ports.js';
import type { ProductSeriesRow } from './core/model.js';

const writer={userId:'00000000-0000-4000-8000-000000000001',permissions:['product.read','product.write']};
const reader={userId:writer.userId,permissions:['product.read']};
const platformId='00000000-0000-4000-8000-000000000002';
const seriesId='7';

function setup(options:{platformActive?:boolean;duplicate?:boolean;linkedModels?:boolean}={}) {
  let row: ProductSeriesRow={id:seriesId,code:'FC',name_zh:'折叠系列',name_en:'Folding Series',status:'ACTIVE',default_platform_id:platformId};
  let platformActive=options.platformActive ?? true;
  let duplicate=options.duplicate ?? false;
  let linked=options.linkedModels ?? false;
  const events:string[]=[];
  const repository={
    transaction:async<T>(work:(executor:unknown)=>Promise<T>)=>work({query:async()=>({rows:[]})}),
    platformIsActive:async(id:string)=>platformActive && id===platformId,
    listSeries:async()=>[{...row}],
    createSeries:async(input:{code:string;nameZh:string;nameEn:string;status:ProductSeriesRow['status'];defaultPlatformId:string})=>{
      if(duplicate){const error:any=new Error('duplicate key');error.code='23505';throw error;}
      row={id:seriesId,code:input.code,name_zh:input.nameZh,name_en:input.nameEn,status:input.status,default_platform_id:input.defaultPlatformId};
      return {...row};
    },
    updateSeries:async(input:{id:string;nameZh:string|null;nameEn:string|null;status:'DRAFT'|'ACTIVE'|'RETIRED'|null;defaultPlatformId:string|null})=>{
      if(input.id!==seriesId)return null;
      if(input.status==='RETIRED' && linked)return null;
      row={...row,name_zh:input.nameZh??row.name_zh,name_en:input.nameEn??row.name_en,
        status:input.status??row.status,default_platform_id:input.defaultPlatformId??row.default_platform_id};
      return {...row};
    },
    seriesExists:async(id:string)=>id===seriesId,
    seriesHasUnretiredModels:async()=>linked,
  } as unknown as ProductRepository;
  const audit:ProductAuditPort={record:async(event)=>{events.push(event.action);}};
  return {
    service:new ProductService(repository,audit),events,repository,
    setPlatformActive:(flag:boolean)=>{platformActive=flag;},
    setLinked:(flag:boolean)=>{linked=flag;},
  };
}

test('creating a series requires product.write, normalizes the code and audits the write',async()=>{
  const {service,events}=setup();
  await assert.rejects(()=>service.createSeries(reader,{code:'fc',nameZh:'折叠系列',nameEn:'Folding Series',defaultPlatformId:platformId}),/product.write/);
  const row=await service.createSeries(writer,{code:' fc ',nameZh:' 折叠系列 ',nameEn:' Folding Series ',defaultPlatformId:platformId});
  assert.equal(row.code,'FC');
  assert.equal(row.name_zh,'折叠系列');
  assert.equal(row.status,'ACTIVE');
  assert.deepEqual(events,['product.series_created']);
});

test('series master data is validated before any database write',async()=>{
  const {service}=setup();
  await assert.rejects(()=>service.createSeries(writer,{code:'F C',nameZh:'系列',nameEn:'Series',defaultPlatformId:platformId}),ProductValidationError);
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'   ',nameEn:'Series',defaultPlatformId:platformId}),ProductValidationError);
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'系列',nameEn:'',defaultPlatformId:platformId}),ProductValidationError);
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'系列',nameEn:'Series',status:'RETIRED',defaultPlatformId:platformId}),ProductValidationError);
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'系列',nameEn:'Series',defaultPlatformId:'not-a-uuid'}),ProductValidationError);
});

test('a series may only point at an existing ACTIVE engineering platform',async()=>{
  const {service,setPlatformActive}=setup({platformActive:false});
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'折叠系列',nameEn:'Folding Series',defaultPlatformId:platformId}),
    /ACTIVE/);
  setPlatformActive(true);
  await assert.doesNotReject(()=>service.createSeries(writer,{code:'FC',nameZh:'折叠系列',nameEn:'Folding Series',defaultPlatformId:platformId}));
});

test('duplicate series codes are reported as a conflict, not a raw database error',async()=>{
  const {service}=setup({duplicate:true});
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'折叠系列',nameEn:'Folding Series',defaultPlatformId:platformId}),
    ProductConflictError);
});

test('series updates reject empty payloads and malformed identifiers',async()=>{
  const {service}=setup();
  await assert.rejects(()=>service.updateSeries(writer,seriesId,{}),ProductValidationError);
  await assert.rejects(()=>service.updateSeries(writer,'7;drop',{nameZh:'折叠系列'}),ProductValidationError);
  await assert.rejects(()=>service.updateSeries(writer,seriesId,{status:'INVALID' as 'DRAFT'}),ProductValidationError);
});

test('linked bike models block archiving a series and unknown series give not-found',async()=>{
  const {service,setLinked}=setup();
  setLinked(true);
  await assert.rejects(()=>service.updateSeries(writer,seriesId,{status:'RETIRED'}),ProductValidationError);
  setLinked(false);
  const archived=await service.updateSeries(writer,seriesId,{status:'RETIRED'});
  assert.equal(archived.status,'RETIRED');
  await assert.rejects(()=>service.updateSeries(writer,'999',{nameZh:'不存在'}),ProductNotFoundError);
});

test('an audit failure aborts the series write instead of leaving an unlogged change',async()=>{
  const {repository}=setup();
  const failingAudit:ProductAuditPort={record:async()=>{throw new Error('audit unavailable');}};
  const service=new ProductService(repository,failingAudit);
  await assert.rejects(()=>service.createSeries(writer,{code:'FC',nameZh:'折叠系列',nameEn:'Folding Series',defaultPlatformId:platformId}),
    /audit unavailable/);
});

test('series repository SQL keeps the archive guard and never rewrites the immutable code',async()=>{
  const {PostgresProductRepository}=await import('./infrastructure/postgres-product-repository.js');
  const statements:string[]=[];
  const fakeDb={query:async(sql:string)=>{
    statements.push(sql);
    return {rows:[{id:seriesId,code:'FC',name_zh:'折叠系列',name_en:'Folding Series',status:'ACTIVE',default_platform_id:platformId}]};
  }};
  const repository=new PostgresProductRepository(fakeDb as never);
  await repository.createSeries({code:'FC',nameZh:'折叠系列',nameEn:'Folding Series',status:'ACTIVE',defaultPlatformId:platformId,actorUserId:writer.userId});
  await repository.updateSeries({id:seriesId,nameZh:'折叠系列',nameEn:null,status:'RETIRED',defaultPlatformId:null,actorUserId:writer.userId});
  const [insert,update]=statements;
  assert.match(insert!,/INSERT INTO product\.series\(code,name_zh,name_en,status,default_platform_id\)/);
  assert.doesNotMatch(update!,/SET[\s\S]*\bcode\s*=/);
  assert.match(update!,/NOT EXISTS \(SELECT 1 FROM product\.models m/);
  assert.match(update!,/RETURNING series_id AS id/);
});
