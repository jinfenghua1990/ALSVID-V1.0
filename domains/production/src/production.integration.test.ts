import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import type { ProductionInventoryPort } from './application/ports.js';
import {createProductionService,ProductionConflictError} from './index.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suffix = () => randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();

async function testUser(db: Database): Promise<string> {
  const user = await db.query<{ id: string }>(
    `INSERT INTO identity.users(email,display_name,password_hash) VALUES ($1,'Production Test','x') RETURNING id`,
    [`prod-${suffix().toLowerCase()}@example.com`],
  );
  return user.rows[0]!.id;
}

async function factory(db: Database, valid = true): Promise<string> {
  const partner = await db.query<{ id: string }>(
    `INSERT INTO partners.partners(kind,display_name) VALUES ('ORGANIZATION',$1) RETURNING id`,
    [`Factory ${suffix()}`],
  );
  if (valid) {
    await db.query(`INSERT INTO partners.roles(partner_id,role) VALUES ($1,'FACTORY')`, [partner.rows[0]!.id]);
  }
  return partner.rows[0]!.id;
}

async function buildSpec(db: Database, released = true): Promise<{ specId: string; skuId: string; revisionId: string }> {
  const code = suffix();
  const platform = await db.query<{ id: string }>(`SELECT id FROM product.platforms WHERE code='FC'`);
  const model = await db.query<{ id: string }>(
    `INSERT INTO product.models(platform_id,code,name) VALUES ($1,$2,'Prod Test') RETURNING id`,
    [platform.rows[0]!.id, `M${code}`],
  );
  const variant = await db.query<{ id: string }>(
    `INSERT INTO product.variants(model_id,code,name) VALUES ($1,'BASE','Base') RETURNING id`,
    [model.rows[0]!.id],
  );
  const sku = await db.query<{ id: string }>(
    `INSERT INTO product.skus(variant_id,sku,name) VALUES ($1,$2,'Prod SKU') RETURNING id`,
    [variant.rows[0]!.id, `S${code}`],
  );
  const bom = await db.query<{ id: string }>(
    `INSERT INTO engineering.boms(model_id,code,name) VALUES ($1,$2,'Prod BOM') RETURNING id`,
    [model.rows[0]!.id, `B${code}`],
  );
  const revision = await db.query<{ id: string }>(
    `INSERT INTO engineering.bom_revisions(bom_id,revision_code) VALUES ($1,'A') RETURNING id`,
    [bom.rows[0]!.id],
  );
  await db.query(`UPDATE engineering.bom_revisions SET status='RELEASED',released_at=now() WHERE id=$1`, [revision.rows[0]!.id]);
  const spec = await db.query<{ id: string }>(
    `INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id,status,released_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [`BS${code}`, sku.rows[0]!.id, revision.rows[0]!.id, released ? 'RELEASED' : 'DRAFT', released ? new Date() : null],
  );
  return { specId: spec.rows[0]!.id, skuId: sku.rows[0]!.id, revisionId: revision.rows[0]!.id };
}

test('Production Order requires released Build Spec and FACTORY Partner role', { skip: !hasDatabase }, async () => {
  const db = new Database();
  try {
    const invalidFactory = await factory(db, false);
    const released = await buildSpec(db, true);
    await assert.rejects(
      db.query(`INSERT INTO production.production_orders(build_spec_id,factory_partner_id,planned_quantity) VALUES ($1,$2,1)`, [released.specId, invalidFactory]),
      /FACTORY Partner role/,
    );

    const validFactory = await factory(db, true);
    const draft = await buildSpec(db, false);
    await assert.rejects(
      db.query(`INSERT INTO production.production_orders(build_spec_id,factory_partner_id,planned_quantity) VALUES ($1,$2,1)`, [draft.specId, validFactory]),
      /released Build Specification/,
    );
  } finally {
    await db.close();
  }
});

test('as-built deviation must reference the released BOM and cannot be added after QC PASS', { skip: !hasDatabase }, async () => {
  const db = new Database();
  try {
    const inspector = await testUser(db);
    const factoryId = await factory(db, true);
    const spec = await buildSpec(db, true);
    const expected = await db.query<{ id: string }>(
      `INSERT INTO engineering.parts(part_number,name) VALUES ($1,'Expected part') RETURNING id`,
      [`EXP${suffix()}`],
    );
    const actual = await db.query<{ id: string }>(
      `INSERT INTO engineering.parts(part_number,name) VALUES ($1,'Actual substitute') RETURNING id`,
      [`ACT${suffix()}`],
    );
    const unrelated = await db.query<{ id: string }>(
      `INSERT INTO engineering.parts(part_number,name) VALUES ($1,'Unrelated part') RETURNING id`,
      [`OTH${suffix()}`],
    );

    // The BOM revision is already released, so create a fresh draft/release pair with the expected part.
    const originalSpec = await db.query<{ sku_id: string; bom_id: string }>(
      `SELECT bs.sku_id, br.bom_id FROM engineering.build_specs bs
       JOIN engineering.bom_revisions br ON br.id=bs.bom_revision_id WHERE bs.id=$1`,
      [spec.specId],
    );
    const revision = await db.query<{ id: string }>(
      `INSERT INTO engineering.bom_revisions(bom_id,revision_code) VALUES ($1,'B') RETURNING id`,
      [originalSpec.rows[0]!.bom_id],
    );
    await db.query(
      `INSERT INTO engineering.bom_lines(revision_id,line_no,part_id,quantity) VALUES ($1,10,$2,1)`,
      [revision.rows[0]!.id, expected.rows[0]!.id],
    );
    await db.query(`UPDATE engineering.bom_revisions SET status='RELEASED',released_at=now() WHERE id=$1`, [revision.rows[0]!.id]);
    const guardedSpec = await db.query<{ id: string }>(
      `INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id,status,released_at)
       VALUES ($1,$2,$3,'RELEASED',now()) RETURNING id`,
      [`GBS${suffix()}`, originalSpec.rows[0]!.sku_id, revision.rows[0]!.id],
    );

    const order = await db.query<{ id: string }>(
      `INSERT INTO production.production_orders(build_spec_id,factory_partner_id,planned_quantity,status,released_at)
       VALUES ($1,$2,1,'RELEASED',now()) RETURNING id`,
      [guardedSpec.rows[0]!.id, factoryId],
    );
    const unit = await db.query<{ id: string }>(
      `INSERT INTO production.production_units(production_order_id,unit_no,status) VALUES ($1,1,'ASSEMBLED') RETURNING id`,
      [order.rows[0]!.id],
    );

    await assert.rejects(
      db.query(
        `INSERT INTO production.as_built_deviations(production_unit_id,expected_part_id,actual_part_id,quantity,reason,approved_by)
         VALUES ($1,$2,$3,1,'Wrong expected part',$4)`,
        [unit.rows[0]!.id, unrelated.rows[0]!.id, actual.rows[0]!.id, inspector],
      ),
      /Expected part is not present/,
    );

    await db.query(
      `INSERT INTO production.as_built_deviations(production_unit_id,expected_part_id,actual_part_id,quantity,reason,approved_by)
       VALUES ($1,$2,$3,1,'Approved substitution',$4)`,
      [unit.rows[0]!.id, expected.rows[0]!.id, actual.rows[0]!.id, inspector],
    );

    await db.query(`UPDATE production.production_units SET status='QC_PENDING' WHERE id=$1`, [unit.rows[0]!.id]);
    await db.query(
      `INSERT INTO production.qc_inspections(production_unit_id,result,inspected_by) VALUES ($1,'PASS',$2)`,
      [unit.rows[0]!.id, inspector],
    );
    await db.query(`UPDATE production.production_units SET status='QC_PASSED' WHERE id=$1`, [unit.rows[0]!.id]);

    await assert.rejects(
      db.query(
        `INSERT INTO production.as_built_deviations(production_unit_id,expected_part_id,actual_part_id,quantity,reason,approved_by)
         VALUES ($1,$2,$3,1,'Late edit',$4)`,
        [unit.rows[0]!.id, expected.rows[0]!.id, actual.rows[0]!.id, inspector],
      ),
      /after QC PASS/,
    );
  } finally {
    await db.close();
  }
});

test('QC fail cannot birth Vehicle; QC pass can birth exactly one immutable frame identity', { skip: !hasDatabase }, async () => {
  const db = new Database();
  try {
    const inspector = await testUser(db);
    const factoryId = await factory(db, true);
    const spec = await buildSpec(db, true);
    const order = await db.query<{ id: string }>(
      `INSERT INTO production.production_orders(build_spec_id,factory_partner_id,planned_quantity,status,released_at)
       VALUES ($1,$2,1,'RELEASED',now()) RETURNING id`,
      [spec.specId, factoryId],
    );
    const unit = await db.query<{ id: string }>(
      `INSERT INTO production.production_units(production_order_id,unit_no,status) VALUES ($1,1,'QC_PENDING') RETURNING id`,
      [order.rows[0]!.id],
    );
    const fail = await db.query<{ id: string }>(
      `INSERT INTO production.qc_inspections(production_unit_id,result,inspected_by,inspected_at)
       VALUES ($1,'FAIL',$2,now()-interval '1 minute') RETURNING id`,
      [unit.rows[0]!.id, inspector],
    );
    await db.query(`UPDATE production.production_units SET status='QC_FAILED' WHERE id=$1`, [unit.rows[0]!.id]);

    await assert.rejects(
      db.query(
        `INSERT INTO vehicle.vehicles(frame_number,production_unit_id,production_order_id,build_spec_id,sku_id,factory_partner_id,birth_qc_inspection_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`FRAME-${suffix()}`, unit.rows[0]!.id, order.rows[0]!.id, spec.specId, spec.skuId, factoryId, fail.rows[0]!.id],
      ),
      /QC_PASSED/,
    );

    await db.query(`UPDATE production.production_units SET status='QC_PENDING' WHERE id=$1`, [unit.rows[0]!.id]);
    const pass = await db.query<{ id: string }>(
      `INSERT INTO production.qc_inspections(production_unit_id,result,inspected_by) VALUES ($1,'PASS',$2) RETURNING id`,
      [unit.rows[0]!.id, inspector],
    );
    await db.query(`UPDATE production.production_units SET status='QC_PASSED' WHERE id=$1`, [unit.rows[0]!.id]);

    const frame = `FRAME-${suffix()}`;
    const vehicle = await db.query<{ id: string }>(
      `INSERT INTO vehicle.vehicles(frame_number,production_unit_id,production_order_id,build_spec_id,sku_id,factory_partner_id,birth_qc_inspection_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [frame, unit.rows[0]!.id, order.rows[0]!.id, spec.specId, spec.skuId, factoryId, pass.rows[0]!.id],
    );

    await assert.rejects(
      db.query(
        `INSERT INTO vehicle.vehicles(frame_number,production_unit_id,production_order_id,build_spec_id,sku_id,factory_partner_id,birth_qc_inspection_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [`OTHER-${suffix()}`, unit.rows[0]!.id, order.rows[0]!.id, spec.specId, spec.skuId, factoryId, pass.rows[0]!.id],
      ),
      /duplicate key/,
    );
    await assert.rejects(
      db.query(`UPDATE vehicle.vehicles SET frame_number=$2 WHERE id=$1`, [vehicle.rows[0]!.id, `NEW-${suffix()}`]),
      /immutable/,
    );
    await assert.rejects(
      db.query(`DELETE FROM vehicle.vehicles WHERE id=$1`, [vehicle.rows[0]!.id]),
      /cannot be deleted/,
    );
  } finally {
    await db.close();
  }
});

