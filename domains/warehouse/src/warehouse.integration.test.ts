import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import { createInventoryService } from '@alsvid/inventory';
import { createWarehouseService } from './index.js';

const hasDatabase=Boolean(process.env.DATABASE_URL);
const suffix=()=>randomUUID().replaceAll('-','').slice(0,10).toUpperCase();
const audit={async record():Promise<void>{}};
type TestActor={userId:string;permissions:string[]};

async function actor(db:Database):Promise<TestActor>{
  const email=`warehouse-${suffix().toLowerCase()}@example.com`;
  const user=await db.query<{id:string}>(`INSERT INTO identity.users(email,display_name,password_hash) VALUES ($1,'Warehouse Test','x') RETURNING id`,[email]);
  return{userId:user.rows[0]!.id,permissions:['inventory.read','inventory.move','inventory.reserve','inventory.stocktake','inventory.adjust','warehouse.manage']};
}

test('closing stocktake appends correction movement instead of overwriting balance', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db);const inventory=createInventoryService(db,audit);const warehouse=createWarehouseService(db,audit,inventory);
    const key=suffix();
    const w=await warehouse.createWarehouse(auth,{code:`DE${key}`,name:'Germany Test Warehouse',countryCode:'DE',timezone:'Europe/Berlin'});
    const location=await warehouse.createLocation(auth,{warehouseId:w.id,code:'A01',name:'A01 Storage',locationType:'STORAGE'});
    const part=await db.query<{id:string}>(`INSERT INTO engineering.parts(part_number,name,default_unit) VALUES ($1,'Stocktake Part','EA') RETURNING id`,[`ST-${key}`]);
    await inventory.postMovement(auth,{movementType:'RECEIPT',itemKind:'PART',itemId:part.rows[0]!.id,unit:'EA',quantity:'10',destinationLocationId:location.id,idempotencyKey:`stocktake-receipt-${key}`});
    const session=await warehouse.openStocktake(auth,{warehouseId:w.id,note:'Cycle count'});
    const count=await warehouse.recordCount(auth,session.id,{locationId:location.id,itemKind:'PART',itemId:part.rows[0]!.id,countedQuantity:'7',unit:'EA'});
    await warehouse.closeStocktake(auth,session.id);
    assert.equal(Number(await inventory.balanceAt({itemKind:'PART',itemId:part.rows[0]!.id,unit:'EA',locationId:location.id})),7);
    const correction=await db.query<{movement_type:string;quantity:string}>(`SELECT movement_type,quantity::text FROM inventory.movements WHERE reference_type='STOCKTAKE' AND reference_id=$1`,[session.id]);
    assert.equal(correction.rows.length,1);assert.equal(correction.rows[0]!.movement_type,'STOCKTAKE_CORRECTION');assert.equal(Number(correction.rows[0]!.quantity),3);
    const state=await db.query<{status:string}>(`SELECT status FROM warehouse.stocktake_sessions WHERE id=$1`,[session.id]);assert.equal(state.rows[0]!.status,'CLOSED');
    await assert.rejects(db.query(`UPDATE warehouse.stocktake_counts SET counted_quantity=9 WHERE id=$1`,[count.id]),/append-only/);
  }finally{await db.close();}
});

test('delete refuses stocked warehouse without altering the ledger', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db),inv=createInventoryService(db,audit),wh=createWarehouseService(db,audit,inv),key=suffix();
    const w=await wh.createWarehouse(auth,{code:'CN'+key,name:'测试仓',countryCode:'CN',timezone:'Asia/Shanghai'});
    const l=await wh.createLocation(auth,{warehouseId:w.id,code:'A01',name:'库位',locationType:'STORAGE'});
    const p=await db.query<{id:string}>(`INSERT INTO engineering.parts(part_number,name,default_unit) VALUES ($1,'Delete Test','EA') RETURNING id`,['WD-'+key]);
    await inv.postMovement(auth,{movementType:'RECEIPT',itemKind:'PART',itemId:p.rows[0]!.id,unit:'EA',quantity:'2',destinationLocationId:l.id,idempotencyKey:'wd-'+key});
    await assert.rejects(wh.deleteWarehouse(auth,w.id,{expectedCode:w.code}),/禁止删除：该仓库仍有库存/);
    assert.equal((await db.query('SELECT 1 FROM warehouse.warehouses WHERE id=$1',[w.id])).rows.length,1);
    assert.equal(Number(await inv.balanceAt({itemKind:'PART',itemId:p.rows[0]!.id,unit:'EA',locationId:l.id})),2);
    await assert.rejects(wh.deleteWarehouse({...auth,permissions:['inventory.read']},w.id,{expectedCode:w.code}));
  }finally{await db.close()}
});
test('delete requires matching warehouse code; unused warehouse and empty location can be deleted', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db),wh=createWarehouseService(db,audit,createInventoryService(db,audit));
    const w=await wh.createWarehouse(auth,{code:'DE'+suffix(),name:'空仓',countryCode:'DE',timezone:'Europe/Berlin'});
    const l=await wh.createLocation(auth,{warehouseId:w.id,code:'A01',name:'空库位',locationType:'STORAGE'});
    await assert.rejects(wh.deleteWarehouse(auth,w.id,{expectedCode:'WRONG'}),/仓库编号不匹配/);
    assert.deepEqual(await wh.deleteWarehouse(auth,w.id,{expectedCode:w.code}),{id:w.id,code:w.code,deleted:true});
    assert.equal((await db.query('SELECT 1 FROM warehouse.warehouses WHERE id=$1',[w.id])).rows.length,0);
    assert.equal((await db.query('SELECT 1 FROM warehouse.locations WHERE id=$1',[l.id])).rows.length,0);
  }finally{await db.close()}
});
test('zero inventory with prior receipt and issue still cannot be deleted', {skip:!hasDatabase}, async()=>{
  const db=new Database();
  try{
    const auth=await actor(db),inv=createInventoryService(db,audit),wh=createWarehouseService(db,audit,inv),key=suffix();
    const w=await wh.createWarehouse(auth,{code:'DE'+key,name:'历史仓',countryCode:'DE',timezone:'Europe/Berlin'});
    const l=await wh.createLocation(auth,{warehouseId:w.id,code:'A01',name:'历史库位',locationType:'STORAGE'});
    const p=await db.query<{id:string}>(`INSERT INTO engineering.parts(part_number,name,default_unit) VALUES ($1,'Delete History','EA') RETURNING id`,['DH-'+key]);
    await inv.postMovement(auth,{movementType:'RECEIPT',itemKind:'PART',itemId:p.rows[0]!.id,unit:'EA',quantity:'1',destinationLocationId:l.id,idempotencyKey:'dh-in-'+key});
    await inv.postMovement(auth,{movementType:'ISSUE',itemKind:'PART',itemId:p.rows[0]!.id,unit:'EA',quantity:'1',sourceLocationId:l.id,idempotencyKey:'dh-out-'+key});
    await assert.rejects(wh.deleteWarehouse(auth,w.id,{expectedCode:w.code}),/历史出入库/);
  }finally{await db.close()}
});