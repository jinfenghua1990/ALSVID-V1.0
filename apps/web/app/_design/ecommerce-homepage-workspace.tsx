'use client';

import { useCallback, useEffect, useState } from 'react';

type Model = { id: string; product_id: string; code: string; name: string; status: string; product_type_code: string };
type Slot = { slot_code: 'FC1_HERO' | 'FC1_FEATURED' | 'FC2_LAUNCH'; target_model_code: string; mode: 'AUTO' | 'MANUAL'; manual_model_id: string | null; resolved_model_id: string | null; resolved_model_code: string | null; version: number };
const labels: Record<Slot['slot_code'], string> = { FC1_HERO: '首页首屏 · A1 Ultra', FC1_FEATURED: '首页重点产品 · A1 Ultra', FC2_LAUNCH: '首页新品区 · L1 Pro' };

async function homepageApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/control/v1/product/${path}`, { cache: 'no-store', method: body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => null) as { data?: T; message?: string } | null;
  if (!response.ok) throw new Error(response.status === 401 ? '登录已失效，请重新登录' : response.status === 403 ? '当前账号没有首页商品编排权限' : payload?.message ?? '首页商品编排失败');
  if (!payload || !('data' in payload)) throw new Error('首页商品编排接口返回格式异常');
  return payload.data as T;
}

export function EcommerceHomepageWorkspace({ models, loadError }: { models: readonly Model[]; loadError: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      setSlots(await homepageApi<Slot[]>('homepage-bindings'));
      setState('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '首页绑定资料读取失败');
      setState('error');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(slot: Slot, mode: Slot['mode'], modelId: string | null) {
    if (saving) return;
    setSaving(slot.slot_code);
    setError('');
    setNotice('');
    try {
      const saved = await homepageApi<Slot>('homepage-bindings', { slot: slot.slot_code, mode, modelId: mode === 'MANUAL' ? modelId : null, expectedVersion: slot.version });
      setSlots(current => current.map(item => item.slot_code === saved.slot_code ? saved : item));
      setNotice('首页商品编排已保存。界面按数字商品 ID 操作，后台安全地使用已有 Model UUID 维护绑定；不代表商品已审核或已上架。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '首页商品编排保存失败');
    } finally {
      setSaving('');
    }
  }

  if (state === 'loading') return <section className="av-card av-commerce-load-state" role="status"><strong>正在读取首页商品编排…</strong><p>正在读取真实展示位和产品中心型号。</p></section>;
  if (state === 'error') return <section className="av-card av-commerce-load-state" role="alert"><strong>首页商品编排暂不可用</strong><p>{error}。读取失败不代表首页没有配置。</p><button className="av-btn" type="button" onClick={() => void load()}>重新读取</button></section>;

  return <div className="av-commerce-workspace" aria-label="首页商品编排工作区">
    <section className="av-card av-commerce-dashboard-head"><div><p className="av-eyebrow">商城运营 / 首页商品编排</p><h1 className="av-cardtitle">首页商品编排</h1><p>通过产品研发自动分配的六位数字商品 ID 选择真实车型，不创建第二套商品记录。</p></div><div className="av-pageactions"><button className="av-btn" type="button" onClick={() => void load()}>刷新</button><a className="av-btn" href="/admin/ecommerce/products">商城商品列表</a></div></section>
    {loadError ? <p className="av-card av-inline-alert" role="alert">产品主数据无法读取：{loadError}</p> : null}
    {error ? <p className="av-card av-inline-alert" role="alert">{error}</p> : null}
    {notice ? <p className="av-card av-inline-notice" role="status">{notice}</p> : null}
    <section className="av-card" aria-label="首页展示位表格"><div className="av-cardhead"><div><h2 className="av-cardtitle">首页展示位</h2><p className="av-cardhint">此处沿用固定车型展示位：自动模式按目标车型匹配；手动模式从同一车型中按六位数字商品 ID 选择。</p></div></div><div className="av-tablewrap"><table className="av-table av-ecommerce-homepage-table"><thead><tr><th>展示位</th><th>目标车型编码</th><th>当前数字商品 ID</th><th>绑定方式</th><th>状态</th><th>操作</th></tr></thead><tbody>{slots.map(slot => <SlotRow key={slot.slot_code} slot={slot} models={models} disabled={Boolean(saving || loadError)} busy={saving === slot.slot_code} save={save} />)}</tbody></table></div>{!slots.length ? <p className="av-empty-state">接口暂未返回首页展示位。未创建虚构绑定，请先检查产品配置。</p> : null}</section>
    <p className="av-cardhint">正式商品发布、售价、库存和支付状态仍由商城商品、价格、库存和订单模块分别维护。</p>
  </div>;
}

function SlotRow({ slot, models, disabled, busy, save }: { slot: Slot; models: readonly Model[]; disabled: boolean; busy: boolean; save: (slot: Slot, mode: Slot['mode'], modelId: string | null) => Promise<void> }) {
  const candidates = models.filter(model => model.code === slot.target_model_code && model.status === 'ACTIVE' && model.product_type_code === 'BIKE');
  const [mode, setMode] = useState(slot.mode);
  const [modelId, setModelId] = useState(slot.manual_model_id ?? '');
  useEffect(() => { setMode(slot.mode); setModelId(slot.manual_model_id ?? ''); }, [slot.mode, slot.manual_model_id, slot.version]);
  const resolved=models.find(model=>model.id===slot.resolved_model_id);
  return <tr><td><strong>{labels[slot.slot_code]}</strong></td><td>{slot.target_model_code}</td><td>{resolved?.product_id ?? '尚未关联'}</td><td><select value={mode} disabled={disabled} onChange={event => setMode(event.target.value as Slot['mode'])}><option value="AUTO">自动</option><option value="MANUAL">手动</option></select>{mode === 'MANUAL' ? <select value={modelId} disabled={disabled || !candidates.length} onChange={event => setModelId(event.target.value)}><option value="">选择六位商品 ID</option>{candidates.map(model => <option key={model.id} value={model.id}>{model.product_id} · {model.name} ({model.code})</option>)}</select> : null}</td><td>{slot.resolved_model_id ? <span className="av-tag" data-tone="good">已关联</span> : <span className="av-tag" data-tone="warn">未关联</span>}</td><td><button className="av-btn" type="button" disabled={disabled || busy || (mode === 'MANUAL' && !modelId)} onClick={() => void save(slot, mode, modelId || null)}>{busy ? '保存中…' : '保存'}</button></td></tr>;
}

