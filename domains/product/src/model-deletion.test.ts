import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductService } from './application/product-service.js';
import { ProductCapability, ProductConflictError, ProductNotFoundError, ProductValidationError } from './index.js';

function harness(blockers: string[], existing = true) {
  const audits: string[] = [];
  const deleted: string[] = [];
  const repository: any = {
    modelDeletionBlockers: async () => blockers,
    transaction: async (work: any) => work({ query: async () => ({ rows: [] }) }),
    deleteModel: async (input: any) => { if (!existing) return false; deleted.push(input.id); return true; },
    exists: async () => existing,
  };
  const service = new ProductService(repository, { record: async (input: any) => { audits.push(input.action); } });
  const actor = { userId: 'u1', permissions: [ProductCapability.Read, ProductCapability.Write] };
  return { service, actor, audits, deleted };
}

test('a model with dependent records is never deleted and asks for retirement instead', async () => {
  const { service, actor, deleted, audits } = harness(['variants', 'skus']);
  await assert.rejects(() => service.deleteModel(actor, 'model-1', { expectedVersion: 1 }),
    (error: any) => error instanceof ProductConflictError && /已退役/.test(error.message));
  assert.deepEqual(deleted, []);
  assert.deepEqual(audits, []);
});

test('an unreferenced model is deleted with an audit record', async () => {
  const { service, actor, deleted, audits } = harness([]);
  assert.deepEqual(await service.deleteModel(actor, 'model-1', { expectedVersion: 3 }), { deleted: true });
  assert.deepEqual(deleted, ['model-1']);
  assert.deepEqual(audits, ['product.model_deleted']);
});

test('deleting requires an expected version and reports a missing model separately', async () => {
  const { service, actor } = harness([]);
  await assert.rejects(() => service.deleteModel(actor, 'model-1', { expectedVersion: 0 }), ProductValidationError);
  const missing = harness([], false);
  await assert.rejects(() => missing.service.deleteModel(missing.actor, 'model-1', { expectedVersion: 1 }), ProductNotFoundError);
});
