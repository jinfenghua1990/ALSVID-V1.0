import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import { ProductService } from './application/product-service.js';
import { PostgresProductRepository } from './infrastructure/postgres-product-repository.js';
import { ProductConflictError } from './core/errors.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const unique = () => randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();

// Guards the reference probe against schema drift: one wrong column here used to
// turn the Admin delete button into an opaque 500 instead of an actionable conflict.
test('model deletion probe matches the real schema and blocks referenced models',
  { skip: !hasDatabase }, async () => {
    const db = new Database();
    try {
      const user = await db.query<{ id: string }>(
        "INSERT INTO identity.users(email,display_name,password_hash) VALUES($1,'Delete CI','x') RETURNING id",
        ['delete-' + randomUUID() + '@example.com']);
      const actor = { userId: user.rows[0]!.id, permissions: ['product.read', 'product.write'] };
      const service = new ProductService(new PostgresProductRepository(db), { async record() {} });

      const model = await service.createModel(actor, {
        productTypeCode: 'ACCESSORY', code: 'D' + unique(), name: 'Deletion probe model',
      });
      const repository = new PostgresProductRepository(db);
      assert.deepEqual(await repository.modelDeletionBlockers(model.id), []);

      const variant = await service.createVariant(actor, { modelId: model.id, code: 'V' + unique(), name: 'Base' });
      assert.deepEqual(await repository.modelDeletionBlockers(model.id), ['variants']);

      await assert.rejects(() => service.deleteModel(actor, model.id, { expectedVersion: model.version }),
        (error: any) => error instanceof ProductConflictError && /已退役/.test(error.message));

      await db.query('DELETE FROM product.variants WHERE id=$1', [variant.id]);
      await service.deleteModel(actor, model.id, { expectedVersion: model.version });
      assert.deepEqual(await repository.modelDeletionBlockers(model.id), []);
    } finally {
      await db.close?.();
    }
  });
