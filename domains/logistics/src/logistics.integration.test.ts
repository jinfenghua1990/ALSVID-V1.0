import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import { createInventoryService } from '@alsvid/inventory';
import { LogisticsConflictError, createLogisticsService } from './index.js';

const hasDatabase=Boolean(process.env.DATABASE_URL);
const suffix=()=>randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
const audit={async record():Promise<void>{}};
type TestActor={userId:string;permissions:string[]};

async function actor(db:Database):Promise<TestActor>{
  const email=`logistics-${suffix().toLowerCase()}@example.com`;
  const user=await db.query<{id:string}>(`INSERT INTO identity.users(email,display_name,password_hash) VALUES ($1,'Logistics Test','x') RETURNING id`,[email]);
  return{userId:user.rows[0]!.id,permissions:['logistics.read','logistics.plan','logistics.release','logistics.milestone','logistics.customs','inventory.read','inventory.move','inventory.reserve']};
}

async function location(db:Database,userId:string,country:'CN'|'DE',codePrefix:string):Promise<{warehouseId:string;locationId:string}>{
  const key=suffix();
  const warehouse=await db.query<{id:string}>(`INSERT INTO warehouse.warehouses(code,name,country_code,timezone,created_by,updated_by) VALUES ($1,$2,$3,'UTC',$4,$4) RETURNING id`,[`${codePrefix}${key}`,`${country} Warehouse ${key}`,country,userId]);
  const row=await db.query<{id:string}>(`INSERT INTO warehouse.locations(warehouse_id,code,name,location_type,created_by,updated_by) VALUES ($1,'FG','Finished Goods','STORAGE',$2,$2) RETURNING id`,[warehouse.rows[0]!.id,userId]);
  return{warehouseId:warehouse.rows[0]!.id,locationId:row.rows[0]!.id};
}

async function sku(db:Database):Promise<string>{
  const key=suffix();
  const platform=await db.query<{id:string}>(`SELECT id FROM product.platforms WHERE code='FC'`);
  const model=await db.query<{id:string}>(`INSERT INTO product.models(platform_id,code,name,status) VALUES ($1,$2,'Logistics Test Model','ACTIVE') RETURNING id`,[platform.rows[0]!.id,`M${key}`]);
  const variant=await db.query<{id:string}>(`INSERT INTO product.variants(model_id,code,name,status) VALUES ($1,'BASE','Base','ACTIVE') RETURNING id`,[model.rows[0]!.id]);
  const result=await db.query<{id:string}>(`INSERT INTO product.skus(variant_id,sku,name,status) VALUES ($1,$2,'Logistics Test SKU','ACTIVE') RETURNING id`,[variant.rows[0]!.id,`SKU-${key}`]);
  return result.rows[0]!.id;
}

async function partner(db:Database,role:'DEALER'|'LOGISTICS_PROVIDER'|'FACTORY',country='DE'):Promise<string>{
  const key=suffix();
  const result=await db.query<{id:string}>(`INSERT INTO partners.partners(kind,display_name,country_code) VALUES ('ORGANIZATION',$1,$2) RETURNING id`,[`${role} ${key}`,country]);
  await db.query(`INSERT INTO partners.roles(partner_id,role) VALUES ($1,$2)`,[result.rows[0]!.id,role]);
  return result.rows[0]!.id;
}

async function shippingAddress(db:Database,partnerId:string):Promise<string>{
  const row=await db.query<{id:string}>(`INSERT INTO partners.addresses(partner_id,purpose,line1,city,postal_code,country_code) VALUES ($1,'SHIPPING','Dealer Street 1','Berlin','10115','DE') RETURNING id`,[partnerId]);
  return row.rows[0]!.id;
}

async function eori(db:Database,partnerId:string,value:string):Promise<string>{
  const row=await db.query<{id:string}>(`INSERT INTO partners.identifiers(partner_id,scheme,raw_value,normalized_value) VALUES ($1,'EORI',$2,$2) RETURNING id`,[partnerId,value]);
  return row.rows[0]!.id;
}

