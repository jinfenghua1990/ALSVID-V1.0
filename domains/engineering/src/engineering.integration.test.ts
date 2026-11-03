import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';

const hasDatabase = Boolean(process.env.DATABASE_URL);

test('released BOM revisions and Build Specifications are immutable in PostgreSQL', { skip: !hasDatabase }, async () => {
  const db = new Database();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  try {
    const platform = await db.query<{ id: string }>("SELECT id FROM product.platforms WHERE code = 'FC'");
    const model = await db.query<{ id: string }>(
      `INSERT INTO product.models(platform_id, code, name) VALUES ($1,$2,$3) RETURNING id`,
      [platform.rows[0]!.id, `T${suffix}`, `Test ${suffix}`],
    );
    const variant = await db.query<{ id: string }>(
      `INSERT INTO product.variants(model_id, code, name) VALUES ($1,'BASE','Base') RETURNING id`,
      [model.rows[0]!.id],
    );
    const sku = await db.query<{ id: string }>(
      `INSERT INTO product.skus(variant_id, sku, name) VALUES ($1,$2,'Test SKU') RETURNING id`,
      [variant.rows[0]!.id, `SKU${suffix}`],
    );
    const part = await db.query<{ id: string }>(
      `INSERT INTO engineering.parts(part_number, name) VALUES ($1,'Frame') RETURNING id`,
      [`PART${suffix}`],
    );
    const bom = await db.query<{ id: string }>(
      `INSERT INTO engineering.boms(model_id, code, name) VALUES ($1,$2,'Test BOM') RETURNING id`,
      [model.rows[0]!.id, `BOM${suffix}`],
    );
    const revision = await db.query<{ id: string }>(
      `INSERT INTO engineering.bom_revisions(bom_id, revision_code) VALUES ($1,'A') RETURNING id`,
      [bom.rows[0]!.id],
    );
    // L1 uses an empty draft workspace until its parts are approved. Release must fail
    // for ALL empty BOM revisions, not only the L1-specific record.
    await assert.rejects(
      db.query(`UPDATE engineering.bom_revisions SET status='RELEASED', released_at=now() WHERE id=$1`, [revision.rows[0]!.id]),
      /without at least one BOM line/,
    );
    await db.query(
      `INSERT INTO engineering.bom_lines(revision_id,line_no,part_id,quantity) VALUES ($1,10,$2,1)`,
      [revision.rows[0]!.id, part.rows[0]!.id],
    );
    await db.query(`UPDATE engineering.bom_revisions SET status='RELEASED', released_at=now() WHERE id=$1`, [revision.rows[0]!.id]);

    await assert.rejects(
      db.query(`UPDATE engineering.bom_lines SET quantity=2 WHERE revision_id=$1`, [revision.rows[0]!.id]),
      /immutable/,
    );

    const spec = await db.query<{ id: string }>(
      `INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id) VALUES ($1,$2,$3) RETURNING id`,
      [`SPEC${suffix}`, sku.rows[0]!.id, revision.rows[0]!.id],
    );
    await db.query(`UPDATE engineering.build_specs SET status='RELEASED', released_at=now() WHERE id=$1`, [spec.rows[0]!.id]);

    await assert.rejects(
      db.query(`UPDATE engineering.build_specs SET notes='changed' WHERE id=$1`, [spec.rows[0]!.id]),
      /immutable/,
    );
  } finally {
    await db.close();
  }
});

