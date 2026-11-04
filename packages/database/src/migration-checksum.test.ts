import assert from 'node:assert/strict';
import test from 'node:test';
import { checksumOf } from './migration-checksum.js';

test('migration checksums ignore line-ending differences between Windows and Linux checkouts', () => {
  const lf = 'CREATE TABLE demo(id int);\nINSERT INTO demo VALUES (1);\n';
  const crlf = lf.replace(/\n/g, '\r\n');
  assert.notEqual(lf, crlf);
  assert.equal(checksumOf(lf), checksumOf(crlf));
});

test('migration checksums still change when the SQL content changes', () => {
  assert.notEqual(checksumOf('SELECT 1;'), checksumOf('SELECT 2;'));
});
