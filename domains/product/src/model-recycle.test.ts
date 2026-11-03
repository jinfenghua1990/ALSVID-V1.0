import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './application/product-service.js';
import { ProductCapability, ProductConflictError, ProductNotFoundError, ProductValidationError } from './index.js';

function harness(options: { recycled?: boolean; exists?: boolean } = {}) {
  const events: string[] = [];
  const recycled = options.recycled ?? false;
  const repository: any = {
    recycleModel: async (input: any) => { if (recycled) return false; events.push(`recycle:${input.id}`); return true; },
    restoreModel: async (input: any) => { if (!recycled) return false; events.push(`restore:${input.id}`); return true; },
    listRecycledModels: async () => [{ id: 'model-1', productId: '100123', code: 'X1', name: 'Recycled', status: 'ACTIVE', version: 2, deletedAt: '2026-11-03T00:00:00.000Z', deletedBy: null }],
    exists: async () => options.exists ?? true,
  };
  const service = new ProductService(repository, { record: async (input: any) => { events.push(input.action); } });
  const actor = { userId: 'u1', permissions: [ProductCapability.Read, ProductCapability.Write] };
  return { service, actor, events };
}

test('deleting a commerce product moves it to the recycle bin and audits the move', async () => {
  const { service, actor, events } = harness();
  assert.deepEqual(await service.recycleModel(actor, 'model-1', { expectedVersion: 2 }), { recycled: true });
  assert.deepEqual(events, ['recycle:model-1', 'product.model_recycled']);
});

test('recycling requires an expected version and reports a missing product', async () => {
  const { service, actor } = harness();
  await assert.rejects(() => service.recycleModel(actor, 'model-1', { expectedVersion: 0 }), ProductValidationError);
  const missing = harness({ exists: false });
  await assert.rejects(() => missing.service.recycleModel(missing.actor, 'model-1', { expectedVersion: 1 }), ProductNotFoundError);
});

test('a product already in the recycle bin cannot be recycled again', async () => {
  const { service, actor } = harness({ recycled: true });
  await assert.rejects(() => service.recycleModel(actor, 'model-1', { expectedVersion: 1 }), ProductConflictError);
});

test('recycled products can be listed and restored', async () => {
  const { service, actor, events } = harness({ recycled: true });
  const items = await service.listRecycled(actor);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.code, 'X1');
  assert.deepEqual(await service.restoreModel(actor, 'model-1'), { restored: true });
  assert.deepEqual(events, ['restore:model-1', 'product.model_restored']);
});

test('restoring a product that is not recycled is refused', async () => {
  const { service, actor } = harness({ recycled: false });
  await assert.rejects(() => service.restoreModel(actor, 'model-1'), ProductConflictError);
});
