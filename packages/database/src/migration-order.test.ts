import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { LEGACY_DUPLICATE_MIGRATIONS, orderedMigrationFiles } from './migration-order.js';

test('historical migrations have deterministic numbering and pinned duplicate groups', async () => {
  const files = orderedMigrationFiles(await readdir(new URL('../migrations/', import.meta.url)));
  assert.equal(files[0]?.startsWith('0001_'), true);
  const numbers = [...new Set(files.map(file => Number(file.slice(0, 4))))];
  assert.ok((numbers.at(-1) ?? 0) >= 51, 'minimum expected migration history remains available');
  for (const [number, expected] of Object.entries(LEGACY_DUPLICATE_MIGRATIONS)) {
    assert.deepEqual(files.filter(file => file.startsWith(number + '_')), expected);
  }
  assert.deepEqual(numbers, Array.from({ length: numbers.at(-1)! }, (_, index) => index + 1));
});

test('migration order rejects new duplicates and legacy file renames', () => {
  const fixture = Object.values(LEGACY_DUPLICATE_MIGRATIONS).flat();
  assert.throws(() => orderedMigrationFiles([...fixture, '0051_one.sql', '0051_two.sql']), /Unpinned/);
  assert.throws(() => orderedMigrationFiles(fixture.map(file => file === '0021_portal_identity_roles.sql' ? '0021_portal_renamed.sql' : file)), /renamed/);
});
