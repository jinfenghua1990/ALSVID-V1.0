import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../_design/renderer.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('./product-client.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./product.module.css', import.meta.url), 'utf8');

test('canonical admin product module embeds the live single-source product archive', () => {
  assert.match(renderer, /isLiveProductRoot\s*\?\s*\(\s*<ProductClient embedded \/>/);
  assert.match(renderer, /import ProductClient from '\.\.\/product\/product-client'/);
});

test('product archive is list-first; version and SKU editing happens in a dialog', () => {
  assert.ok(client.indexOf('id="vehicle-models"') < client.indexOf('id="product-types"'));
  assert.doesNotMatch(client, /id="product-maintenance-panel"|配置版本与 SKU 管理|配置版本与 SKU 明细/);
  assert.match(client, /aria-label="编辑车型配置及 SKU"/);
  assert.match(client, /setManageModelId\(model.id\)/);
  assert.match(client, /aria-label="商业配置版本"/);
  assert.match(client, /aria-label="车型 SKU 规格"/);
  assert.match(client, /创建版本/);
  assert.match(client, /创建 SKU/);
  assert.match(css, /\.variantSkuDialog/);
  assert.match(client, /id="parts-library-panel"/);
  assert.match(client, /id="production-bom"/);
  assert.doesNotMatch(client, /id="engineering-panel"/);
  assert.match(client, /revealLinkedPanel/);
  assert.match(css, /\.modelTable tbody tr:nth-child\(even\)/);
  assert.match(client, /className=\{styles\.archiveWorkspace\}/);
  assert.match(client, /className=\{styles\.archiveHeading\}/);
  assert.match(client, /aria-label="整车产品档案"/);
  assert.match(client, /aria-label="生产零件档案"/);
  assert.match(client, /aria-label="可售配件档案"/);
  assert.match(client, /aria-label="技术平台档案"/);
  assert.match(client, /aria-label=\{platformDraft === 'new' \? '新建技术平台'/);
  assert.match(client, /\/v1\/product\/platforms/);
  assert.match(client, /id="configuration"/);
  assert.match(client, /role="dialog"/);
  assert.match(client, /创建商品|新建整车/);
  assert.doesNotMatch(client, /className=\{styles\.metrics\} aria-label="产品数据概览"/);
  assert.doesNotMatch(client, /<summary>产品分类与技术平台/);
  assert.match(css, /\.archiveTableWrap/);
  assert.match(css, /\.archiveEmpty/);
  assert.match(css, /\.archiveHeading h1/);
  assert.match(css, /\.createCard/);
  assert.doesNotMatch(client, /自定义字段管理/);
  assert.match(client, /function ModelFieldInputs/);
  assert.match(client, /readModelFields/);
  assert.doesNotMatch(client, /\/v1\/product\/model-fields/);
  assert.doesNotMatch(client, /aria-label="商品字段定义"/);
  assert.doesNotMatch(css, /\.fieldManagerCard/);

});
