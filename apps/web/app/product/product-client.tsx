'use client';

import { OperationsFrame } from '../_components/operations-frame';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import styles from './product.module.css';
import { adminSkuPricingHref } from '../_lib/admin-sku-pricing-navigation';
import { findActiveSkuCombinationDuplicates } from './sku-combination-audit';
import { matchesModelRegisterSearch } from './model-register';
import { emptyTechnicalSpecs, technicalSpecModules, technicalSpecProgress, technicalSpecValue, type TechnicalSpecs } from './technical-specs';

type CustomFieldDefinition = { id:string; product_type_code:'BIKE'|'ACCESSORY'|'SERVICE_PART'; code:string;
  label:string; field_type:'TEXT'|'NUMBER'|'BOOLEAN'|'SELECT'; options:string[]; required:boolean;
  status:'ACTIVE'|'RETIRED'; version:number };
type CustomFieldValues = Record<string,string|number|boolean>;
type Platform = { id: string; code: string; name: string; description: string; status: string; version: number };
type Model = { custom_fields?: Record<string, unknown>; id: string; product_id: string; platform_id: string | null; product_type_code: 'BIKE' | 'ACCESSORY' | 'SERVICE_PART'; code: string; name: string; description: string; status: string; version: number };
type Variant = { id: string; model_id: string; code: string; name: string; description: string; status: string; version: number };
type Sku = { id: string; product_id: string; sku_number: string; sku_sequence: number; variant_id: string; sku: string; name: string; market_code: string | null; color_code: string | null; size_code: string | null; status: string; version: number };
type Catalog = { modelFieldDefinitions:CustomFieldDefinition[]; productTypes: {code:string;name:string;description:string;status:string}[]; platforms: Platform[]; models: Model[]; variants: Variant[]; skus: Sku[] };
type Part = { id: string; part_number: string; name: string; category: string; default_unit: string; status: string };
type BomRow = { id: string; code: string; name: string; model_id: string; model_code: string; revision_id: string | null; revision_code: string | null; revision_status: string | null; line_count: number | null };
type BuildSpec = { id: string; code: string; status: string; version: number; sku_id: string; sku: string; bom_revision_id: string; revision_code: string; bom_code: string };
type Engineering = { parts: Part[]; boms: BomRow[]; buildSpecs: BuildSpec[] };
type EditTarget = { productTypeCode?:'BIKE'|'ACCESSORY'|'SERVICE_PART';customFields?:CustomFieldValues; entity: 'model' | 'variant' | 'sku'; id: string; version: number; name: string; status: string; description?: string; marketCode?: string | null; colorCode?: string | null; sizeCode?: string | null };

const emptyCatalog: Catalog = { modelFieldDefinitions:[],productTypes: [], platforms: [], models: [], variants: [], skus: [] };
const emptyEngineering: Engineering = { parts: [], boms: [], buildSpecs: [] };

// Platform labels come from actual user-maintained records, not hardcoded example platforms.
function platformName(platform: Platform) { return platform.name; }
function platformDescription(platform: Platform) { return platform.description; }

function statusLabel(status: string | null | undefined) {
  if (!status) return '未设置';
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    ACTIVE: '启用',
    RELEASED: '已发布',
    RETIRED: '已退役',
    INACTIVE: '停用',
    NO_REVISION: '暂无版本',
  };
  return labels[status] ?? status;
}

function modelShortName(model: Pick<Model, 'name' | 'code'>) {
  const match = model.name.match(/\bALSVID\s+([A-Z0-9]+)\b/i);
  return match?.[1] ?? model.code;
}

function modelCustomFields(value: Record<string, unknown> | undefined): CustomFieldValues {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key, item]) => key !== '__technical_specs' && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'))) as CustomFieldValues;
}

function modelTechnicalSpecs(value: Record<string, unknown> | undefined): TechnicalSpecs {
  const specs = value?.__technical_specs;
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return emptyTechnicalSpecs();
  return { ...emptyTechnicalSpecs(), ...(specs as TechnicalSpecs) };
}

function modelSpecSummary(model: Model, moduleCode: string, fieldCode: string) {
  return technicalSpecValue(modelTechnicalSpecs(model.custom_fields), moduleCode, fieldCode);
}

/** Schema-driven inputs do not become SKU dimensions, price, inventory or a public catalogue. */
function ModelFieldInputs({definitions,values={}}:{definitions:CustomFieldDefinition[];values?:CustomFieldValues}) {
  const active=definitions.filter(def=>def.status==='ACTIVE');
  if(!active.length)return null;
  return <fieldset className={styles.customFieldInputs}><legend>商品自定义字段</legend>
    {active.map(def=><label key={def.id}>{def.label}{def.required?' *':''}
      {def.field_type==='BOOLEAN'?
        <select name={`cf.${def.code}`} defaultValue={values[def.code]===true?'true':values[def.code]===false?'false':''} required={def.required}>
          <option value="">未填写</option><option value="true">是</option><option value="false">否</option>
        </select>
      :def.field_type==='SELECT'?
        <select name={`cf.${def.code}`} defaultValue={String(values[def.code]??'')} required={def.required}>
          <option value="">请选择</option>{def.options.map(option=><option key={option} value={option}>{option}</option>)}
        </select>
      :<input name={`cf.${def.code}`} type={def.field_type==='NUMBER'?'number':'text'}
        step={def.field_type==='NUMBER'?'any':undefined} maxLength={def.field_type==='TEXT'?500:undefined}
        defaultValue={String(values[def.code]??'')} required={def.required}/>}
    </label>)}
  </fieldset>;
}

function TechnicalSpecEditor({
  model, platform, specs, engineering, saving, onChange, onSave, onClose, inline = false,
}: {
  model: Model; platform?: Platform | undefined; specs: TechnicalSpecs; engineering: Engineering; saving: boolean;
  onChange: (moduleCode: string, fieldCode: string, value: string | number | boolean | string[]) => void;
  onSave: (status?: 'ACTIVE') => void; onClose: () => void; inline?: boolean;
}) {
  const [activeModuleCode, setActiveModuleCode] = useState(technicalSpecModules[0]?.code ?? 'basic');
  const activeModule = technicalSpecModules.find(module => module.code === activeModuleCode) ?? technicalSpecModules[0]!;
  const setPart = (partId: string, checked: boolean) => {
    const current = Array.isArray(specs.bomMapping?.partIds) ? specs.bomMapping.partIds : [];
    onChange('bomMapping', 'partIds', checked ? [...current, partId] : current.filter(item => item !== partId));
  };
  return <div className={inline ? styles.specInline : styles.modal} role="presentation">
    <section className={`${styles.specEditor}${inline ? ` ${styles.specEditorInline}` : ''}`} role={inline ? 'region' : 'dialog'} aria-modal={!inline} aria-label={`编辑 ${modelShortName(model)} 技术规格`}>
      <header className={styles.specEditorHeader}>
        <div><span className={styles.specKicker}>产品研发 / 车辆型号</span><h2>{modelShortName(model)}</h2>
          <p>{model.name} · {model.code} · {platform?.name ?? '未关联平台'}</p></div>
        <div className={styles.specEditorMeta}><span className={styles.archiveStatus} data-status={model.status}>{statusLabel(model.status)}</span><span>版本 {model.version}</span></div>
      </header>
      <div className={styles.specEditorToolbar}>
        <label className={styles.specSelector}>参数类别
          <select aria-label="选择技术参数类别" value={activeModule.code} onChange={event=>setActiveModuleCode(event.target.value)}>
            {technicalSpecModules.map(module=><option key={module.code} value={module.code}>{module.title} · {technicalSpecProgress(specs,module).filled}/{technicalSpecProgress(specs,module).total}</option>)}
          </select>
        </label>
        <span className={styles.specToolbarHint}>直接在表格填写并保存，切换类别不会丢失当前输入。</span>
      </div>
      <div className={styles.specSheetWrap}>
        <table className={styles.specSheet} aria-label="车辆型号技术参数编辑表">
          <thead><tr><th scope="col">参数字段</th><th scope="col">参数值</th></tr></thead>
          <tbody>
            {activeModule.fields.filter(field=>activeModule.code!=='bomMapping'||!['bomRevisionId','partIds'].includes(field.code)).map(field=>{
              const raw=specs[activeModule.code]?.[field.code];
              const value=Array.isArray(raw)?raw.join(', '):raw??'';
              return <tr key={field.code}><th scope="row">{field.label}</th><td>
                {field.type==='boolean'
                  ?<select aria-label={field.label} value={raw===true?'true':raw===false?'false':''} onChange={event=>onChange(activeModule.code,field.code,event.target.value===''?'':event.target.value==='true')}><option value="">未填写</option><option value="true">是</option><option value="false">否</option></select>
                  :field.type==='select'
                    ?<select aria-label={field.label} value={String(value)} onChange={event=>onChange(activeModule.code,field.code,event.target.value)}><option value="">请选择</option>{field.options?.map(option=><option key={option} value={option}>{option}</option>)}</select>
                    :<input aria-label={field.label} type={field.type==='number'?'number':'text'} step={field.type==='number'?'any':undefined} value={String(value)} placeholder={field.placeholder} onChange={event=>onChange(activeModule.code,field.code,field.type==='number'?(event.target.value===''?'':Number(event.target.value)):event.target.value)}/>}
              </td></tr>;
            })}
            {activeModule.code==='bomMapping'?<>
              <tr><th scope="row">BOM Revision</th><td><select aria-label="BOM Revision" value={String(specs.bomMapping?.bomRevisionId??'')} onChange={event=>onChange('bomMapping','bomRevisionId',event.target.value)}><option value="">未关联</option>{engineering.boms.filter(row=>row.revision_id).map(row=><option key={row.revision_id!} value={row.revision_id!}>{row.code} / {row.revision_code} · {statusLabel(row.revision_status)}</option>)}</select></td></tr>
              <tr><th scope="row">关键零件引用</th><td><div className={styles.specPartList}>{engineering.parts.map(part=><label key={part.id}><input type="checkbox" checked={Array.isArray(specs.bomMapping?.partIds)&&specs.bomMapping.partIds.includes(part.id)} onChange={event=>setPart(part.id,event.target.checked)}/>{part.part_number} · {part.name}</label>)}{!engineering.parts.length?<small>没有可引用零件；不会重复创建</small>:null}</div></td></tr>
            </>:null}
          </tbody>
        </table>
      </div>
      <footer className={styles.specEditorFooter}><span>规格保存在当前车型记录中；Variant、SKU 和 BOM 仍由各自业务模块维护。</span><div><button type="button" className={styles.archiveSecondaryButton} disabled={saving} onClick={onClose}>返回列表</button><button type="button" className={styles.archiveSecondaryButton} disabled={saving} onClick={() => onSave()}>保存草稿</button><button type="button" className={styles.archivePrimaryButton} disabled={saving} onClick={() => onSave('ACTIVE')}>{saving ? '正在保存…' : '保存并启用'}</button></div></footer>
    </section>
  </div>;
}
function readModelFields(form:FormData,definitions:CustomFieldDefinition[]):CustomFieldValues {
  const values:CustomFieldValues={};
  for(const def of definitions.filter(item=>item.status==='ACTIVE')){
    const raw=String(form.get(`cf.${def.code}`)??'').trim();
    if(raw==='')continue;
    values[def.code]=def.field_type==='NUMBER'?Number(raw):def.field_type==='BOOLEAN'?raw==='true':raw;
  }
  return values;
}