async function vehicle(db:Database,userId:string):Promise<string>{
  const key=suffix();
  const factoryId=await partner(db,'FACTORY','CN');
  const platform=await db.query<{id:string}>(`SELECT id FROM product.platforms WHERE code='FC'`);
  const model=await db.query<{id:string}>(`INSERT INTO product.models(platform_id,code,name,status) VALUES ($1,$2,'Vehicle Logistics Test','ACTIVE') RETURNING id`,[platform.rows[0]!.id,`VM${key}`]);
  const variant=await db.query<{id:string}>(`INSERT INTO product.variants(model_id,code,name,status) VALUES ($1,'BASE','Base','ACTIVE') RETURNING id`,[model.rows[0]!.id]);
  const skuRow=await db.query<{id:string}>(`INSERT INTO product.skus(variant_id,sku,name,status) VALUES ($1,$2,'Vehicle Logistics SKU','ACTIVE') RETURNING id`,[variant.rows[0]!.id,`VS${key}`]);
  const bom=await db.query<{id:string}>(`INSERT INTO engineering.boms(model_id,code,name) VALUES ($1,$2,'Vehicle Logistics BOM') RETURNING id`,[model.rows[0]!.id,`VB${key}`]);
  const revision=await db.query<{id:string}>(`INSERT INTO engineering.bom_revisions(bom_id,revision_code,status,released_at) VALUES ($1,'A','RELEASED',now()) RETURNING id`,[bom.rows[0]!.id]);
  const spec=await db.query<{id:string}>(`INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id,status,released_at) VALUES ($1,$2,$3,'RELEASED',now()) RETURNING id`,[`VBS${key}`,skuRow.rows[0]!.id,revision.rows[0]!.id]);
  const order=await db.query<{id:string}>(`INSERT INTO production.production_orders(build_spec_id,factory_partner_id,planned_quantity,status,released_at) VALUES ($1,$2,1,'RELEASED',now()) RETURNING id`,[spec.rows[0]!.id,factoryId]);
  const unit=await db.query<{id:string}>(`INSERT INTO production.production_units(production_order_id,unit_no,status) VALUES ($1,1,'QC_PENDING') RETURNING id`,[order.rows[0]!.id]);
  const qc=await db.query<{id:string}>(`INSERT INTO production.qc_inspections(production_unit_id,result,inspected_by) VALUES ($1,'PASS',$2) RETURNING id`,[unit.rows[0]!.id,userId]);
  await db.query(`UPDATE production.production_units SET status='QC_PASSED' WHERE id=$1`,[unit.rows[0]!.id]);
  const result=await db.query<{id:string}>(`INSERT INTO vehicle.vehicles(frame_number,production_unit_id,production_order_id,build_spec_id,sku_id,factory_partner_id,birth_qc_inspection_id,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[`FRAME-${key}`,unit.rows[0]!.id,order.rows[0]!.id,spec.rows[0]!.id,skuRow.rows[0]!.id,factoryId,qc.rows[0]!.id,userId]);
  return result.rows[0]!.id;
}

test('Germany route reserves, dispatches, delivers, then requires explicit Inventory receipt', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);const inventory=createInventoryService(db,audit);const logistics=createLogisticsService(db,audit,inventory);
    const cn=await location(db,auth.userId,'CN','CN');const de=await location(db,auth.userId,'DE','DE');const skuId=await sku(db);const carrier=await partner(db,'LOGISTICS_PROVIDER');
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'SKU',itemId:skuId,unit:'EA',quantity:'2',destinationLocationId:cn.locationId,idempotencyKey:`seed-${suffix()}`});
    const shipment=await logistics.createShipment(auth,{routeType:'FACTORY_TO_GERMANY_WAREHOUSE',originLocationId:cn.locationId,destinationLocationId:de.locationId,carrierPartnerId:carrier,transportMode:'SEA',incoterm:'DAP'});
    const cargo=await logistics.allocateCargo(auth,shipment.id,{itemKind:'SKU',itemId:skuId,quantity:'2'});
    const reservation=await db.query<{status:string}>(`SELECT status FROM inventory.reservations WHERE id=$1`,[cargo.reservation_id]);assert.equal(reservation.rows[0]!.status,'ACTIVE');
    const available=await db.query<{available:string}>(`SELECT available::text FROM inventory.v_availability WHERE sku_id=$1 AND location_id=$2`,[skuId,cn.locationId]);assert.equal(Number(available.rows[0]!.available),0);
    await logistics.releaseShipment(auth,shipment.id);await logistics.dispatchShipment(auth,shipment.id);
    assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:skuId,unit:'EA',locationId:cn.locationId})),0);
    const consumed=await db.query<{status:string}>(`SELECT status FROM inventory.reservations WHERE id=$1`,[cargo.reservation_id]);assert.equal(consumed.rows[0]!.status,'CONSUMED');
    await logistics.addMilestone(auth,shipment.id,{eventType:'DEPARTED'});await logistics.addMilestone(auth,shipment.id,{eventType:'ARRIVED_EU'});await logistics.addMilestone(auth,shipment.id,{eventType:'DELIVERED_GERMANY_WAREHOUSE'});
    assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:skuId,unit:'EA',locationId:de.locationId})),0,'delivery milestone alone must not create stock');
    await logistics.receiveGermanyShipment(auth,shipment.id);
    assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:skuId,unit:'EA',locationId:de.locationId})),2);
    const handoff=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM logistics.receiving_handoffs WHERE shipment_id=$1`,[shipment.id]);assert.equal(handoff.rows[0]!.count,1);
    await assert.rejects(logistics.receiveGermanyShipment(auth,shipment.id),LogisticsConflictError);
  }finally{await db.close();}
});


