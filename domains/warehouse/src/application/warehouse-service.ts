import { postgresErrorCode, type QueryExecutor } from '@alsvid/database';
import { ForbiddenError } from '@alsvid/kernel';
import { WarehouseCapability, type WarehouseItemKind } from '../core/model.js';
import { WarehouseConflictError, WarehouseNotFoundError, WarehouseValidationError } from '../core/errors.js';
import { normalizeLocationType, normalizeWarehouseCode, normalizeWarehouseCountry, warehouseCount, warehouseItemIds } from '../core/validation.js';
import type { WarehouseActor, WarehouseAuditPort, WarehouseInventoryPort, WarehouseRepository } from './ports.js';

interface StocktakeCountRow {
  id: string;
  item_kind: WarehouseItemKind;
  part_id: string | null;
  sku_id: string | null;
  vehicle_id: string | null;
  counted_quantity: string;
  unit: string;
  location_id: string;
}

export class WarehouseService {
  constructor(
    private readonly repository: WarehouseRepository,
    private readonly audit: WarehouseAuditPort,
    private readonly inventory: WarehouseInventoryPort,
  ) {}

  async summary(actor: WarehouseActor): Promise<any> {
    requireCapability(actor, WarehouseCapability.Read);
    return this.repository.summary();
  }

  async createWarehouse(actor: WarehouseActor, input: { code: string; name: string; partnerId?: string; countryCode: string; timezone?: string }): Promise<any> {
    requireCapability(actor, WarehouseCapability.Manage);
    if (!input.name?.trim()) throw new WarehouseValidationError('name is required');
    try {
      const row = await this.repository.createWarehouse({
        code: normalizeWarehouseCode(input.code, 'code'),
        name: input.name.trim(),
        partnerId: input.partnerId || null,
        countryCode: normalizeWarehouseCountry(input.countryCode),
        timezone: input.timezone?.trim() || 'UTC',
        actorUserId: actor.userId,
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'warehouse.created', targetType: 'warehouse', targetId: row.id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async updateWarehouse(actor: WarehouseActor, id: string, input: { name: string; timezone: string; expectedName: string; expectedTimezone: string }): Promise<any> {
    requireCapability(actor, WarehouseCapability.Manage);
    const name = input?.name?.trim();
    const timezone = input?.timezone?.trim();
    if (!id || !name || !timezone || !input?.expectedName || !input?.expectedTimezone || name.length > 120 || timezone.length > 100)
      throw new WarehouseValidationError('Warehouse name, timezone, and original values are required');
    const row = await this.repository.updateWarehouse({id,name,timezone,expectedName:input.expectedName,expectedTimezone:input.expectedTimezone,actorUserId:actor.userId});
    if (!row) throw new WarehouseConflictError('Warehouse was changed or no longer exists; reload before editing');
    await this.audit.record({actorUserId:actor.userId,action:'warehouse.updated',targetType:'warehouse',targetId:id});
    return row;
  }

  async deleteWarehouse(actor: WarehouseActor, id: string, input: { expectedCode: string }): Promise<{id:string;code:string;deleted:true}> {
    requireCapability(actor, WarehouseCapability.Manage);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) || !input || typeof input.expectedCode !== 'string')
      throw new WarehouseValidationError('请指定有效仓库并填写要删除的仓库编号');
    const expectedCode = normalizeWarehouseCode(input.expectedCode, 'expectedCode');
    try {
      return await this.repository.transaction(async executor => {
        const deleted = await this.repository.deleteWarehouse({id,expectedCode},executor);
        await this.audit.record({
          actorUserId:actor.userId,action:'warehouse.deleted',targetType:'warehouse',targetId:id,
          metadata:{code:deleted.code},
        },executor);
        return deleted;
      });
    } catch (error) {
      if (postgresErrorCode(error) === '23503')
        throw new WarehouseConflictError('禁止删除：该仓库仍被其他业务记录引用，请先核对库存、盘点、订单或第三方仓关联');
      throw error;
    }
  }

  async createLocation(actor: WarehouseActor, input: { warehouseId: string; parentLocationId?: string; code: string; name: string; locationType: string }): Promise<any> {
    requireCapability(actor, WarehouseCapability.Manage);
    if (!input.warehouseId || !input.name?.trim()) throw new WarehouseValidationError('warehouseId and name are required');
    try {
      const row = await this.repository.createLocation({
        warehouseId: input.warehouseId,
        parentLocationId: input.parentLocationId || null,
        code: normalizeWarehouseCode(input.code, 'code'),
        name: input.name.trim(),
        locationType: normalizeLocationType(input.locationType),
        actorUserId: actor.userId,
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'warehouse.location_created', targetType: 'warehouse.location', targetId: row.id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async openStocktake(actor: WarehouseActor, input: { warehouseId: string; note?: string }): Promise<any> {
    requireCapability(actor, WarehouseCapability.Stocktake);
    try {
      const row = await this.repository.openStocktake({ warehouseId: input.warehouseId, note: input.note?.trim() ?? '', actorUserId: actor.userId });
      await this.audit.record({ actorUserId: actor.userId, action: 'warehouse.stocktake_opened', targetType: 'warehouse.stocktake', targetId: row.id });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async recordCount(actor: WarehouseActor, sessionId: string, input: { locationId: string; itemKind: WarehouseItemKind; itemId: string; countedQuantity: string | number; unit: string }): Promise<any> {
    requireCapability(actor, WarehouseCapability.Stocktake);
    const counted = warehouseCount(input.countedQuantity);
    const unit = input.unit.trim().toUpperCase();
    await this.assertItem(input.itemKind, input.itemId, unit);
    try {
      const row = await this.repository.recordCount({
        sessionId,
        locationId: input.locationId,
        itemKind: input.itemKind,
        ...warehouseItemIds(input.itemKind, input.itemId),
        countedQuantity: counted,
        unit,
        actorUserId: actor.userId,
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'warehouse.stocktake_counted', targetType: 'warehouse.stocktake', targetId: sessionId, metadata: { countId: row.id, locationId: input.locationId, itemKind: input.itemKind } });
      return row;
    } catch (error) { this.rethrow(error); }
  }

  async closeStocktake(actor: WarehouseActor, sessionId: string): Promise<any> {
    requireCapability(actor, WarehouseCapability.Stocktake);
    return this.repository.transaction(async (executor) => {
      const session = await this.repository.lockStocktake(sessionId, executor);
      if (!session) throw new WarehouseNotFoundError('Stocktake session not found');
      if (session.status !== 'OPEN') throw new WarehouseConflictError('Stocktake session is no longer open');
      const latest: StocktakeCountRow[] = await this.repository.latestCounts(sessionId, executor);
      if (!latest.length) throw new WarehouseConflictError('At least one stocktake count is required before close');
      const corrections: { row: StocktakeCountRow; itemId: string; delta: string }[] = [];
      for (const row of latest) {
        const itemId = row.part_id ?? row.sku_id ?? row.vehicle_id;
        if (!itemId) throw new WarehouseConflictError('Stocktake count is missing its item reference');
        const balance = await this.inventory.balanceAt({ itemKind: row.item_kind, itemId, unit: row.unit, locationId: row.location_id }, executor);
        corrections.push({ row, itemId, delta: await this.repository.numericDelta(row.counted_quantity, balance, executor) });
      }
      corrections.sort((a, b) => compareDecimalStrings(a.delta, b.delta));
      for (const correction of corrections) {
        if (isDecimalZero(correction.delta)) continue;
        const row = correction.row;
        await this.inventory.postStocktakeCorrection(actor, {
          itemKind: row.item_kind,
          itemId: correction.itemId,
          unit: row.unit,
          locationId: row.location_id,
          delta: correction.delta,
          stocktakeId: sessionId,
          countId: row.id,
        }, executor);
      }
      const closed = await this.repository.closeStocktake(sessionId, actor.userId, executor);
      await this.audit.record({
        actorUserId: actor.userId,
        action: 'warehouse.stocktake_closed',
        targetType: 'warehouse.stocktake',
        targetId: sessionId,
        metadata: { countLines: latest.length, correctionLines: corrections.filter((correction) => !isDecimalZero(correction.delta)).length },
      }, executor);
      return closed;
    });
  }

  async cancelStocktake(actor: WarehouseActor, sessionId: string): Promise<any> {
    requireCapability(actor, WarehouseCapability.Stocktake);
    const row = await this.repository.cancelStocktake(sessionId, actor.userId);
    if (!row) throw new WarehouseConflictError('Stocktake session is missing or no longer open');
    await this.audit.record({ actorUserId: actor.userId, action: 'warehouse.stocktake_cancelled', targetType: 'warehouse.stocktake', targetId: sessionId });
    return row;
  }

  private async assertItem(kind: WarehouseItemKind, id: string, unit: string, executor?: QueryExecutor): Promise<void> {
    const expected = await this.repository.itemUnit(kind, id, executor);
    if (expected === null) throw new WarehouseNotFoundError(kind === 'PART' ? 'Part not found' : kind === 'SKU' ? 'SKU not found' : 'Vehicle not found');
    if (expected.toUpperCase() !== unit) throw new WarehouseValidationError(kind === 'PART' ? `Part unit must be ${expected}` : `${kind} stocktake unit must be EA`);
  }

  private rethrow(error: unknown): never {
    const message = error instanceof Error ? error.message : '';
    const code = postgresErrorCode(error);
    if (code === '23503') throw new WarehouseNotFoundError('Referenced warehouse, Partner, location or item not found');
    if (code === '23505') throw new WarehouseConflictError('Warehouse or location code already exists');
    if (code === '23514') throw new WarehouseValidationError(message);
    if (/same warehouse|Stocktake session|location must belong|append-only|Invalid stocktake/i.test(message)) throw new WarehouseConflictError(message);
    throw error;
  }
}

function isDecimalZero(value: string): boolean {
  return compareDecimalStrings(value, '0') === 0;
}

function compareDecimalStrings(left: string, right: string): number {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  const scale = Math.max(a.scale, b.scale);
  const aValue = BigInt(a.digits + '0'.repeat(scale - a.scale)) * (a.negative ? -1n : 1n);
  const bValue = BigInt(b.digits + '0'.repeat(scale - b.scale)) * (b.negative ? -1n : 1n);
  return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
}

function parseDecimal(value: string): { negative: boolean; digits: string; scale: number } {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new WarehouseValidationError('Invalid decimal stocktake delta');
  const fraction = match[3] ?? '';
  return {
    negative: match[1] === '-',
    digits: `${match[2]}${fraction}`,
    scale: fraction.length,
  };
}

function requireCapability(actor: WarehouseActor, capability: string): void {
  if (!actor.permissions.includes(capability)) throw new ForbiddenError('WAREHOUSE_FORBIDDEN', `Missing permission: ${capability}`);
}
