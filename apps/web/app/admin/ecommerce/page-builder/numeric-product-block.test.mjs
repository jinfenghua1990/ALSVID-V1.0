import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
const file=new URL('./numeric-product-block.ts',import.meta.url);
const source=readFileSync(file,'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
const module={exports:{}};
runInNewContext(outputText,{exports:module.exports,module});
const {numericProductId,verifiedPublishedProducts,numericProductBlock}=module.exports;
const item={productId:'100123',modelId:'uuid-internal',code:'A1-ULTRA',type:'BIKE',image:'/home/original/approved.webp',title:{zh:'A1 Ultra',de:'A1 Ultra',en:'A1 Ultra'}};
test('6-digit product id, 9-digit SKU number, never a model code or UUID',()=>{
  assert.equal(numericProductId('100123'),true);
  for(const wrong of ['FC1','A1-ULTRA','123','012345','100123001','550e8400-e29b-41d4-a716-446655440000',100123])assert.equal(numericProductId(wrong),false);
});
test('only unique, verified published product ids become draft blocks',()=>{
  const items=verifiedPublishedProducts({items:[item,{...item}, {...item,productId:'100124',image:'//evil.com/p.png'}]});
  assert.equal(items.length,1);
  assert.equal(items[0].productId,'100123');
  const html=numericProductBlock({...item,title:{...item.title,de:'Bike <test>'}},'de');
  assert.match(html,/data-product-id="100123"/);
  assert.match(html,/href="\/de\/explore\/100123"/);
  assert.match(html,/Bike &lt;test&gt;/);
  assert.doesNotMatch(html, /price|inventory|checkout|stock/i);
});
test('no examples when public catalogue unavailable',()=>{assert.throws(()=>verifiedPublishedProducts(null));assert.throws(()=>numericProductBlock({...item,productId:'FC1'},'de'));});
