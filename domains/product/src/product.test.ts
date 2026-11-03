import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProductCode, ProductValidationError } from './index.js';

test('product codes normalize to stable uppercase identifiers', () => {
  assert.equal(normalizeProductCode(' fc1-pro '), 'FC1-PRO');
  assert.equal(normalizeProductCode('ct_1'), 'CT_1');
});

test('product codes reject spaces and punctuation', () => {
  assert.throws(() => normalizeProductCode('FC 1'), ProductValidationError);
  assert.throws(() => normalizeProductCode('FC1/PRO'), ProductValidationError);
});


test('SKU dimensions normalize color and size independently from SKU and Model identifiers',async()=>{
 const {normalizeSkuDimension}=await import('./index.js');
 assert.equal(normalizeSkuDimension(' graphite_black ','colorCode'),'GRAPHITE_BLACK');
 assert.equal(normalizeSkuDimension(' 20-inch ','sizeCode'),'20-INCH');
 assert.equal(normalizeSkuDimension('  ','colorCode'),null);
 assert.equal(normalizeSkuDimension(undefined,'sizeCode'),null);
 for(const input of ['BLACK/GRAY',' ', 'B'.repeat(33),'white grey']){
   if(input.trim()==='')continue;
   assert.throws(()=>normalizeSkuDimension(input,'colorCode'),ProductValidationError);
 }
});

test('mnemonic product SKUs follow the 2-3-3 controlled code', async () => {
  const {normalizeMnemonicSku,normalizeMnemonicPrefix} = await import('./index.js');
  assert.equal(normalizeMnemonicSku(' a1-ebi-blk '), 'A1-EBI-BLK');
  assert.equal(normalizeMnemonicSku('un-hlm-mbk'), 'UN-HLM-MBK');
  assert.equal(normalizeMnemonicPrefix(' au '), 'AU');
  for (const bad of ['A1-EBI-BLACK','A1-XYZ-BLK','ALS-EBI-BLK','A1_EBI_BLK','A1-EBI-0'])
    assert.throws(() => normalizeMnemonicSku(bad), ProductValidationError);
  assert.throws(() => normalizeMnemonicPrefix('A1-ULTRA'), ProductValidationError);
});
