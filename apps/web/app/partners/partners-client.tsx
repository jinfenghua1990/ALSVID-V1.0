'use client';

import { AppShell } from '@alsvid/ui';
import { navigationFor } from '../_design/admin-navigation';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'SUPPLIER' | 'FACTORY' | 'DEALER' | 'CUSTOMER' | 'SERVICE_PARTNER' | 'LOGISTICS_PROVIDER';
type Partner = { id: string; partnerCode: string; kind: 'ORGANIZATION' | 'PERSON'; displayName: string; legalName: string | null; status: string; countryCode: string | null; version: number; roles: Role[] };
type PartnerDetail = Partner & {
  identifiers: Array<{ id: string; scheme: string; value: string }>;
  contacts: Array<{ id: string; type: string; purpose: string; value: string; isPrimary: boolean }>;
  addresses: Array<{ id: string; purpose: string; recipient: string | null; line1: string; line2: string | null; city: string; region: string | null; postalCode: string | null; countryCode: string }>;
};
const allRoles: Role[] = ['SUPPLIER', 'FACTORY', 'DEALER', 'CUSTOMER', 'SERVICE_PARTNER', 'LOGISTICS_PROVIDER'];
const roleLabels: Record<Role, string> = {
  SUPPLIER: '供应商',
  FACTORY: '工厂',
  DEALER: '经销商',
  CUSTOMER: '客户',
  SERVICE_PARTNER: '服务伙伴',
  LOGISTICS_PROVIDER: '物流服务商',
};

