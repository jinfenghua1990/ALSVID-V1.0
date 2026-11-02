import assert from'node:assert/strict';import test from'node:test';import{randomUUID}from'node:crypto';import{CommerceConflictError,createCommerceService}from'./index.js';import{Database}from'@alsvid/database';
const hasDatabase=Boolean(process.env.DATABASE_URL);const suffix=()=>randomUUID().replaceAll('-','').slice(0,10).toUpperCase();const audit={async record():Promise<void>{}};type TestActor={userId:string;permissions:string[]};
async function actor(db:Database):Promise<TestActor>{const email=`commerce-map-${suffix().toLowerCase()}@example.com`;const row=await db.query<{id:string}>(`INSERT INTO identity.users(email,display_name,password_hash) VALUES ($1,'Commerce Map Test','x') RETURNING id`,[email]);return{userId:row.rows[0]!.id,permissions:['commerce.read','commerce.map','commerce.reconcile','integrations.ingest','partner.read','product.read']}}
async function partner(db:Database,role:'DEALER'|'CUSTOMER'):Promise<string>{const row=await db.query<{id:string}>(`INSERT INTO partners.partners(kind,display_name,country_code) VALUES ('ORGANIZATION',$1,'DE') RETURNING id`,[`${role} ${suffix()}`]);await db.query(`INSERT INTO partners.roles(partner_id,role) VALUES ($1,$2)`,[row.rows[0]!.id,role]);return row.rows[0]!.id}
test('Commerce Partner mappings enforce Partner roles and provider identity stays stable',{skip:!hasDatabase},async()=>{const db=new Database();try{const auth=await actor(db);const service=createCommerceService(db,audit);const dealer=await partner(db,'DEALER');const customer=await partner(db,'CUSTOMER');const channel=await service.createChannel(auth,{provider:'OTHER',channelKey:`ch-${suffix()}`,displayName:'External Channel Test',externalAccountId:`external-${suffix().toLowerCase()}`,defaultDealerPartnerId:dealer});const ingested=await service.ingestOrder(auth,channel.id,`EVENT-${suffix()}`,{externalOrderId:'3001',orderStatus:'OPEN',currency:'EUR',subtotalAmount:'10',totalAmount:'10',sourceUpdatedAt:'2026-10-10T10:00:00Z',lines:[{externalLineId:'LINE-3001',externalVariantId:'V3001',quantity:'1',unitPrice:'10'}]},db);const mapped=await service.mapOrderPartners(auth,ingested.order.id,{dealerPartnerId:dealer,customerPartnerId:customer});assert.equal(mapped.dealer_partner_id,dealer);assert.equal(mapped.customer_partner_id,customer);const invalid=await partner(db,'DEALER');await assert.rejects(service.mapOrderPartners(auth,ingested.order.id,{customerPartnerId:invalid}),CommerceConflictError);await assert.rejects(db.query(`UPDATE commerce.external_order_lines SET external_variant_id='MUTATED' WHERE order_id=$1`,[ingested.order.id]),/provider identity is immutable/)}finally{await db.close()}});

test('retired Shopify provider cannot be registered, including by direct Commerce API callers',{skip:!hasDatabase},async()=>{
 const db=new Database();
 try {
  const auth=await actor(db);
  const service=createCommerceService(db,audit);
  await assert.rejects(
   service.createChannel(auth,{provider:'SHOPIFY' as unknown as 'OTHER',channelKey:`retired-${suffix()}`,displayName:'Retired Channel',externalAccountId:'retired.example'}),
   /Provider retired or unsupported/,
  );
  await assert.rejects(
   service.createChannel(auth,{provider:'UNSUPPORTED' as 'OTHER',channelKey:`unknown-${suffix()}`,displayName:'Unknown Provider',externalAccountId:'unknown.example'}),
   /Provider retired or unsupported/,
  );
 } finally { await db.close(); }
});
