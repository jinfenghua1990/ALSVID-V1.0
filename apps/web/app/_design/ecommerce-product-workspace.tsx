'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CatalogPublicationPanel } from '../product/catalog-publication-panel';
import { EcommercePricingWorkspace } from './ecommerce-pricing-workspace';
import styles from './ecommerce-product-workspace.module.css';

type Model = { id: string; product_id: string; code: string; name: string; description: string; status: string; version: number; created_at: string; updated_at: string; platform_id: string | null; product_type_code: string };
type Variant = { id: string; model_id: string; code: string; name: string; status: string };
type Sku = { id: string; variant_id: string; sku: string; name: string; status: string; market_code: string | null; color_code: string | null; size_code: string | null };
type Platform = { id: string; code: string; name: string };
type Catalog = { models: Model[]; variants: Variant[]; skus: Sku[]; platforms: Platform[] };
type Publication = { model_id: string; model_code: string; status: string; title_zh: string; title_de: string; title_en: string; image_path: string; version: number; published_at: string | null; withdrawn_at: string | null };
type Price = { id: string; skuId: string; sku: string; skuName: string; marketCountry: string; currency: string; unitPriceGross: string; status: string; effectiveFrom: string | null };
type Summary = { skus: { id: string; sku: string; name: string; modelCode: string; variantCode: string }[]; prices: Price[]; orders: { id: string; orderNumber: string; status: string; marketCountry: string; totalGrossAmount: string; createdAt: string }[]; orderTotal: number; orderStatusCounts: Record<string, number> };
type Stock = { item_kind: string; sku_id: string | null; sku: string | null; sku_name: string | null; warehouse_code: string; warehouse_name: string; location_code: string; on_hand: string; reserved: string; available: string; frame_number: string | null };
type ProductData = { catalog: Catalog; publications: Publication[]; summary: Summary; inventory: Stock[]; permissions: string[] | null };
type ProductRowData = { model: Model; publication: Publication | undefined; platform: Platform | undefined; skus: Sku[]; prices: Price[]; stock: Stock[] };
type Filters = { id: string; code: string; sku: string; name: string; type: string; market: string; platform: string; stock: string; from: string; to: string; priceState: string; updatedWithin: string };

const publicationLabel: Record<string, string> = { UNLISTED: '未建立发布记录', DRAFT: '草稿', IN_REVIEW: '待审核', PUBLISHED: '已上架', WITHDRAWN: '已下架' };
const productTypeLabel: Record<string, string> = { BIKE: '整车', ACCESSORY: '零配件', SERVICE_PART: '服务件' };
const emptyFilters: Filters = { id: '', code: '', sku: '', name: '', type: 'ALL', market: 'ALL', platform: 'ALL', stock: 'ALL', from: '', to: '', priceState: 'ALL', updatedWithin: 'ALL' };

async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  const payload = await response.json().catch(() => null) as { data?: T; message?: string } | null;
  if (!response.ok) throw new Error(response.status === 401 ? '登录已失效，请重新登录' : response.status === 403 ? '当前账号没有商城数据读取权限' : payload?.message ?? '商城数据读取失败');
  if (!payload || !('data' in payload)) throw new Error('商城接口返回格式异常');
  return payload.data as T;
}

async function transitionPublication(modelId: string, action: 'PUBLISH' | 'WITHDRAW', version: number) {
  const response = await fetch(`/api/control/v1/product/publications/${encodeURIComponent(modelId)}/transition`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, expectedVersion: version }),
  });
  const payload = await response.json().catch(() => null) as { data?: unknown; message?: string } | null;
  if (!response.ok) throw new Error(response.status === 403 ? '没有商品发布权限' : payload?.message ?? '操作失败，请刷新后重试');
  if (!payload || !('data' in payload)) throw new Error('发布接口返回资料异常');
}