export default function PartnersClient({ embedded = false, scope = 'all' }: { embedded?: boolean; scope?: 'all' | 'supply' } = {}) {
  const isSupply = scope === 'supply';
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selected, setSelected] = useState<PartnerDetail | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState<Role>('SUPPLIER');
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [factoryOptions, setFactoryOptions] = useState<Partner[]>([]);
  const [linkedFactories, setLinkedFactories] = useState<string[]>([]);
  const [linkMessage, setLinkMessage] = useState('');

  async function api(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');
    const response = await fetch(path, { ...init, headers });
    if (response.status === 401) {
      router.push('/login');
      throw new Error('登录状态已失效');
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.message ?? '请求失败');
    return payload.data;
  }

  async function load(search = '') {
    setLoadStatus('loading');
    try {
      const rows: unknown = await api(`/api/partners?q=${encodeURIComponent(search)}`);
      if (!Array.isArray(rows)) throw new Error('合作伙伴数据格式不正确');
      setPartners(rows as Partner[]);
      setLoadStatus('ready');
      setMessage('');
    } catch (error) {
      setLoadStatus('error');
      setMessage(error instanceof Error ? error.message : '无法加载合作伙伴');
    }
  }

  useEffect(() => { void load(); }, []);

  async function loadFactories() {
    try {
      const rows: unknown = await api('/api/partners?role=FACTORY');
      setFactoryOptions(Array.isArray(rows) ? rows as Partner[] : []);
    } catch {
      setFactoryOptions([]);
    }
  }

  useEffect(() => { if (isSupply) void loadFactories(); }, [isSupply]);
  const displayedPartners = useMemo(() => isSupply ? partners.filter((partner) => partner.roles.some((role) => role === 'SUPPLIER' || role === 'FACTORY' || role === 'LOGISTICS_PROVIDER')) : partners, [partners, isSupply]);
  const counts = useMemo(() => allRoles.map((role) => [role, partners.filter((partner) => partner.roles.includes(role)).length] as const), [partners]);

  async function openPartner(id: string) {
    setMessage('');
    setLinkMessage('');
    try {
      const detail = await api(`/api/partners/${id}`) as PartnerDetail;
      setSelected(detail);
      if (detail.roles.includes('SUPPLIER')) {
        const links: unknown = await api(`/api/partners/${id}/factories`);
        setLinkedFactories(Array.isArray(links) ? (links as Array<{ factoryId: string }>).map(link => link.factoryId) : []);
      } else {
        setLinkedFactories([]);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法加载合作伙伴详情'); }
  }

  async function saveFactoryLinks() {
    if (!selected) return;
    setLinkMessage('');
    try {
      const links: unknown = await api(`/api/partners/${selected.id}/factories`, { method: 'PUT', body: JSON.stringify({ factoryIds: linkedFactories }) });
      setLinkedFactories(Array.isArray(links) ? (links as Array<{ factoryId: string }>).map(link => link.factoryId) : []);
      setLinkMessage('工厂关联已保存。');
    } catch (error) { setLinkMessage(error instanceof Error ? error.message : '无法保存工厂关联'); }
  }

  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roles = allRoles.filter((role) => form.get(role) === 'on');
    const identifierValue = String(form.get('identifierValue') ?? '').trim();
    const primaryEmail = String(form.get('primaryEmail') ?? '').trim();
    const addressLine1 = String(form.get('addressLine1') ?? '').trim();
    const addressCity = String(form.get('addressCity') ?? '').trim();
    const addressCountry = String(form.get('addressCountry') ?? '').trim();

    try {
      const created = await api('/api/partners', {
        method: 'POST',
        body: JSON.stringify({
          kind: form.get('kind'),
          displayName: form.get('displayName'),
          legalName: form.get('legalName') || undefined,
          countryCode: form.get('countryCode') || undefined,
          roles,
          identifiers: identifierValue ? [{ scheme: form.get('identifierScheme') || 'REGISTRATION', value: identifierValue }] : [],
          contacts: primaryEmail ? [{ type: 'EMAIL', purpose: 'GENERAL', value: primaryEmail, isPrimary: true }] : [],
          addresses: addressLine1 && addressCity && addressCountry ? [{ purpose: 'REGISTERED', line1: addressLine1, city: addressCity, postalCode: form.get('addressPostalCode') || undefined, countryCode: addressCountry }] : [],
        }),
      });
      setCreateOpen(false);
      await load(query);
      if (isSupply) await loadFactories();
      setSelected(created);
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法创建合作伙伴'); }
  }

  async function savePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const roles = allRoles.filter((role) => form.get(role) === 'on');
    try {
      const updated = await api(`/api/partners/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedVersion: selected.version,
          displayName: form.get('displayName'),
          legalName: form.get('legalName') ?? '',
          countryCode: form.get('countryCode') ?? '',
          status: form.get('status'),
          roles,
        }),
      });
      setSelected(updated);
      await load(query);
      setMessage('合作伙伴资料已保存。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '无法保存合作伙伴'); }
  }

  const content = (
    <>
      <section className="partnerWorkspace">
        <header className="partnerHeader">
          <div><div className="eyebrow">{isSupply ? "供应链 / 合作方主档" : "合作伙伴 / PARTNER MASTER"}</div><h1 className="sectionTitle">{isSupply ? "供应商与工厂管理" : "一个主体，多种业务角色。"}</h1><p className="sectionLead">{isSupply ? "工厂、零配件供应商与物流服务商统一建档；生产采购单直接引用工厂档案。" : "供应商、工厂、经销商、客户与服务伙伴共享同一个稳定的业务身份，避免重复建档。"}</p></div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            {embedded && !isSupply ? <a href="/admin/dealers" style={{ fontSize: 13, fontWeight: 650 }}>返回经销商管理</a> : null}
            {isSupply ? <><button className="primaryButton" onClick={() => { setCreateRole("FACTORY"); setCreateOpen(true); }}>+ 新建工厂</button><button className="primaryButton" onClick={() => { setCreateRole("SUPPLIER"); setCreateOpen(true); }}>+ 新建供应商</button></> : <button className="primaryButton" onClick={() => setCreateOpen(true)}>新建合作伙伴</button>}
          </div>
        </header>

        {!isSupply ? <div className="metricRow">{counts.map(([role, count]) => <div className="metric" key={role}><span>{roleLabels[role]}</span><b>{loadStatus === 'ready' ? count : '—'}</b></div>)}</div> : null}
        <div className="toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(query); }} placeholder="搜索名称或合作伙伴编号" /><button onClick={() => void load(query)}>搜索</button></div>
        {message ? <div className="notice" role={loadStatus === 'error' ? 'alert' : 'status'}>{message}</div> : null}

        <div className="partnerGrid">
          <div className="tableCard">
            <div className="tableHead"><span>合作伙伴</span><span>业务角色</span><span>状态</span></div>
            {(loadStatus === 'ready' ? displayedPartners : []).map((partner) => <button className="tableRow" key={partner.id} onClick={() => void openPartner(partner.id)}><span><b>{partner.displayName}</b><small>{partner.partnerCode} · {partner.countryCode ?? '—'}</small></span><span className="roleList">{partner.roles.length ? partner.roles.map((role) => <i key={role}>{roleLabels[role]}</i>) : <small>未分配角色</small>}</span><span>{partner.status === 'ACTIVE' ? '启用' : partner.status === 'INACTIVE' ? '停用' : partner.status}</span></button>)}
            {loadStatus === 'loading' ? <div className="emptyState" role="status">正在读取合作伙伴…</div> : null}
            {loadStatus === 'error' ? <div className="emptyState">无法读取合作伙伴列表。
              <button type="button" onClick={() => { void load(query); }}>重新加载</button></div> : null}
            {loadStatus === 'ready' && !displayedPartners.length ? <div className="emptyState">{isSupply ? "暂无工厂或供应商，请先新建档案。" : "暂无合作伙伴。录入后将在这里显示。"}</div> : null}
          </div>

          <aside className="detailCard">
            {selected && loadStatus === 'ready' ? <form className="stack" onSubmit={savePartner}>
              <div><div className="eyebrow">{selected.partnerCode}</div><h2>{selected.displayName}</h2></div>
              <label>显示名称<input name="displayName" defaultValue={selected.displayName} required /></label>
              <label>法定名称<input name="legalName" defaultValue={selected.legalName ?? ''} /></label>
              <div className="split"><label>国家 / 地区<input name="countryCode" maxLength={2} defaultValue={selected.countryCode ?? ''} /></label><label>状态<select name="status" defaultValue={selected.status}><option value="ACTIVE">启用</option><option value="INACTIVE">停用</option></select></label></div>
              <fieldset><legend>业务角色</legend><div className="checkGrid">{allRoles.map((role) => <label key={role}><input type="checkbox" name={role} defaultChecked={selected.roles.includes(role)} />{roleLabels[role]}</label>)}</div></fieldset>
              {selected.roles.includes('SUPPLIER') ? <fieldset>
                <legend>关联工厂</legend>
                {factoryOptions.length ? <div className="checkGrid">{factoryOptions.map((factory) => <label key={factory.id}><input type="checkbox" checked={linkedFactories.includes(factory.id)} onChange={(event) => setLinkedFactories((current) => event.target.checked ? [...current, factory.id] : current.filter((id) => id !== factory.id))} />{factory.displayName}<small>{factory.countryCode ?? ''}</small></label>)}</div> : <small>尚无工厂档案，请先新建工厂。</small>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <button type="button" className="primaryButton" onClick={() => void saveFactoryLinks()}>保存工厂关联</button>
                  {linkMessage ? <small role="status">{linkMessage}</small> : null}
                </div>
              </fieldset> : null}
              <section className="factBlock"><span>业务标识</span>{selected.identifiers.length ? selected.identifiers.map((item) => <p key={item.id}><b>{item.scheme}</b>{item.value}</p>) : <small>暂无记录</small>}</section>
              <section className="factBlock"><span>联系方式</span>{selected.contacts.length ? selected.contacts.map((item) => <p key={item.id}><b>{item.purpose} · {item.type}</b>{item.value}</p>) : <small>暂无记录</small>}</section>
              <section className="factBlock"><span>地址</span>{selected.addresses.length ? selected.addresses.map((item) => <p key={item.id}><b>{item.purpose}</b>{[item.line1, item.city, item.postalCode, item.countryCode].filter(Boolean).join(', ')}</p>) : <small>暂无记录</small>}</section>
              <button className="primaryButton">保存修改</button>
            </form> : <div className="emptyState">选择一个合作伙伴后查看和编辑主数据。</div>}
          </aside>
        </div>
      </section>

      {createOpen ? <div className="modalBackdrop" onMouseDown={() => setCreateOpen(false)}><form className="modalCard stack" onSubmit={createPartner} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHead"><div><div className="eyebrow">新建业务主体</div><h2>{isSupply ? (createRole === "FACTORY" ? "新建工厂" : "新建供应商") : "新建合作伙伴"}</h2></div><button type="button" aria-label="关闭" onClick={() => setCreateOpen(false)}>×</button></div>
        <label>主体类型<select name="kind"><option value="ORGANIZATION">组织 / 企业</option><option value="PERSON">个人</option></select></label>
        <label>显示名称<input name="displayName" required /></label>
        <label>法定名称<input name="legalName" /></label>
        <div className="split"><label>国家 / 地区代码<input name="countryCode" maxLength={2} placeholder="DE" /></label><label>主要邮箱<input name="primaryEmail" type="email" /></label></div>
        <div className="split"><label>标识类型<input name="identifierScheme" placeholder="VAT / EORI / REGISTRATION" /></label><label>标识值<input name="identifierValue" /></label></div>
        <fieldset><legend>注册地址</legend><div className="stack"><label>详细地址<input name="addressLine1" /></label><div className="split"><label>城市<input name="addressCity" /></label><label>邮编<input name="addressPostalCode" /></label></div><label>国家 / 地区代码<input name="addressCountry" maxLength={2} placeholder="DE" /></label></div></fieldset>
        <fieldset><legend>业务角色</legend><div className="checkGrid">{allRoles.map((role) => <label key={role}><input type="checkbox" name={role} defaultChecked={isSupply ? role === createRole : embedded && role === 'DEALER'} />{roleLabels[role]}</label>)}</div></fieldset>
        <button className="primaryButton">创建合作伙伴</button>
      </form></div> : null}
    </>
  );
  // /partners preserves its original shell. The Admin counterpart nests only
  // the existing business component in AdminScreen — not a second AppShell.
  return embedded
    ? <div className="av-live-operations" data-area="partners">{content}</div>
    : <AppShell navigation={navigationFor('/partners')} footer="ALSVID · 内部管理">{content}</AppShell>;
}
