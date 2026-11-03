import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./model-register.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const module = { exports: {} };
runInNewContext(outputText, { exports: module.exports, module, Set });
const { matchesModelRegisterSearch, modelEngineeringStage, modelBomSummary, deriveVehicleSkuPrefix } = module.exports;

const model = { id: 'model-a', code: 'FC1', name: 'Folding Carbon' };
const platform = { code: 'FC', name: 'Folding Carbon' };
const catalog = {
  variants: [{ id: 'variant-a', model_id: 'model-a', code: 'PRO', name: 'Pro' },
    { id: 'variant-b', model_id: 'model-b', code: 'TOUR', name: 'Touring' }],
  skus: [{ id: 'sku-a', variant_id: 'variant-a', sku: 'FC1-PRO-DE-BLK', name: 'Black FC1', market_code: 'DE', color_code: 'BLK', size_code: '20' },
    { id: 'sku-b', variant_id: 'variant-b', sku: 'GT1-TOUR-AT', name: 'GT Touring', market_code: 'AT' }],
};
const engineering = {
  boms: [{ model_id: 'model-a', code: 'BOM-FC1', name: 'FC1 Assembly', revision_code: 'A', revision_status: 'RELEASED' },
    { model_id: 'model-b', code: 'BOM-GT1', name: 'GT Assembly', revision_code: 'Z', revision_status: 'DRAFT' }],
  buildSpecs: [{ sku_id: 'sku-a', code: 'BS-FC1-DE', status: 'RELEASED' },
    { sku_id: 'sku-b', code: 'BS-GT1', status: 'DRAFT' }],
};

test('vehicle SKU prefix follows the employee registration standard', () => {
  assert.equal(deriveVehicleSkuPrefix('A1'), 'A1');
  assert.equal(deriveVehicleSkuPrefix('A2'), 'A2');
  assert.equal(deriveVehicleSkuPrefix('FC1'), 'FC');
  assert.equal(deriveVehicleSkuPrefix('A1-ULTRA'), 'AU');
  assert.equal(deriveVehicleSkuPrefix('L1-PRO'), 'LP');
  assert.equal(deriveVehicleSkuPrefix('A1-ULTRA-PLUS'), null);
});

test('product register searches related variants, SKU, market, BOM and build specification', () => {
  for (const query of ['FC1', 'Folding', 'PRO', 'BLK', 'FC1-PRO-DE-BLK', 'BOM-FC1', 'FC1 Assembly', 'BS-FC1-DE']) {
    assert.equal(matchesModelRegisterSearch(model, platform, catalog, engineering, query, true), true, query);
  }
});

test('model search cannot match another model through unrelated SKU or BOM', () => {
  for (const query of ['GT1-TOUR-AT', 'BOM-GT1', 'BS-GT1', 'Touring']) {
    assert.equal(matchesModelRegisterSearch(model, platform, catalog, engineering, query, true), false, query);
  }
});

test('without a trusted engineering response, BOM / build-spec cannot be searched or inferred', () => {
  for (const query of ['BOM-FC1', 'BS-FC1-DE']) {
    assert.equal(matchesModelRegisterSearch(model, platform, catalog, engineering, query, false), false, query);
  }
  assert.equal(matchesModelRegisterSearch(model, platform, catalog, engineering, 'FC1-PRO-DE-BLK', false), true);
});

test('engineering summary reflects only loaded related records', () => {
  assert.equal(modelEngineeringStage(model.id, catalog, engineering), '生产规格已发布');
  assert.equal(modelEngineeringStage('model-b', catalog, engineering), '生产规格编制中');
  assert.equal(modelEngineeringStage('unknown', catalog, engineering), '待建立 BOM');
  assert.equal(modelBomSummary(model.id, engineering), 'BOM-FC1 / A');
  assert.equal(modelBomSummary('unknown', engineering), '未关联 BOM');
});
