import type { DatabasePort, QueryExecutor } from '@alsvid/database';
import type { HomepageBinding, ModelFieldDefinition, PlatformRow, ProductCatalog, ProductEntityKind } from '../core/model.js';
import type { CatalogPublishAssetRow,PublicationRow, PublicationDraft, PublicationStatus } from '../core/publication.js';
import type { CreateModelRecord, CreatePlatformRecord, CreateSkuRecord, CreateVariantRecord, ProductRepository, UpdatePlatformRecord, UpdateProductRecord } from '../application/ports.js';

export class PostgresProductRepository implements ProductRepository {
  constructor(private readonly database: DatabasePort) {}

  transaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }

  async catalog(): Promise<ProductCatalog> {
    const [platforms, models, variants, skus, productTypes,modelFieldDefs] = await Promise.all([
      this.database.query<any>('SELECT id, code, name, description, status, version, created_at, updated_at FROM product.platforms ORDER BY code'),
      this.database.query<any>('SELECT id, product_id, platform_id, product_type_code, code, sku_prefix, name, description, custom_fields, status, version, created_at, updated_at FROM product.models m WHERE NOT EXISTS (SELECT 1 FROM product.model_merge_aliases a WHERE a.legacy_product_id=m.product_id) ORDER BY code'),
      this.database.query<any>('SELECT id, model_id, code, name, description, attributes, status, version, created_at, updated_at FROM product.variants v WHERE NOT EXISTS (SELECT 1 FROM product.model_merge_aliases a WHERE a.legacy_product_id=v.product_id) ORDER BY code'),
      this.database.query<any>('SELECT id, product_id, sku_number, sku_sequence, variant_id, sku, name, market_code, color_code, size_code, attributes, status, version, created_at, updated_at FROM product.skus s WHERE NOT EXISTS (SELECT 1 FROM product.model_merge_aliases a WHERE a.legacy_product_id=s.product_id) ORDER BY sku'),
      this.database.query<any>('SELECT code,name,description,status FROM product.product_types ORDER BY code'),
      this.modelFieldDefinitions(),
    ]);
    return { modelFieldDefinitions:modelFieldDefs,productTypes: productTypes.rows, platforms: platforms.rows, models: models.rows, variants: variants.rows, skus: skus.rows.map((row) => ({ ...row, market_code: row.market_code?.trim() ?? null })) };
  }


  async modelFieldDefinitions():Promise<ModelFieldDefinition[]> {
    const rows=await this.database.query<ModelFieldDefinition>(
      'SELECT id,product_type_code,code,label,field_type,options,required,status,version FROM product.model_field_definitions ORDER BY product_type_code,code');
    return rows.rows;
  }

  async createModelField(input:{
    productTypeCode:'BIKE'|'ACCESSORY'|'SERVICE_PART';code:string;label:string;
    fieldType:'TEXT'|'NUMBER'|'BOOLEAN'|'SELECT';options:string[];required:boolean;actorUserId:string;
  }):Promise<ModelFieldDefinition> {
    const result=await this.database.query<ModelFieldDefinition>(
      `INSERT INTO product.model_field_definitions
       (product_type_code,code,label,field_type,options,required,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$7)
       RETURNING id,product_type_code,code,label,field_type,options,required,status,version`,
      [input.productTypeCode,input.code,input.label,input.fieldType,JSON.stringify(input.options),input.required,input.actorUserId]);
    return result.rows[0]!;
  }

  async updateModelField(input:{
    id:string;expectedVersion:number;label:string|null;
    status:'ACTIVE'|'RETIRED'|null;required:boolean|null;actorUserId:string;
  }):Promise<ModelFieldDefinition|null> {
    const result=await this.database.query<ModelFieldDefinition>(
      `UPDATE product.model_field_definitions SET label=COALESCE($3,label),
         status=COALESCE($4,status),required=COALESCE($5,required),
         version=version+1,updated_by=$6,updated_at=now()
       WHERE id=$1 AND version=$2
       RETURNING id,product_type_code,code,label,field_type,options,required,status,version`,
      [input.id,input.expectedVersion,input.label,input.status,input.required,input.actorUserId]);
    return result.rows[0]??null;
  }

  async deleteModelField(input:{id:string;expectedVersion:number;actorUserId:string}, executor:QueryExecutor):Promise<(ModelFieldDefinition & {affectedModels:number})|null> {
    const locked=await executor.query<ModelFieldDefinition>(
      'SELECT id,product_type_code,code,label,field_type,options,required,status,version FROM product.model_field_definitions WHERE id=$1 FOR UPDATE',
      [input.id],
    );
    const current=locked.rows[0];
    if(!current||current.version!==input.expectedVersion)return null;
    const cleaned=await executor.query(
      `UPDATE product.models SET custom_fields=custom_fields-$1::text,version=version+1,updated_by=$3,updated_at=now()
       WHERE product_type_code=$2 AND custom_fields ? $1`,
      [current.code,current.product_type_code,input.actorUserId],
    );
    const deleted=await executor.query<ModelFieldDefinition>(
      `DELETE FROM product.model_field_definitions WHERE id=$1 AND version=$2
       RETURNING id,product_type_code,code,label,field_type,options,required,status,version`,
      [input.id,input.expectedVersion],
    );
    const row=deleted.rows[0];
    return row ? {...row,affectedModels:cleaned.rowCount ?? 0} : null;
  }

  async modelFieldExists(id:string):Promise<boolean> {
    const result=await this.database.query('SELECT 1 FROM product.model_field_definitions WHERE id=$1',[id]);
    return result.rows.length>0;
  }

  async modelFieldTarget(id:string):Promise<{product_type_code:'BIKE'|'ACCESSORY'|'SERVICE_PART';custom_fields:Record<string,unknown>}|null> {
    const result=await this.database.query<{product_type_code:'BIKE'|'ACCESSORY'|'SERVICE_PART';custom_fields:Record<string,unknown>}>(
      'SELECT product_type_code,custom_fields FROM product.models WHERE id=$1',[id]);
    return result.rows[0]??null;
  }

  async createPlatform(input: CreatePlatformRecord): Promise<PlatformRow> {
    const result = await this.database.query<PlatformRow>(
      `INSERT INTO product.platforms(code,name,description,status,created_by,updated_by)
       VALUES ($1,$2,$3,'DRAFT',$4,$4) RETURNING id,code,name,description,status,version,created_at,updated_at`,
      [input.code,input.name,input.description,input.actorUserId],
    );
    return result.rows[0]!;
  }

  async updatePlatform(input: UpdatePlatformRecord): Promise<PlatformRow | null> {
    const result = await this.database.query<PlatformRow>(
      `UPDATE product.platforms p SET name=COALESCE($3,name),status=COALESCE($4,status),
         description=CASE WHEN $5::boolean THEN $6 ELSE description END,
         version=version+1,updated_by=$7,updated_at=now()
       WHERE p.id=$1 AND p.version=$2
         AND ($4::text IS DISTINCT FROM 'RETIRED'
              OR NOT EXISTS (SELECT 1 FROM product.models m
                  WHERE m.platform_id=p.id AND m.status <> 'RETIRED'))
       RETURNING id,code,name,description,status,version,created_at,updated_at`,
      [input.id,input.expectedVersion,input.name,input.status,input.descriptionProvided,input.description,input.actorUserId],
    );
    return result.rows[0] ?? null;
  }

  async platformExists(id: string): Promise<boolean> {
    const result = await this.database.query('SELECT 1 FROM product.platforms WHERE id=$1', [id]);
    return result.rows.length > 0;
  }

  async platformHasUnretiredModels(id: string): Promise<boolean> {
    const result = await this.database.query(
      "SELECT 1 FROM product.models WHERE platform_id=$1 AND status <> 'RETIRED' LIMIT 1", [id]);
    return result.rows.length > 0;
  }

  async homepageBindings(): Promise<HomepageBinding[]> {
    const result = await this.database.query<any>(`
      SELECT h.slot_code,h.target_model_code,h.mode,h.manual_model_id,h.version,
             m.id AS resolved_model_id,m.code AS resolved_model_code
      FROM product.homepage_product_bindings h
      LEFT JOIN product.models m ON m.code=h.target_model_code
        AND m.status='ACTIVE' AND m.product_type_code='BIKE'
        AND (h.mode='AUTO' OR m.id=h.manual_model_id)
      ORDER BY h.slot_code`);
    return result.rows as HomepageBinding[];
  }

  async homepageBindingExists(slot: string): Promise<boolean> {
    const result = await this.database.query('SELECT 1 FROM product.homepage_product_bindings WHERE slot_code=$1', [slot]);
    return result.rows.length > 0;
  }

  async modelForHomepageSlot(slot: string, modelId: string): Promise<boolean> {
    const result = await this.database.query(`
      SELECT 1 FROM product.homepage_product_bindings h
      JOIN product.models m ON m.id=$2 AND m.code=h.target_model_code
      WHERE h.slot_code=$1 AND m.status='ACTIVE' AND m.product_type_code='BIKE'`, [slot, modelId]);
    return result.rows.length > 0;
  }

  async updateHomepageBinding(input: {slot: string; mode: string; modelId: string | null; expectedVersion: number; actorUserId: string}): Promise<HomepageBinding | null> {
    const result = await this.database.query(`
      UPDATE product.homepage_product_bindings
      SET mode=$3,manual_model_id=$4,version=version+1,updated_by=$5,updated_at=now()
      WHERE slot_code=$1 AND version=$2 RETURNING slot_code`,
      [input.slot,input.expectedVersion,input.mode,input.modelId,input.actorUserId]);
    if (!result.rows.length) return null;
    const bindings = await this.homepageBindings();
    return bindings.find(binding => binding.slot_code === input.slot) ?? null;
  }


  private readonly publicationProjection = `
    SELECT p.model_id,m.product_id,m.code AS model_code,m.product_type_code,m.status AS model_status,
      p.status,p.title_zh,p.title_de,p.title_en,p.image_path,p.evidence_note,
      p.version,p.submitted_at,p.published_at,p.withdrawn_at
    FROM product.catalog_publications p
    JOIN product.models m ON m.id=p.model_id`;

  async publications(): Promise<PublicationRow[]> {
    const result = await this.database.query<PublicationRow>(
      this.publicationProjection + ' ORDER BY m.code');
    return result.rows;
  }

  async publishedPublications(): Promise<PublicationRow[]> {
    const result = await this.database.query<PublicationRow>(
      this.publicationProjection + `
        WHERE p.status='PUBLISHED' AND m.status='ACTIVE'
        AND m.product_type_code IN ('BIKE','ACCESSORY','SERVICE_PART')
        ORDER BY p.published_at DESC`);
    return result.rows;
  }

  async suppressedPublishedCodes():Promise<string[]> {
    const result=await this.database.query<{code:string}>(`
      SELECT m.code FROM product.catalog_publications p
      JOIN product.models m ON m.id=p.model_id
      WHERE p.published_at IS NOT NULL
        AND (p.status<>'PUBLISHED' OR m.status<>'ACTIVE')
        AND m.code IN ('A1-ULTRA','L1-PRO','A1','L1')`);
    return result.rows.map(row=>row.code);
  }

  async publication(modelId:string):Promise<PublicationRow|null> {
    const result=await this.database.query<PublicationRow>(
      this.publicationProjection+' WHERE p.model_id=$1',[modelId]);
    return result.rows[0]??null;
  }

  async catalogPublishAssets():Promise<CatalogPublishAssetRow[]>{
    const result=await this.database.query<CatalogPublishAssetRow>(
      'SELECT model_code,image_path,enabled FROM product.catalog_publish_assets ORDER BY model_code');
    return result.rows;
  }

  async createPublication(modelId:string,actorUserId:string):Promise<PublicationRow|null> {
    const result=await this.database.query(`
      INSERT INTO product.catalog_publications(model_id,created_by,updated_by)
      SELECT m.id,$2,$2 FROM product.models m
      WHERE m.id=$1 AND m.status IN ('DRAFT','ACTIVE')
        AND m.product_type_code IN ('BIKE','ACCESSORY','SERVICE_PART')
      ON CONFLICT (model_id) DO NOTHING RETURNING model_id`,
      [modelId,actorUserId]);
    if(!result.rows.length)return null;
    return this.publication(modelId);
  }

  async savePublication(modelId:string,expectedVersion:number,body:PublicationDraft,imagePath:string,actorUserId:string):Promise<PublicationRow|null> {
    const result=await this.database.query(`
      UPDATE product.catalog_publications p
      SET title_zh=$3,title_de=$4,title_en=$5,image_path=$6,evidence_note=$7,
        status='DRAFT',version=version+1,updated_by=$8,updated_at=now(),
        submitted_at=NULL,withdrawn_at=NULL
      WHERE p.model_id=$1 AND p.version=$2 AND p.status IN ('DRAFT','WITHDRAWN')
        AND EXISTS(SELECT 1 FROM product.models m WHERE m.id=p.model_id
        AND m.status IN ('DRAFT','ACTIVE')
        AND m.product_type_code IN ('BIKE','ACCESSORY','SERVICE_PART'))
      RETURNING model_id`,
      [modelId,expectedVersion,body.titleZh,body.titleDe,body.titleEn,imagePath,body.evidenceNote,actorUserId]);
    if(!result.rows.length)return null;
    return this.publication(modelId);
  }

  async transitionPublication(modelId:string,expectedVersion:number,fromStatus:PublicationStatus,
    toStatus:PublicationStatus,actorUserId:string):Promise<PublicationRow|null> {
    const result=await this.database.query(`
      UPDATE product.catalog_publications p
      SET status=$4,version=version+1,updated_by=$5,updated_at=now(),
        submitted_at=CASE WHEN $4='IN_REVIEW' THEN now() ELSE submitted_at END,
        published_at=CASE WHEN $4='PUBLISHED' THEN now() ELSE published_at END,
        withdrawn_at=CASE WHEN $4='WITHDRAWN' THEN now() ELSE withdrawn_at END,
        reviewed_by=CASE WHEN $4='PUBLISHED' THEN $5 ELSE reviewed_by END
      WHERE p.model_id=$1 AND p.version=$2 AND p.status=$3
        AND ($4='WITHDRAWN' OR EXISTS(
          SELECT 1 FROM product.models m WHERE m.id=p.model_id AND m.status='ACTIVE'
          AND m.product_type_code IN ('BIKE','ACCESSORY','SERVICE_PART')
          AND (($4='PUBLISHED' AND EXISTS(SELECT 1 FROM product.catalog_publish_assets a
            WHERE a.model_code=m.code AND a.enabled AND a.image_path=p.image_path))
          OR $4='IN_REVIEW')))
      RETURNING model_id`,
      [modelId,expectedVersion,fromStatus,toStatus,actorUserId]);
    if(!result.rows.length)return null;
    return this.publication(modelId);
  }

  async createModel(input: CreateModelRecord): Promise<any> {
    // Lock the ACTIVE platform row while creating a bike to serialize archive/create.
    const sql = input.productTypeCode === 'BIKE'
      ? `INSERT INTO product.models(platform_id,product_type_code,code,name,description,custom_fields,created_by,updated_by,sku_prefix)
         SELECT p.id,$2,$3,$4,$5,jsonb_set($7::jsonb,'{__technical_specs}',$8::jsonb,true),$6,$6,$9 FROM product.platforms p
         WHERE p.id=$1 AND p.status='ACTIVE' FOR UPDATE OF p RETURNING *`
      : `INSERT INTO product.models(platform_id,product_type_code,code,name,description,custom_fields,created_by,updated_by,sku_prefix)
         VALUES ($1,$2,$3,$4,$5,jsonb_set($7::jsonb,'{__technical_specs}',$8::jsonb,true),$6,$6,$9) RETURNING *`;
    const result = await this.database.query<any>(sql,
      [input.platformId,input.productTypeCode,input.code,input.name,input.description,input.actorUserId,JSON.stringify(input.customFields ?? {}),JSON.stringify(input.technicalSpecs ?? {}),input.skuPrefix]);
    return result.rows[0] ?? null;
  }

  async createVariant(input: CreateVariantRecord): Promise<any> {
    const result = await this.database.query<any>(
      `INSERT INTO product.variants(model_id,code,name,description,attributes,created_by,updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6) RETURNING *`,
      [input.modelId, input.code, input.name, input.description, JSON.stringify(input.attributes), input.actorUserId],
    );
    return result.rows[0];
  }

  async skuOwnerForVariant(variantId: string): Promise<{modelCode:string;skuPrefix:string|null;productTypeCode:'BIKE'|'ACCESSORY'|'SERVICE_PART'}|null> {
    const result = await this.database.query<{model_code:string;sku_prefix:string|null;product_type_code:'BIKE'|'ACCESSORY'|'SERVICE_PART'}>(
      `SELECT m.code AS model_code,m.sku_prefix,m.product_type_code FROM product.variants v
         JOIN product.models m ON m.id=v.model_id WHERE v.id=$1`,[variantId]);
    const row = result.rows[0];
    return row ? {modelCode:row.model_code,skuPrefix:row.sku_prefix,productTypeCode:row.product_type_code} : null;
  }

  async createSku(input: CreateSkuRecord): Promise<any> {
    const result = await this.database.query<any>(
      `INSERT INTO product.skus(variant_id,sku,name,market_code,color_code,size_code,attributes,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8) RETURNING *`,
      [input.variantId, input.sku, input.name, input.marketCode, input.colorCode, input.sizeCode, JSON.stringify(input.attributes), input.actorUserId],
    );
    return result.rows[0];
  }

  async update(input: UpdateProductRecord): Promise<any | null> {
    if (input.entity === 'sku') {
      const result = await this.database.query<any>(
        `UPDATE product.skus SET name=COALESCE($3,name),status=COALESCE($4,status),
         market_code=CASE WHEN $5::boolean THEN $6 ELSE market_code END,
         color_code=CASE WHEN $7::boolean THEN $8 ELSE color_code END,
         size_code=CASE WHEN $9::boolean THEN $10 ELSE size_code END,
         version=version+1,updated_by=$11,updated_at=now() WHERE id=$1 AND version=$2 RETURNING *`,
        [input.id,input.expectedVersion,input.name,input.status,input.marketCodeProvided,input.marketCode,input.colorCodeProvided,input.colorCode,input.sizeCodeProvided,input.sizeCode,input.actorUserId],
      );
      return result.rows[0] ?? null;
    }
    if(input.entity==='model') {
      const result=await this.database.query<any>(
        `UPDATE product.models SET name=COALESCE($3,name),status=COALESCE($4,status),
         description=CASE WHEN $5::boolean THEN $6 ELSE description END,
         custom_fields=CASE WHEN $8::boolean OR $10::boolean THEN
           jsonb_set(CASE WHEN $8::boolean THEN $9::jsonb ELSE custom_fields END,
             '{__technical_specs}',
             CASE WHEN $10::boolean THEN $11::jsonb ELSE COALESCE(custom_fields->'__technical_specs','{}'::jsonb) END,
             true)
           ELSE custom_fields END,
         version=version+1,updated_by=$7,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING *`,
        [input.id,input.expectedVersion,input.name,input.status,input.descriptionProvided,input.description,
          input.actorUserId,input.customFieldsProvided,JSON.stringify(input.customFields),input.technicalSpecsProvided,JSON.stringify(input.technicalSpecs)],
      );
      return result.rows[0]??null;
    }
    const result=await this.database.query<any>(
      `UPDATE product.variants SET name=COALESCE($3,name),status=COALESCE($4,status),
       description=CASE WHEN $5::boolean THEN $6 ELSE description END,
       version=version+1,updated_by=$7,updated_at=now()
       WHERE id=$1 AND version=$2 RETURNING *`,
      [input.id,input.expectedVersion,input.name,input.status,input.descriptionProvided,input.description,input.actorUserId],
    );
    return result.rows[0]??null;
  }

  async exists(entity: ProductEntityKind, id: string): Promise<boolean> {
    const table = entity === 'model' ? 'models' : entity === 'variant' ? 'variants' : 'skus';
    const result = await this.database.query(`SELECT 1 FROM product.${table} WHERE id=$1`, [id]);
    return Boolean(result.rows[0]);
  }

  /**
   * A model may only be removed while nothing references it. Every dependent
   * relation is ON DELETE RESTRICT, so this check turns a raw 23503 into a
   * readable "archive it instead" conflict.
   */
  async modelDeletionBlockers(id: string): Promise<string[]> {
    const result = await this.database.query<{ reason: string }>(`
      SELECT reason FROM (
        SELECT 'variants' AS reason WHERE EXISTS (SELECT 1 FROM product.variants WHERE model_id=$1)
        UNION ALL SELECT 'bom' WHERE EXISTS (SELECT 1 FROM engineering.boms WHERE model_id=$1)
        UNION ALL SELECT 'publication' WHERE EXISTS (SELECT 1 FROM product.catalog_publications WHERE model_id=$1)
        UNION ALL SELECT 'homepage' WHERE EXISTS (SELECT 1 FROM product.homepage_product_bindings WHERE manual_model_id=$1)
        UNION ALL SELECT 'skus' WHERE EXISTS (
          SELECT 1 FROM product.skus s JOIN product.models m ON m.product_id=s.product_id_snapshot WHERE m.id=$1)
        UNION ALL SELECT 'merge_alias' WHERE EXISTS (
          SELECT 1 FROM product.model_merge_aliases a JOIN product.models m
            ON m.product_id IN (a.legacy_product_id, a.canonical_product_id) WHERE m.id=$1)
      ) blockers`, [id]);
    return result.rows.map(row => row.reason);
  }

  async deleteModel(input: { id: string; expectedVersion: number; actorUserId: string }): Promise<boolean> {
    const result = await this.database.query(
      'DELETE FROM product.models WHERE id=$1 AND version=$2 RETURNING id', [input.id, input.expectedVersion]);
    return Boolean(result.rows[0]);
  }
}
