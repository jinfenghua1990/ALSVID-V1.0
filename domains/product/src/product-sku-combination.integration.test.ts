import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Database } from '@alsvid/database';
import { ProductService } from './application/product-service.js';
import { PostgresProductRepository } from './infrastructure/postgres-product-repository.js';
import { ProductConflictError } from './core/errors.js';

const code=()=>('U'+randomUUID().replaceAll('-','').slice(0,15)).toUpperCase();

test('real PostgreSQL guards future concurrent-prone duplicate SKU dimensions without rekeying historic SKUs',
 {skip:!process.env.DATABASE_URL},async()=>{
 const db=new Database();
 try{
  const user=(await db.query<{id:string}>(
   "INSERT INTO identity.users(email,display_name,password_hash) VALUES($1,'SKU Test','x') RETURNING id",
   ['sku-'+randomUUID()+'@example.test'])).rows[0]!;
  const platform=(await db.query<{id:string}>(
    "SELECT id FROM product.platforms WHERE code='FC' LIMIT 1")).rows[0]!;
  const model=(await db.query<{id:string}>(
   "INSERT INTO product.models(platform_id,code,name,sku_prefix) VALUES($1,$2,'SKU fixture','T8') RETURNING id",
   [platform.id,code()])).rows[0]!;
  const variant=(await db.query<{id:string}>(
   "INSERT INTO product.variants(model_id,code,name) VALUES($1,$2,'Core') RETURNING id",
   [model.id,code()])).rows[0]!;
  const actor={userId:user.id,permissions:['product.read','product.write']};
  const service=new ProductService(new PostgresProductRepository(db),{record:async()=>{}});
  const first=await service.createSku(actor,{variantId:variant.id,sku:'T8-EBI-BLK',name:'Black 20',
   marketCode:'DE',colorCode:'black',sizeCode:'20'});
  assert.equal(first.color_code,'BLACK');
  await assert.rejects(()=>service.createSku(actor,{variantId:variant.id,sku:'T8-EBI-BK2',
   name:'Duplicate Black',marketCode:'de',colorCode:'BLACK',sizeCode:'20'}),ProductConflictError);
  const gray=await service.createSku(actor,{variantId:variant.id,sku:'T8-EBI-GRY',name:'Gray 20',
   marketCode:'DE',colorCode:'GRAY',sizeCode:'20'});
  await assert.rejects(()=>service.updateEntity(actor,'sku',gray.id,{expectedVersion:gray.version,
   colorCode:'black'}),ProductConflictError);
  await service.updateEntity(actor,'sku',first.id,{expectedVersion:first.version,status:'RETIRED'});
  const moved=await service.updateEntity(actor,'sku',gray.id,{expectedVersion:gray.version,
   colorCode:'black'});
  assert.equal(moved.color_code,'BLACK');
  const preserved=await db.query<{sku:string}>('SELECT sku FROM product.skus WHERE id=$1',[first.id]);
  assert.equal(preserved.rows[0]!.sku,first.sku);
 }finally{await db.close();}
});
