'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './admin-records.module.css';
import { adminRecordHref, queryRecordId } from './record-links';

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'failed';
type RemoteList<T> = { state: LoadState; items: T[]; message: string };
type Partner = {
  id: string; partnerCode: string; displayName: string; kind: string;
  status: string; countryCode: string | null; roles: string[]; updatedAt: string;
};
type PartnerDetail = Partner & {
  contacts: Array<{ id: string; type: string; purpose: string; value: string }>;
};
type Vehicle = { id: string; frame_number: string; sku: string; production_order_number: string; born_at: string };
type AuditEvent = {
  id: string; actorUserId: string | null; action: string; targetType: string;
  targetId: string | null; occurredAt: string;
};
type StaffUser = { userId: string; email: string; displayName: string; status: string; roles: string[] };

function empty<T>(): RemoteList<T> {
  return { state: 'loading', items: [], message: '' };
}

function readError(status: number): string {
  if (status === 401) return '登录已过期，请重新登录后刷新';
  if (status === 403) return '账号没有读取此类业务数据的权限';
  return '读取失败，请刷新重试；不能将读取失败当作零条记录';
}

async function readData<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/control' + path, {
    method: 'GET',
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw Object.assign(new Error(readError(response.status)), { status: response.status });
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('data' in payload)) throw new Error('接口返回格式异常');
  return payload.data as T;
}

async function listData<T>(path: string, signal?: AbortSignal): Promise<RemoteList<T>> {
  try {
    const result = await readData<unknown>(path, signal);
    if (!Array.isArray(result)) throw new Error('接口返回的不是记录列表');
    return { state: 'ready', items: result as T[], message: '' };
  } catch (error) {
    if (signal?.aborted) return empty<T>();
    const code = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    return {
      state: code === 401 || code === 403 ? 'unauthorized' : 'failed',
      items: [],
      message: error instanceof Error ? error.message : '读取失败',
    };
  }
}

function StatusMessage({ state, message }: { state: LoadState; message: string }) {
  if (state === 'loading') return <p className={styles.notice} role="status">正在读取真实业务记录…</p>;
  return <p className={styles.error} role="alert">{message}</p>;
}

function time(value: string | undefined): string {
  if (!value) return '—';
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? '—' : new Date(ms).toLocaleString('zh-CN', { hour12: false });
}

