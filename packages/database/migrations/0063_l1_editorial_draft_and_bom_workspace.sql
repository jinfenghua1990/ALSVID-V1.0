-- L1 (100006) editorial readiness: preserve the F8 -> L1 historic merge.
-- No catalogue publication, BOM release, pricing, inventory or production activation.
-- WWW media is a checked repository-static reference, not an R2 asset-object record.
-- Intentionally create only a DRAFT BOM shell without parts or approved build spec.
DO $l1_readiness$
DECLARE
  target_model_id uuid;
  target_sku_id uuid;
  draft_bom_id uuid;
BEGIN
  -- Fresh installation has no owner-specific F8/L1 history. Never seed a fictitious bike.
  IF NOT EXISTS (
    SELECT 1 FROM product.model_merge_aliases
    WHERE legacy_product_id=100001 AND canonical_product_id=100006
      AND legacy_sku_number=100001001 AND canonical_sku_number=100006001
  ) THEN
    RAISE NOTICE 'L1 historical merge alias absent; skipping owner-specific editorial draft';
    RETURN;
  END IF;

  SELECT id INTO target_model_id FROM product.models
  WHERE product_id=100006 AND code='L1' AND status='ACTIVE' FOR UPDATE;
  SELECT id INTO target_sku_id FROM product.skus
  WHERE product_id=100006 AND sku_number=100006001
    AND sku='ALS-DEF-L1' AND status='ACTIVE' FOR UPDATE;

  IF target_model_id IS NULL OR target_sku_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM product.models
                    WHERE product_id=100001 AND status='RETIRED')
     OR NOT EXISTS (SELECT 1 FROM product.variants
                    WHERE model_id=target_model_id AND code='DEFAULT' AND status='ACTIVE')
  THEN
    RAISE EXCEPTION 'L1 editorial prerequisites changed: refusing business-data setup';
  END IF;

  -- This is a factual identity description, NOT an approved production specification.
  UPDATE product.models SET
    description='ALSVID L1：20英寸碳纤维折叠电动自行车，后轮毂驱动。现有产品图片及详细技术参数为参考资料，最终量产配置、颜色和售价尚待确认。',
    version=version+1,updated_at=now()
  WHERE id=target_model_id AND btrim(description)='';

  -- One existing DEFAULT version belongs to L1. Never invent PRO/Standard sales
  -- variants or replace the immutable canonical SKU number.
  UPDATE product.variants SET
    description='现有默认配置版本；尚未确认最终规格或 BOM，不代表已发布量产版本。',
    version=version+1,updated_at=now()
  WHERE model_id=target_model_id AND code='DEFAULT' AND btrim(description)='';

  -- Local image files under apps/web/public/products/l8 are already rendered in
  -- the L1 page. Register their *display reference*, not a fake cloud asset.
  -- Explicitly disabled until copyright and finalized model photography are reviewed.
  INSERT INTO product.catalog_publish_assets
    (model_code,image_path,enabled,evidence_note)
  VALUES (
    'L1','/products/l8/retouched-side.webp',false,
    'L1 existing static retouched manufacturer-reference image. Source/provenance and final production photography require manual review before public catalogue approval.'
  )
  ON CONFLICT (model_code) DO NOTHING;

  -- Add an INTERNAL publication draft so Admin can edit/review the L1 image,
  -- localized title and provenance. No transition to IN_REVIEW/PUBLISHED.
  INSERT INTO product.catalog_publications
    (model_id,status,title_zh,title_de,title_en,image_path,evidence_note)
  VALUES (
    target_model_id,'DRAFT',
    'ALSVID L1 · 碳纤维折叠电助力自行车',
    'ALSVID L1 · Carbon-Falt-E-Bike',
    'ALSVID L1 · Carbon folding e-bike',
    '/products/l8/retouched-side.webp',
    'Manufacturer reference photograph used on existing L1 detail page. NOT confirmed ALSVID production artwork; verify origin/usage rights and final appearance before publishing.'
  )
  ON CONFLICT (model_id) DO NOTHING;

  -- Create the missing L1 engineering WORKSPACE only. A DRAFT with no parts is
  -- visibly incomplete: do not release the BOM or create a build specification.
  IF NOT EXISTS (
    SELECT 1 FROM engineering.boms WHERE product_id=100006
  ) THEN
    INSERT INTO engineering.boms(model_id,code,name,description)
    VALUES (
      target_model_id,'L1-BOM','ALSVID L1 整车 BOM（待配置）',
      '待工厂提供最终零件清单、数量、版本和技术核准。仅为草稿容器，不构成可生产的 BOM。'
    )
    RETURNING id INTO draft_bom_id;
    INSERT INTO engineering.bom_revisions(bom_id,revision_code,status,notes)
    VALUES (
      draft_bom_id,'A','DRAFT',
      '未填写 BOM 明细；严禁作为已发布物料清单或生产执行依据。'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM product.catalog_publications
    WHERE model_id=target_model_id
  ) OR NOT EXISTS (
    SELECT 1 FROM product.catalog_publish_assets
    WHERE model_code='L1'
  ) OR NOT EXISTS (
    SELECT 1 FROM engineering.boms WHERE product_id=100006
  ) THEN
    RAISE EXCEPTION 'L1 editorial/BOM draft setup incomplete; rolling back';
  END IF;
END;
$l1_readiness$;

-- Global safety rule: an empty BOM shell may be edited, but can never be released.
-- This also protects future models created through the existing Engineering API.
CREATE OR REPLACE FUNCTION engineering.prevent_empty_bom_revision_release()
RETURNS trigger LANGUAGE plpgsql AS $bom_guard$
BEGIN
  IF NEW.status='RELEASED' AND OLD.status='DRAFT' AND NOT EXISTS (
    SELECT 1 FROM engineering.bom_lines l WHERE l.revision_id=NEW.id
  ) THEN
    RAISE EXCEPTION 'Cannot release BOM revision without at least one BOM line';
  END IF;
  RETURN NEW;
END;
$bom_guard$;
CREATE TRIGGER bom_revision_requires_lines_before_release
BEFORE UPDATE OF status ON engineering.bom_revisions
FOR EACH ROW EXECUTE FUNCTION engineering.prevent_empty_bom_revision_release();
