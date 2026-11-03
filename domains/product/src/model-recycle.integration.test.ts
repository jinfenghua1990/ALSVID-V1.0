import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import { ProductService } from './application/product-service.js';
import { PostgresProductRepository } from './infrastructure/postgres-product-repository.js';

const hasDatabase = Boolean(process.env.DATABASE_URL);
const unique = () => randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();

// A deleted commerce product must leave the working catalogue but keep every
// dependent record, and must come back unchanged when it is restored.
test('a recycled product leaves the catalogue, keeps its records and can be restored',
  { skip: !hasDatabase }, async () => {
    const db = new Database();
    try {
      const user = await db.query<{ id: string }>(
        "INSERT INTO identity.users(email,display_name,password_hash) VALUES($1,'Recycle CI','x') RETURNING id",
        ['recycle-' + randomUUID() + '@example.com']);
      const actor = { userId: user.rows[0]!.id, permissions: ['product.read', 'product.write'] };
      const repository = new PostgresProductRepository(db);
      const service = new ProductService(repository, { async record() {} });

      const model = await service.createModel(actor, {
        productTypeCode: 'ACCESSORY', code: 'R' + unique(), name: 'Recycled accessory',
      });
      assert.ok((await repository.catalog()).models.some(item => item.id === model.id));

      await service.recycleModel(actor, model.id, { expectedVersion: model.version });
      assert.ok(!(await repository.catalog()).models.some(item => item.id === model.id), 'recycled model leaves the catalogue');

      const recycled = await repository.listRecycledModels();
      const entry = recycled.find(item => item.id === model.id);
      assert.ok(entry, 'recycled model is listed in the recycle bin');
      assert.equal(entry!.code, model.code);

      const row = await db.query<{ id: string }>('SELECT id FROM product.models WHERE id=$1', [model.id]);
      assert.equal(row.rows.length, 1, 'the record itself is kept');

      await service.restoreModel(actor, model.id);
      assert.ok((await repository.catalog()).models.some(item => item.id === model.id), 'restored model returns to the catalogue');
      assert.ok(!(await repository.listRecycledModels()).some(item => item.id === model.id));
    } finally {
      await db.close?.();
    }
  });