function money(value: string | undefined, currency = 'EUR') {
  if (!value) return '未配置';
  return `${value} ${currency}`;
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—';
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map(row => row.map(cell => csvCell(cell)).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function day(value: string | undefined) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function contains(value: string | null | undefined, term: string) {
  return !term.trim() || (value ?? '').toLocaleLowerCase().includes(term.trim().toLocaleLowerCase());
}

function stockTotal(stock: Stock[], field: 'on_hand' | 'available' = 'available') {
  if (!stock.length) return null;
  const values = stock.map(item => typeof item[field] === 'string' && item[field].trim() ? Number(item[field]) : NaN);
  return values.every(Number.isFinite) ? values.reduce((total, value) => total + value, 0) : null;
}

export function EcommerceProductWorkspace() {
  const [data, setData] = useState<ProductData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [status, setStatus] = useState('ALL');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failures, setFailures] = useState<string[]>([]);

  async function load() {
    setState('loading');
    setError('');
    try {
      const [catalog, publications, summary, inventory, identity] = await Promise.all([
        readApi<Catalog>('/api/control/v1/product/catalog'),
        readApi<Publication[]>('/api/control/v1/product/publications'),
        readApi<Summary>('/api/control/v1/commerce/storefront/summary'),
        readApi<{ balances: Stock[] }>('/api/control/v1/inventory'),
        readApi<{ permissions: string[] }>('/api/control/v1/auth/me').catch(() => null),
      ]);
      setData({ catalog, publications, summary, inventory: inventory.balances, permissions: Array.isArray(identity?.permissions) ? identity.permissions : null });
      setSelectedIds(new Set());
      setState('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '商城数据读取失败');
      setState('error');
    }
  }

  useEffect(() => {
    const modelId = new URLSearchParams(window.location.search).get('modelId') ?? '';
    setSelectedId(modelId);
    void load();
  }, []);

  // Canonical operator deep links use the stable six-digit Product ID.
  // Old UUID modelId bookmarks remain readable for compatibility.
  useEffect(()=>{
    if(!data)return;
    const productId=new URLSearchParams(window.location.search).get('productId');
    if(!productId)return;
    const selected=data.catalog.models.find(model=>String(model.product_id)===productId);
    setSelectedId(selected?.id??'');
  },[data]);

  const allRows = useMemo<ProductRowData[]>(() => {
    if (!data) return [];
    const publicationByModel = new Map(data.publications.map(item => [item.model_id, item]));
    const platformById = new Map(data.catalog.platforms.map(item => [item.id, item]));
    const modelByVariant = new Map(data.catalog.variants.map(item => [item.id, item.model_id]));
    const skuByModel = new Map<string, Sku[]>();
    const modelBySku = new Map<string, string>();
    for (const sku of data.catalog.skus) {
      const modelId = modelByVariant.get(sku.variant_id);
      if (!modelId) continue;
      modelBySku.set(sku.id, modelId);
      const items = skuByModel.get(modelId) ?? [];
      items.push(sku); skuByModel.set(modelId, items);
    }
    const pricesByModel = new Map<string, Price[]>();
    for (const price of data.summary.prices) {
      const modelId = modelBySku.get(price.skuId);
      if (!modelId || price.status !== 'ACTIVE') continue;
      const items = pricesByModel.get(modelId) ?? [];
      items.push(price); pricesByModel.set(modelId, items);
    }
    const stockByModel = new Map<string, Stock[]>();
    for (const stock of data.inventory) {
      const modelId = stock.item_kind === 'SKU' && stock.sku_id ? modelBySku.get(stock.sku_id) : undefined;
      if (!modelId) continue;
      const items = stockByModel.get(modelId) ?? [];
      items.push(stock); stockByModel.set(modelId, items);
    }
    return data.catalog.models.map(model => ({
      model, publication: publicationByModel.get(model.id), platform: model.platform_id ? platformById.get(model.platform_id) : undefined,
      skus: skuByModel.get(model.id) ?? [], prices: pricesByModel.get(model.id) ?? [], stock: stockByModel.get(model.id) ?? [],
    }));
  }, [data]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allRows.length };
    for (const row of allRows) {
      const key = row.publication?.status ?? 'UNLISTED';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [allRows]);

  const rows = useMemo(() => allRows.filter(row => {
    const { model, publication, skus, prices, stock } = row;
    const total = stockTotal(stock);
    const created = day(model.created_at);
    return contains(model.product_id, filters.id)
      && contains(model.code, filters.code)
      && (!filters.sku.trim() || skus.some(sku => contains(sku.sku, filters.sku)))
      && (!filters.name.trim() || [model.name, publication?.title_zh, publication?.title_de, publication?.title_en].some(value => contains(value, filters.name)))
      && (filters.type === 'ALL' || model.product_type_code === filters.type)
      && (filters.market === 'ALL' || prices.some(price => price.marketCountry === filters.market))
      && (filters.platform === 'ALL' || model.platform_id === filters.platform)
      && (filters.stock === 'ALL' || (filters.stock === 'MISSING' ? !stock.length : total !== null && (filters.stock === 'AVAILABLE' ? total > 0 : total <= 0)))
      && (filters.priceState === 'ALL' || (filters.priceState === 'PRICED' ? prices.length > 0 : prices.length === 0))
      && (filters.updatedWithin === 'ALL' || new Date(model.updated_at).getTime() >= Date.now() - Number(filters.updatedWithin) * 86400000)
      && (!filters.from || (!!created && created >= filters.from))
      && (!filters.to || (!!created && created <= filters.to))
      && (status === 'ALL' || (publication?.status ?? 'UNLISTED') === status);
  }), [allRows, filters, status]);

  const selected = data?.catalog.models.find(model => model.id === selectedId) ?? null;
  const selectedRows = rows.filter(row => selectedIds.has(row.model.id));
  const allSelected = rows.length > 0 && rows.every(row => selectedIds.has(row.model.id));
  const canPublish = data?.permissions?.includes('product.publish') ?? false;
  const publishable = selectedRows.filter(row => row.publication?.status === 'IN_REVIEW');
  const withdrawable = selectedRows.filter(row => row.publication?.status === 'PUBLISHED');
  const retireable = selectedRows.filter(row => row.model.status !== 'RETIRED');

  async function refreshPrices() {
    const summary = await readApi<Summary>('/api/control/v1/commerce/storefront/summary');
    setData(current => current ? { ...current, summary } : current);
  }

  function selectModel(id: string) {
    setSelectedId(id);
    const product=data?.catalog.models.find(model=>model.id===id);
    const key=product&&/^[1-9][0-9]{5}$/.test(String(product.product_id))
      ? 'productId='+encodeURIComponent(String(product.product_id))
      : 'modelId='+encodeURIComponent(id);
    window.history.replaceState({}, '', '/admin/ecommerce/products?'+key);
  }

  function toggle(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(current => {
      const next = new Set(current);
      for (const row of rows) {
        if (allSelected) next.delete(row.model.id); else next.add(row.model.id);
      }
      return next;
    });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(draft);
    setSelectedIds(new Set());
  }

  function resetFilters() {
    setFilters(emptyFilters); setDraft(emptyFilters); setStatus('ALL'); setSelectedIds(new Set());
  }

  async function batch(action: 'PUBLISH' | 'WITHDRAW') {
    if (busy || !canPublish) return;
    const targets = action === 'PUBLISH' ? publishable : withdrawable;
    if (!targets.length) return;
    const prompt = action === 'PUBLISH'
      ? `确认已核验车型、图片及三语标题，审核并公开发布 ${targets.length} 个待审核商品？其他状态的已选商品将跳过。`
      : `确认从公开目录撤回 ${targets.length} 个已上架商品？其他状态的已选商品将跳过。`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setFeedback(''); setFailures([]);
    const failed: string[] = [];
    let succeeded = 0;
    for (const row of targets) {
      try {
        await transitionPublication(row.model.id, action, row.publication!.version);
        succeeded++;
      } catch (reason) {
        failed.push(`${row.model.code}：${reason instanceof Error ? reason.message : '操作失败'}`);
      }
    }
    await load();
    setFeedback(`已${action === 'PUBLISH' ? '审核上架' : '下架'} ${succeeded} 个商品${failed.length ? `，失败 ${failed.length} 个` : ''}。`);
    setFailures(failed);
    setBusy(false);
  }

  function exportRows() {
    if (!data) return;
    const source = selectedIds.size > 0 ? selectedRows : rows;
    if (!source.length) { setFeedback('当前没有可导出的商品。'); return; }
    const header = ['商品 ID', '商品编码', '商品名称', '产品类型', 'SKU 数', 'SKU 编码', '市场与售价', '可用库存', '销售状态', '最近更新'];
    const body = source.map(row => {
      const { model, publication, skus, prices, stock } = row;
      const available = stockTotal(stock);
      return [
        model.product_id ?? '',
        model.code,
        publication?.title_zh || model.name,
        productTypeLabel[model.product_type_code] ?? model.product_type_code,
        String(skus.length),
        skus.map(sku => sku.sku).join(' | '),
        prices.map(price => `${price.marketCountry} ${price.unitPriceGross} ${price.currency}`).join(' | '),
        available === null ? '数据异常' : String(available),
        publication ? (publicationLabel[publication.status] ?? publication.status) : (publicationLabel.UNLISTED ?? '未建立发布记录'),
        date(model.updated_at),
      ];
    });
    downloadCsv(`storefront-products-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
    setFeedback(`已导出 ${source.length} 个商品为 CSV。`);
  }

  async function copySelectedSkus() {
    if (!data || !selectedRows.length) return;
    const codes = selectedRows.flatMap(row => row.skus.map(sku => sku.sku));
    if (!codes.length) { setFeedback('所选商品没有可复制的 SKU 编码。'); return; }
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setFeedback(`已复制 ${codes.length} 个 SKU 编码到剪贴板。`);
    } catch {
      setFeedback('浏览器拒绝了剪贴板写入，请手动复制。');
    }
  }

  async function batchRetire() {
    if (busy || !retireable.length) return;
    if (!window.confirm(`确认停用 ${retireable.length} 个商品型号？\n\n停用后该型号不再作为可售商品出现在选品与商城流程中；历史订单、库存与生产记录保留。此操作会写入商品主数据版本，请确认已核对商品编码。`)) return;
    setBusy(true); setFeedback(''); setFailures([]);
    const failed: string[] = [];
    let succeeded = 0;
    for (const row of retireable) {
      try {
        const response = await fetch(`/api/control/v1/product/model/${encodeURIComponent(row.model.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: row.model.version, status: 'RETIRED' }) });
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        if (!response.ok) throw new Error(payload?.message ?? '商品型号停用失败');
        succeeded++;
      } catch (reason) {
        failed.push(`${row.model.code}：${reason instanceof Error ? reason.message : '操作失败'}`);
      }
    }
    await load();
    setFeedback(`已停用 ${succeeded} 个商品型号${failed.length ? `，失败 ${failed.length} 个` : ''}。`);
    setFailures(failed);
    setBusy(false);
  }

  if (state === 'loading') return <section className="av-card av-commerce-load-state" role="status"><strong>正在读取商城商品资料…</strong></section>;
  if (state === 'error') return <section className="av-card av-commerce-load-state" role="alert"><strong>商城商品资料暂不可用</strong><p>{error}。读取失败不代表没有商品或库存。</p><button className="av-btn" type="button" onClick={() => void load()}>重新读取</button></section>;
  if (!data) return null;

  return <div className="av-ecommerce-products">
    <header className={styles.header}>
      <h1>商城商品列表</h1>
      <div className={styles.actions}>
        <button className="av-btn" type="button" onClick={() => void load()} disabled={busy}>刷新</button>
        <a className="av-btn" data-variant="primary" href="/admin/product?type=BIKE#vehicle-models">从产品中心新增</a>
      </div>
    </header>
    {feedback ? <p className="av-card av-inline-notice" role="status">{feedback}</p> : null}
    {failures.length ? <div className="av-card av-inline-alert" role="alert">{failures.map(item => <div key={item}>{item}</div>)}</div> : null}

    <section className={styles.list} aria-label="商城商品列表">
      <nav className={styles.tabs} aria-label="按商品状态筛选">
        {['ALL', 'PUBLISHED', 'WITHDRAWN', 'IN_REVIEW', 'DRAFT', 'UNLISTED'].map(key => <button key={key} type="button" className={styles.tab} aria-pressed={status === key} onClick={() => { setStatus(key); setSelectedIds(new Set()); }}>{key === 'ALL' ? '全部' : publicationLabel[key]} <strong>{statusCounts[key] ?? 0}</strong></button>)}
      </nav>
      <form className={styles.filters} onSubmit={applyFilters}>
        <label>数字商品 ID<input className="av-search" inputMode="numeric" pattern="[0-9]{0,6}" maxLength={6} value={draft.id} onChange={event => setDraft({ ...draft, id: event.target.value.replace(/\D/g,'').slice(0,6) })} placeholder="6 位商品 ID" /></label>
        <label>商品编码<input className="av-search" value={draft.code} onChange={event => setDraft({ ...draft, code: event.target.value })} placeholder="输入商品编码" /></label>
        <label>SKU 编码<input className="av-search" value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} placeholder="输入 SKU 编码" /></label>
        <label>商品名称<input className="av-search" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="输入商品名称" /></label>
        <label>创建时间从<input className="av-search" type="date" value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
        <label>创建时间至<input className="av-search" type="date" value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
        <div className={styles.filterActions}><button className="av-btn" data-variant="primary" type="submit">查询</button><button className="av-btn" type="button" onClick={resetFilters}>重置</button><button className="av-btn" type="button" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? '收起筛选' : '更多筛选'}</button></div>
        {showAdvanced ? <>
        <label>商品类型<select className="av-search" value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value })}><option value="ALL">全部类型</option><option value="BIKE">整车</option><option value="ACCESSORY">零配件</option><option value="SERVICE_PART">服务件</option></select></label>
        <label>销售市场<select className="av-search" value={draft.market} onChange={event => setDraft({ ...draft, market: event.target.value })}><option value="ALL">全部市场</option><option value="DE">德国 DE</option><option value="AT">奥地利 AT</option></select></label>
        <label>技术平台<select className="av-search" value={draft.platform} onChange={event => setDraft({ ...draft, platform: event.target.value })}><option value="ALL">全部平台</option>{data.catalog.platforms.map(platform => <option key={platform.id} value={platform.id}>{platform.name || platform.code}</option>)}</select></label>
        <label>库存台账<select className="av-search" value={draft.stock} onChange={event => setDraft({ ...draft, stock: event.target.value })}><option value="ALL">全部库存</option><option value="AVAILABLE">台账有可用量</option><option value="EMPTY">台账无可用量</option><option value="MISSING">无库存记录</option></select></label>
        <label>价格配置<select className="av-search" value={draft.priceState} onChange={event => setDraft({ ...draft, priceState: event.target.value })}><option value="ALL">全部价格</option><option value="PRICED">已配置市场价格</option><option value="UNPRICED">未配置市场价格</option></select></label>
        <label>最近更新<select className="av-search" value={draft.updatedWithin} onChange={event => setDraft({ ...draft, updatedWithin: event.target.value })}><option value="ALL">全部更新时间</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label>
        </> : null}
      </form>

      <div className={styles.toolbar}>
        <span>已选 {selectedRows.length} 条</span>
        <button className="av-btn" type="button" onClick={() => void batch('PUBLISH')} disabled={busy || !canPublish || !publishable.length} title={!canPublish ? '需要商品发布权限' : '仅处理已选的待审核商品'}>批量审核并上架</button>
        <button className="av-btn" type="button" onClick={() => void batch('WITHDRAW')} disabled={busy || !canPublish || !withdrawable.length} title={!canPublish ? '需要商品发布权限' : '仅处理已选的已上架商品'}>批量下架</button>
        <button className="av-btn" type="button" onClick={exportRows} disabled={busy || !rows.length}>导出 CSV</button>
        <button className="av-btn" type="button" onClick={() => void copySelectedSkus()} disabled={busy || !selectedRows.length}>复制 SKU</button>
        <button className="av-btn" type="button" onClick={() => void batchRetire()} disabled={busy || !retireable.length} title="将所选型号状态改为 RETIRED，不物理删除">批量停用</button>
        <span className={styles.count}>显示 {rows.length} / {allRows.length} 条</span>
      </div>
      {data.permissions === null ? <p className={styles.hint}>发布权限暂无法确认，批量操作已停用。</p> : null}
      {data.summary.prices.length >= 500 ? <p className={styles.hint}>价格接口最多返回最近 500 条价格版本。</p> : null}
      <div className={`av-tablewrap ${styles.tableWrap}`}>
        <table className={`av-table ${styles.table}`}>
          <thead><tr><th><input type="checkbox" aria-label="选择当前全部商品" checked={allSelected} onChange={toggleAll} disabled={!rows.length || busy} /></th><th>商品信息</th><th>类型 / 技术平台</th><th>SKU</th><th>市场 / 启用价格</th><th>仓内总库存</th><th>B2C 可用库存</th><th>发布状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>{rows.length ? rows.map(row => <ProductRow key={row.model.id} row={row} market={filters.market} onSelect={selectModel} chosen={row.model.id === selectedId} checked={selectedIds.has(row.model.id)} toggle={toggle} busy={busy} />) : <tr><td colSpan={10} className={styles.empty}>没有符合筛选条件的商品</td></tr>}</tbody>
        </table>
      </div>
    </section>
    {selected ? <ProductConfiguration model={selected} data={data} onChange={load} onPriceChange={refreshPrices} /> : null}
  </div>;
}