test('completed QC production only enters factory-owned stock on real physical receipt, no duplicate units', {skip:!hasDatabase}, async()=>{
 const db=new Database();
 try{
   const userId=await testUser(db);
   const factoryId=await factory(db,true),spec=await buildSpec(db,true);
   const actor={userId,permissions:['production.write','production.release','qc.inspect','inventory.move','inventory.read','inventory.reserve']};
   const audit={async record(){}};
   // Adapter to inventory's real append-only ledger without importing another domain.
   // This keeps Production's architectural boundary explicit.
   const inventory:ProductionInventoryPort={
     async postMovement(_actor,input,executor){
       const result=await (executor??db).query<{id:string}>(
         `INSERT INTO inventory.movements(
           movement_type,item_kind,sku_id,quantity,unit,destination_location_id,
           reference_type,reference_id,reason,idempotency_key,correlation_id,created_by
         ) VALUES ('RECEIPT','SKU',$1,$2,'EA',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
         [input.itemId,input.quantity,input.destinationLocationId,input.referenceType,
          input.referenceId,input.reason,input.idempotencyKey,input.correlationId,userId]
       );
       return {id:result.rows[0]!.id};
     }
   };
   const balanceAt=async()=>{
     const result=await db.query<{balance:string}>(
       `SELECT COALESCE(sum(on_hand),0)::text AS balance FROM inventory.v_location_balances
        WHERE sku_id=$1 AND location_id=$2`,[spec.skuId,location.rows[0]!.id]
     );
     return Number(result.rows[0]?.balance??0);
   };
   const production=createProductionService(db,audit,inventory);
   const warehouse=await db.query<{id:string}>(`INSERT INTO warehouse.warehouses(code,name,partner_id,country_code) VALUES ($1,'Contract factory warehouse',$2,'CN') RETURNING id`,['WF'+suffix(),factoryId]);
   const location=await db.query<{id:string}>(`INSERT INTO warehouse.locations(warehouse_id,code,name,location_type) VALUES ($1,'FG','QC-passed finished goods','STORAGE') RETURNING id`,[warehouse.rows[0]!.id]);
   const order=await production.createOrder(actor,{buildSpecId:spec.specId,factoryPartnerId:factoryId,plannedQuantity:2});
   await assert.rejects(production.receiveFinishedGoods(actor,order.id,{locationId:location.rows[0]!.id,quantity:1}),ProductionConflictError);
   await production.releaseOrder(actor,order.id);
   await production.startOrder(actor,order.id);
   const units=await db.query<{id:string}>(`SELECT id FROM production.production_units WHERE production_order_id=$1 ORDER BY unit_no`,[order.id]);
   for(const unit of units.rows)await production.markUnitAssembled(actor,unit.id);
   await production.moveOrderToQc(actor,order.id);
   for(const unit of units.rows)await production.inspectUnit(actor,unit.id,{result:'PASS'});
   await production.completeOrder(actor,order.id);
   const first=await production.receiveFinishedGoods(actor,order.id,{locationId:location.rows[0]!.id,quantity:1});
   assert.equal(first.remaining,1);
   assert.equal(await balanceAt(),1);
   await assert.rejects(production.receiveFinishedGoods(actor,order.id,{locationId:location.rows[0]!.id,quantity:2}),ProductionConflictError);
   const last=await production.receiveFinishedGoods(actor,order.id,{locationId:location.rows[0]!.id,quantity:1});
   assert.equal(last.remaining,0);
   assert.equal(Number(await inventory.balanceAt({itemKind:'SKU',itemId:spec.skuId,unit:'EA',locationId:location.rows[0]!.id})),2);
 }finally{await db.close();}
});