test('domestic factory-to-warehouse delivery is linked to PO and cannot fake receiving', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);
    const inventory=createInventoryService(db,audit);
    const logistics=createLogisticsService(db,audit,inventory);
    const origin=await location(db,auth.userId,'CN','FCT');
    const destination=await location(db,auth.userId,'CN','CWH');
    const skuId=await sku(db);
    const wrongSku=await sku(db);
    const factoryId=await partner(db,'FACTORY','CN');
    const po=await db.query<{id:string}>(`INSERT INTO procurement.purchase_orders(supplier_partner_id,currency) VALUES ($1,'CNY') RETURNING id`,[factoryId]);
    await db.query(`INSERT INTO procurement.purchase_order_lines(purchase_order_id,line_no,item_type,sku_id,ordered_quantity,unit,unit_price) VALUES ($1,10,'SKU',$2,2,'EA',100)`,[po.rows[0]!.id,skuId]);
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'SKU',itemId:skuId,unit:'EA',quantity:'2',destinationLocationId:origin.locationId,idempotencyKey:`domestic-seed-${suffix()}`});
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'SKU',itemId:wrongSku,unit:'EA',quantity:'1',destinationLocationId:origin.locationId,idempotencyKey:`domestic-wrong-${suffix()}`});
    const shipment=await logistics.createShipment(auth,{routeType:'FACTORY_TO_DOMESTIC_WAREHOUSE',sourcePurchaseOrderId:po.rows[0]!.id,originLocationId:origin.locationId,destinationLocationId:destination.locationId,transportMode:'ROAD'});
    const summary=await logistics.summary(auth);
    assert.equal(summary.shipments.find(s=>s.id===shipment.id)?.source_purchase_order_id,po.rows[0]!.id);
    await assert.rejects(logistics.allocateCargo(auth,shipment.id,{itemKind:'SKU',itemId:wrongSku,quantity:'1'}),/does not match a purchased SKU/);
    await logistics.allocateCargo(auth,shipment.id,{itemKind:'SKU',itemId:skuId,quantity:'2'});
    await logistics.releaseShipment(auth,shipment.id);
    await logistics.dispatchShipment(auth,shipment.id);
    await logistics.addMilestone(auth,shipment.id,{eventType:'DEPARTED'});
    await logistics.addMilestone(auth,shipment.id,{eventType:'DELIVERED_WAREHOUSE'});
    assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:skuId,unit:'EA',locationId:destination.locationId})),0);
    await logistics.receiveWarehouseShipment(auth,shipment.id);
    assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:skuId,unit:'EA',locationId:destination.locationId})),2);
    await assert.rejects(logistics.receiveWarehouseShipment(auth,shipment.id),LogisticsConflictError);
  }finally{await db.close();}
});

test('dealer-direct shipment never creates a Germany warehouse receipt', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);const inventory=createInventoryService(db,audit);const logistics=createLogisticsService(db,audit,inventory);
    const cn=await location(db,auth.userId,'CN','CN');const skuId=await sku(db);const dealer=await partner(db,'DEALER');const address=await shippingAddress(db,dealer);
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'SKU',itemId:skuId,unit:'EA',quantity:'1',destinationLocationId:cn.locationId,idempotencyKey:`direct-seed-${suffix()}`});
    const shipment=await logistics.createShipment(auth,{routeType:'FACTORY_TO_DEALER_DIRECT',originLocationId:cn.locationId,destinationDealerPartnerId:dealer,destinationAddressId:address,transportMode:'AIR',incoterm:'DAP'});
    await logistics.allocateCargo(auth,shipment.id,{itemKind:'SKU',itemId:skuId,quantity:'1'});await logistics.releaseShipment(auth,shipment.id);await logistics.dispatchShipment(auth,shipment.id);
    await logistics.addMilestone(auth,shipment.id,{eventType:'DEPARTED'});await logistics.addMilestone(auth,shipment.id,{eventType:'ARRIVED_EU'});await logistics.addMilestone(auth,shipment.id,{eventType:'DELIVERED_DEALER'});
    await assert.rejects(logistics.receiveGermanyShipment(auth,shipment.id),LogisticsConflictError);
    const handoffs=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM logistics.receiving_handoffs WHERE shipment_id=$1`,[shipment.id]);assert.equal(handoffs.rows[0]!.count,0);
    const shipmentReceipts=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM inventory.movements WHERE reference_type='SHIPMENT' AND reference_id=$1 AND movement_type='RECEIPT'`,[shipment.id]);assert.equal(shipmentReceipts.rows[0]!.count,0);
  }finally{await db.close();}
});

