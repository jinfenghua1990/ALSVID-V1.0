import type{DatabasePort,QueryExecutor}from'@alsvid/database';import type{CreateProductionOrderInput,ProductionDeviationInput,ProductionSummary,QcInspectionInput}from'../core/model.js';import type{ProductionRepository}from'../application/ports.js';
export class PostgresProductionRepository implements ProductionRepository{
 constructor(private readonly db:DatabasePort){}
 transaction<T>(work:(executor:QueryExecutor)=>Promise<T>):Promise<T>{return this.db.transaction(work)}
 async summary():Promise<ProductionSummary>{const[orders,units,inspections,deviations,history]=await Promise.all([
 this.db.query<any>(`SELECT po.*,bs.code AS build_spec_code,s.sku,p.partner_code,p.display_name AS factory_name,(SELECT count(*)::int FROM production.production_units u WHERE u.production_order_id=po.id) AS unit_count FROM production.production_orders po JOIN engineering.build_specs bs ON bs.id=po.build_spec_id JOIN product.skus s ON s.id=bs.sku_id JOIN partners.partners p ON p.id=po.factory_partner_id ORDER BY po.created_at DESC LIMIT 200`),
 this.db.query<any>(`SELECT u.*,po.production_order_number FROM production.production_units u JOIN production.production_orders po ON po.id=u.production_order_id ORDER BY po.created_at DESC,u.unit_no LIMIT 2000`),
 this.db.query<any>(`SELECT q.*,u.production_order_id,u.unit_no FROM production.qc_inspections q JOIN production.production_units u ON u.id=q.production_unit_id ORDER BY q.inspected_at DESC LIMIT 2000`),
 this.db.query<any>(`SELECT d.*,ep.part_number AS expected_part_number,ap.part_number AS actual_part_number FROM production.as_built_deviations d JOIN engineering.parts ep ON ep.id=d.expected_part_id JOIN engineering.parts ap ON ap.id=d.actual_part_id ORDER BY d.created_at DESC LIMIT 1000`),
 this.db.query<any>(`SELECT * FROM production.order_state_history ORDER BY occurred_at DESC LIMIT 1000`)]);const receipts=await this.db.query<any>(`SELECT r.*,po.production_order_number,w.name AS warehouse_name FROM production.factory_finished_receipts r JOIN production.production_orders po ON po.id=r.production_order_id JOIN warehouse.locations l ON l.id=r.location_id JOIN warehouse.warehouses w ON w.id=l.warehouse_id ORDER BY r.received_at DESC LIMIT 1000`);return{orders:orders.rows,units:units.rows,inspections:inspections.rows,deviations:deviations.rows,history:history.rows,factoryReceipts:receipts.rows}}
 async lockFactoryOrder(id:string,e:QueryExecutor):Promise<{id:string;status:string;planned_quantity:number;factory_partner_id:string;sku_id:string}|null>{const r=await e.query<any>(`SELECT po.id,po.status,po.planned_quantity,po.factory_partner_id,bs.sku_id FROM production.production_orders po JOIN engineering.build_specs bs ON bs.id=po.build_spec_id WHERE po.id=$1 FOR UPDATE OF po`,[id]);return r.rows[0]??null}
 async verifyFactoryLocation(locationId:string,factoryId:string,e:QueryExecutor):Promise<boolean>{const r=await e.query<any>(`SELECT 1 FROM warehouse.locations l JOIN warehouse.warehouses w ON w.id=l.warehouse_id WHERE l.id=$1 AND w.partner_id=$2 AND w.country_code='CN' AND w.active=true AND l.active=true`,[locationId,factoryId]);return r.rows.length>0}
 async receivedFactoryQuantity(id:string,e:QueryExecutor):Promise<number>{const r=await e.query<{received:string}>(`SELECT COALESCE(sum(quantity),0)::text AS received FROM production.factory_finished_receipts WHERE production_order_id=$1`,[id]);return Number(r.rows[0]?.received??0)}
 async addFactoryReceipt(orderId:string,locationId:string,quantity:number,movementId:string,actorUserId:string,e:QueryExecutor):Promise<void>{await e.query(`INSERT INTO production.factory_finished_receipts(production_order_id,location_id,quantity,inventory_movement_id,received_by) VALUES($1,$2,$3,$4,$5)`,[orderId,locationId,quantity,movementId,actorUserId])}
 async getStorefrontOrderProductionContext(orderId:string,factoryPartnerId:string,e:QueryExecutor):Promise<{order:any|null;paymentEvidence:boolean;factoryValid:boolean;lines:any[];existing:any[]}>{
  const found=await e.query<any>(`SELECT id,order_number,status,payment_status,tax_configuration_status,total_gross_amount::text,currency
   FROM commerce.storefront_orders WHERE id=$1 FOR UPDATE`,[orderId]);
  const order=found.rows[0]??null;
  if(!order)return{order:null,paymentEvidence:false,factoryValid:false,lines:[],existing:[]};
  const evidence=await e.query(`SELECT id FROM commerce.storefront_payment_verifications
   WHERE order_id=$1 AND amount=$2 AND currency=$3 AND provider_status='SUCCEEDED'
    AND signature_verified_at IS NOT NULL AND order_binding_verified_at IS NOT NULL LIMIT 1`,
   [orderId,order.total_gross_amount,order.currency]);
  const factory=await e.query(`SELECT p.id FROM partners.partners p
   JOIN partners.roles r ON r.partner_id=p.id WHERE p.id=$1 AND r.role='FACTORY' AND r.enabled=true LIMIT 1`,[factoryPartnerId]);
  const lines=await e.query<any>(`SELECT l.id AS line_id,l.sku_id,l.quantity,bs.id AS build_spec_id
   FROM commerce.storefront_order_lines l
   LEFT JOIN LATERAL(
    SELECT x.id FROM engineering.build_specs x WHERE x.sku_id=l.sku_id AND x.status='RELEASED'
    ORDER BY x.effective_from DESC NULLS LAST,x.released_at DESC NULLS LAST,x.created_at DESC LIMIT 1
   ) bs ON TRUE
   WHERE l.order_id=$1 ORDER BY l.created_at,l.id FOR SHARE OF l`,[orderId]);
  const lineIds=lines.rows.map((line:any)=>line.line_id);
  const existing=lineIds.length?await e.query<any>(`SELECT id,production_order_number,source_storefront_order_line_id,
   planned_quantity,build_spec_id,factory_partner_id,status
   FROM production.production_orders WHERE source_storefront_order_line_id=ANY($1::uuid[]) ORDER BY created_at,id`,[lineIds]):{rows:[]};
  return{order,paymentEvidence:Boolean(evidence.rows[0]),factoryValid:Boolean(factory.rows[0]),lines:lines.rows,existing:existing.rows};
 }
 async advanceStorefrontOrderToFulfillment(orderId:string,userId:string,e:QueryExecutor):Promise<boolean>{
  const result=await e.query(`UPDATE commerce.storefront_orders SET status='FULFILLMENT_PENDING',
   version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='PAYMENT_VERIFIED' RETURNING id`,[orderId,userId]);
  return Boolean(result.rows[0]);
 }
 async advanceStorefrontOrderToInProductionIfReady(orderLineId:string,userId:string,e:QueryExecutor):Promise<{id:string;order_number:string}|null>{
  const ready=await e.query<any>(`SELECT o.id,o.order_number FROM commerce.storefront_orders o
   JOIN commerce.storefront_order_lines seed ON seed.order_id=o.id
   WHERE seed.id=$1 AND o.status='FULFILLMENT_PENDING' AND o.payment_status='VERIFIED'
    AND o.tax_configuration_status='VERIFIED'
    AND NOT EXISTS(SELECT 1 FROM commerce.storefront_order_lines l WHERE l.order_id=o.id
     AND NOT EXISTS(SELECT 1 FROM production.production_orders po
      WHERE po.source_storefront_order_line_id=l.id
       AND po.status IN ('RELEASED','IN_PROGRESS','QC_PENDING','COMPLETED')))
   FOR UPDATE OF o`,[orderLineId]);
  const order=ready.rows[0];if(!order)return null;
  const updated=await e.query<any>(`UPDATE commerce.storefront_orders SET status='IN_PRODUCTION',
   version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='FULFILLMENT_PENDING'
   RETURNING id,order_number`,[order.id,userId]);
  return updated.rows[0]??null;
 }
 async createOrder(input:CreateProductionOrderInput&{actorUserId:string},executor?:QueryExecutor):Promise<any>{const database=executor??this.db;const r=await database.query<any>(`INSERT INTO production.production_orders(build_spec_id,factory_partner_id,source_purchase_order_id,source_storefront_order_line_id,planned_quantity,planned_start_date,planned_completion_date,note,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,[input.buildSpecId,input.factoryPartnerId,input.sourcePurchaseOrderId||null,input.sourceStorefrontOrderLineId||null,input.plannedQuantity,input.plannedStartDate||null,input.plannedCompletionDate||null,input.note?.trim()??'',input.actorUserId]);return r.rows[0]}
 async releaseOrder(id:string,userId:string,e:QueryExecutor):Promise<any|null>{const r=await e.query<any>(`UPDATE production.production_orders SET status='RELEASED',released_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='DRAFT' RETURNING *`,[id,userId]);return r.rows[0]??null}
 async createUnits(id:string,count:number,userId:string,e:QueryExecutor):Promise<void>{await e.query(`INSERT INTO production.production_units(production_order_id,unit_no,updated_by) SELECT $1,n,$2 FROM generate_series(1,$3::integer) AS n`,[id,userId,count])}
 async startOrder(id:string,userId:string):Promise<any|null>{const r=await this.db.query<any>(`UPDATE production.production_orders SET status='IN_PROGRESS',started_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='RELEASED' RETURNING *`,[id,userId]);return r.rows[0]??null}
 async markUnitAssembled(id:string,userId:string):Promise<any|null>{const r=await this.db.query<any>(`UPDATE production.production_units u SET status='ASSEMBLED',assembly_started_at=COALESCE(assembly_started_at,now()),assembly_completed_at=now(),updated_by=$2,updated_at=now() FROM production.production_orders po WHERE u.id=$1 AND po.id=u.production_order_id AND po.status='IN_PROGRESS' AND u.status IN ('PLANNED','ASSEMBLING') RETURNING u.*`,[id,userId]);return r.rows[0]??null}
 async countUnitsBlockingQc(id:string,e:QueryExecutor):Promise<number>{const r=await e.query<{count:string}>(`SELECT count(*)::text AS count FROM production.production_units WHERE production_order_id=$1 AND status NOT IN ('ASSEMBLED','QC_PENDING','QC_PASSED','QC_FAILED','HOLD')`,[id]);return Number(r.rows[0]?.count??0)}
 async moveOrderToQc(id:string,userId:string,e:QueryExecutor):Promise<any|null>{const r=await e.query<any>(`UPDATE production.production_orders SET status='QC_PENDING',qc_pending_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='IN_PROGRESS' RETURNING *`,[id,userId]);return r.rows[0]??null}
 async markAssembledUnitsQcPending(id:string,userId:string,e:QueryExecutor):Promise<void>{await e.query(`UPDATE production.production_units SET status='QC_PENDING',updated_by=$2,updated_at=now() WHERE production_order_id=$1 AND status='ASSEMBLED'`,[id,userId])}
 async lockUnit(id:string,e:QueryExecutor):Promise<any|null>{const r=await e.query<any>(`SELECT u.*,po.status AS order_status FROM production.production_units u JOIN production.production_orders po ON po.id=u.production_order_id WHERE u.id=$1 FOR UPDATE OF u`,[id]);return r.rows[0]??null}
 async setUnitStatus(id:string,status:string,userId:string,e:QueryExecutor):Promise<void>{await e.query(`UPDATE production.production_units SET status=$2,updated_by=$3,updated_at=now() WHERE id=$1`,[id,status,userId])}
 async createInspection(id:string,input:QcInspectionInput,userId:string,e:QueryExecutor):Promise<any>{const r=await e.query<any>(`INSERT INTO production.qc_inspections(production_unit_id,result,checklist_code,checklist,note,inspected_by) VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,[id,input.result,input.checklistCode?.trim()||null,JSON.stringify(input.checklist??{}),input.note?.trim()??'',userId]);return r.rows[0]}
 async recordDeviation(id:string,input:ProductionDeviationInput&{quantity:string},userId:string):Promise<any>{const r=await this.db.query<any>(`INSERT INTO production.as_built_deviations(production_unit_id,expected_part_id,actual_part_id,quantity,serial_number,reason,approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[id,input.expectedPartId,input.actualPartId,input.quantity,input.serialNumber?.trim()||null,input.reason.trim(),userId]);return r.rows[0]}
 async countUnitsNotQcPassed(id:string):Promise<number>{const r=await this.db.query<{count:string}>(`SELECT count(*)::text AS count FROM production.production_units WHERE production_order_id=$1 AND status<>'QC_PASSED'`,[id]);return Number(r.rows[0]?.count??0)}
 async completeOrder(id:string,userId:string):Promise<any|null>{const r=await this.db.query<any>(`UPDATE production.production_orders SET status='COMPLETED',completed_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 AND status='QC_PENDING' RETURNING *`,[id,userId]);return r.rows[0]??null}
}