test('Build Specification cannot be released against a draft BOM revision', { skip: !hasDatabase }, async () => {
  const db = new Database();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  try {
    const platform = await db.query<{ id: string }>("SELECT id FROM product.platforms WHERE code = 'CT'");
    const model = await db.query<{ id: string }>(`INSERT INTO product.models(platform_id,code,name) VALUES ($1,$2,'Draft Test') RETURNING id`, [platform.rows[0]!.id, `D${suffix}`]);
    const variant = await db.query<{ id: string }>(`INSERT INTO product.variants(model_id,code,name) VALUES ($1,'BASE','Base') RETURNING id`, [model.rows[0]!.id]);
    const sku = await db.query<{ id: string }>(`INSERT INTO product.skus(variant_id,sku,name) VALUES ($1,$2,'Draft SKU') RETURNING id`, [variant.rows[0]!.id, `DSKU${suffix}`]);
    const bom = await db.query<{ id: string }>(`INSERT INTO engineering.boms(model_id,code,name) VALUES ($1,$2,'Draft BOM') RETURNING id`, [model.rows[0]!.id, `DBOM${suffix}`]);
    const revision = await db.query<{ id: string }>(`INSERT INTO engineering.bom_revisions(bom_id,revision_code) VALUES ($1,'A') RETURNING id`, [bom.rows[0]!.id]);
    const spec = await db.query<{ id: string }>(`INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id) VALUES ($1,$2,$3) RETURNING id`, [`DSPEC${suffix}`, sku.rows[0]!.id, revision.rows[0]!.id]);

    await assert.rejects(
      db.query(`UPDATE engineering.build_specs SET status='RELEASED', released_at=now() WHERE id=$1`, [spec.rows[0]!.id]),
      /released BOM revision/,
    );
  } finally {
    await db.close();
  }
});


test('Build Specification refuses a SKU and BOM revision from different models', { skip: !hasDatabase }, async () => {
  const db = new Database();
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  try {
    const platform = await db.query<{ id: string }>("SELECT id FROM product.platforms WHERE code = 'FC'");
    const first = await db.query<{ id: string }>(
      "INSERT INTO product.models(platform_id,code,name) VALUES ($1,$2,'Model A') RETURNING id",
      [platform.rows[0]!.id, `A${suffix}`],
    );
    const second = await db.query<{ id: string }>(
      "INSERT INTO product.models(platform_id,code,name) VALUES ($1,$2,'Model B') RETURNING id",
      [platform.rows[0]!.id, `B${suffix}`],
    );
    const variant = await db.query<{ id: string }>(
      "INSERT INTO product.variants(model_id,code,name) VALUES ($1,'STANDARD','Standard') RETURNING id",
      [first.rows[0]!.id],
    );
    const sku = await db.query<{ id: string }>(
      "INSERT INTO product.skus(variant_id,sku,name) VALUES ($1,$2,'Model A SKU') RETURNING id",
      [variant.rows[0]!.id, `S${suffix}`],
    );
    const correctBom = await db.query<{ id: string }>(
      "INSERT INTO engineering.boms(model_id,code,name) VALUES ($1,$2,'Correct BOM') RETURNING id",
      [first.rows[0]!.id, `C${suffix}`],
    );
    const otherBom = await db.query<{ id: string }>(
      "INSERT INTO engineering.boms(model_id,code,name) VALUES ($1,$2,'Wrong BOM') RETURNING id",
      [second.rows[0]!.id, `X${suffix}`],
    );
    const correctRevision = await db.query<{ id: string }>(
      "INSERT INTO engineering.bom_revisions(bom_id,revision_code) VALUES ($1,'A') RETURNING id",
      [correctBom.rows[0]!.id],
    );
    const wrongRevision = await db.query<{ id: string }>(
      "INSERT INTO engineering.bom_revisions(bom_id,revision_code) VALUES ($1,'A') RETURNING id",
      [otherBom.rows[0]!.id],
    );

    await assert.rejects(
      db.query(
        "INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id) VALUES ($1,$2,$3)",
        [`BAD${suffix}`, sku.rows[0]!.id, wrongRevision.rows[0]!.id],
      ),
      /same model/,
    );

    const valid = await db.query<{ id: string }>(
      "INSERT INTO engineering.build_specs(code,sku_id,bom_revision_id) VALUES ($1,$2,$3) RETURNING id",
      [`OK${suffix}`, sku.rows[0]!.id, correctRevision.rows[0]!.id],
    );
    assert.ok(valid.rows[0]!.id);
    await assert.rejects(
      db.query(
        'UPDATE engineering.build_specs SET bom_revision_id=$2 WHERE id=$1',
        [valid.rows[0]!.id, wrongRevision.rows[0]!.id],
      ),
      /same model/,
    );
  } finally {
    await db.close();
  }
});