export function CustomerRecords() {
  const [partners, setPartners] = useState<RemoteList<Partner>>(empty);
  const [vehicles, setVehicles] = useState<RemoteList<Vehicle>>(empty);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>('ready');
  const [detailMessage, setDetailMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setPartners(empty<Partner>());
    setVehicles(empty<Vehicle>());
    const [p, v] = await Promise.all([
      listData<Partner>('/v1/partners', signal),
      listData<Vehicle>('/v1/vehicles', signal),
    ]);
    if (signal?.aborted) return;
    setPartners(p);
    setVehicles(v);
    setUpdatedAt(new Date().toLocaleString('zh-CN', { hour12: false }));
  }, []);

  useEffect(() => {
    setSelectedId(queryRecordId('partnerId') ?? '');
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailState('loading');
    void (async () => {
      try {
        const data = await readData<PartnerDetail>('/v1/partners/' + encodeURIComponent(selectedId), controller.signal);
        if (controller.signal.aborted) return;
        if (!data || !Array.isArray(data.roles)) throw new Error('客户资料格式异常');
        setDetail(data);
        setDetailState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        const code = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
        setDetailState(code === 401 || code === 403 ? 'unauthorized' : 'failed');
        setDetailMessage(error instanceof Error ? error.message : '无法加载资料');
      }
    })();
    return () => controller.abort();
  }, [selectedId]);

  const customers = useMemo(() =>
    partners.items.filter((item) => item.roles.includes('CUSTOMER')).filter((item) =>
      (item.partnerCode + ' ' + item.displayName + ' ' + (item.countryCode ?? '')).toLowerCase().includes(filter.trim().toLowerCase())),
    [partners.items, filter]);
  const selected = selectedId && detail?.id === selectedId && detail.roles.includes('CUSTOMER') ? detail : null;

  return (
    <div className={styles.stack}>
      <section className="av-card">
        <div className={styles.heading}>
          <div>
            <h2 className="av-cardtitle">客户业务档案（真实数据）</h2>
            <p className={styles.muted}>仅列出 Partner 领域标记为 CUSTOMER 的档案；这不是已核验的交易账户或车主身份，也不能证明车辆所有权。</p>
          </div>
          <button className="av-btn" type="button" onClick={() => { setSelectedId(''); void load(); }}>刷新记录</button>
        </div>
        <p className={styles.muted}>本页读取时间：{updatedAt || '尚未完成读取'}；接口记录不是外部实时同步状态。</p>
        {partners.state === 'ready' ? (
          <>
            <div className={styles.heading}>
              <strong>客户档案：{customers.length} 条{filter ? '（筛选后）' : ''}</strong>
              <input className={styles.search} type="search" aria-label="筛选客户" placeholder="搜索客户名称、编号或国家" value={filter} onChange={(event) => setFilter(event.target.value)} />
            </div>
            {customers.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>客户编号</th><th>名称</th><th>类型</th><th>国家</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>{customers.map((partner) => (
                    <tr key={partner.id}>
                      <td><a href={adminRecordHref('customer',partner.id)}>{partner.partnerCode}</a></td><td>{partner.displayName}</td><td>{partner.kind === 'PERSON' ? '个人' : '机构'}</td>
                      <td>{partner.countryCode ?? '—'}</td><td>{partner.status}</td>
                      <td><a className={styles.linkButton} href={adminRecordHref('customer',partner.id)}>查看真实档案</a></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className={styles.notice}>{filter ? '没有符合筛选条件的客户' : '暂无标记为 CUSTOMER 的真实客户档案'}</p>}
          </>
        ) : <StatusMessage state={partners.state} message={partners.message} />}
        {selectedId ? (
          <div className={styles.detail}>
            <div className={styles.heading}>
              <h3>客户详情</h3>
              <button type="button" className="av-btn" onClick={() => setSelectedId('')}>关闭</button>
            </div>
            {detailState === 'loading' ? <p>正在加载详情…</p>
              : detailState !== 'ready' ? <p className={styles.error} role="alert">{detailMessage}</p>
                : selected ? (
                  <>
                    <p><strong>{selected.displayName}</strong> · {selected.partnerCode} · {selected.status}</p>
                    <p className={styles.muted}>联系方式（权限内可见）：{selected.contacts?.map((c) => c.purpose + ' ' + c.value).join('；') || '未记录'}</p>
                    <p className={styles.muted}>档案最后更新：{time(selected.updatedAt)}</p>
                    <p className={styles.notice}>车辆归属需要独立的交付、激活或审核证明，不能根据客户邮箱或 VIN 自动建立。</p>
                    <p><a href={adminRecordHref('customer',selected.id)}>此客户档案专属链接 →</a></p>
                  </>
                ) : <p className={styles.error}>此档案不是有效客户关系，无法显示客户详情。</p>}
          </div>
        ) : null}
      </section>
      <section className="av-card">
        <h2 className="av-cardtitle">车辆出生台账（尚未关联客户所有权）</h2>
        <p className={styles.muted}>仅从 Vehicle 领域读取已出生车辆。生产事实与客户归属是两类不同数据，不做推断性匹配。需要人工核验车主授权请前往“设置 → 跨门户授权与交付核验”。</p>
        {vehicles.state === 'ready' ? vehicles.items.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>车架号</th><th>SKU</th><th>生产单号</th><th>出生时间</th></tr></thead>
              <tbody>{vehicles.items.slice(0, 100).map((vehicle) => <tr key={vehicle.id}>
                <td><a href={adminRecordHref('vehicle',vehicle.id)}>{vehicle.frame_number}</a></td><td>{vehicle.sku}</td><td>{vehicle.production_order_number}<p><a href={adminRecordHref('service-intake',vehicle.id)}>售后 →</a></p></td><td>{time(vehicle.born_at)}</td>
              </tr>)}</tbody>
            </table>
            {vehicles.items.length > 100 ? <p className={styles.muted}>仅展示前 100 条，实际查询 API 最多返回 1000 条。</p> : null}
          </div>
        ) : <p className={styles.notice}>暂无已出生车辆记录</p>
          : <StatusMessage state={vehicles.state} message={vehicles.message} />}
      </section>
    </div>
  );
}

export function AccessAuditRecords() {
  const [users, setUsers] = useState<RemoteList<StaffUser>>(empty);
  const [audit, setAudit] = useState<RemoteList<AuditEvent>>(empty);
  const [checkedAt, setCheckedAt] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setUsers(empty<StaffUser>());
    setAudit(empty<AuditEvent>());
    const [u, a] = await Promise.all([
      listData<StaffUser>('/v1/auth/users', signal),
      listData<AuditEvent>('/v1/audit?limit=100', signal),
    ]);
    if (signal?.aborted) return;
    setUsers(u);
    setAudit(a);
    setCheckedAt(new Date().toLocaleString('zh-CN', { hour12: false }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <div className={styles.stack}>
      <section className="av-card">
        <div className={styles.heading}>
          <div>
            <h2 className="av-cardtitle">内部账户与角色（只读）</h2>
            <p className={styles.muted}>基于 Auth API 的真实账户状态。用户权限由服务器授权；本视图不自动授予或修改角色。</p>
          </div>
          <button type="button" className="av-btn" onClick={() => { void load(); }}>刷新</button>
        </div>
        <p className={styles.muted}>本页读取时间：{checkedAt || '尚未完成读取'}</p>
        {users.state === 'ready' ? users.items.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>邮箱</th><th>姓名</th><th>账号状态</th><th>已授予角色</th></tr></thead>
              <tbody>{users.items.map((user) => <tr key={user.userId}>
                <td>{user.email}</td><td>{user.displayName}</td><td>{user.status}</td><td>{user.roles.join(' / ') || '无'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p className={styles.notice}>接口返回 0 条账户记录</p>
          : <StatusMessage state={users.state} message={users.message} />}
      </section>
      <section className="av-card">
        <h2 className="av-cardtitle">最近 100 条操作审计（真实数据）</h2>
        <p className={styles.muted}>仅显示已有审计事件，不读取隐私元数据；不代表所有外部服务、生产事件都已接入审计。</p>
        {audit.state === 'ready' ? audit.items.length ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>时间</th><th>事件</th><th>操作人 ID</th><th>业务对象</th></tr></thead>
              <tbody>{audit.items.map((entry) => <tr key={entry.id}>
                <td>{time(entry.occurredAt)}</td><td>{entry.action}</td><td>{entry.actorUserId ?? '系统 / 未记录'}</td>
                <td>{entry.targetType}{entry.targetId ? ' · ' + entry.targetId : ''}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p className={styles.notice}>审计接口返回 0 条事件（没有示例日志）</p>
          : <StatusMessage state={audit.state} message={audit.message} />}
      </section>
    </div>
  );
}
