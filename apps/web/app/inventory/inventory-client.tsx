'use client';

import { OperationsFrame } from '../_components/operations-frame';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import styles from './inventory.module.css';

type ItemKind = 'PART' | 'SKU' | 'VEHICLE';
type FactoryPartner = { id:string;displayName:string;roles?:string[] };
type Warehouse = { id: string; code: string; name: string; country_code: string; timezone: string; partner_name: string | null; active: boolean };
type Location = { id: string; warehouse_id: string; warehouse_code: string; warehouse_name: string; code: string; name: string; location_type: string; active: boolean };
type Part = { id: string; part_number: string; name: string; default_unit: string };
type Sku = { id: string; sku: string; name: string };
type Vehicle = { id: string; vehicle_code: string; frame_number: string; sku: string };
type Balance = { item_kind: ItemKind; part_id: string | null; sku_id: string | null; vehicle_id: string | null; warehouse_code: string; warehouse_name: string; location_code: string; location_name: string; unit: string; on_hand: string; reserved: string; available: string; part_number: string | null; part_name: string | null; sku: string | null; sku_name: string | null; frame_number: string | null };
type Movement = { id: string; movement_number: string; movement_type: string; item_kind: ItemKind; part_number: string | null; sku: string | null; frame_number: string | null; quantity: string; unit: string; source_warehouse_code: string | null; source_location_code: string | null; destination_warehouse_code: string | null; destination_location_code: string | null; reason: string; occurred_at: string };
type Reservation = { id: string; item_kind: ItemKind; part_number: string | null; sku: string | null; frame_number: string | null; warehouse_code: string; location_code: string; quantity: string; unit: string; status: string; reference_type: string | null; created_at: string };
type Stocktake = { id: string; stocktake_number: string; warehouse_id: string; warehouse_code: string; warehouse_name: string; status: string; note: string; opened_at: string; closed_at: string | null };
type Count = { id: string; session_id: string; location_id: string; location_code: string; item_kind: ItemKind; part_number: string | null; sku: string | null; frame_number: string | null; counted_quantity: string; unit: string; counted_at: string };
type InventorySummary = { balances: Balance[]; movements: Movement[]; reservations: Reservation[] };
type WarehouseSummary = { warehouses: Warehouse[]; locations: Location[]; stocktakes: Stocktake[]; counts: Count[] };
type InventorySource = 'inventory' | 'warehouse' | 'engineering' | 'product' | 'vehicles';
type SourceStatus = 'loading' | 'ready' | 'error';
const inventorySourceLabels: Record<InventorySource, string> = { inventory: '库存余额/流水/预留', warehouse: '仓库/库位/盘点', engineering: '零部件目录', product: '商品 SKU', vehicles: '车辆档案' };

const emptyInventory: InventorySummary = { balances: [], movements: [], reservations: [] };
const emptyWarehouse: WarehouseSummary = { warehouses: [], locations: [], stocktakes: [], counts: [] };

function normalizeInventorySummary(value: unknown): InventorySummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.balances) || !Array.isArray(row.movements) || !Array.isArray(row.reservations)) return null;
  return { balances: row.balances as Balance[], movements: row.movements as Movement[], reservations: row.reservations as Reservation[] };
}

function normalizeWarehouseSummary(value: unknown): WarehouseSummary | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!Array.isArray(row.warehouses) || !Array.isArray(row.locations) || !Array.isArray(row.stocktakes) || !Array.isArray(row.counts)) return null;
  return { warehouses: row.warehouses as Warehouse[], locations: row.locations as Location[], stocktakes: row.stocktakes as Stocktake[], counts: row.counts as Count[] };
}

function sourceErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const itemKindLabel: Record<ItemKind, string> = { PART: '零部件', SKU: 'SKU', VEHICLE: '整车' };
const movementTypeLabel: Record<string, string> = {
  RECEIPT: '入库',
  TRANSFER: '移库',
  ISSUE: '出库',
  RETURN: '退回',
  ADJUSTMENT: '库存调整',
  STOCKTAKE: '盘点调整',
};
const stocktakeStatusLabel: Record<string, string> = { OPEN: '盘点中', CLOSED: '已完成', CANCELLED: '已取消' };

