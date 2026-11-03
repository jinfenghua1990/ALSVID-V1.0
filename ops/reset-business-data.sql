-- ============================================================
-- ALSVID 业务数据清空 · 执行脚本（不可逆！）
-- 保留：登录体系(identity)、审计(audit)、任务框架(platform)、
--       字典(product.product_types / product.model_field_definitions)
-- 清空：其余全部业务数据（商品、SKU、订单、价格、库存、仓库、物流、
--       采购、生产、伙伴、财务、经销商、车辆、售后、集成同步、装修草稿）
--
-- 执行前必读：
--   1. 先跑 ops/reset-business-data.dry-run.sql，确认第 2 步安全检查无任何行
--   2. 先做备份（Neon 控制台 Restore/Backup，或 pg_dump，见 ops/RESET-README.md）
--   3. 序列 RESTART IDENTITY：product_id 将从 100001 重新开始
--   4. 登录账号、角色权限、审计记录全部保留
-- ============================================================

BEGIN;

DO $reset$
DECLARE
  t record;
  wiped integer := 0;
BEGIN
  FOR t IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname || '.' || tablename IN (
      'assets.links',
      'assets.objects',
      'commerce.channels',
      'commerce.exception_events',
      'commerce.external_order_lines',
      'commerce.external_orders',
      'commerce.fulfillment_lines',
      'commerce.fulfillments',
      'commerce.mapping_exceptions',
      'commerce.order_snapshots',
      'commerce.refund_review_requests',
      'commerce.sku_mappings',
      'commerce.storefront_layout_drafts',
      'commerce.storefront_order_events',
      'commerce.storefront_order_lines',
      'commerce.storefront_orders',
      'commerce.storefront_payment_verifications',
      'commerce.storefront_prices',
      'commerce_lab.catalog_products',
      'dealer.dealers',
      'dealer.status_history',
      'engineering.bom_lines',
      'engineering.bom_revisions',
      'engineering.boms',
      'engineering.build_specs',
      'engineering.parts',
      'finance.allocation_reversals',
      'finance.allocations',
      'finance.document_lines',
      'finance.documents',
      'finance.fx_rates',
      'finance.landed_cost_allocations',
      'finance.landed_cost_batches',
      'finance.landed_cost_components',
      'finance.obligation_voids',
      'finance.obligations',
      'finance.payment_reversals',
      'finance.payments',
      'identity.supplier_memberships',
      'integrations.external_sku_mappings',
      'integrations.external_warehouse_mappings',
      'integrations.ingestion_attempts',
      'integrations.sync_cursors',
      'integrations.warehouse_provider_connections',
      'integrations.warehouse_provider_events',
      'integrations.warehouse_sync_runs',
      'integrations.webhook_receipts',
      'inventory.movements',
      'inventory.reservations',
      'logistics.customs_declarations',
      'logistics.customs_events',
      'logistics.customs_lines',
      'logistics.receiving_handoffs',
      'logistics.shipment_cargo',
      'logistics.shipment_events',
      'logistics.shipments',
      'partners.addresses',
      'partners.contacts',
      'partners.identifiers',
      'partners.partners',
      'partners.roles',
      'partners.supplier_factories',
      'procurement.purchase_order_lines',
      'procurement.purchase_order_snapshots',
      'procurement.purchase_orders',
      'procurement.quotation_lines',
      'procurement.quotations',
      'procurement.receipt_lines',
      'procurement.receipts',
      'procurement.supplier_confirmation_lines',
      'procurement.supplier_confirmations',
      'procurement.supplier_po_acknowledgements',
      'product.catalog_publications',
      'product.catalog_publish_assets',
      'product.homepage_product_bindings',
      'product.model_merge_aliases',
      'product.models',
      'product.platforms',
      'product.series',
      'product.skus',
      'product.variants',
      'production.as_built_deviations',
      'production.factory_finished_receipts',
      'production.order_state_history',
      'production.production_orders',
      'production.production_units',
      'production.qc_inspections',
      'service.case_activities',
      'service.case_history',
      'service.cases',
      'service.owner_submission_requests',
      'vehicle.owner_access_events',
      'vehicle.vehicles',
      'warehouse.locations',
      'warehouse.stocktake_counts',
      'warehouse.stocktake_sessions',
      'warehouse.warehouses'
    )
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', t.schemaname, t.tablename);
    wiped := wiped + 1;
  END LOOP;
  RAISE NOTICE 'wiped % business tables', wiped;
END
$reset$;

-- 安全校验：保留表必须还在，否则整体回滚
DO $verify$
DECLARE
  users_left integer;
  types_left integer;
BEGIN
  SELECT count(*) INTO users_left FROM identity.users;
  SELECT count(*) INTO types_left FROM product.product_types;
  IF users_left = 0 THEN RAISE EXCEPTION 'SAFETY: identity.users 为空，CASCADE 误伤保留表，已回滚'; END IF;
  IF types_left = 0 THEN RAISE EXCEPTION 'SAFETY: product.product_types 为空，CASCADE 误伤保留表，已回滚'; END IF;
END
$verify$;

COMMIT;

-- 执行后复查（手动）：
--   SELECT count(*) FROM product.models;              -- 0
--   SELECT count(*) FROM commerce.storefront_orders;  -- 0
--   SELECT count(*) FROM identity.users;              -- 保持原值
