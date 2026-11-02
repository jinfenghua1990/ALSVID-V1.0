'use client';

import { OperationsFrame } from '../_components/operations-frame';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import styles from './commerce.module.css';
import { OrderOperationsPanel } from './order-operations-panel';
import { EcommerceOrdersWorkspace } from '../_design/ecommerce-orders-workspace';
import { adminRecordHref, queryRecordId } from '../_design/record-links';

type Partner = { id: string; partnerCode: string; displayName: string; roles: string[] };
type Sku = { id: string; sku: string; name: string };
type Shipment = { id: string; shipment_number: string; status: string };
type Channel = { id: string; provider: 'SHOPIFY' | 'AMAZON' | 'OTHER'; channel_key: string; display_name: string; external_account_id: string; default_dealer_partner_id: string | null; requires_dealer: boolean; enabled: boolean };
type Order = { id: string; channel_id: string; channel_key: string; channel_name: string; external_order_id: string; external_order_name: string | null; external_customer_id: string | null; dealer_partner_id: string | null; customer_partner_id: string | null; dealer_name: string | null; customer_name: string | null; order_status: string; financial_status: string | null; fulfillment_status: string | null; currency: string; subtotal_amount: string; total_amount: string; source_updated_at: string | null };
type Line = { id: string; order_id: string; external_line_id: string; external_product_id?: string | null; external_variant_id: string | null; external_sku: string | null; title: string; quantity: string; unit_price: string; currency: string; mapped_sku: string | null; mapped_sku_name: string | null; mapping_source: string };
type Fulfillment = { id: string; order_id: string; external_fulfillment_id: string; fulfillment_status: string; tracking_company: string | null; tracking_number: string | null; logistics_shipment_id: string | null; shipment_number: string | null };
type Exception = { id: string; channel_id: string; channel_key: string; exception_type: string; entity_type: string; entity_id: string; external_reference: string | null; message: string; status: string; created_at: string };
type Receipt = { id: string; channel_id: string; channel_key: string; provider_event_id: string; provider_correlation_id: string | null; topic: string; source_account: string | null; provider_api_version: string | null; received_at: string };
type Attempt = { id: string; receipt_id: string; provider_event_id: string; topic: string; outcome: string; message: string; attempt_number: number; occurred_at: string };
type CommerceSummary = { channels: Channel[]; orders: Order[]; lines: Line[]; fulfillments: Fulfillment[]; exceptions: Exception[]; mappings: unknown[]; fulfillmentLines: unknown[]; exceptionEvents: unknown[] };
type IntegrationSummary = { receipts: Receipt[]; attempts: Attempt[]; cursors: unknown[] };
type CommerceSource = 'commerce' | 'integrations' | 'partners' | 'product' | 'logistics';
type SourceStatus = 'loading' | 'ready' | 'error';
const commerceSourceLabels: Record<CommerceSource, string> = { commerce: '订单与渠道', integrations: '渠道事件', partners: '合作伙伴', product: '商品 SKU', logistics: '物流发运' };

const emptyCommerce: CommerceSummary = { channels: [], orders: [], lines: [], fulfillments: [], exceptions: [], mappings: [], fulfillmentLines: [], exceptionEvents: [] };
const emptyIntegrations: IntegrationSummary = { receipts: [], attempts: [], cursors: [] };

function normalizeCommerceSummary(value: unknown): CommerceSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.channels) || !Array.isArray(row.orders) || !Array.isArray(row.lines) ||
      !Array.isArray(row.fulfillments) || !Array.isArray(row.exceptions)) return null;
  return {
    channels: row.channels as Channel[],
    orders: row.orders as Order[],
    lines: row.lines as Line[],
    fulfillments: row.fulfillments as Fulfillment[],
    exceptions: row.exceptions as Exception[],
    mappings: Array.isArray(row.mappings) ? row.mappings : [],
    fulfillmentLines: Array.isArray(row.fulfillmentLines) ? row.fulfillmentLines : [],
    exceptionEvents: Array.isArray(row.exceptionEvents) ? row.exceptionEvents : [],
  };
}

function normalizeIntegrationSummary(value: unknown): IntegrationSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.receipts) || !Array.isArray(row.attempts)) return null;
  return {
    receipts: row.receipts as Receipt[],
    attempts: row.attempts as Attempt[],
    cursors: Array.isArray(row.cursors) ? row.cursors : [],
  };
}

function sourceErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function providerLabel(provider: Channel['provider'] | string) {
  if (provider === 'SHOPIFY') return 'Shopify';
  if (provider === 'AMAZON') return 'Amazon';
  return '其他渠道';
}

function statusLabel(status: string | null | undefined) {
  if (!status) return '未设置';
  const labels: Record<string, string> = {
    OPEN: '待处理', RESOLVED: '已解决', IGNORED: '已忽略', PROCESSED: '已处理', NOOP: '无变更', REJECTED: '已拒绝',
    UNMAPPED: '未映射', MANUAL: '人工映射', AUTO_VARIANT: '自动映射', ENABLED: '启用', DISABLED: '停用',
  };
  return labels[status] ?? status;
}

export default function CommerceClient({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [commerce, setCommerce] = useState<CommerceSummary>(emptyCommerce);
  const [integrations, setIntegrations] = useState<IntegrationSummary>(emptyIntegrations);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [linkedOrderId, setLinkedOrderId] = useState<string|null>(null);
  const [message, setMessage] = useState('');
  const [sourceStatus, setSourceStatus] = useState<Record<CommerceSource, SourceStatus>>({ commerce: 'loading', integrations: 'loading', partners: 'loading', product: 'loading', logistics: 'loading' });
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<CommerceSource, string>>>({});

  async function api(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const response = await fetch(`/api/control${path}`, { ...init, headers });
    if (response.status === 401) {
      router.push('/login');
      throw new Error('登录状态已过期，请重新登录');
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? '请求失败');
    if (!payload || typeof payload !== 'object' || !('data' in payload)) throw new Error('接口返回数据格式异常');
    return payload.data;
  }

  function sourceReady(source: CommerceSource) {
    setSourceStatus((current) => ({ ...current, [source]: 'ready' }));
    setSourceErrors((current) => {
      const next = { ...current };
      delete next[source];
      return next;
    });
  }

  function sourceFailed(source: CommerceSource, error: unknown, fallback: string) {
    setSourceStatus((current) => ({ ...current, [source]: current[source] === 'ready' ? 'ready' : 'error' }));
    setSourceErrors((current) => ({ ...current, [source]: sourceErrorMessage(error, fallback) }));
  }

  async function reload() {
    const [commerceResult, integrationsResult, partnersResult, productResult, logisticsResult] = await Promise.allSettled([
      api('/v1/commerce'), api('/v1/integrations'), api('/v1/partners'), api('/v1/product/catalog'), api('/v1/logistics'),
    ]);

    if (commerceResult.status === 'fulfilled') {
      const nextCommerce = normalizeCommerceSummary(commerceResult.value);
      if (nextCommerce) {
        setCommerce(nextCommerce);
        setSelectedOrderId((current) => current || queryRecordId('orderId') || nextCommerce.orders[0]?.id || '');
        sourceReady('commerce');
      } else sourceFailed('commerce', new Error('订单接口返回的数据格式异常'), '订单数据暂不可用');
    } else sourceFailed('commerce', commerceResult.reason, '订单数据暂不可用');

    if (integrationsResult.status === 'fulfilled') {
      const nextIntegrations = normalizeIntegrationSummary(integrationsResult.value);
      if (nextIntegrations) {
        setIntegrations(nextIntegrations);
        sourceReady('integrations');
      } else sourceFailed('integrations', new Error('渠道事件接口返回的数据格式异常'), '渠道事件暂不可用');
    } else sourceFailed('integrations', integrationsResult.reason, '渠道事件暂不可用');

    if (partnersResult.status === 'fulfilled' && Array.isArray(partnersResult.value)) {
      setPartners(partnersResult.value);
      sourceReady('partners');
    } else sourceFailed('partners', partnersResult.status === 'rejected' ? partnersResult.reason : new Error('合作伙伴接口返回的数据格式异常'), '合作伙伴暂不可用');

    if (productResult.status === 'fulfilled' && productResult.value && Array.isArray(productResult.value.skus)) {
      setSkus(productResult.value.skus);
      sourceReady('product');
    } else sourceFailed('product', productResult.status === 'rejected' ? productResult.reason : new Error('商品接口返回的数据格式异常'), '商品 SKU 暂不可用');

    if (logisticsResult.status === 'fulfilled' && logisticsResult.value && Array.isArray(logisticsResult.value.shipments)) {
      setShipments(logisticsResult.value.shipments);
      sourceReady('logistics');
    } else sourceFailed('logistics', logisticsResult.status === 'rejected' ? logisticsResult.reason : new Error('物流接口返回的数据格式异常'), '物流发运暂不可用');
  }

  useEffect(() => { setLinkedOrderId(queryRecordId('orderId')); void reload(); }, []);

  const dealerPartners = partners.filter((item) => item.roles.includes('DEALER'));
  const customerPartners = partners.filter((item) => item.roles.includes('CUSTOMER'));
  const selectedOrder = commerce.orders.find((item) => item.id === selectedOrderId) ?? (linkedOrderId ? null : commerce.orders[0] ?? null);
  const orderLines = selectedOrder ? commerce.lines.filter((item) => item.order_id === selectedOrder.id) : [];
  const orderFulfillments = selectedOrder ? commerce.fulfillments.filter((item) => item.order_id === selectedOrder.id) : [];
  const openExceptions = commerce.exceptions.filter((item) => item.status === 'OPEN');
  const amazonChannels = commerce.channels.filter((item) => item.provider === 'AMAZON');
  const metrics = useMemo(() => ({
    channels: commerce.channels.length,
    orders: commerce.orders.length,
    open: openExceptions.length,
    unmapped: commerce.lines.filter((item) => !item.mapped_sku).length,
  }), [commerce, openExceptions]);

  async function action(path: string, body: unknown = {}) {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage('操作已完成。');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const provider = String(form.get('provider')) as Channel['provider'];
    const dealer = String(form.get('defaultDealerPartnerId') ?? '');
    const marketplace = String(form.get('marketplace') ?? '').trim();
    try {
      await api('/v1/commerce/channels', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          channelKey: form.get('channelKey'),
          displayName: form.get('displayName'),
          externalAccountId: form.get('externalAccountId'),
          requiresDealer: form.get('requiresDealer') === 'on',
          ...(dealer ? { defaultDealerPartnerId: dealer } : {}),
          metadata: provider === 'AMAZON'
            ? { adapter: 'SP_API', integrationStatus: 'UNCONFIGURED', ...(marketplace ? { marketplace } : {}) }
            : {},
        }),
      });
      target.reset();
      setMessage(provider === 'AMAZON' ? 'Amazon 渠道已登记；SP-API 仍处于待配置状态。' : '外部渠道已登记。');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法登记渠道');
    }
  }

  async function mapVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    try {
      await api('/v1/commerce/mappings/variant', {
        method: 'POST',
        body: JSON.stringify({
          channelId: form.get('channelId'),
          externalProductId: form.get('externalProductId') || undefined,
          externalVariantId: form.get('externalVariantId'),
          externalSku: form.get('externalSku') || undefined,
          skuId: form.get('skuId'),
        }),
      });
      target.reset();
      setMessage('外部商品映射已保存。');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法保存商品映射');
    }
  }

  async function mapPartners(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrder) return;
    const form = new FormData(event.currentTarget);
    const dealer = String(form.get('dealerPartnerId') ?? '');
    const customer = String(form.get('customerPartnerId') ?? '');
    await action(`/v1/commerce/orders/${selectedOrder.id}/partners`, { dealerPartnerId: dealer || null, customerPartnerId: customer || null });
  }

  function latestAttempt(receiptId: string) {
    return integrations.attempts.filter((item) => item.receipt_id === receiptId).sort((a, b) => b.attempt_number - a.attempt_number)[0] ?? null;
  }

  function channelFor(id: string) {
    return commerce.channels.find((item) => item.id === id);
  }

  return (
    <OperationsFrame embedded={embedded} area="commerce" footer="Commerce / 外部渠道 / 对账">
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>电商渠道 / Commerce</div>
          <h1>ALSVID 订单中心 · 自建商城与业务履约</h1>
          <p>首期以 ALSVID 自建商城订单为主。此处可管理真实价格版本和内部订单草稿；支付、正式结账与履约仍受上线门禁约束。外部渠道仅在单独获批启用时管理必要映射和对账。</p>
        </div>
        <div className={styles.releaseBadge}>正式结账尚未开放</div>
      </header>

      {message ? <div className={styles.notice}>{message}</div> : null}
      {Object.keys(sourceErrors).length ? <div className={styles.notice} role="alert"><strong>部分电商数据源不可用：</strong> {Object.entries(sourceErrors).map(([key, error]) => commerceSourceLabels[key as CommerceSource] + '：' + error).join('；')}。失败来源不会按空数据计算；若保留已有记录，请以最近一次成功读取为准。 <button type="button" className={styles.ghostButton} onClick={() => { void reload(); }}>重试读取</button></div> : null}

      <nav className={styles.orderQuickNav} aria-label="订单功能快速入口">
        <a href="#b2c">自建商城订单与价格</a>
        <a href="#external-orders">外部渠道订单</a>
        <a href="#exceptions">异常与对账</a>
        <a href="/admin/product">进入产品中心</a>
      </nav>
      <EcommerceOrdersWorkspace />

      <OrderOperationsPanel />

      <section id="external-channels" className={styles.providerGrid}>
        <article className={styles.providerCard}>
          <div className={styles.providerHead}><span>AMAZON</span><strong className={styles.pending}>{amazonChannels.length ? '渠道已登记 · SP-API 待配置' : '未配置 · SP-API 待接入'}</strong></div>
          <h2>Amazon Marketplace</h2>
          <p>本阶段只建立正式渠道身份、映射和管理入口。不会伪造 Seller Central/SP-API 已连接，也不会在页面保存 token 或密钥。</p>
          <div className={styles.providerMeta}>{amazonChannels.length} 个渠道 · Orders / FBA-FBM / Settlement 后续适配</div>
        </article>
      </section>

      <div className={styles.metrics}>
        <div><span>渠道</span><b>{sourceStatus.commerce !== 'ready' || sourceErrors.commerce ? '—' : metrics.channels}</b></div>
        <div><span>规范化订单</span><b>{sourceStatus.commerce !== 'ready' || sourceErrors.commerce ? '—' : metrics.orders}</b></div>
        <div><span>待处理异常</span><b>{sourceStatus.commerce !== 'ready' || sourceErrors.commerce ? '—' : metrics.open}</b></div>
        <div><span>未映射明细</span><b>{sourceStatus.commerce !== 'ready' || sourceErrors.commerce ? '—' : metrics.unmapped}</b></div>
      </div>

      <section className={styles.topGrid}>
        <form className={styles.card} onSubmit={createChannel}>
          <span>渠道登记</span><h2>登记外部电商渠道</h2>
          <select name="provider" required defaultValue="AMAZON">
            <option value="AMAZON">Amazon Marketplace</option><option value="OTHER">其他渠道</option>
          </select>
          <div className={styles.inline}><input name="channelKey" placeholder="amazon-de / other-eu" required/><input name="displayName" placeholder="ALSVID Amazon Germany" required/></div>
          <input name="externalAccountId" placeholder="Seller ID / 外部渠道账号" required/>
          <input name="marketplace" placeholder="Amazon Marketplace（可选，如 DE）"/>
          <select name="defaultDealerPartnerId" defaultValue=""><option value="">不设置默认经销商</option>{dealerPartners.map((item) => <option key={item.id} value={item.id}>{item.partnerCode} · {item.displayName}</option>)}</select>
          <label className={styles.check}><input type="checkbox" name="requiresDealer"/> 此渠道要求经销商映射</label>
          <button>登记渠道</button>
        </form>
        <div className={styles.rule}>
          <span>职责边界</span><h2>ALSVID 不变成第二套 OMS</h2>
          <p>外部平台负责其自身的店铺、下单、支付与履约。ALSVID 负责产品主数据、外部订单事实映射、异常与跨系统关联。外部商品标识和订单号不能自动生成 ALSVID SKU。历史 Shopify 渠道仅保留只读数据，不再开放写入或重放。</p>
        </div>
      </section>

      <section className={styles.channelList}>
        <div className={styles.sectionHead}><span>已登记渠道</span><h2>Provider 与账号引用</h2></div>
        {commerce.channels.map((channel) => <article key={channel.id}>
          <div><b>{channel.display_name}</b><small>{providerLabel(channel.provider)} · {channel.channel_key}</small></div>
          <div><span>{channel.external_account_id}</span><small>{channel.enabled ? '启用' : '停用'}{channel.provider === 'AMAZON' ? ' · SP-API 待配置' : ''}</small></div>
        </article>)}
        {!commerce.channels.length ? <p className={styles.empty}>{sourceStatus.commerce === 'loading' ? '正在读取渠道数据…' : sourceStatus.commerce === 'error' || sourceErrors.commerce ? '渠道数据不可用，无法确认当前是否已有渠道。' : '尚未登记任何电商渠道。'}</p> : null}
      </section>

      <section className={styles.topGrid}>
        <form className={styles.card} onSubmit={mapVariant}>
          <span>SKU 映射</span><h2>外部商品 → ALSVID SKU</h2>
          <select name="channelId" required defaultValue=""><option value="" disabled>选择渠道</option>{commerce.channels.filter((item) => item.provider !== 'SHOPIFY').map((item) => <option key={item.id} value={item.id}>{providerLabel(item.provider)} · {item.channel_key}</option>)}</select>
          <input name="externalProductId" placeholder="商品 ID：Amazon ASIN / 外部 Product ID"/>
          <div className={styles.inline}><input name="externalVariantId" placeholder="映射键：Amazon Seller SKU / 外部 Variant ID" required/><input name="externalSku" placeholder="外部 SKU（可选）"/></div>
          <select name="skuId" required defaultValue=""><option value="" disabled>选择 ALSVID SKU</option>{skus.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
          <button>保存映射</button>
        </form>

      </section>

      <section id="external-orders" className={styles.orderGrid}>
        <div className={styles.orderList}>
          {commerce.orders.map((item) => {
            const channel = channelFor(item.channel_id);
            return <a key={item.id} href={adminRecordHref('order',item.id)} className={selectedOrder?.id === item.id ? styles.selected : ''}>
              <span>{providerLabel(channel?.provider ?? 'OTHER')} · {item.channel_key} · {statusLabel(item.order_status)}</span>
              <b>{item.external_order_name ?? item.external_order_id}</b>
              <small>{item.total_amount} {item.currency} · {statusLabel(item.fulfillment_status)}</small>
            </a>;
          })}
          {!commerce.orders.length ? <p className={styles.empty}>{sourceStatus.commerce === 'loading' ? '正在读取订单…' : sourceStatus.commerce === 'error' || sourceErrors.commerce ? '订单数据不可用，无法确认当前是否有订单。' : '还没有同步进来的规范化订单。'}</p> : null}
        </div>
        {selectedOrder ? <div className={styles.detail}>
          <div className={styles.sectionHead}><span>外部订单事实</span><h2>{selectedOrder.external_order_name ?? selectedOrder.external_order_id}</h2>
             <p><a href={adminRecordHref('order',selectedOrder.id)}>打开此订单专属链接 →</a>
               {selectedOrder.customer_partner_id ? <> · <a href={adminRecordHref('customer',selectedOrder.customer_partner_id)}>查看映射客户档案 →</a></> : null}
             </p><p>{selectedOrder.channel_name} · 来源更新时间 {selectedOrder.source_updated_at ? new Date(selectedOrder.source_updated_at).toLocaleString() : '—'}</p></div>
          <div className={styles.factGrid}>
            <div><span>订单</span><b>{statusLabel(selectedOrder.order_status)}</b></div><div><span>财务状态</span><b>{statusLabel(selectedOrder.financial_status)}</b></div><div><span>履约状态</span><b>{statusLabel(selectedOrder.fulfillment_status)}</b></div><div><span>经销商</span><b>{selectedOrder.dealer_name ?? '未映射'}</b></div><div><span>客户</span><b>{selectedOrder.customer_name ?? '未映射'}</b></div><div><span>金额</span><b>{selectedOrder.total_amount} {selectedOrder.currency}</b></div>
          </div>
          <form className={styles.partnerMap} onSubmit={mapPartners}>
            <select name="dealerPartnerId" defaultValue={selectedOrder.dealer_partner_id ?? ''}><option value="">不映射经销商</option>{dealerPartners.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
            <select name="customerPartnerId" defaultValue={selectedOrder.customer_partner_id ?? ''}><option value="">不映射客户</option>{customerPartners.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
            <button>保存 Partner 映射</button>
          </form>
          <div className={styles.lines}><span>订单明细</span>{orderLines.map((line) => <article key={line.id}><div><b>{line.title || line.external_line_id}</b><small>商品 {line.external_product_id ?? '—'} · 映射键 {line.external_variant_id ?? '—'} · {line.external_sku ?? '无外部 SKU'}</small></div><div><b>{line.quantity} × {line.unit_price} {line.currency}</b><small>{line.mapped_sku ? `${line.mapped_sku} · ${statusLabel(line.mapping_source)}` : '未映射'}</small></div></article>)}</div>
          <div className={styles.lines}><span>履约事实</span>{orderFulfillments.map((fulfillment) => <article key={fulfillment.id}><div><b>{fulfillment.external_fulfillment_id} · {statusLabel(fulfillment.fulfillment_status)}</b><small>{fulfillment.tracking_company ?? ''} {fulfillment.tracking_number ?? ''}</small></div><form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void action(`/v1/commerce/fulfillments/${fulfillment.id}/shipment`, { shipmentId: data.get('shipmentId') || null }); }}><select name="shipmentId" defaultValue={fulfillment.logistics_shipment_id ?? ''}><option value="">不关联 ALSVID Shipment</option>{shipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.shipment_number} · {shipment.status}</option>)}</select><button>映射</button></form></article>)}</div>
        </div> : <div className={styles.detail}><p className={styles.empty}>{linkedOrderId ? '链接指定的订单不在当前已授权的订单数据中，请核对订单 ID 或刷新。' : '选择一个订单查看详情。'}</p></div>}
      </section>

      <section id="exceptions" className={styles.bottomGrid}>
        <div className={styles.panel}>
          <div className={styles.sectionHead}><span>对账异常</span><h2>异常保留，不静默丢弃</h2></div>
          {openExceptions.map((item) => <article className={styles.exception} key={item.id}><div><b>{item.exception_type}</b><span>{item.channel_key} · {item.entity_type}</span><p>{item.message}</p></div><div className={styles.actions}><button onClick={() => void action(`/v1/commerce/exceptions/${item.id}/resolve`, { action: 'RESOLVED', resolution: { note: 'Reviewed in Commerce workspace' } })}>标记已解决</button><button className={styles.secondary} onClick={() => void action(`/v1/commerce/exceptions/${item.id}/resolve`, { action: 'IGNORED', resolution: { note: 'Explicitly ignored' } })}>忽略</button></div></article>)}
          {!openExceptions.length ? <p className={styles.empty}>{sourceStatus.commerce === 'loading' ? '正在读取异常记录…' : sourceStatus.commerce === 'error' || sourceErrors.commerce ? '订单异常来源不可用，无法确认是否存在待处理异常。' : '当前没有待处理映射异常。'}</p> : null}
        </div>
        <div className={styles.panel}>
          <div className={styles.sectionHead}><span>集成证据</span><h2>Delivery receipts & attempts</h2><p>历史事件仅供查询、审计，不再允许重放已退役 Shopify Webhook；Amazon SP-API 尚未接入。</p></div>
          {integrations.receipts.slice(0, 30).map((receipt) => { const attempt = latestAttempt(receipt.id); const channel = channelFor(receipt.channel_id); return <article className={styles.receipt} key={receipt.id}><div><b>{providerLabel(channel?.provider ?? 'OTHER')} · {receipt.topic}</b><span>{receipt.channel_key} · {receipt.provider_event_id}</span><small>{attempt ? `${statusLabel(attempt.outcome)} · 第 ${attempt.attempt_number} 次` : '尚无处理尝试'}</small></div></article>; })}
          {!integrations.receipts.length ? <p className={styles.empty}>{sourceStatus.integrations === 'loading' ? '正在读取渠道事件…' : sourceStatus.integrations === 'error' || sourceErrors.integrations ? '渠道事件来源不可用，无法确认是否已有集成证据。' : '还没有保留的集成证据。'}</p> : null}
        </div>
      </section>
    </OperationsFrame>
  );
}
