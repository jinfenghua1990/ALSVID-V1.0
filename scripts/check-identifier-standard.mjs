// ALSVID ID governance gate: block NEW duplicate/opaque primary-key schemes.
// This is a STATIC migration gate, not proof of live database cutover.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const migrations=join(root,'packages/database/migrations');
const historical=new Set([
  "0001_identity_audit_partners.sql",
  "0002_product_engineering_assets.sql",
  "0003_procurement.sql",
  "0004_production_vehicle.sql",
  "0005_production_evidence_guards.sql",
  "0006_inventory_warehouse.sql",
  "0007_inventory_adjustment_guard.sql",
  "0008_inventory_concurrency_guards.sql",
  "0009_export_logistics.sql",
  "0010_logistics_inventory_permissions.sql",
  "0011_logistics_integrity_guards.sql",
  "0012_dealer_commerce_integrations.sql",
  "0013_commerce_integrity_guards.sql",
  "0014_dealer_history_integrity.sql",
  "0015_shopify_delivery_metadata.sql",
  "0016_platform_jobs.sql",
  "0017_finance_foundation.sql",
  "0018_finance_integrity_guards.sql",
  "0019_amazon_commerce_provider.sql",
  "0020_identity_email_auth.sql",
  "0021_identity_phone_login.sql",
  "0021_portal_identity_roles.sql",
  "0022_identity_session_password_policy.sql",
  "0023_identity_password_reset.sql",
  "0024_identity_auth_rate_limits.sql",
  "0025_marketing_product_colour_preferences.sql",
  "0025_service_case_foundation.sql",
  "0026_service_evidence_foundation.sql",
  "0027_supplier_membership_and_po_ack.sql",
  "0028_vehicle_owner_access_events.sql",
  "0029_owner_service_intake.sql",
  "0030_commerce_refund_review_foundation.sql",
  "0030_product_platform_naming.sql",
  "0031_first_party_storefront_orders.sql",
  "0032_build_spec_model_consistency.sql",
  "0032_dealer_partnership_intake.sql",
  "0033_test_ride_enquiries.sql",
  "0034_product_types_homepage_bindings.sql",
  "0035_product_catalog_publication.sql",
  "0036_storefront_order_submission.sql",
  "0037_warehouse_provider_configuration.sql",
  "0038_procurement_receipt_overage_guard.sql",
  "0039_commerce_lab_catalog.sql",
  "0040_commerce_lab_product_images.sql",
  "0041_commerce_lab_product_specifications.sql",
  "0042_catalog_publish_assets.sql",
  "0043_product_model_custom_fields.sql",
  "0044_procurement_gift_line_kind.sql",
  "0045_product_sku_dimension_guard.sql",
  "0046_storefront_layout_drafts.sql",
  "0047_stable_product_sku_numbers.sql",
  "0048_procurement_product_id_snapshots.sql",
  "0049_rename_product_models.sql",
  "0050_seed_initial_alsvid_models.sql",
  "0051_shared_product_sku_links.sql",
  "0052_production_delivery_shipments.sql"
]);
const errors=[];
const files=readdirSync(migrations).filter(x=>/^\d{4}_.+\.sql$/.test(x));
const scan=(file)=>{
  const sql=readFileSync(join(migrations,file),'utf8');
  const tables=[...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s*\(([\s\S]*?)\n\s*\);/gi)];
  return {sql,tables};
};
const historicUuid=[];
for(const file of files){
  const {sql,tables}=scan(file);
  if(historical.has(file)){
    for(const match of tables){
      if(/\bid\s+uuid\s+PRIMARY\s+KEY/i.test(match[2]))historicUuid.push(match[1]);
    }
    continue;
  }
  for(const match of tables){
    const name=match[1],body=match[2];
    const id=body.match(/^\s*id\s+(uuid|bigint|bigserial|integer|serial|text|varchar)[^,\n]*PRIMARY\s+KEY/im);
    if(id && !/\bid\s+bigint\s+GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\s+PRIMARY\s+KEY/i.test(body)){
      errors.push(`${file}: ${name} must use one BIGINT GENERATED AS IDENTITY primary key, not ${id[1]}`);
    }
    if(/\bid\s+uuid\b/i.test(body)&&!id)errors.push(`${file}: ${name} contains a non-standard UUID id field`);
  }
  if(/\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:internal_id|uuid_id|legacy_id|shadow_id)\s+uuid\b/i.test(sql)){
    errors.push(`${file}: new parallel UUID identity alias is forbidden`);
  }
  if(/CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?product\.(?:product_id|sku_number|sku_id)[\w]*_seq/i.test(sql)){
    errors.push(`${file}: use existing Product/SKU number authorities; do not create a second generator`);
  }
}
const stable=readFileSync(join(migrations,'0047_stable_product_sku_numbers.sql'),'utf8');
for(const [label,re] of [
  ['product immutable ID',/Product ID is immutable/],
  ['product uniqueness',/product_models_product_id_unique/],
  ['SKU immutable number',/SKU identity and owning product are immutable/],
  ['SKU uniqueness',/product_skus_sku_number_unique/],
  ['SKU number shape',/sku_number\s*=\s*product_id\s*\*\s*1000\s*\+\s*sku_sequence/],
]){
  if(!re.test(stable))errors.push(`0047_stable_product_sku_numbers.sql: missing ${label} invariant`);
}
if(!existsSync(join(root,'docs/IDENTIFIER_STANDARD_2026-11-02.md')))errors.push('Identifier contract missing');
if(errors.length){
  console.error('ALSVID numeric ID contract violations:');
  for(const e of errors)console.error('  ERROR '+e);
  process.exitCode=1;
}else{
  console.log(`Numeric ID governance check passed. Audited ${files.length} migration files.`);
  console.log(`Existing UUID PK declarations remain legacy migration debt (at least ${historicUuid.length} scanned historical tables); not claimed converted.`);
  console.log('New business tables must use BIGINT identity PKs; new duplicate Product/SKU generators are blocked.');
}