test('serialized Vehicle cannot be allocated to conflicting active shipments', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);const inventory=createInventoryService(db,audit);const logistics=createLogisticsService(db,audit,inventory);
    const cn=await location(db,auth.userId,'CN','CN');const de=await location(db,auth.userId,'DE','DE');const vehicleId=await vehicle(db,auth.userId);
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'VEHICLE',itemId:vehicleId,unit:'EA',quantity:'1',destinationLocationId:cn.locationId,idempotencyKey:`vehicle-seed-${suffix()}`});
    const a=await logistics.createShipment(auth,{routeType:'FACTORY_TO_GERMANY_WAREHOUSE',originLocationId:cn.locationId,destinationLocationId:de.locationId});
    const b=await logistics.createShipment(auth,{routeType:'FACTORY_TO_GERMANY_WAREHOUSE',originLocationId:cn.locationId,destinationLocationId:de.locationId});
    await logistics.allocateCargo(auth,a.id,{itemKind:'VEHICLE',itemId:vehicleId,quantity:'1'});
    await assert.rejects(logistics.allocateCargo(auth,b.id,{itemKind:'VEHICLE',itemId:vehicleId,quantity:'1'}));
    const active=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM inventory.reservations WHERE vehicle_id=$1 AND status='ACTIVE'`,[vehicleId]);assert.equal(active.rows[0]!.count,1);
  }finally{await db.close();}
});

test('customs evidence enforces EORI ownership and becomes immutable after declaration', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);const inventory=createInventoryService(db,audit);const logistics=createLogisticsService(db,audit,inventory);
    const cn=await location(db,auth.userId,'CN','CN');const de=await location(db,auth.userId,'DE','DE');const skuId=await sku(db);
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'SKU',itemId:skuId,unit:'EA',quantity:'1',destinationLocationId:cn.locationId,idempotencyKey:`customs-seed-${suffix()}`});
    const shipment=await logistics.createShipment(auth,{routeType:'FACTORY_TO_GERMANY_WAREHOUSE',originLocationId:cn.locationId,destinationLocationId:de.locationId});
    const cargo=await logistics.allocateCargo(auth,shipment.id,{itemKind:'SKU',itemId:skuId,quantity:'1'});
    const exporter=await partner(db,'FACTORY','CN');const importer=await partner(db,'DEALER','DE');const exporterEori=await eori(db,exporter,`CN${suffix()}`);const importerEori=await eori(db,importer,`DE${suffix()}`);
    await assert.rejects(logistics.createCustomsDeclaration(auth,shipment.id,{direction:'EXPORT',jurisdiction:'CN',exporterPartnerId:exporter,exporterEoriIdentifierId:importerEori}));
    const declaration=await logistics.createCustomsDeclaration(auth,shipment.id,{direction:'EXPORT',jurisdiction:'CN',exporterPartnerId:exporter,exporterEoriIdentifierId:exporterEori,importerPartnerId:importer,importerEoriIdentifierId:importerEori,currency:'EUR'});
    const line=await logistics.addCustomsLine(auth,declaration.id,{cargoId:cargo.id,originCountry:'CN',hsCode:'871160',cnCode:'87116090',taricCode:'8711609090',declaredValue:'1500',dutyRate:'0.06',dutyAmount:'90'});
    await logistics.addCustomsEvent(auth,declaration.id,{eventType:'DECLARED',reference:'CN-CUS-1'});
    await assert.rejects(db.query(`UPDATE logistics.customs_lines SET duty_amount=91 WHERE id=$1`,[line.id]),/only while declaration is DRAFT/);
    await assert.rejects(db.query(`UPDATE logistics.customs_declarations SET note='mutated' WHERE id=$1`,[declaration.id]),/immutable after declaration/);
    const shipmentEvent=await db.query<{count:number}>(`SELECT count(*)::int AS count FROM logistics.shipment_events WHERE shipment_id=$1 AND event_type='CHINA_EXPORT_DECLARED'`,[shipment.id]);assert.equal(shipmentEvent.rows[0]!.count,1);
    await assert.rejects(db.query(`UPDATE logistics.shipment_events SET note='mutated' WHERE shipment_id=$1`,[shipment.id]),/append-only/);
  }finally{await db.close();}
});