function displayMovementType(value: string) { return movementTypeLabel[value] ?? value; }
function displayStocktakeStatus(value: string) { return stocktakeStatusLabel[value] ?? value; }

export default function InventoryClient({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();

  useEffect(() => {
    const revealInventoryActions = () => {
      if (['#warehouse-setup', '#stocktake', '#movement-history'].includes(window.location.hash)) {
        document.getElementById('inventory-advanced')?.setAttribute('open', '');
      }
    };
    revealInventoryActions();
    window.addEventListener('hashchange', revealInventoryActions);
    return () => window.removeEventListener('hashchange', revealInventoryActions);
  }, []);
  const [inventory, setInventory] = useState<InventorySummary>(emptyInventory);
  const [warehouse, setWarehouse] = useState<WarehouseSummary>(emptyWarehouse);
  const [factoryPartners,setFactoryPartners]=useState<FactoryPartner[]>([]);
  const [factorySourceError,setFactorySourceError]=useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [movementKind, setMovementKind] = useState<ItemKind>('PART');
  const [reservationKind, setReservationKind] = useState<ItemKind>('PART');
  const [countKind, setCountKind] = useState<ItemKind>('PART');
  const [adjustKind, setAdjustKind] = useState<ItemKind>('PART');
  const [movementType, setMovementType] = useState('RECEIPT');
  const [selectedStocktakeId, setSelectedStocktakeId] = useState('');
  const [message, setMessage] = useState('');
  const [sourceStatus, setSourceStatus] = useState<Record<InventorySource, SourceStatus>>({ inventory: 'loading', warehouse: 'loading', engineering: 'loading', product: 'loading', vehicles: 'loading' });
  const [sourceErrors, setSourceErrors] = useState<Partial<Record<InventorySource, string>>>({});

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

  function sourceReady(source: InventorySource) {
    setSourceStatus((current) => ({ ...current, [source]: 'ready' }));
    setSourceErrors((current) => {
      const next = { ...current };
      delete next[source];
      return next;
    });
  }

  function sourceFailed(source: InventorySource, error: unknown, fallback: string) {
    setSourceStatus((current) => ({ ...current, [source]: current[source] === 'ready' ? 'ready' : 'error' }));
    setSourceErrors((current) => ({ ...current, [source]: sourceErrorMessage(error, fallback) }));
  }

  async function reload() {
    const [inventoryResult, warehouseResult, engineeringResult, productResult, vehiclesResult, partnersResult] = await Promise.allSettled([
      api('/v1/inventory'), api('/v1/warehouse'), api('/v1/engineering'), api('/v1/product/catalog'), api('/v1/vehicles'), api('/v1/partners'),
    ]);

    if (inventoryResult.status === 'fulfilled') {
      const nextInventory = normalizeInventorySummary(inventoryResult.value);
      if (nextInventory) {
        setInventory(nextInventory);
        sourceReady('inventory');
      } else sourceFailed('inventory', new Error('库存接口返回的数据格式异常'), '库存数据暂不可用');
    } else sourceFailed('inventory', inventoryResult.reason, '库存数据暂不可用');

    if (warehouseResult.status === 'fulfilled') {
      const nextWarehouse = normalizeWarehouseSummary(warehouseResult.value);
      if (nextWarehouse) {
        setWarehouse(nextWarehouse);
        setSelectedStocktakeId((current) => {
          if (current && nextWarehouse.stocktakes.some((item) => item.id === current)) return current;
          return nextWarehouse.stocktakes.find((item) => item.status === 'OPEN')?.id ?? '';
        });
        sourceReady('warehouse');
      } else sourceFailed('warehouse', new Error('仓库接口返回的数据格式异常'), '仓库数据暂不可用');
    } else sourceFailed('warehouse', warehouseResult.reason, '仓库数据暂不可用');

    if (engineeringResult.status === 'fulfilled' && engineeringResult.value && Array.isArray(engineeringResult.value.parts)) {
      setParts(engineeringResult.value.parts);
      sourceReady('engineering');
    } else sourceFailed('engineering', engineeringResult.status === 'rejected' ? engineeringResult.reason : new Error('零部件接口返回的数据格式异常'), '零部件目录暂不可用');

    if (productResult.status === 'fulfilled' && productResult.value && Array.isArray(productResult.value.skus)) {
      setSkus(productResult.value.skus);
      sourceReady('product');
    } else sourceFailed('product', productResult.status === 'rejected' ? productResult.reason : new Error('商品接口返回的数据格式异常'), '商品 SKU 暂不可用');

    if (partnersResult.status === 'fulfilled' && Array.isArray(partnersResult.value)) {
      setFactoryPartners((partnersResult.value as FactoryPartner[]).filter(p=>Array.isArray(p.roles)&&p.roles.includes('FACTORY')));
      setFactorySourceError(false);
    } else {
      setFactoryPartners([]);
      setFactorySourceError(true);
    }

    if (vehiclesResult.status === 'fulfilled' && Array.isArray(vehiclesResult.value)) {
      setVehicles(vehiclesResult.value);
      sourceReady('vehicles');
    } else sourceFailed('vehicles', vehiclesResult.status === 'rejected' ? vehiclesResult.reason : new Error('车辆接口返回的数据格式异常'), '车辆档案暂不可用');
  }

  useEffect(() => { void reload(); }, []);

  function items(kind: ItemKind) {
    if (kind === 'PART') return parts.map((item) => ({ id: item.id, label: `${item.part_number} · ${item.name}`, unit: item.default_unit }));
    if (kind === 'SKU') return skus.map((item) => ({ id: item.id, label: `${item.sku} · ${item.name}`, unit: 'EA' }));
    return vehicles.map((item) => ({ id: item.id, label: `${item.frame_number} · ${item.sku}`, unit: 'EA' }));
  }

  function unitFor(kind: ItemKind, itemId: string) { return items(kind).find((item) => item.id === itemId)?.unit ?? 'EA'; }
  function balanceLabel(balance: Balance) { return balance.part_number ?? balance.sku ?? balance.frame_number ?? '未知物料'; }
  function movementLabel(row: Movement) { return row.part_number ?? row.sku ?? row.frame_number ?? '未知物料'; }

  const activeReservations = inventory.reservations.filter((item) => item.status === 'ACTIVE');
  const selectedStocktake = warehouse.stocktakes.find((item) => item.id === selectedStocktakeId) ?? null;
  const stocktakeCounts = selectedStocktake ? warehouse.counts.filter((item) => item.session_id === selectedStocktake.id) : [];
  const metrics = useMemo(() => ({
    warehouses: warehouse.warehouses.length,
    locations: warehouse.locations.length,
    stockPositions: inventory.balances.length,
    activeReservations: activeReservations.length,
    openStocktakes: warehouse.stocktakes.filter((row) => row.status === 'OPEN').length,
  }), [inventory.balances, activeReservations.length, warehouse]);

  async function action(path: string, body: unknown = {}) {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) });
      setMessage('操作已完成。');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(build(form)) });
      setMessage('已保存。');
      formElement.reset();
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    }
  }

  return (
    <OperationsFrame embedded={embedded} area="inventory" footer="ALSVID · 库存 / 仓库">
      <section>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>库存控制 / INVENTORY CONTROL</div>
            <h1>库存管理</h1>
            <p>先查看仓库与库存记录，需要时再展开出入库、调拨与盘点操作。数量由真实库存流水计算。</p>
          </div>
        </header>
        {message ? <div className={styles.notice}>{message}</div> : null}
        {Object.keys(sourceErrors).length ? <div className={styles.notice} role="alert"><strong>部分库存数据源不可用：</strong> {Object.entries(sourceErrors).map(([key, error]) => inventorySourceLabels[key as InventorySource] + '：' + error).join('；')}。其他来源仍可使用；失败来源的已有记录如被保留，仅代表最近一次成功读取。 <button type="button" className={styles.retry} onClick={() => { void reload(); }}>重试读取</button></div> : null}

        <div className={styles.metrics}>
          <div><span>仓库</span><b>{sourceStatus.warehouse !== 'ready' || sourceErrors.warehouse ? '—' : metrics.warehouses}</b></div>
          <div><span>库位</span><b>{sourceStatus.warehouse !== 'ready' || sourceErrors.warehouse ? '—' : metrics.locations}</b></div>
          <div><span>库存位置</span><b>{sourceStatus.inventory !== 'ready' || sourceErrors.inventory ? '—' : metrics.stockPositions}</b></div>
          <div><span>有效预留</span><b>{sourceStatus.inventory !== 'ready' || sourceErrors.inventory ? '—' : metrics.activeReservations}</b></div>
          <div><span>进行中盘点</span><b>{sourceStatus.warehouse !== 'ready' || sourceErrors.warehouse ? '—' : metrics.openStocktakes}</b></div>
        </div>

        <section className={styles.panel} id="warehouses" aria-label="仓库列表">
          <div className={styles.sectionHead}>
            <h2>仓库列表</h2>
            <a className={styles.listAction} href="#warehouse-setup" onClick={() => document.getElementById('inventory-advanced')?.setAttribute('open', '')}>＋ 新建仓库 / 库位</a>
          </div>
          <div className={styles.tableWrap}>
            <table aria-label="真实仓库档案">
              <thead><tr><th>仓库编码</th><th>仓库名称</th><th>国家</th><th>时区</th><th>状态</th></tr></thead>
              <tbody>{warehouse.warehouses.map(row => <tr key={row.id}>
                <td><b>{row.code}</b></td><td>{row.name}</td><td>{row.country_code}</td><td>{row.timezone}</td><td>{row.active ? '启用' : '停用'}</td>
              </tr>)}</tbody>
            </table>
            {!warehouse.warehouses.length && <p className={styles.empty}>{sourceStatus.warehouse === 'loading' ? '正在读取仓库…' : sourceStatus.warehouse === 'error' || sourceErrors.warehouse ? '仓库数据不可用，无法确认仓库数量。' : '当前没有已登记仓库，可点击“新建仓库 / 库位”建立档案。'}</p>}
          </div>
        </section>

        <section className={styles.panel} id="balances" aria-label="库存余额">
          <div className={styles.sectionHead}><h2>库存余额</h2><span>按仓库与库位逐条查看真实台账</span></div>
          <div className={styles.tableWrap}>
            <table aria-label="真实库存余额">
              <thead><tr><th>商品 / 零件</th><th>类型</th><th>仓库</th><th>库位</th><th>现存</th><th>预留</th><th>可用</th></tr></thead>
              <tbody>{inventory.balances.map((row, index) => <tr key={`${row.item_kind}-${row.part_id ?? row.sku_id ?? row.vehicle_id}-${row.warehouse_code}-${row.location_code}-${index}`}>
                <td><b>{balanceLabel(row)}</b></td><td>{itemKindLabel[row.item_kind]}</td><td>{row.warehouse_name ?? row.warehouse_code}</td><td>{row.location_code}</td>
                <td>{row.on_hand} {row.unit}</td><td>{row.reserved}</td><td><b>{row.available}</b></td>
              </tr>)}</tbody>
            </table>
            {!inventory.balances.length && <p className={styles.empty}>{sourceStatus.inventory === 'loading' ? '正在读取库存…' : sourceStatus.inventory === 'error' || sourceErrors.inventory ? '库存数据不可用，无法确认库存数量。' : '当前没有库存记录。'}</p>}
          </div>
        </section>

        <details className={styles.advanced} id="inventory-advanced">
          <summary>仓库操作与高级管理（出入库、调拨、盘点、接口状态）</summary>
        <section className={styles.panel} id="warehouse-provider" aria-labelledby="warehouse-provider-title">
          <div className={styles.sectionHead}>
            <span>THIRD-PARTY WAREHOUSE / WMS</span>
            <h2 id="warehouse-provider-title">第三方仓连接状态</h2>
            <p>当前尚未配置真实仓商 API、商户账号或沙箱凭据。系统不会发起外部同步，也不会把第三方库存计入可售库存。</p>
          </div>
          <div className={styles.row}>
            <div>
              <b>连接状态：未配置</b>
              <span>首家服务商：待确认</span>
              <small>正式接入前需要官方 API 文档、商户 / 仓库 ID、SKU 映射和沙箱凭据。</small>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table aria-label="第三方仓接口能力状态">
              <thead><tr><th>能力</th><th>当前状态</th><th>开启条件</th></tr></thead>
              <tbody>
                <tr><td>库存快照与对账</td><td>未接入</td><td>仓库 / SKU 映射及沙箱验收</td></tr>
                <tr><td>订单履约与运单</td><td>未接入</td><td>真实订单门禁、仓商接单回执与追踪接口</td></tr>
                <tr><td>收货与退货回执</td><td>未接入</td><td>仓商能力确认、实收证据与权限审计</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.topGrid} id="warehouse-setup" aria-label="仓库、库位与调拨主数据">
          <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/warehouse/warehouses', (form) => ({ code: form.get('code'), name: form.get('name'), countryCode: form.get('countryCode'), timezone: form.get('timezone'), partnerId: form.get('partnerId') || undefined }))}>
            <span>仓库主数据</span><h2>创建仓库</h2>
            <div className={styles.inline}><input name="code" placeholder="例如：DE-BERLIN" required /><input name="name" placeholder="例如：德国仓" required /></div>
            <div className={styles.inline}><input name="countryCode" defaultValue="DE" maxLength={2} required /><input name="timezone" defaultValue="Europe/Berlin" required /></div>
            <label>关联合作工厂（工厂成品入库时必须选择）
              <select name="partnerId" defaultValue="">
                <option value="">普通仓库（不关联工厂）</option>
                {factoryPartners.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </label>
            {factorySourceError&&<p className={styles.empty}>工厂资料暂时不可读取，不能创建关联工厂仓。请刷新确认后再选择。</p>}
            <button>创建仓库</button>
          </form>

          <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/warehouse/locations', (form) => ({ warehouseId: form.get('warehouseId'), code: form.get('code'), name: form.get('name'), locationType: form.get('locationType') }))}>
            <span>仓库库位</span><h2>创建库位 / 暂存区</h2>
            <select name="warehouseId" required defaultValue=""><option value="" disabled>选择仓库</option>{warehouse.warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
            <div className={styles.inline}><input name="code" placeholder="例如：A01-01" required /><input name="name" placeholder="例如：A01-01 存储位" required /></div>
            <select name="locationType" defaultValue="STORAGE">
              <option value="STORAGE">存储</option><option value="RECEIVING">收货</option><option value="STAGING">暂存</option><option value="PICK">拣货</option><option value="QUARANTINE">隔离</option><option value="DISPATCH">发货</option>
            </select>
            <button>创建库位</button>
          </form>
        </section>

        <section className={styles.opsGrid}>
          <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/inventory/movements', (form) => {
            const kind = form.get('itemKind') as ItemKind;
            const itemId = String(form.get('itemId'));
            return { movementType: form.get('movementType'), itemKind: kind, itemId, unit: unitFor(kind, itemId), quantity: form.get('quantity'), sourceLocationId: form.get('sourceLocationId') || undefined, destinationLocationId: form.get('destinationLocationId') || undefined, reason: form.get('reason') || undefined, idempotencyKey: crypto.randomUUID() };
          })}>
            <span>正常库存流水</span><h2>入库 · 移库 · 出库 · 退回</h2>
            <select name="movementType" value={movementType} onChange={(event) => setMovementType(event.target.value)}>
              <option value="RECEIPT">入库</option><option value="TRANSFER">移库</option><option value="ISSUE">出库</option><option value="RETURN">退回</option>
            </select>
            <select name="itemKind" value={movementKind} onChange={(event) => setMovementKind(event.target.value as ItemKind)}>
              <option value="PART">零部件</option><option value="SKU">SKU</option><option value="VEHICLE">整车</option>
            </select>
            <select name="itemId" required defaultValue=""><option value="" disabled>选择库存对象</option>{items(movementKind).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <input name="quantity" inputMode="decimal" defaultValue={movementKind === 'VEHICLE' ? '1' : ''} placeholder="数量" required />
            <div className={styles.inline}>
              <select name="sourceLocationId" defaultValue=""><option value="">无来源库位</option>{warehouse.locations.map((item) => <option key={item.id} value={item.id}>{item.warehouse_code}/{item.code}</option>)}</select>
              <select name="destinationLocationId" defaultValue=""><option value="">无目标库位</option>{warehouse.locations.map((item) => <option key={item.id} value={item.id}>{item.warehouse_code}/{item.code}</option>)}</select>
            </div>
            <input name="reason" placeholder={`${displayMovementType(movementType)}原因 / 外部引用`} />
            <button>写入不可变库存流水</button>
          </form>

          <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/inventory/reservations', (form) => {
            const kind = form.get('itemKind') as ItemKind;
            const itemId = String(form.get('itemId'));
            return { itemKind: kind, itemId, unit: unitFor(kind, itemId), locationId: form.get('locationId'), quantity: form.get('quantity'), referenceType: form.get('referenceType') || undefined, note: form.get('note') || undefined };
          })}>
            <span>库存预留</span><h2>为订单 / 履约锁定库存</h2>
            <select name="itemKind" value={reservationKind} onChange={(event) => setReservationKind(event.target.value as ItemKind)}><option value="PART">零部件</option><option value="SKU">SKU</option><option value="VEHICLE">整车</option></select>
            <select name="itemId" required defaultValue=""><option value="" disabled>选择库存对象</option>{items(reservationKind).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <select name="locationId" required defaultValue=""><option value="" disabled>选择预留库位</option>{warehouse.locations.map((item) => <option key={item.id} value={item.id}>{item.warehouse_code}/{item.code}</option>)}</select>
            <input name="quantity" inputMode="decimal" defaultValue={reservationKind === 'VEHICLE' ? '1' : ''} placeholder="数量" required />
            <input name="referenceType" placeholder="引用类型：DEALER_ORDER / SHIPMENT / COMMERCE" />
            <input name="note" placeholder="预留备注" />
            <button>创建库存预留</button>
          </form>

          <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/inventory/movements', (form) => {
            const kind = form.get('itemKind') as ItemKind;
            const itemId = String(form.get('itemId'));
            const direction = String(form.get('direction'));
            const locationId = String(form.get('locationId'));
            return { movementType: 'ADJUSTMENT', itemKind: kind, itemId, unit: unitFor(kind, itemId), quantity: form.get('quantity'), sourceLocationId: direction === 'OUT' ? locationId : undefined, destinationLocationId: direction === 'IN' ? locationId : undefined, reason: form.get('reason'), idempotencyKey: crypto.randomUUID() };
          })}>
            <span>受控库存调整</span><h2>有依据的库存修正</h2>
            <select name="direction"><option value="IN">增加库存</option><option value="OUT">减少库存</option></select>
            <select name="itemKind" value={adjustKind} onChange={(event) => setAdjustKind(event.target.value as ItemKind)}><option value="PART">零部件</option><option value="SKU">SKU</option><option value="VEHICLE">整车</option></select>
            <select name="itemId" required defaultValue=""><option value="" disabled>选择库存对象</option>{items(adjustKind).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            <select name="locationId" required defaultValue=""><option value="" disabled>选择库位</option>{warehouse.locations.map((item) => <option key={item.id} value={item.id}>{item.warehouse_code}/{item.code}</option>)}</select>
            <input name="quantity" inputMode="decimal" placeholder="数量" required />
            <input name="reason" placeholder="必须填写库存调整原因，作为运营证据" required />
            <button>提交库存调整</button>
          </form>
        </section>

        <section className={styles.twoCol}>
          <div className={styles.panel}>
            <div className={styles.sectionHead}><span>可用库存</span><h2>按库位推导的库存余额</h2></div>
            <div className={styles.tableWrap}>
              <table><thead><tr><th>库存对象</th><th>类型</th><th>仓库 / 库位</th><th>现存量</th><th>已预留</th><th>可用量</th></tr></thead>
                <tbody>{inventory.balances.map((row, index) => <tr key={`${row.item_kind}-${row.part_id ?? row.sku_id ?? row.vehicle_id}-${row.location_code}-${index}`}><td><b>{balanceLabel(row)}</b></td><td>{itemKindLabel[row.item_kind]}</td><td>{row.warehouse_code}/{row.location_code}</td><td>{row.on_hand} {row.unit}</td><td>{row.reserved}</td><td><b>{row.available}</b></td></tr>)}</tbody>
              </table>
              {!inventory.balances.length ? <p className={styles.empty}>{sourceStatus.inventory === 'loading' ? '正在读取库存余额…' : sourceStatus.inventory === 'error' || sourceErrors.inventory ? '库存数据不可用，无法确认当前库存余额。' : '暂无库存流水，因此没有可显示的库存余额。'}</p> : null}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.sectionHead}><span>有效预留</span><h2>已锁定需求</h2></div>
            <div className={styles.tableWrap}><table aria-label="有效库存预留">
              <thead><tr><th>预留对象</th><th>仓库 / 库位</th><th>数量</th><th>业务引用</th><th>操作</th></tr></thead>
              <tbody>{activeReservations.map(row=><tr key={row.id}>
                <td><strong>{row.part_number??row.sku??row.frame_number}</strong></td>
                <td>{row.warehouse_code}/{row.location_code}</td><td>{row.quantity} {row.unit}</td><td>{row.reference_type??'—'}</td>
                <td><div className={styles.rowActions}><button onClick={()=>void action(`/v1/inventory/reservations/${row.id}/issue`,{idempotencyKey:crypto.randomUUID(),reason:'预留库存出库'})}>确认出库</button><button className={styles.secondary} onClick={()=>void action(`/v1/inventory/reservations/${row.id}/release`)}>释放</button></div></td>
              </tr>)}
              {!activeReservations.length?<tr><td colSpan={5} className={styles.empty}>{sourceStatus.inventory==='loading'?'正在读取库存预留…':sourceStatus.inventory==='error'||sourceErrors.inventory?'库存数据不可用，无法确认预留记录':'暂无有效库存预留'}</td></tr>:null}</tbody>
            </table></div>
          </div>
        </section>

        <section className={styles.stocktakePanel} id="stocktake">
          <div className={styles.sectionHead}>
            <span>库存盘点</span><h2>盘点证据 → 修正流水</h2>
            <p>盘点数量不会直接覆盖库存。关闭盘点时，系统比较最新实盘数量与库存流水，并仅生成必要的补偿流水。</p>
          </div>
          <div className={styles.stocktakeGrid}>
            <form className={styles.card} onSubmit={(event) => void submit(event, '/v1/warehouse/stocktakes', (form) => ({ warehouseId: form.get('warehouseId'), note: form.get('note') || undefined }))}>
              <span>新建盘点</span>
              <select name="warehouseId" required defaultValue=""><option value="" disabled>选择仓库</option>{warehouse.warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
              <input name="note" placeholder="循环盘点 / 年度盘点备注" />
              <button>开始盘点</button>
            </form>

            <div className={styles.tableWrap}>
              <table aria-label="库存盘点记录"><thead><tr><th>盘点单号</th><th>仓库</th><th>状态</th><th>开始时间</th><th>操作</th></tr></thead>
                <tbody>{warehouse.stocktakes.map(item=><tr key={item.id} data-selected={selectedStocktakeId===item.id}>
                  <td><strong>{item.stocktake_number}</strong></td><td>{item.warehouse_code}</td><td>{displayStocktakeStatus(item.status)}</td><td>{new Date(item.opened_at).toLocaleString('zh-CN')}</td>
                  <td><button type="button" className={styles.textAction} onClick={()=>setSelectedStocktakeId(selectedStocktakeId===item.id?'':item.id)}>{selectedStocktakeId===item.id?'收起':'处理'}</button></td>
                </tr>)}
                {!warehouse.stocktakes.length?<tr><td colSpan={5} className={styles.empty}>{sourceStatus.warehouse==='loading'?'正在读取盘点记录…':sourceStatus.warehouse==='error'||sourceErrors.warehouse?'仓库数据不可用，无法确认盘点记录':'暂无盘点会话'}</td></tr>:null}</tbody>
              </table>
            </div>

            {selectedStocktake ? (
              <form className={styles.card} onSubmit={(event) => void submit(event, `/v1/warehouse/stocktakes/${selectedStocktake.id}/counts`, (form) => {
                const kind = form.get('itemKind') as ItemKind;
                const itemId = String(form.get('itemId'));
                return { locationId: form.get('locationId'), itemKind: kind, itemId, countedQuantity: form.get('countedQuantity'), unit: unitFor(kind, itemId) };
              })}>
                <span>追加实盘数量</span>
                <select name="locationId" required defaultValue=""><option value="" disabled>选择库位</option>{warehouse.locations.filter((item) => item.warehouse_id === selectedStocktake.warehouse_id).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
                <select name="itemKind" value={countKind} onChange={(event) => setCountKind(event.target.value as ItemKind)}><option value="PART">零部件</option><option value="SKU">SKU</option><option value="VEHICLE">整车</option></select>
                <select name="itemId" required defaultValue=""><option value="" disabled>选择库存对象</option>{items(countKind).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
                <input name="countedQuantity" inputMode="decimal" placeholder="实盘数量" required />
                <button disabled={selectedStocktake.status !== 'OPEN'}>记录盘点证据</button>
              </form>
            ) : <div className={styles.card}><p className={styles.empty}>请选择一个盘点会话。</p></div>}
          </div>

          {selectedStocktake ? <div className={styles.stocktakeDetail}>
            <div><b>{selectedStocktake.stocktake_number}</b><span>{selectedStocktake.warehouse_name} · {displayStocktakeStatus(selectedStocktake.status)}</span></div>
            <div className={styles.rowActions}>{selectedStocktake.status === 'OPEN' ? <><button onClick={() => void action(`/v1/warehouse/stocktakes/${selectedStocktake.id}/close`)}>关闭并对账</button><button className={styles.secondary} onClick={() => void action(`/v1/warehouse/stocktakes/${selectedStocktake.id}/cancel`)}>取消盘点</button></> : null}</div>
          </div> : null}

          {stocktakeCounts.length?<div className={styles.tableWrap}><table aria-label="盘点实盘明细">
            <thead><tr><th>库存对象</th><th>库位</th><th>实盘数量</th><th>盘点时间</th></tr></thead>
            <tbody>{stocktakeCounts.map(row=><tr key={row.id}><td>{row.part_number??row.sku??row.frame_number}</td><td>{row.location_code}</td><td>{row.counted_quantity} {row.unit}</td><td>{new Date(row.counted_at).toLocaleString('zh-CN')}</td></tr>)}</tbody>
          </table></div>:null}
        </section>

        <section className={styles.panel} id="movement-history">
          <div className={styles.sectionHead}><span>库存流水历史</span><h2>不可变库存时间线</h2></div>
          <div className={styles.tableWrap}>
            <table><thead><tr><th>流水号</th><th>库存对象</th><th>类型</th><th>路径</th><th>数量</th><th>时间</th></tr></thead>
              <tbody>{inventory.movements.map((row) => <tr key={row.id}><td>{row.movement_number}</td><td><b>{movementLabel(row)}</b></td><td>{displayMovementType(row.movement_type)}</td><td>{row.source_warehouse_code ? `${row.source_warehouse_code}/${row.source_location_code}` : '外部'} → {row.destination_warehouse_code ? `${row.destination_warehouse_code}/${row.destination_location_code}` : '外部'}</td><td>{row.quantity} {row.unit}</td><td>{new Date(row.occurred_at).toLocaleString()}</td></tr>)}</tbody>
            </table>
            {!inventory.movements.length ? <p className={styles.empty}>{sourceStatus.inventory === 'loading' ? '正在读取库存流水…' : sourceStatus.inventory === 'error' || sourceErrors.inventory ? '库存数据不可用，无法确认当前库存流水。' : '暂无库存流水。'}</p> : null}
          </div>
        </section>
        </details>
      </section>
    </OperationsFrame>
  );
}
