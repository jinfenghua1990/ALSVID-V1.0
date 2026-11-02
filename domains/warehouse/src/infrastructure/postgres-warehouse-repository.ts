import type{DatabasePort,QueryExecutor}from'@alsvid/database';
import {WarehouseConflictError,WarehouseNotFoundError} from '../core/errors.js';import type{WarehouseItemKind}from'../core/model.js';import type{WarehouseRepository}from'../application/ports.js';
export class PostgresWarehouseRepository implements WarehouseRepository{constructor(private readonly db:DatabasePort){}transaction<T>(work:(executor:QueryExecutor)=>Promise<T>):Promise<T>{return this.db.transaction(work)}async summary():Promise<any>{const[w,l,s,c]=await Promise.all([this.db.query<any>(`SELECT w.*,p.partner_code,p.display_name AS partner_name FROM warehouse.warehouses w LEFT JOIN partners.partners p ON p.id=w.partner_id ORDER BY w.code`),this.db.query<any>(`SELECT l.*,w.code AS warehouse_code,w.name AS warehouse_name,pl.code AS parent_code FROM warehouse.locations l JOIN warehouse.warehouses w ON w.id=l.warehouse_id LEFT JOIN warehouse.locations pl ON pl.id=l.parent_location_id ORDER BY w.code,l.code`),this.db.query<any>(`SELECT s.*,w.code AS warehouse_code,w.name AS warehouse_name FROM warehouse.stocktake_sessions s JOIN warehouse.warehouses w ON w.id=s.warehouse_id ORDER BY s.opened_at DESC LIMIT 200`),this.db.query<any>(`SELECT c.*,l.code AS location_code,p.part_number,s.sku,v.frame_number FROM warehouse.stocktake_counts c JOIN warehouse.locations l ON l.id=c.location_id LEFT JOIN engineering.parts p ON p.id=c.part_id LEFT JOIN product.skus s ON s.id=c.sku_id LEFT JOIN vehicle.vehicles v ON v.id=c.vehicle_id ORDER BY c.counted_at DESC LIMIT 1000`)]);return{warehouses:w.rows,locations:l.rows,stocktakes:s.rows,counts:c.rows}}
 async itemUnit(kind:WarehouseItemKind,id:string,e:QueryExecutor=this.db):Promise<string|null>{if(kind==='PART'){const r=await e.query<{unit:string}>(`SELECT default_unit AS unit FROM engineering.parts WHERE id=$1`,[id]);return r.rows[0]?.unit??null}if(kind==='SKU'){const r=await e.query(`SELECT 1 FROM product.skus WHERE id=$1`,[id]);return r.rows[0]?'EA':null}if(kind==='VEHICLE'){const r=await e.query(`SELECT 1 FROM vehicle.vehicles WHERE id=$1`,[id]);return r.rows[0]?'EA':null}return null}
 async createWarehouse(i:any):Promise<any>{const r=await this.db.query<any>(`INSERT INTO warehouse.warehouses(code,name,partner_id,country_code,timezone,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,[i.code,i.name,i.partnerId,i.countryCode,i.timezone,i.actorUserId]);return r.rows[0]}async updateWarehouse(i:{id:string;name:string;timezone:string;expectedName:string;expectedTimezone:string;actorUserId:string}):Promise<any|null>{const r=await this.db.query<any>(`UPDATE warehouse.warehouses SET name=$2,timezone=$3,updated_by=$6,updated_at=now() WHERE id=$1 AND name=$4 AND timezone=$5 RETURNING *`,[i.id,i.name,i.timezone,i.expectedName,i.expectedTimezone,i.actorUserId]);return r.rows[0]??null}async deleteWarehouse(i:{id:string;expectedCode:string},e:QueryExecutor):Promise<{id:string;code:string;deleted:true}>{
    // Serialize warehouse deletion against concurrent location creation, and lock
    // existing locations to prevent new FK-backed inventory records during deletion.
    const w=await e.query<{id:string;code:string}>(`SELECT id,code FROM warehouse.warehouses WHERE id=$1 FOR UPDATE`,[i.id]);
    if(!w.rows[0])throw new WarehouseNotFoundError('仓库不存在，可能已被删除');
    if(w.rows[0].code!==i.expectedCode)throw new WarehouseConflictError('仓库编号不匹配，请刷新后重新确认');
    const locations=await e.query<{id:string}>(`SELECT id FROM warehouse.locations WHERE warehouse_id=$1 FOR UPDATE`,[i.id]);
    const ids=locations.rows.map(row=>row.id);
    if(ids.length){
      const balance=await e.query<{blocked:boolean}>(`SELECT EXISTS(
        SELECT 1 FROM inventory.v_location_balances WHERE location_id=ANY($1::uuid[]) AND on_hand<>0
      ) AS blocked`,[ids]);
      const reserved=await e.query<{blocked:boolean}>(`SELECT EXISTS(
        SELECT 1 FROM inventory.reservations WHERE location_id=ANY($1::uuid[]) AND status='ACTIVE'
      ) AS blocked`,[ids]);
      if(balance.rows[0]?.blocked||reserved.rows[0]?.blocked)
        throw new WarehouseConflictError('禁止删除：该仓库仍有库存或库存预留，请先完成出库、调拨或释放预留');
      const history=await e.query<{blocked:boolean}>(`SELECT EXISTS(
        SELECT 1 FROM inventory.movements WHERE source_location_id=ANY($1::uuid[]) OR destination_location_id=ANY($1::uuid[])
      ) OR EXISTS(
        SELECT 1 FROM inventory.reservations WHERE location_id=ANY($1::uuid[])
      ) AS blocked`,[ids]);
      if(history.rows[0]?.blocked)
        throw new WarehouseConflictError('禁止删除：该仓库存在历史出入库或预留记录，为保证库存可追溯，请保留仓库档案');
    }
    const dependencies=await e.query<{blocked:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM warehouse.stocktake_sessions WHERE warehouse_id=$1
    ) OR EXISTS(
      SELECT 1 FROM integrations.external_warehouse_mappings WHERE internal_warehouse_id=$1
    ) AS blocked`,[i.id]);
    if(dependencies.rows[0]?.blocked)
      throw new WarehouseConflictError('禁止删除：该仓库存在盘点记录或第三方仓映射，请先核对关联业务');
    // Only unreferenced and unused locations may be removed. Other FK edges
    // remain guarded at DB level and yield a 409 rather than partial deletion.
    await e.query(`DELETE FROM warehouse.locations WHERE warehouse_id=$1`,[i.id]);
    const removed=await e.query<{id:string;code:string}>(`DELETE FROM warehouse.warehouses WHERE id=$1 AND code=$2 RETURNING id,code`,[i.id,i.expectedCode]);
    if(!removed.rows[0])throw new WarehouseConflictError('仓库档案发生变化，请刷新后重试');
    return {...removed.rows[0],deleted:true as const};
  }async createLocation(i:any):Promise<any>{const r=await this.db.query<any>(`INSERT INTO warehouse.locations(warehouse_id,parent_location_id,code,name,location_type,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,[i.warehouseId,i.parentLocationId,i.code,i.name,i.locationType,i.actorUserId]);return r.rows[0]}async openStocktake(i:any):Promise<any>{const r=await this.db.query<any>(`INSERT INTO warehouse.stocktake_sessions(warehouse_id,note,opened_by,created_at) VALUES ($1,$2,$3,now()) RETURNING *`,[i.warehouseId,i.note,i.actorUserId]);return r.rows[0]}async recordCount(i:any):Promise<any>{const r=await this.db.query<any>(`INSERT INTO warehouse.stocktake_counts(session_id,location_id,item_kind,part_id,sku_id,vehicle_id,counted_quantity,unit,counted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[i.sessionId,i.locationId,i.itemKind,i.partId,i.skuId,i.vehicleId,i.countedQuantity,i.unit,i.actorUserId]);return r.rows[0]}async lockStocktake(id:string,e:QueryExecutor):Promise<any|null>{const r=await e.query<any>(`SELECT * FROM warehouse.stocktake_sessions WHERE id=$1 FOR UPDATE`,[id]);return r.rows[0]??null}async latestCounts(id:string,e:QueryExecutor):Promise<any[]>{const r=await e.query<any>(`WITH latest AS (SELECT DISTINCT ON (location_id,item_kind,part_id,sku_id,vehicle_id,upper(unit)) * FROM warehouse.stocktake_counts WHERE session_id=$1 ORDER BY location_id,item_kind,part_id,sku_id,vehicle_id,upper(unit),counted_at DESC,id DESC) SELECT * FROM latest ORDER BY counted_at,id`,[id]);return r.rows}async numericDelta(counted:string,balance:string,e:QueryExecutor):Promise<string>{const r=await e.query<{delta:string}>(`SELECT ($1::numeric-$2::numeric)::text AS delta`,[counted,balance]);return r.rows[0]?.delta??'0'}async closeStocktake(id:string,userId:string,e:QueryExecutor):Promise<any|null>{const r=await e.query<any>(`UPDATE warehouse.stocktake_sessions SET status='CLOSED',closed_by=$2,closed_at=now() WHERE id=$1 AND status='OPEN' RETURNING *`,[id,userId]);return r.rows[0]??null}async cancelStocktake(id:string,userId:string):Promise<any|null>{const r=await this.db.query<any>(`UPDATE warehouse.stocktake_sessions SET status='CANCELLED',closed_by=$2,closed_at=now() WHERE id=$1 AND status='OPEN' RETURNING *`,[id,userId]);return r.rows[0]??null}}