export default function ProductClient({ embedded = false, view = 'archive' }: { embedded?: boolean; view?: 'archive' | 'engineering' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.toString();
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [engineering, setEngineering] = useState<Engineering>(emptyEngineering);
  const [message, setMessage] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [engineeringError, setEngineeringError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modelSearch, setModelSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [marketFilter, setMarketFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [newModelType, setNewModelType] = useState('BIKE');
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [manageModelId, setManageModelId] = useState<string | null>(null);
  const [platformDraft, setPlatformDraft] = useState<Platform | 'new' | null>(null);
  const [platformStatusFilter, setPlatformStatusFilter] = useState('ALL');
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [fieldManager, setFieldManager] = useState(false);
  const [fieldDraft, setFieldDraft] = useState<CustomFieldDefinition | 'new' | null>(null);
  const [fieldScope, setFieldScope] = useState<'BIKE'|'ACCESSORY'|'SERVICE_PART'>('BIKE');
  const [fieldType, setFieldType] = useState<'TEXT'|'NUMBER'|'BOOLEAN'|'SELECT'>('TEXT');
  const [savingField, setSavingField] = useState(false);
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<'bikes' | 'models' | 'parts' | 'platforms'>('bikes');
  const [partTab, setPartTab] = useState<'manufacturing' | 'retail'>('manufacturing');
  const [createKind, setCreateKind] = useState<'bike' | 'part' | 'accessory' | null>(null);
  const [specModel, setSpecModel] = useState<Model | null>(null);
  const [specDraft, setSpecDraft] = useState<TechnicalSpecs>(emptyTechnicalSpecs);
  const [savingSpecs, setSavingSpecs] = useState(false);

  useEffect(() => {
    const revealLinkedPanel = () => {
      const id = window.location.hash.slice(1);
      if (view === 'archive') {
        const params = new URLSearchParams(routeQuery);
        const requestedType = params.get('type');
        const requestedModel = params.get('model');
        const nextWorkspace = requestedModel ? 'models'
          : id === 'series' || id === 'product-types' ? 'platforms'
          : id === 'models' || id === 'vehicle-models' ? 'models'
          : id === 'parts' || requestedType === 'PARTS' ? 'parts' : 'bikes';
        setWorkspace(nextWorkspace);
        setTypeFilter(nextWorkspace === 'bikes' || nextWorkspace === 'models' ? 'BIKE' : requestedType === 'PARTS' ? 'PARTS' : 'ALL');
        if (id === 'configuration') setCreateKind('bike');
      }
      // Preserve old bookmarks without offering a second BOM editor in product research.
      if (view === 'archive' && ['engineering', 'engineering-panel', 'production-bom'].includes(id)) {
        router.replace('/admin/production#production-bom');
        return;
      }
      const target = id ? document.getElementById(id) : null;
      const panel = target?.closest('details');
      if (target instanceof HTMLDetailsElement) target.open = true;
      if (panel) panel.open = true;
    };
    revealLinkedPanel();
    window.addEventListener('hashchange', revealLinkedPanel);
    return () => window.removeEventListener('hashchange', revealLinkedPanel);
  }, [view, router, routeQuery]);

  async function api(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const response = await fetch(`/api/control${path}`, { ...init, headers });
    if (response.status === 401) {
      router.push('/login');
      throw new Error('登录状态已过期，请重新登录');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message ?? '请求失败');
    return payload.data;
  }

  async function reload(): Promise<boolean> {
    setLoading(true);
    setCatalogError('');
    setEngineeringError('');
    const [catalogResult, engineeringResult] = await Promise.allSettled([
      api('/v1/product/catalog'),
      api('/v1/engineering'),
    ]);
    if (catalogResult.status === 'fulfilled') {
      // WWW-only releases can precede the separately approved API/database migration.
      // Keep the existing model/SKU editor usable until the full domain release is verified.
      setCatalog({ ...emptyCatalog, ...(catalogResult.value as Partial<Catalog>) });
    } else {
      setCatalog(emptyCatalog);
      setCatalogError(catalogResult.reason instanceof Error ? catalogResult.reason.message : '请求异常');
    }
    if (engineeringResult.status === 'fulfilled') {
      setEngineering(engineeringResult.value as Engineering);
    } else {
      setEngineering(emptyEngineering);
      setEngineeringError(engineeringResult.reason instanceof Error ? engineeringResult.reason.message : '请求异常');
    }
    setLoading(false);
    return catalogResult.status === 'fulfilled' && engineeringResult.status === 'fulfilled';
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSearch = params.get('search') ?? params.get('model');
    if (requestedSearch) setModelSearch(requestedSearch.slice(0,100));
    const requestedType = new URLSearchParams(window.location.search).get('type');
    if (requestedType === 'BIKE' || requestedType === 'PARTS') setTypeFilter(requestedType);
    else setTypeFilter('BIKE');
    void reload();
  }, []);

  useEffect(() => {
    if (view !== 'archive' || workspace !== 'models' || loading) return;
    const requestedModel = new URLSearchParams(window.location.search).get('model');
    if (!requestedModel) {
      if (specModel) setSpecModel(null);
      return;
    }
    const model = catalog.models.find(item => modelShortName(item) === requestedModel || item.code === requestedModel);
    if (model && specModel?.id !== model.id) openTechnicalSpecs(model);
  }, [view, workspace, loading, catalog.models, specModel, routeQuery]);

  const selectableProductTypes = catalog.productTypes.length
    ? catalog.productTypes.filter(type=>type.status==='ACTIVE')
    : [{code:'BIKE',name:'整车（兼容旧版 API）',description:'',status:'ACTIVE'}];

  const hierarchyRows = useMemo(() => [...catalog.models]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((model) => ({
      model,
      platform: catalog.platforms.find((item) => item.id === model.platform_id),
      variants: catalog.variants.filter((item) => item.model_id === model.id),
    })), [catalog]);

  const manageModel = manageModelId ? catalog.models.find(item => item.id === manageModelId) : null;
  const manageVariants = manageModel ? catalog.variants.filter(item => item.model_id === manageModel.id) : [];
  const manageVariantIds = new Set(manageVariants.map(item => item.id));
  const manageSkus = catalog.skus.filter(item => manageVariantIds.has(item.variant_id));

  const duplicateSkuDimensions = useMemo(() => findActiveSkuCombinationDuplicates(catalog.skus), [catalog.skus]);
  const filteredModels = useMemo(() => hierarchyRows.filter(({ model, platform }) =>
    (statusFilter === 'ALL' || model.status === statusFilter)
    && (platformFilter === 'ALL' || model.platform_id === platformFilter)
    && (marketFilter === 'ALL' || modelSpecSummary(model, 'basic', 'markets').toLocaleUpperCase().includes(marketFilter))
    && (typeFilter === 'PARTS' ? model.product_type_code !== 'BIKE' : typeFilter === 'ALL' || model.product_type_code === typeFilter)
    && matchesModelRegisterSearch(
      model,
      platform ? { code: platform.code, name: platformName(platform) } : undefined,
      catalog,
      engineering,
      modelSearch,
      !loading && !engineeringError,
    ),
  ), [hierarchyRows, catalog, engineering, modelSearch, statusFilter, platformFilter, marketFilter, typeFilter, engineeringError, loading]);

  const filteredParts = useMemo(() => engineering.parts.filter(part =>
    [part.part_number, part.name, part.category].some(value => (value || '').toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))
  ), [engineering.parts, modelSearch]);
  const filteredAccessories = useMemo(() => hierarchyRows.filter(({ model }) =>
    model.product_type_code !== 'BIKE'
    && [model.code, model.name, model.description].some(value => (value || '').toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))
  ), [hierarchyRows, modelSearch]);
  const filteredPlatforms = useMemo(() => catalog.platforms.filter(platform =>
    (platformStatusFilter === 'ALL' || platform.status === platformStatusFilter)
    && [platform.code, platform.name, platform.description].some(value => (value || '').toLocaleLowerCase().includes(modelSearch.toLocaleLowerCase()))
  ), [catalog.platforms, modelSearch, platformStatusFilter]);

  async function submitForm(event: FormEvent<HTMLFormElement>, endpoint: string, body: (form: FormData) => unknown, onSaved?: () => void) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(body(form)) });
      formElement.reset();
      onSaved?.();
      const verified = await reload();
      setMessage(verified ? '已保存，列表已重新核对。' : '写入请求成功，但列表刷新失败；请先核对记录，不要重复提交。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function savePlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!platformDraft || savingPlatform) return;
    const form = new FormData(event.currentTarget);
    const creating = platformDraft === 'new';
    const body = creating
      ? { code: String(form.get('code') ?? ''), name: form.get('name'), description: form.get('description') }
      : { expectedVersion: platformDraft.version, name: form.get('name'),
          description: form.get('description'), status: form.get('status') };
    let written = false;
    setSavingPlatform(true);
    try {
      const saved = await api(creating ? '/v1/product/platforms' : `/v1/product/platforms/${platformDraft.id}`, {
        method: creating ? 'POST' : 'PATCH', body: JSON.stringify(body),
      }) as Platform;
      written = true;
      // Do not call a POST again just because a later catalogue read failed.
      const verified = await api('/v1/product/catalog') as Catalog;
      const returned = verified.platforms.find(platform => platform.id === saved.id);
      if (!returned || returned.code !== saved.code || returned.version !== saved.version
          || returned.name !== saved.name || returned.status !== saved.status) {
        throw new Error('接口已返回写入成功，但数据回读与保存结果不一致；请核对后再操作。');
      }
      setCatalog({ ...emptyCatalog, ...verified });
      setPlatformDraft(null);
      setMessage('技术平台已保存，并从数据库重新读取核对。');
    } catch (error) {
      if (written) setPlatformDraft(null);
      setMessage((written ? '写入接口已返回成功，但尚未完成回读核验：' : '技术平台保存失败：')
        + (error instanceof Error ? error.message : '请求异常'));
    } finally {
      setSavingPlatform(false);
    }
  }

  async function saveField(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!fieldDraft||savingField)return;
    const form=new FormData(event.currentTarget);
    const creating=fieldDraft==='new';
    const payload=creating?{
      productTypeCode:fieldScope,code:String(form.get('code')??''),label:form.get('label'),
      fieldType,required:form.get('required')==='on',
      options:fieldType==='SELECT'?String(form.get('options')??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[],
    }:{
      expectedVersion:fieldDraft.version,label:form.get('label'),
      required:form.get('required')==='on',status:form.get('status'),
    };
    let written=false;
    setSavingField(true);
    try {
      const saved=await api(creating?'/v1/product/model-fields':`/v1/product/model-fields/${fieldDraft.id}`,{
        method:creating?'POST':'PATCH',body:JSON.stringify(payload),
      }) as CustomFieldDefinition;
      written=true;
      const verified=await api('/v1/product/catalog') as Catalog;
      const row=(verified.modelFieldDefinitions??[]).find(def=>def.id===saved.id);
      if(!row||row.version!==saved.version||row.label!==saved.label||row.status!==saved.status)
        throw new Error('字段写入后回读不一致，请核对记录后再操作');
      setCatalog({...emptyCatalog,...verified});
      setFieldDraft(null);
      setMessage('商品字段已保存，并从数据库回读核验。');
    }catch(error){
      if(written)setFieldDraft(null);
      setMessage((written?'字段写入成功但尚未完成回读：':'字段保存失败：')+
        (error instanceof Error?error.message:'请求异常'));
    }finally{setSavingField(false);}
  }

  async function deleteField(def: CustomFieldDefinition) {
    if (deletingFieldId) return;
    if (!window.confirm(`确定删除字段“${def.label} / ${def.code}”吗？该字段在车型中已保存的值也会一并删除，且无法恢复。`)) return;
    setDeletingFieldId(def.id);
    try {
      const deleted = await api(`/v1/product/model-fields/${def.id}`, {
        method: 'DELETE', body: JSON.stringify({ expectedVersion: def.version }),
      }) as CustomFieldDefinition & { affectedModels?: number };
      const verified = await api('/v1/product/catalog') as Catalog;
      if ((verified.modelFieldDefinitions ?? []).some(item => item.id === def.id)) {
        throw new Error('删除接口已返回成功，但数据库回读仍存在该字段，请先核对后不要重复操作。');
      }
      setCatalog({ ...emptyCatalog, ...verified });
      setMessage(`字段“${def.label}”已删除${deleted.affectedModels ? `，已清理 ${deleted.affectedModels} 条车型字段值` : ''}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '字段删除失败');
    } finally {
      setDeletingFieldId(null);
    }
  }

  async function release(endpoint: string) {
    try {
      await api(endpoint, { method: 'POST', body: '{}' });
      const verified = await reload();
      setMessage(verified ? '工程发布成功，已重新核对版本。' : '发布请求成功，但列表刷新失败；请先核对版本，不要重复发布。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '发布失败');
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit) return;
    const form = new FormData(event.currentTarget);
    try {
      await api(`/v1/product/${edit.entity}/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: edit.version,
          name: form.get('name'),
          status: form.get('status'),
          description: edit.entity !== 'sku' ? form.get('description') : undefined,
          marketCode: edit.entity === 'sku' ? form.get('marketCode') : undefined,
          colorCode: edit.entity === 'sku' ? form.get('colorCode') : undefined,
          sizeCode: edit.entity === 'sku' ? form.get('sizeCode') : undefined,
          customFields: edit.entity==='model' ?
            readModelFields(form,(catalog.modelFieldDefinitions??[]).filter(def=>def.product_type_code===edit.productTypeCode)) : undefined,
        }),
      });
      setEdit(null);
      const verified = await reload();
      setMessage(verified ? '产品信息已更新，列表已重新核对。' : '更新请求成功，但列表刷新失败；请先核对记录，不要重复提交。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新失败');
    }
  }

  function openTechnicalSpecs(model: Model) {
    setSpecModel(model);
    setSpecDraft(modelTechnicalSpecs(model.custom_fields));
  }

  function closeSpecEditor() {
    setSpecModel(null);
    const url = new URL(window.location.href);
    if (url.searchParams.has('model')) {
      url.searchParams.delete('model');
      url.hash = 'vehicle-models';
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }

  function updateTechnicalSpec(moduleCode: string, fieldCode: string, value: string | number | boolean | string[]) {
    setSpecDraft(current => ({ ...current, [moduleCode]: { ...(current[moduleCode] ?? {}), [fieldCode]: value } }));
  }

  async function saveTechnicalSpecs(status?: 'ACTIVE') {
    if (!specModel || savingSpecs) return;
    setSavingSpecs(true);
    try {
      await api(`/v1/product/model/${specModel.id}`, { method: 'PATCH', body: JSON.stringify({ expectedVersion: specModel.version, technicalSpecs: specDraft, ...(status ? { status } : {}) }) });
      const verified = await reload();
      if (!verified) throw new Error('规格已写入，但列表回读失败，请先核对版本，不要重复提交。');
      setMessage(status ? '技术规格已保存并启用。' : '技术规格草稿已保存。');
      if (status) closeSpecEditor();
      else setSpecModel(current => current ? { ...current, version: current.version + 1, custom_fields: { ...(current.custom_fields ?? {}), __technical_specs: specDraft } } : current);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '技术规格保存失败');
    } finally {
      setSavingSpecs(false);
    }
  }

  return (
    <OperationsFrame embedded={embedded} area={view === "engineering" ? "production" : "product"} footer={view === "engineering" ? "生产制造 / BOM" : "产品研发"}>
      {view === "archive" ? <>
      <main className={styles.archiveWorkspace}>
        <header className={styles.archiveHeading}>
          <div className={styles.archiveHeadingCopy}>
            <h1>{workspace === 'bikes' ? '整车产品' : workspace === 'models' ? '车辆型号' : workspace === 'parts' ? '零配件' : '技术平台'}</h1>
          </div>
          <div className={styles.archiveHeadingActions}>
            <button type="button" className={styles.archiveSecondaryButton} onClick={() => void reload()} disabled={loading}>刷新</button>
            {workspace === 'bikes' || (workspace === 'parts' && partTab === 'retail') ?
              <button type="button" className={styles.archiveSecondaryButton} disabled={loading||!!catalogError}
                onClick={()=>{setFieldScope(workspace==='bikes'?'BIKE':'ACCESSORY');setFieldManager(true);}}>
                自定义字段管理
              </button> : null}
            {workspace === 'bikes' || workspace === 'models' ? <button type="button" className={styles.archivePrimaryButton} onClick={() => {setNewModelType('BIKE');setCreateKind('bike');}}>＋ 新建整车</button> : null}
            {workspace === 'platforms' ? <button type="button" className={styles.archivePrimaryButton} disabled={loading || !!catalogError} onClick={() => setPlatformDraft('new')}>＋ 新建技术平台</button> : null}
            {workspace === 'parts' ? <button type="button" className={styles.archivePrimaryButton} onClick={() => { if (partTab === 'manufacturing') setCreateKind('part'); else {setNewModelType('ACCESSORY');setCreateKind('accessory');} }}>＋ {partTab === 'manufacturing' ? '新建零件' : '新建可售配件'}</button> : null}
          </div>
        </header>

        <div className={styles.archiveScrollArea}>

        {message ? <div className={styles.archiveFeedback} role="status">{message}</div> : null}
        {!loading && !catalogError && duplicateSkuDimensions.length > 0 ? (
          <div className={styles.archiveError} role="alert">
            <strong>SKU 历史规格冲突：发现 {duplicateSkuDimensions.length} 组重复市场／颜色／尺寸组合。</strong>
            <p>这些组合来自真实商品数据。请核对后逐项处理；系统不会自动合并 SKU、订单、价格或库存。</p>
            <ul>{duplicateSkuDimensions.slice(0,10).map(item=><li key={JSON.stringify(item)}>
              {item.market||'未设市场'} / {item.color||'未设颜色'} / {item.size||'未设尺寸'}：
              {item.skus.join('、')}
            </li>)}</ul>
            {duplicateSkuDimensions.length>10?<p>仅展示前 10 组；应继续排查完整目录。</p>:null}
          </div>
        ) : null}
        {(workspace === 'parts' && partTab === 'manufacturing' ? engineeringError : catalogError) ? (
          <div className={styles.archiveError} role="alert">数据读取失败：{workspace === 'parts' && partTab === 'manufacturing' ? engineeringError : catalogError}。读取异常不代表记录为零。</div>
        ) : null}

        {workspace === 'models' ? (
          <section className={styles.archivePanel} id="vehicle-models" aria-label="车辆型号列表">
            {!specModel ? <>
              <div className={styles.archivePanelTitle}>
                <div><h2>车辆型号</h2><p>型号来自已新建的整车，使用型号简称归类，不预设型号。</p></div>
                <span>{loading || catalogError ? '—' : catalog.models.filter(model => model.product_type_code === 'BIKE').length} 条记录</span>
              </div>
              <div className={styles.archiveFilters}>
                <label className={styles.archiveSearch}>
                  <span className={styles.srOnly}>搜索车辆型号</span>
                  <input aria-label="搜索车辆型号" value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="搜索型号简称、整车名称或编码" />
                </label>
                <select aria-label="按型号状态筛选" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                  <option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="ACTIVE">启用</option><option value="RETIRED">已退役</option>
                </select>
                <select aria-label="按技术平台筛选" value={platformFilter} onChange={event => setPlatformFilter(event.target.value)}><option value="ALL">全部技术平台</option>{catalog.platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.code} · {platform.name}</option>)}</select>
                <select aria-label="按目标市场筛选" value={marketFilter} onChange={event => setMarketFilter(event.target.value)}><option value="ALL">全部目标市场</option><option value="DE">DE</option><option value="AT">AT</option><option value="GB">英国 / GB</option><option value="US">美国 / US</option></select>
              </div>
              {loading ? <div className={styles.archiveLoading}>正在读取车辆型号…</div> :
                catalogError ? <div className={styles.archiveEmpty}><strong>暂时无法读取车辆型号</strong><p>请检查数据接口，避免重复创建。</p></div> :
                filteredModels.length ? (
                  <div className={styles.archiveTableWrap}>
                    <table className={styles.archiveTable} aria-label="车辆型号档案">
                      <thead><tr><th>型号简称</th><th>整车名称 / 编码</th><th>技术平台</th><th>类型 / 驱动 / 轮径</th><th>基本信息</th><th>状态</th><th>操作</th></tr></thead>
                      <tbody>{filteredModels.map(({ model, platform }) => (
                        <tr key={model.id}>
                          <td><strong>{modelShortName(model)}</strong></td>
                          <td>{model.name}<span>{model.code} · 商品 ID {model.product_id}</span></td>
                          <td>{platform ? `${platformName(platform)} · ${platform.code}` : '未关联'}</td>
                          <td>{modelSpecSummary(model, 'basic', 'productType') || '未填写'}<span>{modelSpecSummary(model, 'drivetrain', 'type') || '未填写'} · {modelSpecSummary(model, 'wheels', 'wheelSize') || '未填写'}</span></td>
                          <td><span>{technicalSpecProgress(modelTechnicalSpecs(model.custom_fields), technicalSpecModules[0]!).filled}/{technicalSpecModules[0]!.fields.length}</span></td>
                          <td><span className={styles.archiveStatus} data-status={model.status}>{statusLabel(model.status)}</span></td>
                          <td><button type="button" className={styles.archiveEdit} onClick={() => openTechnicalSpecs(model)}>技术参数</button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (
                  <div className={styles.archiveEmpty}>
                    <span className={styles.archiveEmptyIcon} aria-hidden="true">◇</span>
                    <strong>{modelSearch || statusFilter !== 'ALL' || platformFilter !== 'ALL' || marketFilter !== 'ALL' ? '没有符合条件的车辆型号' : '还没有车辆型号'}</strong>
                    <p>{modelSearch || statusFilter !== 'ALL' || platformFilter !== 'ALL' || marketFilter !== 'ALL' ? '可以调整搜索词或筛选条件。' : '新建整车并保存后，系统会自动按型号简称归档到这里。'}</p>
                    {!(modelSearch || statusFilter !== 'ALL' || platformFilter !== 'ALL' || marketFilter !== 'ALL') ? <button type="button" className={styles.archivePrimaryButton} onClick={() => {setNewModelType('BIKE');setCreateKind('bike');}}>＋ 新建整车</button> : null}
                  </div>
                )}
            </> : null}
            {specModel ? <TechnicalSpecEditor
              inline
              model={specModel}
              platform={catalog.platforms.find(item => item.id === specModel.platform_id)}
              specs={specDraft}
              engineering={engineering}
              saving={savingSpecs}
              onChange={updateTechnicalSpec}
              onSave={status => void saveTechnicalSpecs(status)}
              onClose={closeSpecEditor}
            /> : null}
          </section>
        ) : null}

        {workspace === 'bikes' ? (
          <section className={styles.archivePanel} id="vehicle-details" aria-label="整车产品列表">
            <div className={styles.archivePanelTitle}>
              <div><h2>整车产品</h2><p>全部整车一行一条，汇总型号、平台、规格、市场和配置状态。</p></div>
              <span>{loading || catalogError ? '—' : catalog.models.filter(model => model.product_type_code === 'BIKE').length} 条记录</span>
            </div>
            <div className={styles.archiveFilters}>
              <label className={styles.archiveSearch}>
                <span className={styles.srOnly}>搜索整车</span>
                <input aria-label="搜索产品型号" value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="搜索整车名称、编码或 SKU" />
              </label>
              <select aria-label="按产品状态筛选" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="ACTIVE">启用</option><option value="RETIRED">已退役</option>
              </select>
            </div>
            {loading ? <div className={styles.archiveLoading}>正在读取整车档案…</div> :
              catalogError ? <div className={styles.archiveEmpty}><strong>暂时无法读取整车档案</strong><p>请检查数据接口，避免重复创建。</p></div> :
              filteredModels.length ? (
                <div className={styles.archiveTableWrap}>
                  <table className={`${styles.archiveTable} ${styles.vehicleTable}`} aria-label="整车产品档案">
                    <thead><tr><th>型号简称</th><th>整车名称 / 编码</th><th>技术平台</th><th>产品规格</th><th>目标市场</th><th>配置版本</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>{filteredModels.map(({ model, platform, variants }) => (
                      <tr key={model.id}>
                        <td title={model.name}><strong>{modelShortName(model)}</strong></td>
                        <td title={model.name}><strong>{model.name}</strong><span>{model.code} · 商品 ID {model.product_id}</span></td>
                        <td>{platform ? platformName(platform) : '未关联'}<span>{platform?.code ?? ''}</span></td>
                        <td>{modelSpecSummary(model, 'basic', 'productType') || '未填写'}<span>{modelSpecSummary(model, 'drivetrain', 'type') || '未填写'} · {modelSpecSummary(model, 'wheels', 'wheelSize') || '未填写'}</span></td>
                        <td>{modelSpecSummary(model, 'basic', 'markets') || '未填写'}</td>
                        <td>{variants.length ? `${variants.length} 个配置` : '未配置'}</td>
                        <td><span className={styles.archiveStatus} data-status={model.status}>{statusLabel(model.status)}</span></td>
                        <td><div className={styles.tableActionGroup}><button type="button" className={styles.archiveEdit} onClick={() => openTechnicalSpecs(model)}>技术参数</button><button type="button" className={styles.archiveEdit} onClick={() => setEdit({ entity: 'model', id: model.id, version: model.version, name: model.name, status: model.status, description: model.description, productTypeCode: model.product_type_code, customFields: modelCustomFields(model.custom_fields) })}>编辑</button><button type="button" className={styles.archiveEdit} aria-label={`编辑 ${model.code} 配置版本与 SKU`} onClick={() => {setMessage('');setManageModelId(model.id);}}>版本 / SKU</button></div></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.archiveEmpty}>
                  <span className={styles.archiveEmptyIcon} aria-hidden="true">◇</span>
                  <strong>{modelSearch || statusFilter !== 'ALL' ? '没有符合条件的整车' : '还没有整车产品'}</strong>
                  <p>{modelSearch || statusFilter !== 'ALL' ? '可以调整搜索词或筛选条件。' : '从第一款整车开始建立档案，不会自动生成示例型号。'}</p>
                  {!(modelSearch || statusFilter !== 'ALL') ? <button type="button" className={styles.archivePrimaryButton} onClick={() => {setNewModelType('BIKE');setCreateKind('bike');}}>＋ 新建整车</button> : null}
                </div>
              )}
          </section>
        ) : null}

        {workspace === 'parts' ? (
          <section className={styles.archivePanel} id="parts-library-panel" aria-label="零配件管理">
            <div className={styles.archivePanelTitle}>
              <div><h2>零配件档案</h2><p>生产零件与可售配件使用各自既有数据源</p></div>
              <span>{loading || (partTab === 'manufacturing' ? engineeringError : catalogError) ? '—' : (partTab === 'manufacturing' ? engineering.parts.length : catalog.models.filter(model => model.product_type_code !== 'BIKE').length)} 条记录</span>
            </div>
            <div className={styles.archiveSubtabs} role="group" aria-label="零配件类型">
              <button type="button" aria-pressed={partTab === 'manufacturing'} onClick={() => {setPartTab('manufacturing');setModelSearch('');}}>生产零件</button>
              <button type="button" aria-pressed={partTab === 'retail'} onClick={() => {setPartTab('retail');setModelSearch('');}}>可售配件</button>
            </div>
            <div className={styles.archiveFilters}>
              <label className={styles.archiveSearch}><span className={styles.srOnly}>搜索零配件</span><input aria-label="搜索零配件" value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="搜索名称、编码或分类" /></label>
            </div>
            <div id="parts">
            {loading ? <div className={styles.archiveLoading}>正在读取零配件档案…</div> :
              partTab === 'manufacturing' ? (
                engineeringError ? <div className={styles.archiveEmpty}>零件数据不可用，请先检查接口。</div> :
                filteredParts.length ? (
                  <div className={styles.archiveTableWrap}><table className={styles.archiveTable} aria-label="生产零件档案">
                    <thead><tr><th>零件名称 / 编码</th><th>分类</th><th>单位</th><th>状态</th></tr></thead>
                    <tbody>{filteredParts.map(part => <tr key={part.id}><td><strong>{part.name}</strong><span>{part.part_number}</span></td><td>{part.category || '未分类'}</td><td>{part.default_unit}</td><td>{statusLabel(part.status)}</td></tr>)}</tbody>
                  </table></div>
                ) : <div className={styles.archiveEmpty}><span className={styles.archiveEmptyIcon} aria-hidden="true">◇</span><strong>{modelSearch ? '没有找到匹配零件' : '暂无生产零件'}</strong><p>{modelSearch ? '试试其他搜索条件。' : '零件会在这里按行展示，并供生产制造编制 BOM 时引用。'}</p>{!modelSearch ? <button className={styles.archivePrimaryButton} type="button" onClick={() => setCreateKind('part')}>＋ 新建零件</button> : null}</div>
              ) : (
                catalogError ? <div className={styles.archiveEmpty}>商品数据不可用，请先检查接口。</div> :
                filteredAccessories.length ? (
                  <div className={styles.archiveTableWrap}><table className={styles.archiveTable} aria-label="可售配件档案">
                    <thead><tr><th>商品名称 / 编码</th><th>类型</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>{filteredAccessories.map(({ model }) => <tr key={model.id}><td><strong>{model.name}</strong><span>{model.code}</span></td><td>{catalog.productTypes.find(type => type.code === model.product_type_code)?.name ?? model.product_type_code}</td><td>{statusLabel(model.status)}</td><td><button className={styles.archiveEdit} type="button" onClick={() => setEdit({entity:'model',id:model.id,version:model.version,name:model.name,status:model.status,description:model.description, productTypeCode: model.product_type_code, customFields: modelCustomFields(model.custom_fields) })}>编辑</button></td></tr>)}</tbody>
                  </table></div>
                ) : <div className={styles.archiveEmpty}><span className={styles.archiveEmptyIcon} aria-hidden="true">◇</span><strong>{modelSearch ? '没有找到匹配配件' : '暂无可售配件'}</strong><p>可售配件在这里建档，商城上架与定价仍在商城运营管理。</p>{!modelSearch ? <button type="button" className={styles.archivePrimaryButton} onClick={() => {setNewModelType('ACCESSORY');setCreateKind('accessory');}}>＋ 新建可售配件</button> : null}</div>
              )}
            </div>
          </section>
        ) : null}

        {workspace === 'platforms' ? (
          <section id="product-types" className={styles.archivePanel} aria-label="技术平台管理">
            <div className={styles.archivePanelTitle} id="series"><div><h2>技术平台档案</h2><p>技术平台用于归类整车，不和销售 SKU 混用</p></div><span>{loading || catalogError ? '—' : catalog.platforms.length} 条记录</span></div>
            <div className={styles.archiveFilters}><label className={styles.archiveSearch}><span className={styles.srOnly}>搜索技术平台</span><input value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="搜索平台名称、编码或说明" aria-label="搜索技术平台" /></label>
              <select aria-label="按技术平台状态筛选" value={platformStatusFilter} onChange={event => setPlatformStatusFilter(event.target.value)}><option value="ALL">全部状态</option><option value="DRAFT">草稿</option><option value="ACTIVE">启用</option><option value="RETIRED">已归档</option></select>
            </div>
            {loading ? <div className={styles.archiveLoading}>正在读取技术平台…</div> :
              catalogError ? <div className={styles.archiveEmpty}>技术平台暂时无法读取，请检查接口。</div> :
              filteredPlatforms.length ? (
                <div className={styles.platformTableWrap}><table className={styles.platformTable} aria-label="技术平台档案">
                  <thead><tr><th>平台编码</th><th>平台名称</th><th>说明</th><th>关联整车</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{[...filteredPlatforms].sort((a,b)=>a.code.localeCompare(b.code)).map(platform => <tr key={platform.id}>
                    <td><strong>{platform.code}</strong></td><td>{platformName(platform)}</td><td>{platformDescription(platform) || '—'}</td><td>{catalog.models.filter((model) => model.platform_id === platform.id).length}</td><td><span className={styles.archiveStatus} data-status={platform.status}>{platform.status === 'RETIRED' ? '已归档' : statusLabel(platform.status)}</span></td><td><button type="button" className={styles.archiveEdit} onClick={() => setPlatformDraft(platform)}>编辑</button></td>
                  </tr>)}</tbody>
                </table></div>
              ) : <div className={styles.archiveEmpty}><span className={styles.archiveEmptyIcon} aria-hidden="true">◇</span><strong>{modelSearch ? '没有匹配的平台' : '目前没有技术平台记录'}</strong><p>平台信息来自真实数据库，不会自动生成默认型号。</p></div>}
            <p className={styles.archiveFootnote}>平台编码建档后固定不变。仅启用的平台可关联新整车；有关联未退役整车的平台不可归档，历史记录不做物理删除。</p>
          </section>
        ) : null}

        </div>
      </main>

      {createKind ? (
        <div className={styles.modal} onMouseDown={() => setCreateKind(null)} role="presentation">
          <form className={styles.createCard} id="configuration"
            role="dialog" aria-modal="true" aria-label={createKind === 'bike' ? '新建整车' : createKind === 'part' ? '新建零件' : '新建可售配件'}
            onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setCreateKind(null); }}
            onSubmit={event => void submitForm(event,
              createKind === 'part' ? '/v1/engineering/parts' : '/v1/product/models',
              form => createKind === 'part' ?
                {partNumber: form.get('partNumber'), name: form.get('name'), category: form.get('category'), defaultUnit: form.get('defaultUnit')} :
                {productTypeCode: createKind === 'bike' ? 'BIKE' : form.get('productTypeCode'),
                 platformId: createKind === 'bike' ? form.get('platformId') : null,
                 code: form.get('code'), name: form.get('name'), description: form.get('description'),
                 customFields:readModelFields(form,(catalog.modelFieldDefinitions??[]).filter(def=>
                   def.product_type_code===(createKind==='bike'?'BIKE':newModelType)))},
              () => setCreateKind(null))}>
            <div className={styles.createCardHeading}>
              <div><span>商品档案</span><h2>{createKind === 'bike' ? '新建整车' : createKind === 'part' ? '新建生产零件' : '新建可售配件'}</h2><p>填写基础信息后保存；不会自动建立 SKU、BOM 或商城绑定。</p></div>
              <button type="button" className={styles.createClose} aria-label="关闭" onClick={() => setCreateKind(null)}>×</button>
            </div>
            {createKind === 'part' ? (
              <>
                <label>零件编码 <input name="partNumber" autoFocus required maxLength={100} placeholder="输入唯一零件编码" /></label>
                <label>零件名称 <input name="name" required maxLength={160} placeholder="输入零件名称" /></label>
                <div className={styles.createGrid}><label>分类 <input name="category" placeholder="可选" /></label><label>计量单位 <input name="defaultUnit" required placeholder="如 EA" /></label></div>
              </>
            ) : (
              <>
                {createKind === 'accessory' ? (
                  <label>商品类型 <select name="productTypeCode" value={newModelType} onChange={event => setNewModelType(event.target.value)} required>
                    {selectableProductTypes.filter(type => type.code !== 'BIKE').map(type => <option key={type.code} value={type.code}>{type.name}</option>)}
                  </select></label>
                ) : (
                  <label>技术平台 <select name="platformId" defaultValue="" required><option value="" disabled>选择已有技术平台</option>{catalog.platforms.filter(platform => platform.status === 'ACTIVE').map(platform => <option key={platform.id} value={platform.id}>{platform.name} · {platform.code}</option>)}</select></label>
                )}
                {createKind === 'bike' && !catalog.platforms.some(platform => platform.status === 'ACTIVE') ? <p className={styles.archiveError}>目前没有已启用的技术平台。请先在技术平台中建档并启用。</p> : null}
                {createKind === 'accessory' && !selectableProductTypes.some(type => type.code !== 'BIKE') ? <p className={styles.archiveError}>当前商品类型接口尚未提供可售配件类型，无法创建。</p> : null}
                <label>{createKind === 'bike' ? '型号简称' : '商品编码'} <input name="code" autoFocus required maxLength={80} placeholder={createKind === 'bike' ? '例如 F8、FC1' : '输入唯一商品编码'} /></label>
                <label>商品名称 <input name="name" required maxLength={160} placeholder="输入商品名称" /></label>
                <label>说明（可选） <textarea name="description" rows={3} placeholder="简要描述商品" /></label>
                <ModelFieldInputs key={createKind==='bike'?'BIKE':newModelType} definitions={(catalog.modelFieldDefinitions??[])
                  .filter(def=>def.product_type_code===(createKind==='bike'?'BIKE':newModelType))}/>
              </>
            )}
            <div className={styles.createActions}>
              <button type="button" className={styles.archiveSecondaryButton} onClick={() => setCreateKind(null)}>取消</button>
              <button type="submit" className={styles.archivePrimaryButton} disabled={(createKind === 'bike' && !catalog.platforms.some(platform => platform.status === 'ACTIVE')) || (createKind === 'accessory' && !selectableProductTypes.some(type => type.code !== 'BIKE'))}>保存档案</button>
            </div>
          </form>
        </div>
      ) : null}
      </> : null}

      {view === "archive" && platformDraft ? (
        <div className={styles.modal} role="presentation" onMouseDown={() => { if (!savingPlatform) setPlatformDraft(null); }}>
          <form className={styles.createCard} role="dialog" aria-modal="true"
            aria-label={platformDraft === 'new' ? '新建技术平台' : '编辑技术平台'}
            onSubmit={event => void savePlatform(event)}
            onMouseDown={event => event.stopPropagation()}
            onKeyDown={event => { if (event.key === 'Escape' && !savingPlatform) setPlatformDraft(null); }}>
            <div className={styles.createCardHeading}>
              <div><span>产品研发 / 技术平台</span><h2>{platformDraft === 'new' ? '新建技术平台' : '编辑技术平台'}</h2>
              <p>平台档案使用真实数据库。新平台初始为草稿，启用后才能创建关联整车。</p></div>
              <button type="button" className={styles.createClose} aria-label="关闭" disabled={savingPlatform} onClick={() => setPlatformDraft(null)}>×</button>
            </div>
            <label>平台编码<input name="code" autoFocus={platformDraft === 'new'} maxLength={32}
              defaultValue={platformDraft === 'new' ? '' : platformDraft.code}
              readOnly={platformDraft !== 'new'} required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
              placeholder="如 FC" /></label>
            <label>平台名称<input name="name" autoFocus={platformDraft !== 'new'} required maxLength={160}
              defaultValue={platformDraft === 'new' ? '' : platformDraft.name} placeholder="输入技术平台名称" /></label>
            <label>平台说明<textarea name="description" rows={3} maxLength={2000}
              defaultValue={platformDraft === 'new' ? '' : platformDraft.description} placeholder="技术路线与适用车型说明" /></label>
            {platformDraft !== 'new' ? <label>状态<select name="status" defaultValue={platformDraft.status}>
              <option value="DRAFT">草稿</option><option value="ACTIVE">启用</option><option value="RETIRED">归档 / 停用</option>
            </select></label> : null}
            {platformDraft !== 'new' && catalog.models.some(model => model.platform_id === platformDraft.id && model.status !== 'RETIRED')
              ? <p className={styles.archiveFootnote}>此平台仍有关联的未退役整车，归档前需要先处理这些整车；可正常修改名称和说明。</p> : null}
            <div className={styles.createActions}>
              <button type="button" className={styles.archiveSecondaryButton} disabled={savingPlatform} onClick={() => setPlatformDraft(null)}>取消</button>
              <button type="submit" className={styles.archivePrimaryButton} disabled={savingPlatform}>{savingPlatform ? '正在保存…' : '保存平台'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {view === 'archive' && fieldManager && !fieldDraft ? (
        <div className={styles.modal} role="presentation" onMouseDown={()=>setFieldManager(false)}>
          <section className={styles.fieldManagerCard} role="dialog" aria-modal="true" aria-label="管理商品字段"
            onMouseDown={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape')setFieldManager(false);}}>
            <div className={styles.createCardHeading}><div><span>产品研发 / 商品主档案</span><h2>自定义字段管理</h2>
              <p>字段仅用于商品主档案（SPU）；不会修改 SKU、价格、库存或 BOM。</p></div>
              <button type="button" className={styles.createClose} aria-label="关闭" onClick={()=>setFieldManager(false)}>×</button>
            </div>
            <div className={styles.archiveFilters}>
              <select aria-label="字段所属商品类型" value={fieldScope} onChange={event=>setFieldScope(event.target.value as typeof fieldScope)}>
                <option value="BIKE">整车</option><option value="ACCESSORY">可售配件</option><option value="SERVICE_PART">售后配件商品</option>
              </select>
              <button type="button" className={styles.archivePrimaryButton} onClick={()=>{setFieldType('TEXT');setFieldDraft('new');}}>＋ 新建字段</button>
            </div>
            {(catalog.modelFieldDefinitions??[]).filter(def=>def.product_type_code===fieldScope).length?
              <div className={styles.archiveTableWrap}><table className={styles.archiveTable} aria-label="商品字段定义">
                <thead><tr><th>字段名称 / 编码</th><th>类型</th><th>必填</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>{(catalog.modelFieldDefinitions??[]).filter(def=>def.product_type_code===fieldScope).map(def=><tr key={def.id}>
                  <td><strong>{def.label}</strong><span>{def.code}</span></td>
                  <td>{({TEXT:'文本',NUMBER:'数字',BOOLEAN:'是/否',SELECT:'下拉选项'} as const)[def.field_type]}</td>
                  <td>{def.required?'是':'否'}</td><td>{def.status==='ACTIVE'?'启用':'已归档'}</td>
                  <td><div className={styles.tableActionGroup}><button type="button" className={styles.archiveEdit} onClick={()=>{setFieldType(def.field_type);setFieldDraft(def);}}>编辑</button><button type="button" className={styles.archiveEdit} disabled={deletingFieldId === def.id || !!deletingFieldId} onClick={()=>void deleteField(def)}>{deletingFieldId === def.id ? '删除中…' : '删除'}</button></div></td>
                </tr>)}</tbody>
              </table></div>
              :<div className={styles.archiveEmpty}>当前商品类型暂无自定义字段，可自行新建。</div>}
            <p className={styles.archiveFootnote}>删除字段会同时移除车型中该字段的已保存值，删除后不可恢复。</p>
          </section>
        </div>
      ):null}
      {view === 'archive' && fieldDraft ? (
        <div className={styles.modal} role="presentation" onMouseDown={()=>{if(!savingField)setFieldDraft(null);}}>
          <form className={styles.createCard} role="dialog" aria-modal="true"
            aria-label={fieldDraft==='new'?'新建商品字段':'编辑商品字段'}
            onSubmit={event=>void saveField(event)}
            onMouseDown={event=>event.stopPropagation()}
            onKeyDown={event=>{if(event.key==='Escape'&&!savingField)setFieldDraft(null);}}>
            <div className={styles.createCardHeading}><div><span>自定义字段 / {fieldScope}</span>
              <h2>{fieldDraft==='new'?'新建商品字段':'编辑商品字段'}</h2>
              <p>字段类型、编码及下拉选项建档后不可直接修改，避免破坏已有商品数据。</p></div>
              <button type="button" className={styles.createClose} aria-label="关闭" disabled={savingField} onClick={()=>setFieldDraft(null)}>×</button>
            </div>
            <label>字段编码<input name="code" autoFocus={fieldDraft==='new'} required maxLength={32}
              readOnly={fieldDraft!=='new'} defaultValue={fieldDraft==='new'?'':fieldDraft.code}
              pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="如 BATTERY_CAPACITY"/></label>
            <label>字段名称<input name="label" autoFocus={fieldDraft!=='new'} required maxLength={120}
              defaultValue={fieldDraft==='new'?'':fieldDraft.label} placeholder="如 电池容量"/></label>
            <label>字段类型<select name="fieldType" value={fieldType} disabled={fieldDraft!=='new'}
              onChange={event=>setFieldType(event.target.value as typeof fieldType)}>
              <option value="TEXT">文本</option><option value="NUMBER">数字</option><option value="BOOLEAN">是/否</option><option value="SELECT">下拉选项</option>
            </select></label>
            {fieldType==='SELECT'?<label>选项（每行一个）
              <textarea name="options" rows={4} disabled={fieldDraft!=='new'} required
                defaultValue={fieldDraft==='new'?'':fieldDraft.options.join('\n')}
                placeholder="20 英寸\n24 英寸"/></label>:null}
            <label className={styles.fieldCheck}><input name="required" type="checkbox"
              defaultChecked={fieldDraft==='new'?false:fieldDraft.required}/> 必填字段</label>
            {fieldDraft!=='new'?<label>字段状态<select name="status" defaultValue={fieldDraft.status}>
              <option value="ACTIVE">启用</option><option value="RETIRED">归档</option></select></label>:null}
            <div className={styles.createActions}><button type="button" className={styles.archiveSecondaryButton}
              disabled={savingField} onClick={()=>setFieldDraft(null)}>取消</button>
              <button type="submit" className={styles.archivePrimaryButton} disabled={savingField}>
                {savingField?'正在保存…':'保存字段'}</button></div>
          </form>
        </div>
      ):null}
      {view === 'archive' && specModel && workspace !== 'models' ? <TechnicalSpecEditor
        model={specModel}
        platform={catalog.platforms.find(item => item.id === specModel.platform_id)}
        specs={specDraft}
        engineering={engineering}
        saving={savingSpecs}
        onChange={updateTechnicalSpec}
        onSave={status => void saveTechnicalSpecs(status)}
        onClose={closeSpecEditor}
      /> : null}
      {view === "engineering" ? <>
      {message ? <div className={styles.notice} role="status">{message}</div> : null}
      {catalogError || engineeringError ? <div className={styles.notice} role="alert">生产用料数据读取失败：{[catalogError, engineeringError].filter(Boolean).join('；')}。读取失败不等于没有记录。</div> : null}
      <details className={styles.collapsiblePanel} id="production-bom">
        <summary>BOM / 生产用料清单 <span>创建 BOM、零件用量与生产版本</span></summary>
      <div className={styles.notice} role="note">BOM 从产品研发建立的商品及零件档案引用数据，不重复创建商品或零件。发布后的受控版本不能静默修改。</div>
      <section className={styles.section} id="engineering">
        <div className={styles.sectionHead}>
          <div><span>工程发布</span><h2>零部件、BOM 与生产规格</h2></div>
          <p>发布是受控状态转换。BOM Revision 和 Build Specification 一旦发布，就不能被静默修改；后续变更必须形成新的受控版本。</p>
        </div>
        <div className={styles.engineeringGrid}>
          <div className={styles.listCard} id="parts">
            <h3>零部件</h3>
            {engineering.parts.map((part) => <div className={styles.listRow} key={part.id}><b>{part.part_number}</b><span>{part.name}</span><small>{part.category} · {part.default_unit} · {statusLabel(part.status)}</small></div>)}
            {!engineering.parts.length ? <small>{loading ? '正在同步零部件…' : engineeringError ? '零部件读取失败' : '暂无零部件'}</small> : null}
          </div>
          <div className={styles.listCard}>
            <h3>BOM 版本</h3>
            {engineering.boms.map((bom) => (
              <div className={styles.listRow} key={`${bom.id}-${bom.revision_id ?? 'none'}`}>
                <b>{bom.code} · {bom.revision_code ?? '—'}</b>
                <span>{bom.model_code} · {bom.name}</span>
                <small>{bom.line_count ?? 0} 行 · {statusLabel(bom.revision_status ?? 'NO_REVISION')}</small>
                {bom.revision_id && bom.revision_status === 'DRAFT' ? <button onClick={() => void release(`/v1/engineering/bom-revisions/${bom.revision_id}/release`)}>发布 BOM</button> : null}
              </div>
            ))}
          </div>
          <div className={styles.listCard}>
            <h3>生产规格 / Build Spec</h3>
            {engineering.buildSpecs.map((spec) => (
              <div className={styles.listRow} key={spec.id}>
                <b>{spec.code}</b><span>{spec.sku} · {spec.bom_code}/{spec.revision_code}</span><small>{statusLabel(spec.status)}</small>
                {spec.status === 'DRAFT' ? <button onClick={() => void release(`/v1/engineering/build-specs/${spec.id}/release`)}>发布生产规格</button> : null}
              </div>
            ))}
            {!engineering.buildSpecs.length ? <small>{loading ? '正在同步生产规格…' : engineeringError ? '生产规格读取失败' : '暂无生产规格'}</small> : null}
          </div>
        </div>
      </section>

      <section className={styles.formsGrid}>
        <form onSubmit={(e) => void submitForm(e, '/v1/engineering/boms', (f) => ({ modelId: f.get('modelId'), code: f.get('code'), name: f.get('name'), revisionCode: f.get('revisionCode') }))}>
          <span>BOM 主数据</span><h3>创建 BOM 与草稿版本</h3>
          <select name="modelId" required defaultValue=""><option value="" disabled>选择车型</option>{catalog.models.map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}</select>
          <input name="code" placeholder="例如：BOM-FC1" required />
          <input name="name" placeholder="BOM 名称" required />
          <input name="revisionCode" placeholder="版本，例如：A" />
          <button>创建 BOM</button>
        </form>

        <form onSubmit={(e) => void submitForm(e, `/v1/engineering/bom-revisions/${(e.currentTarget.elements.namedItem('revisionId') as HTMLSelectElement)?.value || 'missing'}/lines`, (f) => ({ lineNo: Number(f.get('lineNo')), partId: f.get('partId'), quantity: Number(f.get('quantity')), unit: f.get('unit') }))}>
          <span>BOM 明细</span><h3>添加零部件到草稿 BOM</h3>
          <select name="revisionId" required defaultValue=""><option value="" disabled>选择草稿版本</option>{engineering.boms.filter((b) => b.revision_id && b.revision_status === 'DRAFT').map((b) => <option key={b.revision_id!} value={b.revision_id!}>{b.code} / {b.revision_code}</option>)}</select>
          <select name="partId" required defaultValue=""><option value="" disabled>选择零部件</option>{engineering.parts.map((p) => <option key={p.id} value={p.id}>{p.part_number} · {p.name}</option>)}</select>
          <div className={styles.inline}><input name="lineNo" type="number" min="1" placeholder="行号 10" required /><input name="quantity" type="number" min="0.000001" step="any" placeholder="数量 1" required /><input name="unit" placeholder="单位 EA" /></div>
          <button>添加 BOM 明细</button>
        </form>

        <form onSubmit={(e) => void submitForm(e, '/v1/engineering/build-specs', (f) => ({ code: f.get('code'), skuId: f.get('skuId'), bomRevisionId: f.get('bomRevisionId'), notes: f.get('notes') }))}>
          <span>生产规格</span><h3>创建 Build Specification</h3>
          <input name="code" placeholder="例如：BS-FC1-PRO-DE-A" required />
          <select name="skuId" required defaultValue=""><option value="" disabled>选择 SKU</option>{catalog.skus.map((s) => <option key={s.id} value={s.id}>{s.sku}</option>)}</select>
          <select name="bomRevisionId" required defaultValue=""><option value="" disabled>选择 BOM 版本</option>{engineering.boms.filter((b) => b.revision_id).map((b) => <option key={b.revision_id!} value={b.revision_id!}>{b.code}/{b.revision_code} · {statusLabel(b.revision_status)}</option>)}</select>
          <input name="notes" placeholder="发布说明 / 备注" />
          <button>创建生产规格</button>
        </form>
      </section>

      </details>

      </> : null}


      {manageModel ? (
        <div className={styles.modal} role="presentation" onMouseDown={() => setManageModelId(null)}>
          <section className={styles.variantSkuDialog} role="dialog" aria-modal="true" aria-label="编辑车型配置及 SKU"
            onMouseDown={event => event.stopPropagation()} onKeyDown={event => {if(event.key === 'Escape')setManageModelId(null);}}>
            <header className={styles.variantSkuHeader}>
              <div><span>产品研发 / 整车产品</span><h2>{manageModel.name} · 版本与 SKU</h2><p>商品 ID {manageModel.product_id} · 型号 {manageModel.code}。直接在弹窗内维护，不另建管理页面。</p></div>
              <button type="button" className={styles.archiveSecondaryButton} onClick={() => setManageModelId(null)}>关闭</button>
            </header>
            {message ? <p className={styles.archiveFeedback} role="status">{message}</p> : null}
            <div className={styles.variantSkuTables}>
              <section aria-label="商业配置版本">
                <h3>商业配置版本 <small>{manageVariants.length} 条</small></h3>
                <div className={styles.variantSkuScroll}><table className={styles.variantSkuTable}>
                  <thead><tr><th>版本编码</th><th>名称</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{manageVariants.length ? manageVariants.map(variant => (
                    <tr key={variant.id}><td>{variant.code}</td><td>{variant.name}</td><td>{statusLabel(variant.status)}</td>
                      <td><button type="button" className={styles.archiveEdit} onClick={() => {setManageModelId(null);setEdit({entity:'variant',id:variant.id,version:variant.version,name:variant.name,status:variant.status,description:variant.description});}}>编辑</button></td></tr>
                  )) : <tr><td colSpan={4}>尚无配置版本</td></tr>}</tbody>
                </table></div>
              </section>
              <section aria-label="车型 SKU 规格">
                <h3>SKU 规格 <small>{manageSkus.length} 条</small></h3>
                <div className={styles.variantSkuScroll}><table className={styles.variantSkuTable}>
                  <thead><tr><th>SKU / 内部编号</th><th>所属版本</th><th>市场 / 颜色 / 尺寸</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{manageSkus.length ? manageSkus.map(sku => (
                    <tr key={sku.id}>
                      <td><strong>{sku.sku}</strong><small>{sku.name} · SKU ID {sku.sku_number}</small></td>
                      <td>{manageVariants.find(item => item.id === sku.variant_id)?.code ?? '—'}</td>
                      <td>{[sku.market_code,sku.color_code,sku.size_code].filter(Boolean).join(' / ') || '未配置'}</td>
                      <td>{statusLabel(sku.status)}</td>
                      <td><div className={styles.tableActionGroup}><button type="button" className={styles.archiveEdit} onClick={() => {setManageModelId(null);setEdit({entity:'sku',id:sku.id,version:sku.version,name:sku.name,status:sku.status,marketCode:sku.market_code,colorCode:sku.color_code,sizeCode:sku.size_code});}}>编辑</button><a className={styles.archiveEdit} href={adminSkuPricingHref(sku)}>售价</a></div></td>
                    </tr>
                  )) : <tr><td colSpan={5}>尚无 SKU 规格</td></tr>}</tbody>
                </table></div>
              </section>
            </div>
            <div className={styles.variantSkuForms}>
              <form onSubmit={event => void submitForm(event,'/v1/product/variants',form => ({modelId:manageModel.id,code:form.get('code'),name:form.get('name'),description:form.get('description')}))}>
                <h3>新增商业版本</h3>
                <label>版本编码<input name="code" placeholder="PRO" required /></label>
                <label>版本名称<input name="name" placeholder="Pro" required /></label>
                <label>说明<input name="description" placeholder="版本说明" /></label>
                <button type="submit" className={styles.archivePrimaryButton}>创建版本</button>
              </form>
              <form onSubmit={event => void submitForm(event,'/v1/product/skus',form => ({variantId:form.get('variantId'),sku:form.get('sku'),name:form.get('name'),marketCode:form.get('marketCode')||undefined,colorCode:form.get('colorCode')||undefined,sizeCode:form.get('sizeCode')||undefined}))}>
                <h3>新增 SKU 规格</h3>
                <label>所属版本<select name="variantId" key={manageVariants.map(v=>v.id).join(',')} required defaultValue=""><option value="" disabled>选择配置版本</option>{manageVariants.map(variant=><option key={variant.id} value={variant.id}>{variant.code} · {variant.name}</option>)}</select></label>
                <label>SKU 编码<input name="sku" placeholder="ALS-A1-STD-DE-BLK" required /></label>
                <label>SKU 名称<input name="name" placeholder="A1 Standard 黑色" required /></label>
                <div className={styles.variantSkuDimensions}>
                  <label>市场<input name="marketCode" maxLength={2} placeholder="DE" /></label>
                  <label>颜色<input name="colorCode" maxLength={32} placeholder="BLACK" /></label>
                  <label>尺寸<input name="sizeCode" maxLength={32} placeholder="20" /></label>
                </div>
                <button type="submit" className={styles.archivePrimaryButton} disabled={!manageVariants.length}>创建 SKU</button>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      {edit ? (
        <div className={styles.modal} role="presentation" onMouseDown={() => setEdit(null)}>
          <form className={styles.editCard} role="dialog" aria-modal="true" aria-label={`编辑${edit.entity==='model'?'整车':edit.entity==='variant'?'配置版本':'SKU'}`} onSubmit={saveEdit} onMouseDown={(event) => event.stopPropagation()} onKeyDown={event => {if(event.key==='Escape')setEdit(null);}}>
            <div><span>编辑 {edit.entity.toUpperCase()}</span><h2>{edit.name}</h2></div>
            <label>名称<input name="name" defaultValue={edit.name} /></label>
            <label>状态<select name="status" defaultValue={edit.status}><option value="DRAFT">草稿</option><option value="ACTIVE">启用</option><option value="RETIRED">已退役</option></select></label>
            {edit.entity !== 'sku' ? (
              <>
                <label>说明<textarea name="description" defaultValue={edit.description ?? ''} /></label>
                {edit.entity==='model'?<ModelFieldInputs
                  definitions={(catalog.modelFieldDefinitions??[]).filter(def=>def.product_type_code===edit.productTypeCode)}
                  values={edit.customFields??{}}/>:null}
              </>
            ) : (
              <>
                <label>市场<input name="marketCode" maxLength={2} defaultValue={edit.marketCode ?? ''} /></label>
                <label>颜色<input name="colorCode" defaultValue={edit.colorCode ?? ''} maxLength={32} placeholder="如 GRAPHITE_BLACK" /></label>
                <label>尺寸<input name="sizeCode" defaultValue={edit.sizeCode ?? ''} maxLength={32} placeholder="如 20" /></label>
              </>
            )}
            <div className={styles.actions}><button type="button" onClick={() => setEdit(null)}>取消</button><button>保存</button></div>
          </form>
        </div>
      ) : null}
    </OperationsFrame>
  );
}
