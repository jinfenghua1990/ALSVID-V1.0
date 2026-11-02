'use client';

import { useCallback, useEffect, useState } from 'react';
import contract from './live-operations.json';

type MetricStatus = 'loading' | 'ready' | 'unauthorized' | 'unavailable';
type MetricResult = {
  status: MetricStatus;
  count?: number;
};
type MetricMap = Record<string, MetricResult>;

const sources = contract.liveMetrics;

async function loadMetric(
  source: (typeof sources)[number],
  signal?: AbortSignal,
): Promise<MetricResult> {
  try {
    // Fetch only through the existing same-origin session-bound API proxy.
    const response = await fetch('/api/control' + source.path, {
      method: 'GET',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    if (response.status === 401 || response.status === 403) return { status: 'unauthorized' };
    if (!response.ok) return { status: 'unavailable' };

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return { status: 'unavailable' };
    }
    const data = payload.data;
    if (!data || typeof data !== 'object' || !(source.field in data)) {
      return { status: 'unavailable' };
    }
    const collection = (data as Record<string, unknown>)[source.field];
    if (!Array.isArray(collection)) return { status: 'unavailable' };

    // Counts are records in ALSVID's API snapshot, not sales, stock units or live provider totals.
    return { status: 'ready', count: collection.length };
  } catch {
    return { status: 'unavailable' };
  }
}

export function LiveWorkbench() {
  const [results, setResults] = useState<MetricMap>({});
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState('');

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const outcomes = await Promise.all(sources.map(async (source) => ({
      key: source.key,
      result: await loadMetric(source, signal),
    })));
    if (signal?.aborted) return;
    setResults(Object.fromEntries(outcomes.map((outcome) => [outcome.key, outcome.result])));
    setCheckedAt(new Date().toLocaleString('zh-CN', { hour12: false }));
    setLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return (
    <section className="av-card" aria-label="真实业务数据概览">
      <div className="av-cardhead">
        <div>
          <h2 className="av-cardtitle">业务数据 · 已接入系统</h2>
          <p className="av-cardhint">
            读取现有 ALSVID 领域 API；不使用设计示例数据，不代表任何外部平台或 WMS 实时数据。
          </p>
        </div>
        <div className="av-toolbar">
          <span className="av-cardhint" role="status">
            {checkedAt ? '本页读取时间：' + checkedAt : '尚未完成读取'}
          </span>
          <button
            type="button"
            className="av-btn"
            disabled={loading}
            onClick={() => { void reload(); }}
          >
            {loading ? '读取中…' : '刷新'}
          </button>
        </div>
      </div>
      <div className="av-kpis">
        {sources.map((source) => {
          const metric = results[source.key];
          const value = metric?.status === 'ready'
            ? String(metric.count)
            : metric?.status === 'unauthorized'
              ? '无权限'
              : loading || !metric
                ? '…'
                : '—';
          const status = metric?.status === 'unauthorized'
            ? '权限不足或登录已过期'
            : metric?.status === 'unavailable'
              ? '读取失败，不能视为 0'
              : source.help;
          return (
            <article className="av-card" key={source.key}>
              <div className="av-kpivalue" aria-live="polite">{value}</div>
              <h3 className="av-kpilabel">{source.label}</h3>
              <p className="av-cardhint">{status}</p>
              <a href={source.href}>查看对应业务记录 →</a>
            </article>
          );
        })}
      </div>
      <p className="av-cardhint">
        当前仅统计 API 返回的记录条目；待办、异常和趋势需要各自可追溯的数据口径，尚未接入时继续显示空状态。
      </p>
    </section>
  );
}

export function LiveOperationEntry({ area }: { area: string }) {
  const entry = contract.operationalEntrypoints.find((item) => item.area === area);
  if (!entry) return null;

  return (
    <section className="av-card" aria-label="已接通的真实业务功能">
      <div className="av-cardhead">
        <div>
          <h2 className="av-cardtitle">可保存的真实业务功能</h2>
          <p className="av-cardhint">
            本模块的 Ardot 页面是流程设计预览；下面入口连接现有的领域 API 工作台。
          </p>
        </div>
      </div>
      <p>{entry.detail}</p>
      <div className="av-toolbar">
        <a className="av-btn" data-variant="primary" href={entry.href}>{entry.label} →</a>
      </div>
    </section>
  );
}

export function AdminLogout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session/logout', { method: 'POST' });
      if (!response.ok) throw new Error('退出失败，请重试');
      window.location.assign('/login?portal=admin');
    } catch {
      setError('无法退出，请重试');
      setBusy(false);
    }
  }

  return (
    <span>
      <button className="av-btn" type="button" onClick={() => { void signOut(); }} disabled={busy}>
        {busy ? '退出中…' : '退出登录'}
      </button>
      {error ? <small role="alert">{error}</small> : null}
    </span>
  );
}
