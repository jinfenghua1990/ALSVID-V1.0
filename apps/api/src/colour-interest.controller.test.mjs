import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('colour preference writes and reports use the same post-0049 model code', () => {
  const source = readFileSync(new URL('./colour-interest.controller.ts', import.meta.url), 'utf8');
  assert.match(source, /input\?\.productCode !== 'A1-ULTRA'/);
  assert.match(source, /productCode: 'A1-ULTRA'/);
  assert.equal((source.match(/WHERE product_code = 'A1-ULTRA'/g) ?? []).length, 3);
  assert.doesNotMatch(source, /'FC1'/);
});
