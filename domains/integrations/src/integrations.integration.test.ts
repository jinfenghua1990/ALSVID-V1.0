import assert from'node:assert/strict';import test from'node:test';import{randomUUID}from'node:crypto';import{Database}from'@alsvid/database';import{IntegrationConflictError,IntegrationValidationError,createIntegrationService}from'./index.js';
const hasDatabase=Boolean(process.env.DATABASE_URL);const suffix=()=>randomUUID().replaceAll('-','').slice(0,10).toUpperCase();const audit={async record():Promise<void>{}};type TestActor={userId:string;permissions:string[]};
async function actor(db:Database):Promise<TestActor>{const email=`commerce-${suffix().toLowerCase()}@example.com`;const row=await db.query<{id:string}>(`INSERT INTO identity.users(email,display_name,password_hash) VALUES ($1,'Commerce Test','x') RETURNING id`,[email]);return{userId:row.rows[0]!.id,permissions:['commerce.read','commerce.map','commerce.reconcile','integrations.ingest','integrations.replay','integrations.admin','partner.read','product.read']}}
async function sku(db:Database):Promise<string>{const key=suffix(),platform=await db.query<{id:string}>(`SELECT id FROM product.platforms WHERE code='FC'`),model=await db.query<{id:string}>(`INSERT INTO product.models(platform_id,code,name,status) VALUES ($1,$2,'Commerce Model','ACTIVE') RETURNING id`,[platform.rows[0]!.id,`CM${key}`]),variant=await db.query<{id:string}>(`INSERT INTO product.variants(model_id,code,name,status) VALUES ($1,'BASE','Base','ACTIVE') RETURNING id`,[model.rows[0]!.id]),row=await db.query<{id:string}>(`INSERT INTO product.skus(variant_id,sku,name,status) VALUES ($1,$2,'Commerce SKU','ACTIVE') RETURNING id`,[variant.rows[0]!.id,`SKU-${key}`]);return row.rows[0]!.id}
test('warehouse provider configuration is audited, permissioned, and never returns secret references',{skip:!hasDatabase},async()=>{
 const db=new Database();
 try{
  const auth=await actor(db),integrations=createIntegrationService(db,audit);
  const accountRef=`test-${suffix().toLowerCase()}`,secretRef=`projects/alsvid-prod-123/secrets/alsvid-wms-test-${suffix()}/versions/latest`;
  await assert.rejects(integrations.createWarehouseProviderConnection(auth,{providerCode:'TEST_WMS',displayName:'Test WMS',accountRef,credentialsSecretRef:'this-is-a-secret-value'}),IntegrationValidationError);
  await assert.rejects(integrations.createWarehouseProviderConnection(auth,{providerCode:'TEST_WMS',displayName:'Test WMS',accountRef:`other-${suffix().toLowerCase()}`,credentialsSecretRef:`projects/alsvid-prod-123/secrets/mail-api-key/versions/latest`}),IntegrationValidationError);
  const created=await integrations.createWarehouseProviderConnection(auth,{providerCode:'test_wms',displayName:'Test WMS',accountRef,credentialsSecretRef:secretRef});
  assert.equal(created.provider_code,'TEST_WMS');
  assert.equal(created.connection_status,'PENDING_REVIEW');
  assert.equal(created.credentials_configured,true);
  assert.equal('credentials_secret_ref' in created,false);
  const summary=await integrations.warehouseProviderSummary(auth);
  const connection=summary.connections.find((row:any)=>row.id===created.id);
  assert.ok(connection);
  assert.equal(connection.credentials_configured,true);
  assert.equal(connection.connection_status,'PENDING_REVIEW');
  assert.equal(JSON.stringify(summary).includes(secretRef),false);
  assert.deepEqual(summary.warehouseMappings,[]);
  assert.deepEqual(summary.skuMappings,[]);
  assert.deepEqual(summary.syncRuns,[]);
  await assert.rejects(integrations.warehouseProviderSummary({userId:auth.userId,permissions:['commerce.read']}),/Missing permission: integrations.admin/);
 }finally{await db.close()}
});

test('external warehouse and SKU mappings persist as pending until a provider validates them',{skip:!hasDatabase},async()=>{
 const db=new Database();
 try{
  const auth=await actor(db),commerce=createCommerceService(db,audit),integrations=createIntegrationService(db,audit,commerce),accountRef=`mapping-${suffix().toLowerCase()}`;
  const connection=await integrations.createWarehouseProviderConnection(auth,{providerCode:'TEST_WMS',displayName:'Test WMS',accountRef,credentialsSecretRef:`projects/alsvid-prod-123/secrets/alsvid-wms-map-${suffix()}/versions/latest`});
  const warehouseRow=await db.query<{id:string}>(`INSERT INTO warehouse.warehouses(code,name,country_code,timezone) VALUES ($1,'Mapping Test Warehouse','DE','Europe/Berlin') RETURNING id`,[`WMS-${suffix()}`]);
  const skuId=await sku(db);
  const warehouseMapping=await integrations.createExternalWarehouseMapping(auth,connection.id,{internalWarehouseId:warehouseRow.rows[0]!.id,externalWarehouseId:'ext-wh-001',externalCode:'EU-DE-01',externalName:'Germany 3PL'});
  assert.equal(warehouseMapping.mapping_status,'PENDING');
  const skuMapping=await integrations.createExternalSkuMapping(auth,connection.id,{internalSkuId:skuId,externalSku:'EXT-FC1',externalItemId:'item-001'});
  assert.equal(skuMapping.mapping_status,'PENDING');
  await assert.rejects(integrations.createExternalSkuMapping(auth,connection.id,{internalSkuId:skuId,externalSku:'EXT-FC1',externalItemId:'item-002'}),IntegrationConflictError);
  const summary=await integrations.warehouseProviderSummary(auth);
  assert.equal(summary.warehouseMappings.find((row:any)=>row.id===warehouseMapping.id).mapping_status,'PENDING');
  assert.equal(summary.skuMappings.find((row:any)=>row.id===skuMapping.id).mapping_status,'PENDING');
  assert.ok(summary.warehouseOptions.some((row:any)=>row.id===warehouseRow.rows[0]!.id));
  assert.ok(summary.skuOptions.some((row:any)=>row.id===skuId));
 }finally{await db.close()}
});
