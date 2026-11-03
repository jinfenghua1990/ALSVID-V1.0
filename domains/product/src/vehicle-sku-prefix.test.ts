import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveVehicleSkuPrefix } from './core/normalization.js';

test('derives deterministic vehicle SKU family prefixes', () => {
  assert.equal(deriveVehicleSkuPrefix('A1'), 'A1');
  assert.equal(deriveVehicleSkuPrefix('A2'), 'A2');
  assert.equal(deriveVehicleSkuPrefix('A1-ULTRA'), 'AU');
  assert.equal(deriveVehicleSkuPrefix('L1-PRO'), 'LP');
  assert.equal(deriveVehicleSkuPrefix('FC1'), 'FC');
  assert.equal(deriveVehicleSkuPrefix('unknown'), null);
});
