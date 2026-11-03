-- ============================================================
-- ALSVID 业务数据清空 · 预检（只读，不改任何数据）
-- 用途：执行 ops/reset-business-data.sql 之前，先看清空范围与安全检查
-- ============================================================

-- 1) 将被清空的表（来自 migrations，共 97 张）与当前行数
SELECT schemaname || '.' || relname AS table_name, n_live_tup AS approx_rows
FROM pg_stat_user_tables
WHERE schemaname || '.' || relname IN (
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
ORDER BY n_live_tup DESC, relname;

-- 2) 安全检查：保留表是否通过外键指向业务表
--    出现任何行都必须先停下，把对应表加入 KEEP 名单
SELECT
  conrelid::regclass  AS keep_table,
  confrelid::regclass AS business_table,
  conname             AS constraint_name
FROM pg_constraint
WHERE contype='f'
  AND conrelid::regclass::text IN ('identity.users','identity.roles','identity.permissions',
      'identity.user_roles','identity.role_permissions','identity.sessions',
      'audit.events','platform.jobs','product.product_types','product.model_field_definitions')
  AND confrelid::regclass::text ~ '^(commerce|commerce_lab|dealer|engineering|finance|integrations|inventory|logistics|partners|procurement|production|product|service|vehicle|warehouse|assets)\.'
ORDER BY 1,2;

-- 3) 将被保留的表
  -- audit.events
  -- identity.permissions
  -- identity.role_permissions
  -- identity.roles
  -- identity.sessions
  -- identity.user_roles
  -- identity.users
  -- platform.jobs
  -- product.model_field_definitions
  -- product.product_types