function ProductRow({ row, market, onSelect, chosen, checked, toggle, busy }: { row: ProductRowData; market: string; onSelect: (id: string) => void; chosen: boolean; checked: boolean; toggle: (id: string) => void; busy: boolean }) {
  const { model, publication, skus, stock, platform } = row;
  const prices = market === 'ALL' ? row.prices : row.prices.filter(price => price.marketCountry === market);
  const available = stockTotal(stock);
  const onHand = stockTotal(stock, 'on_hand');
  const isNumericId=/^[1-9][0-9]{5}$/.test(String(model.product_id));
  const href = isNumericId ? `/admin/ecommerce/products?productId=${model.product_id}` : `/admin/ecommerce/products?modelId=${encodeURIComponent(model.id)}`;
  const image = publication?.image_path?.startsWith('/') && !publication.image_path.startsWith('//') ? publication.image_path : '';
  return <tr data-selected={chosen}>
    <td><input type="checkbox" aria-label={`选择 ${model.code}`} checked={checked} onChange={() => toggle(model.id)} disabled={busy} /></td>
    <td><div className={styles.product}>
      <div className={styles.image}><span>暂无图片</span>{image ? <img src={image} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : null}</div>
      <a href={href} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onSelect(model.id); } }}><strong>{publication?.title_zh || model.name || model.code}</strong><span>商品编码：{model.code}</span><span>数字商品 ID：{model.product_id || '未分配'}</span></a>
    </div></td>
    <td>{productTypeLabel[model.product_type_code] ?? model.product_type_code}<span className="av-table-subtext">{platform?.name || platform?.code || '未关联技术平台'}</span></td>
    <td>{skus.length} 个<span className="av-table-subtext">{skus.slice(0, 2).map(item => item.sku).join('、') || '尚未建立 SKU'}{skus.length > 2 ? ` 等 ${skus.length} 个` : ''}</span></td>
    <td>{prices.length ? prices.slice(0, 3).map(price => <span className="av-table-subtext" key={price.id}>{price.marketCountry} · {price.sku} · {money(price.unitPriceGross, price.currency)}</span>) : <span className="av-table-subtext">未发现启用价格</span>}{prices.length > 3 ? <span className="av-table-subtext">另有 {prices.length - 3} 条</span> : null}</td>
    <td>{!stock.length ? '无库存记录' : onHand === null ? '数据异常' : onHand.toLocaleString('zh-CN')}<span className="av-table-subtext">{stock.length && available !== null ? `仓库台账未预留：${available.toLocaleString('zh-CN')}` : '—'}</span></td>
    <td>未接入<span className="av-table-subtext">渠道预留尚未核算</span></td>
    <td><span className="av-tag" data-tone={publication?.status === 'PUBLISHED' ? 'good' : publication?.status === 'IN_REVIEW' ? 'warn' : undefined}>{publication ? publicationLabel[publication.status] ?? publication.status : publicationLabel.UNLISTED}</span></td>
    <td>{date(model.created_at)}<span className="av-table-subtext">更新 {date(model.updated_at)}</span></td>
    <td><div className={styles.rowActions}><button type="button" onClick={() => onSelect(model.id)}>配置</button><button type="button" onClick={() => { onSelect(model.id); window.requestAnimationFrame(() => document.getElementById('product-prices')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>价格管理</button>{publication?.status==='PUBLISHED'&&model.product_type_code==='BIKE'&&isNumericId?<a href={`/de/explore/${model.product_id}`} target="_blank" rel="noopener noreferrer">官网详情</a>:null}</div></td>
  </tr>;
}

function ProductConfiguration({ model, data, onChange, onPriceChange }: { model: Model; data: ProductData; onChange: () => Promise<void>; onPriceChange: () => Promise<void> }) {
  const publication = data.publications.find(item => item.model_id === model.id);
  const variants = data.catalog.variants.filter(item => item.model_id === model.id);
  const skus = data.catalog.skus.filter(item => variants.some(variant => variant.id === item.variant_id));
  const prices = data.summary.prices.filter(item => skus.some(sku => sku.id === item.skuId));
  const stock = data.inventory.filter(item => item.item_kind === 'SKU' && skus.some(sku => sku.id === item.sku_id));
  const platform = data.catalog.platforms.find(item => item.id === model.platform_id);
  return <section className="av-card av-ecommerce-config" aria-label={`${model.code} 商品配置工作区`}>
    <div className="av-cardhead"><div><p className="av-eyebrow">商品配置工作区 · {model.code}</p><h2 className="av-cardtitle">{publication?.title_zh || model.name}</h2><p className="av-cardhint">{model.code} · {productTypeLabel[model.product_type_code] ?? model.product_type_code} · {platform?.name || platform?.code || '未关联技术平台'}</p></div><div className="av-pageactions"><a className="av-btn" href="/admin/ecommerce/publications">发布与审核</a><a className="av-btn" href="#product-prices">价格管理</a><a className="av-btn" href="/admin/ecommerce/inventory">库存查询</a></div></div>
    <div className="av-ecommerce-config-grid">
      <ConfigSection number="01" title="商城展示信息" hint="商品标题、素材和审核动作直接复用现有商品发布流程。"><dl className="av-ecommerce-facts"><div><dt>中文展示名称</dt><dd>{publication?.title_zh || '尚未建立发布记录'}</dd></div><div><dt>德语 / 英文标题</dt><dd>{publication ? `${publication.title_de || '未填写'} / ${publication.title_en || '未填写'}` : '—'}</dd></div><div><dt>主图</dt><dd>{publication?.image_path || '未核对素材'}</dd></div><div><dt>发布状态</dt><dd><span className="av-tag" data-tone={publication?.status === 'PUBLISHED' ? 'good' : undefined}>{publication ? publicationLabel[publication.status] ?? publication.status : '未建立发布记录'}</span></dd></div></dl><div className="av-ecommerce-embedded-publication"><CatalogPublicationPanel models={[model]} onChange={onChange} /></div></ConfigSection>
      <ConfigSection number="02" title="产品与 SKU" hint="车型、技术参数和正式 SKU 只读自产品研发。"><div className="av-tablewrap"><table className="av-table"><thead><tr><th>SKU</th><th>名称</th><th>Variant</th><th>市场 / 颜色 / 尺寸</th></tr></thead><tbody>{skus.map(sku => <tr key={sku.id}><td><strong>{sku.sku}</strong></td><td>{sku.name}</td><td>{variants.find(variant => variant.id === sku.variant_id)?.code || '—'}</td><td>{[sku.market_code, sku.color_code, sku.size_code].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></div>{!skus.length ? <p className="av-cardhint">该商品尚未建立 SKU。</p> : null}</ConfigSection>
      <div id="product-prices"><ConfigSection number="03" title="区域与价格" hint="按商品 SKU 分别维护德国和奥地利价格。"><EcommercePricingWorkspace key={model.id} skuIds={skus.map(sku => sku.id)} embedded onChanged={onPriceChange} /></ConfigSection></div>
      <ConfigSection number="04" title="库存与销售状态" hint="库存只读自库存台账；商城不直接修改仓库实物库存。"><div className="av-tablewrap"><table className="av-table"><thead><tr><th>SKU</th><th>仓库 / 库位</th><th>现存</th><th>已预留</th><th>台账可用</th></tr></thead><tbody>{stock.map((item, index) => <tr key={`${item.sku_id}-${item.warehouse_code}-${item.location_code}-${index}`}><td>{item.sku || item.sku_name || '—'}</td><td>{item.warehouse_name || item.warehouse_code} / {item.location_code}</td><td>{item.on_hand}</td><td>{item.reserved}</td><td>{item.available}</td></tr>)}</tbody></table></div>{!stock.length ? <p className="av-cardhint">当前没有匹配的 SKU 库存记录；这不等于商城缺货。</p> : null}<p className="av-cardhint">正式商城可售量还需要 ATP、市场和履约规则，当前不在此处推断。</p></ConfigSection>
      <ConfigSection number="05" title="发布与审核记录" hint="当前展示授权 API 返回的正式发布状态。"><dl className="av-ecommerce-facts"><div><dt>审核状态</dt><dd>{publication ? publicationLabel[publication.status] ?? publication.status : '未建立发布记录'}</dd></div><div><dt>版本</dt><dd>{publication?.version ?? '—'}</dd></div><div><dt>上架时间</dt><dd>{date(publication?.published_at)}</dd></div><div><dt>撤回时间</dt><dd>{date(publication?.withdrawn_at)}</dd></div></dl><p className="av-cardhint">完整操作审计由产品发布域保留；此处不复制一套审核记录。</p></ConfigSection>
    </div>
  </section>;
}

function ConfigSection({ number, title, hint, children }: { number: string; title: string; hint: string; children: ReactNode }) {
  return <section className="av-ecommerce-config-section"><div className="av-ecommerce-config-heading"><span>{number}</span><div><h3>{title}</h3><p>{hint}</p></div></div>{children}</section>;
}

