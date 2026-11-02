'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAdminWorkspaceState } from '../admin/_components/admin-workspace-keeper';
import styles from './production-delivery-workspace.module.css';

type Step = 'purchase' | 'production' | 'shipping' | 'receipt';
type Po = { id:string; po_number:string; status:string; supplier_partner_id:string; supplier_name:string; currency:string; total_amount:string; created_at:string };
type PoLine = { id:string; purchase_order_id:string; item_type:string; sku_id:string|null; sku:string|null; ordered_quantity:string; unit_price:string; requested_date:string|null; line_kind:string };
type Partner = { id:string; displayName:string; roles:string[] };
type BuildSpec = { id:string; sku_id:string; code:string; status:string };
type Sku = { id:string; sku:string; name:string };
type ProductionOrder = { id:string; source_purchase_order_id:string|null; production_order_number:string; build_spec_id:string; factory_partner_id:string; factory_name:string; planned_quantity:number; planned_completion_date:string|null; status:string };
type ProductionUnit = { id:string; production_order_id:string; unit_no:number; status:string };
type Shipment = { id:string; source_purchase_order_id:string|null; shipment_number:string; route_type:string; origin_location_id:string; destination_location_id:string|null; destination_warehouse_name:string|null; status:string; transport_mode:string; planned_eta:string|null; inventory_received_at:string|null };
type Cargo = { id:string; shipment_id:string; sku_id:string|null; quantity:string; sku:string|null };
type Handoff = { id:string; shipment_id:string; cargo_id:string; received_quantity:string };
type Batch = { id:string; shipment_id:string; currency:string; status:string };
type Cost = { id:string; batch_id:string; category:string; batch_currency_amount:string };
type Allocation = { component_id:string; cargo_id:string; allocated_amount:string };
type FactoryReceipt = { production_order_id:string; quantity:string; warehouse_name:string };
type Stock = { item_kind:string; sku_id:string|null; location_id:string; available:string };
type Warehouse = { id:string; name:string; code:string; country_code:string; partner_id:string|null; active:boolean };
type Location = { id:string; warehouse_id:string; name:string; code:string };
type Facts = {
  procurement: {purchaseOrders:Po[];purchaseOrderLines:PoLine[]};
  production: {orders:ProductionOrder[];units:ProductionUnit[];factoryReceipts:FactoryReceipt[]};
  logistics: {shipments:Shipment[];cargo:Cargo[];handoffs:Handoff[]};
  finance: {landedBatches:Batch[];landedComponents:Cost[];landedAllocations:Allocation[]};
  inventory: {balances:Stock[]};
  warehouse: {warehouses:Warehouse[];locations:Location[]};
  partners: Partner[];
  engineering: {buildSpecs:BuildSpec[]};
  catalog: {skus:Sku[]};
};
const initial: Facts = {
  procurement:{purchaseOrders:[],purchaseOrderLines:[]},
  production:{orders:[],units:[],factoryReceipts:[]},logistics:{shipments:[],cargo:[],handoffs:[]},
  finance:{landedBatches:[],landedComponents:[],landedAllocations:[]},inventory:{balances:[]},
  warehouse:{warehouses:[],locations:[]},partners:[],
  engineering:{buildSpecs:[]},catalog:{skus:[]},
};
const sources = {
  procurement:'/v1/procurement',production:'/v1/production',logistics:'/v1/logistics',
  finance:'/v1/finance',inventory:'/v1/inventory',warehouse:'/v1/warehouse',
  partners:'/v1/partners',engineering:'/v1/engineering',catalog:'/v1/product/catalog',
} as const;
const steps:readonly {id:Step;name:string}[] = [
  {id:'purchase',name:'采购信息'},{id:'production',name:'生产进度'},
  {id:'shipping',name:'发运与费用'},{id:'receipt',name:'仓库入库'},
];
const statuses:Record<string,string> = {
  DRAFT:'草稿',ISSUED:'已发出',CONFIRMED:'工厂已确认',PARTIALLY_FULFILLED:'部分履约',FULFILLED:'采购履约完成',
  RELEASED:'已下达',IN_PROGRESS:'生产中',QC_PENDING:'待质检',COMPLETED:'生产完成',
  DISPATCHED:'已发货',IN_TRANSIT:'运输中',ARRIVED:'已到达',DELIVERED:'已送达',
  PLANNED:'待组装',ASSEMBLED:'已装配',QC_PASSED:'质检通过',QC_FAILED:'质检不合格',HOLD:'暂停',
};
const label = (state:string) => statuses[state] ?? state;
const n = (value:string|number|null|undefined) => Number(value ?? 0);
const amount = (value:number,currency:string) => Number.isFinite(value) ? `${value.toLocaleString('zh-CN',{maximumFractionDigits:2})} ${currency}` : '—';
const yyyyMmDd = (days:number) => {const d=new Date();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

async function api<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch('/api/control'+path,{
    ...init,credentials:'same-origin',cache:'no-store',
    headers:{...(init?.body ? {'Content-Type':'application/json'} : {}),...init?.headers},
  });
  const payload=await response.json().catch(()=>null) as {data?:T;message?:string}|null;
  if(!response.ok || !payload || !('data' in payload)){
    throw new Error(response.status===403?'当前账号没有此操作权限':response.status===401?'登录已过期':payload?.message??'业务接口读取或保存失败');
  }
  return payload.data as T;
}

export function ProductionDeliveryWorkspace(){
  const [facts,setFacts]=useState<Facts>(initial);
  const [errors,setErrors]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const busyGuard=useRef(false);
  const [message,setMessage]=useState('');
  const [openIds,setOpenIds]=useAdminWorkspaceState<string[]>('production-delivery:opened',[]);
  const [activeId,setActiveId]=useAdminWorkspaceState('production-delivery:active','');
  const [stepById,setStepById]=useAdminWorkspaceState<Record<string,Step>>('production-delivery:steps',{});
  const [showCreate,setShowCreate]=useState(false);
  const [query,setQuery]=useState('');
  const [focusedShipmentId,setFocusedShipmentId]=useState('');
  const [unitLimit,setUnitLimit]=useState(20);
  const [sourceReady,setSourceReady]=useState<string[]>([]);
  const reload=useCallback(async()=>{
    setLoading(true);
    const keys=Object.keys(sources) as (keyof typeof sources)[];
    const values=await Promise.allSettled(keys.map(k=>api<unknown>(sources[k])));
    const next:Facts={...initial};
    const failed:string[]=[];
    const ready:string[]=[];
    values.forEach((result,index)=>{
      const key=keys[index];
      if(!key)return;
      if(result.status==='fulfilled' && result.value!==null){
        (next as unknown as Record<string,unknown>)[key]=result.value;
        ready.push(key);
      } else failed.push(key);
    });
    setFacts(next);setErrors(failed);setSourceReady(ready);setLoading(false);
  },[]);
  useEffect(()=>{void reload();},[reload]);
  const available=(key:keyof Facts)=>sourceReady.includes(key);
  const purchaseOrders=useMemo(()=>facts.procurement.purchaseOrders.filter(po=>
    [po.po_number,po.supplier_name,...facts.procurement.purchaseOrderLines.filter(l=>l.purchase_order_id===po.id).map(l=>l.sku??'')]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase())),[facts.procurement,query]);
  const selected=facts.procurement.purchaseOrders.find(po=>po.id===activeId)??null;
  const poLines=selected?facts.procurement.purchaseOrderLines.filter(l=>l.purchase_order_id===selected.id):[];
  const productionOrders=selected?facts.production.orders.filter(o=>o.source_purchase_order_id===selected.id):[];
  const productionUnits=facts.production.units.filter(u=>productionOrders.some(o=>o.id===u.production_order_id));
  const shipments=selected?facts.logistics.shipments.filter(s=>s.source_purchase_order_id===selected.id):[];
  const shipmentIds=new Set(shipments.map(s=>s.id));
  const shipmentCargo=facts.logistics.cargo.filter(c=>shipmentIds.has(c.shipment_id));
  const cargoReceived=(id:string)=>facts.logistics.handoffs.filter(h=>h.cargo_id===id).reduce((sum,h)=>sum+n(h.received_quantity),0);
  const received=shipmentCargo.reduce((sum,c)=>sum+cargoReceived(c.id),0);
  const inTransit=shipmentCargo.filter(c=>!['DRAFT','CANCELLED'].includes(shipments.find(s=>s.id===c.shipment_id)?.status??'')).reduce((sum,c)=>sum+n(c.quantity)-cargoReceived(c.id),0);
  const ordered=poLines.filter(l=>l.line_kind!=='GIFT').reduce((sum,l)=>sum+n(l.ordered_quantity),0);
  const produced=productionOrders.filter(p=>p.status==='COMPLETED').reduce((sum,p)=>sum+n(p.planned_quantity),0);
  const selectedStep:Step=selected?stepById[selected.id]??'purchase':'purchase';
  const factoryPartners=facts.partners.filter(p=>p.roles?.includes('FACTORY'));
  const purchaseSkus=facts.catalog.skus;
  const linkedBatches=facts.finance.landedBatches.filter(b=>shipmentIds.has(b.shipment_id));
  const linkedCosts=facts.finance.landedComponents.filter(c=>linkedBatches.some(b=>b.id===c.batch_id));
  const factoryReceipts=facts.production.factoryReceipts??[];
  const warehouseFor=(locationId:string|null)=>{const l=facts.warehouse.locations.find(x=>x.id===locationId);return facts.warehouse.warehouses.find(w=>w.id===l?.warehouse_id);};
  const status=(po:Po)=>{
    const sh=facts.logistics.shipments.filter(x=>x.source_purchase_order_id===po.id);
    const shipIds=new Set(sh.map(x=>x.id));
    const cargo=facts.logistics.cargo.filter(c=>shipIds.has(c.shipment_id));
    const qty=cargo.reduce((sum,c)=>sum+facts.logistics.handoffs.filter(h=>h.cargo_id===c.id).reduce((a,h)=>a+n(h.received_quantity),0),0);
    const total=facts.procurement.purchaseOrderLines.filter(l=>l.purchase_order_id===po.id&&l.line_kind!=='GIFT').reduce((s,l)=>s+n(l.ordered_quantity),0);
    if(total>0&&qty>=total)return '全部入库';
    if(qty>0)return '部分入库';
    if(sh.some(s=>['DISPATCHED','IN_TRANSIT','ARRIVED','DELIVERED'].includes(s.status)))return '运输中';
    if(facts.production.orders.some(o=>o.source_purchase_order_id===po.id&&['IN_PROGRESS','QC_PENDING'].includes(o.status)))return '生产中';
    return label(po.status);
  };
  function open(poId:string){setOpenIds(ids=>ids.includes(poId)?ids:[...ids,poId]);setActiveId(poId);setShowCreate(false);}
  function close(poId:string){const ids=openIds.filter(id=>id!==poId);setOpenIds(ids);if(poId===activeId)setActiveId(ids.at(-1)??'');}
  async function run(task:()=>Promise<unknown>,success:string){
    if(busyGuard.current)return;
    busyGuard.current=true;setBusy(true);setMessage('');
    try{await task();await reload();setMessage(success);}
    catch(error){setMessage(error instanceof Error?error.message:'结果不确定，请刷新确认，避免重复操作');}
    finally{busyGuard.current=false;setBusy(false);}
  }
  function submitPo(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget);
    const supplierPartnerId=String(form.get('factory')??'');
    const itemId=String(form.get('sku')??'');
    const quantity=Number(form.get('quantity'));
    const unitPrice=Number(form.get('price'));
    if(!supplierPartnerId||!itemId||!Number.isInteger(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0){setMessage('请选择工厂和 SKU，填写正确的数量及单价');return;}
    void run(async()=>{
      const row=await api<Po>('/v1/procurement/purchase-orders',{method:'POST',body:JSON.stringify({
        supplierPartnerId,currency:form.get('currency'),lines:[{
          itemType:'SKU',itemId,quantity,unitPrice,unit:'EA',requestedDate:form.get('deliveryDate')||undefined,
        }],
      })});
      if(!row?.id)throw new Error('采购单创建结果不完整，请查询现有单据，避免重复创建');
      open(row.id);
    },'采购单草稿已创建。请核对后发出订单。');
  }
  function createProduction(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selected)return;
    const form=new FormData(e.currentTarget);
    const buildSpecId=String(form.get('buildSpec')??'');
    const spec=facts.engineering.buildSpecs.find(b=>b.id===buildSpecId);
    const plannedQuantity=Number(form.get('quantity'));
    const already=productionOrders.reduce((sum,o)=>sum+n(o.planned_quantity),0);
    const compatible=poLines.some(l=>l.item_type==='SKU'&&l.sku_id===spec?.sku_id);
    if(!compatible||!Number.isInteger(plannedQuantity)||plannedQuantity<=0||plannedQuantity>ordered-already){setMessage('生产配置必须属于本采购单 SKU，生产数量不能超过剩余采购量');return;}
    void run(()=>api('/v1/production/orders',{method:'POST',body:JSON.stringify({
      sourcePurchaseOrderId:selected.id,buildSpecId,factoryPartnerId:form.get('factory'),
      plannedQuantity,plannedStartDate:form.get('startDate')||undefined,
      plannedCompletionDate:form.get('completionDate')||undefined,
    })}),'生产单已建立，生产进度与采购单关联。');
  }
  function createShipment(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!selected)return;
    const form=new FormData(e.currentTarget);
    const destinationLocationId=String(form.get('destination')??'');
    const originLocationId=String(form.get('origin')??'');
    const dest=warehouseFor(destinationLocationId);
    if(!dest||!['DE','CN'].includes(dest.country_code)||originLocationId===destinationLocationId){setMessage('请选择有效的国内或德国仓库，发货地不能等于目的库位');return;}
    void run(async()=>{
      const row=await api<Shipment>('/v1/logistics/shipments',{method:'POST',body:JSON.stringify({
        sourcePurchaseOrderId:selected.id,originLocationId,destinationLocationId,
        routeType:dest.country_code==='DE'?'FACTORY_TO_GERMANY_WAREHOUSE':'FACTORY_TO_DOMESTIC_WAREHOUSE',
        transportMode:form.get('mode'),plannedEtd:form.get('etd')||undefined,plannedEta:form.get('eta')||undefined,
      })});
      if(!row?.id)throw new Error('发运批次创建结果不完整，请刷新核对');
      setFocusedShipmentId(row.id);
    },'发运批次已创建。请先分配工厂真实库存，再下达发运。');
  }
  function createBatch(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const form=new FormData(e.currentTarget);
    void run(()=>api('/v1/finance/landed-cost',{method:'POST',body:JSON.stringify({
      shipmentId:form.get('shipment'),currency:form.get('currency'),allocationBasis:'QUANTITY',
    })}),'已建立费用记录，实际账单可继续录入。');
  }
  function addCost(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget),batchId=String(f.get('batch'));
    const batch=linkedBatches.find(b=>b.id===batchId),cost=Number(f.get('amount'));
    if(!batch||batch.status!=='DRAFT'||!Number.isFinite(cost)||cost<0){setMessage('费用单或金额不正确');return;}
    if(!shipmentCargo.some(x=>x.shipment_id===batch.shipment_id)){setMessage('需要先分配发运货物');return;}
    void run(()=>api(`/v1/finance/landed-cost/${batchId}/distribute`,{
      method:'POST',body:JSON.stringify({category:f.get('category'),amount:cost,note:f.get('note')||undefined}),
    }),'真实费用已按每个 SKU 数量原子化分摊。');
  }
  function receiveFactory(e:FormEvent<HTMLFormElement>,orderId:string){
    e.preventDefault();const f=new FormData(e.currentTarget),quantity=Number(f.get('quantity'));
    if(!Number.isSafeInteger(quantity)||quantity<=0){setMessage('实际入库数量无效');return;}
    if(!window.confirm('已核对工厂成品实际数量且全部质检合格？此操作会增加工厂仓实际库存。'))return;
    void run(()=>api(`/v1/production/orders/${orderId}/factory-receipts`,{
      method:'POST',body:JSON.stringify({locationId:f.get('location'),quantity,note:f.get('note')||undefined}),
    }),'已计入工厂成品真实库存，可在发运时预留。');
  }
  function receiveCargo(e:FormEvent<HTMLFormElement>,shipmentId:string,cargoId:string){
    e.preventDefault();const f=new FormData(e.currentTarget),quantity=Number(f.get('quantity'));
    if(!Number.isSafeInteger(quantity)||quantity<=0){setMessage('实际签收数量无效');return;}
    if(!window.confirm('已经核对仓库签收数量、货损和实际入库凭证？仅确认合格实收货物。'))return;
    void run(()=>api(`/v1/logistics/shipments/${shipmentId}/receive-warehouse`,{
      method:'POST',body:JSON.stringify({lines:[{cargoId,quantity}],note:f.get('note')||undefined}),
    }),'本批实际入库已登记，未收数量仍保留待处理。');
  }
  const focus=shipments.find(s=>s.id===focusedShipmentId)??shipments[0]??null;
  return <div className={styles.root}>
    <header className={styles.heading}><div><h1>生产交付总单</h1><p>一张采购单贯穿工厂生产、分批发运、物流成本和仓库实际入库</p></div>
      <div className={styles.actions}><button type="button" onClick={()=>void reload()} disabled={loading||busy}>刷新</button><button className={styles.primary} type="button" disabled={!available('partners')||!available('catalog')} onClick={()=>{setShowCreate(s=>!s);setActiveId('');}}>＋ 新建生产采购单</button></div></header>
    {errors.length>0?<p className={styles.warning} role="alert">以下数据暂时不可读取：{errors.join('、')}。对应状态与操作不可视为已核验。</p>:null}
    {message?<p role="status" className={styles.notice}>{message}</p>:null}
    {showCreate?<form className={styles.panel} onSubmit={submitPo}>
      <h2>新建生产采购单</h2>
      <div className={styles.fields}>
        <label>工厂<select name="factory" required defaultValue=""><option value="">选择工厂</option>{factoryPartners.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
        <label>商品 SKU<select name="sku" required defaultValue=""><option value="">选择已建商品</option>{purchaseSkus.map(s=><option key={s.id} value={s.id}>{s.sku} · {s.name}</option>)}</select></label>
        <label>采购数量<input name="quantity" type="number" min="1" step="1" required/></label>
        <label>单台采购价<input name="price" type="number" min="0" step="0.01" required/></label>
        <label>币种<select name="currency" defaultValue="CNY"><option>CNY</option><option>EUR</option><option>USD</option></select></label>
        <label>预计交期<input name="deliveryDate" type="date" defaultValue={yyyyMmDd(90)} required/></label>
      </div><div className={styles.actions}><button type="button" onClick={()=>setShowCreate(false)}>取消</button><button disabled={busy} className={styles.primary}>创建采购单草稿</button></div>
    </form>:null}
    {openIds.length>0?<nav className={styles.orderTabs} aria-label="已打开的生产采购单">
      <button type="button" onClick={()=>setActiveId('')} aria-current={!activeId?'page':undefined}>全部订单</button>
      {openIds.map(id=>{const po=facts.procurement.purchaseOrders.find(x=>x.id===id);return <span className={styles.openTab} key={id}>
        <button type="button" aria-current={id===activeId?'page':undefined} onClick={()=>setActiveId(id)}>{po?.po_number??'已打开订单'}</button>
        <button type="button" aria-label={`关闭订单 ${po?.po_number??id}`} onClick={()=>close(id)}>×</button>
      </span>;})}
    </nav>:null}
    {!activeId?<section className={styles.panel}>
      <div className={styles.panelHead}><h2>生产采购订单</h2><input aria-label="搜索订单" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索订单号、车型或工厂"/></div>
      <div className={styles.scroll}><table><thead><tr><th>单号</th><th>工厂</th><th>车型 / SKU</th><th>采购数量</th><th>采购金额</th><th>生产交付状态</th><th>操作</th></tr></thead>
        <tbody>{purchaseOrders.map(po=>{const lines=facts.procurement.purchaseOrderLines.filter(l=>l.purchase_order_id===po.id);return <tr key={po.id}>
          <td><strong>{po.po_number}</strong></td><td>{po.supplier_name}</td><td>{lines.map(l=>l.sku??'零件').join('、')||'—'}</td>
          <td>{lines.reduce((sum,l)=>sum+n(l.ordered_quantity),0)}</td><td>{amount(n(po.total_amount),po.currency)}</td><td>{status(po)}</td>
          <td><button type="button" onClick={()=>open(po.id)}>打开总单</button></td>
        </tr>;})}
        {!purchaseOrders.length?<tr><td colSpan={7}>{loading?'正在读取真实订单…':available('procurement')?'暂无匹配的采购单':'采购数据读取失败，不能显示真实订单'}</td></tr>:null}</tbody></table></div>
    </section>:selected?<section className={styles.panel}>
      <div className={styles.panelHead}><div><h2>{selected.po_number} · {poLines.map(l=>l.sku??'零件').join('、')}</h2><p>{selected.supplier_name} · {ordered} 台 · {status(selected)} · 采购金额 {amount(n(selected.total_amount),selected.currency)}</p></div>
        <button type="button" onClick={()=>setActiveId('')}>返回列表</button></div>
      <div className={styles.metrics}><span>计划 {ordered}</span><span>生产完成 {produced}</span><span>在途 {inTransit}</span><span>已入库 {received}</span><span>发运批次 {shipments.length}</span></div>
      <nav className={styles.stepTabs} aria-label="生产交付操作步骤">
        {steps.map((t,index)=><button type="button" key={t.id} aria-current={selectedStep===t.id?'step':undefined} onClick={()=>setStepById(x=>({...x,[selected.id]:t.id}))}>{index+1}. {t.name}</button>)}
      </nav>
      {selectedStep==='purchase'?<div className={styles.content}>
        <div className={styles.panelHead}><h3>采购订单</h3><span>{label(selected.status)}</span></div>
        <div className={styles.scroll}><table><thead><tr><th>SKU</th><th>采购数量</th><th>单价</th><th>要求交期</th></tr></thead><tbody>{poLines.map(l=><tr key={l.id}><td>{l.sku??'零配件'}</td><td>{l.ordered_quantity}</td><td>{amount(n(l.unit_price),selected.currency)}</td><td>{l.requested_date??'—'}</td></tr>)}</tbody></table></div>
        <div className={styles.actions}>
          {selected.status==='DRAFT'?<button className={styles.primary} disabled={busy} onClick={()=>void run(()=>api(`/v1/procurement/purchase-orders/${selected.id}/issue`,{method:'POST',body:'{}'}),'采购单已发出')}>发出采购单</button>:null}
          {selected.status==='ISSUED'?<button className={styles.primary} disabled={busy} onClick={()=>void run(()=>api(`/v1/procurement/purchase-orders/${selected.id}/confirm`,{method:'POST',body:JSON.stringify({lines:poLines.map(l=>({purchaseOrderLineId:l.id,confirmedQuantity:l.ordered_quantity,confirmedDate:l.requested_date??undefined}))})}),'已记录工厂确认')}>记录工厂确认</button>:null}
          <span className={styles.hint}>单据状态与工厂实际确认必须一致；请勿提前确认。</span>
        </div>
      </div>:null}
      {selectedStep==='production'?<div className={styles.content}>
        <div className={styles.panelHead}><h3>生产进度</h3><span>已关联 {productionOrders.length} 张生产单</span></div>
        <div className={styles.scroll}><table><thead><tr><th>生产单号</th><th>工厂</th><th>数量</th><th>预计完工</th><th>进度</th><th>下一步操作</th></tr></thead>
          <tbody>{productionOrders.map(o=><tr key={o.id}><td>{o.production_order_number}</td><td>{o.factory_name}</td><td>{o.planned_quantity}</td><td>{o.planned_completion_date??'—'}</td><td>{label(o.status)}</td>
            <td>{o.status==='DRAFT'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/production/orders/${o.id}/release`,{method:'POST',body:'{}'}),'生产单已下达')}>下达</button>:null}
              {o.status==='RELEASED'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/production/orders/${o.id}/start`,{method:'POST',body:'{}'}),'已记录开工')}>开工</button>:null}
              {o.status==='IN_PROGRESS'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/production/orders/${o.id}/qc`,{method:'POST',body:'{}'}),'已提交质检环节')}>进入质检</button>:null}
              {o.status==='QC_PENDING'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/production/orders/${o.id}/complete`,{method:'POST',body:'{}'}),'生产单已完成')}>质检完成后结单</button>:null}
              {o.status==='COMPLETED'?'已完成':null}</td></tr>)}
            {!productionOrders.length?<tr><td colSpan={6}>暂无关联的生产单</td></tr>:null}</tbody></table></div>
        {productionUnits.length>0?<div>
          <div className={styles.panelHead}><h4>逐车装配 / 质检记录</h4><span>共 {productionUnits.length} 台，只显示前 {Math.min(unitLimit,productionUnits.length)} 台</span></div>
          <div className={styles.scroll}><table><thead><tr><th>生产单</th><th>车辆序号</th><th>实际状态</th><th>操作</th></tr></thead><tbody>
            {productionUnits.slice(0,unitLimit).map(u=>{const order=productionOrders.find(o=>o.id===u.production_order_id);return <tr key={u.id}><td>{order?.production_order_number}</td><td>{u.unit_no}</td><td>{label(u.status)}</td>
              <td>{order?.status==='IN_PROGRESS'&&['PLANNED','ASSEMBLING'].includes(u.status)?<button disabled={busy} onClick={()=>{if(window.confirm('已经实际完成该台整车装配？'))void run(()=>api(`/v1/production/units/${u.id}/assembled`,{method:'POST',body:'{}'}),'该台装配事实已记录');}}>确认装配</button>:null}
                {order?.status==='QC_PENDING'&&u.status==='QC_PENDING'?<button disabled={busy} onClick={()=>{if(window.confirm('已按质检要求实际检验该台车辆并确认合格？'))void run(()=>api(`/v1/production/units/${u.id}/inspect`,{method:'POST',body:JSON.stringify({result:'PASS'})}),'该台质检通过记录已保存');}}>记录质检通过</button>:null}
                {u.status==='QC_PASSED'?'已通过':null}</td></tr>;})}
          </tbody></table></div>{productionUnits.length>unitLimit?<button type="button" onClick={()=>setUnitLimit(x=>x+20)}>显示更多车辆</button>:null}
        </div>:null}
        {productionOrders.filter(o=>o.status==='COMPLETED').map(o=>{
          const already=factoryReceipts.filter(x=>x.production_order_id===o.id).reduce((sum,x)=>sum+n(x.quantity),0);
          const remain=Math.max(0,n(o.planned_quantity)-already);
          const locations=facts.warehouse.locations.filter(l=>facts.warehouse.warehouses.some(w=>w.id===l.warehouse_id&&w.partner_id===o.factory_partner_id&&w.country_code==='CN'&&w.active));
          return <form key={o.id} className={styles.subform} onSubmit={e=>receiveFactory(e,o.id)}>
            <h4>工厂成品入库 · {o.production_order_number}</h4>
            <p className={styles.hint}>完工 {o.planned_quantity} 台 · 已实收 {already} 台 · 待入库 {remain} 台</p>
            <div className={styles.fields}>
              <label>工厂仓库库位<select name="location" required defaultValue=""><option value="">选择关联工厂的国内仓库</option>{locations.map(l=><option key={l.id} value={l.id}>{warehouseFor(l.id)?.name} / {l.code}</option>)}</select></label>
              <label>本次实收数量<input type="number" name="quantity" required min="1" step="1" max={remain} defaultValue={remain||undefined}/></label>
              <label>验收凭证 / 备注<input name="note" placeholder="工厂出厂清点单号"/></label>
            </div><button className={styles.primary} disabled={busy||remain===0||locations.length===0}>确认实际成品入库</button>
            {locations.length===0?<p className={styles.hint}>请先在仓库设置中建立「工厂合作方关联的中国仓库」及其库位。</p>:null}
          </form>;
        })}
                {selected.status==='CONFIRMED'||selected.status==='PARTIALLY_FULFILLED'||selected.status==='FULFILLED'?<form className={styles.subform} onSubmit={createProduction}>
          <h4>＋ 新增关联生产单</h4><div className={styles.fields}>
            <label>量产配置<select name="buildSpec" required defaultValue=""><option value="">选择已发布配置</option>{facts.engineering.buildSpecs.filter(b=>b.status==='RELEASED'&&poLines.some(l=>l.sku_id===b.sku_id)).map(b=><option key={b.id} value={b.id}>{b.code}</option>)}</select></label>
            <label>生产工厂<select name="factory" required defaultValue={factoryPartners.some(p=>p.id===selected.supplier_partner_id)?selected.supplier_partner_id:''}><option value="">选择工厂</option>{factoryPartners.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label>
            <label>生产数量<input type="number" name="quantity" min="1" max={Math.max(0,ordered-productionOrders.reduce((s,o)=>s+n(o.planned_quantity),0))} required/></label>
            <label>计划开工<input type="date" name="startDate" defaultValue={yyyyMmDd(0)}/></label>
            <label>预计完工<input type="date" name="completionDate" defaultValue={poLines[0]?.requested_date??yyyyMmDd(90)}/></label>
          </div><div className={styles.actions}><button className={styles.primary} disabled={busy||!available('engineering')}>建立生产单</button></div>
        </form>:<p className={styles.hint}>采购单经工厂确认后才能创建关联生产单。</p>}
        <p className={styles.hint}>实车组装及逐车质检仍以生产域真实记录为准；不能直接将计划数量当作已完工数量。</p>
      </div>:null}
      {selectedStep==='shipping'?<div className={styles.content}>
        <div className={styles.panelHead}><h3>分批发运与实际费用</h3><span>发运关联采购单号，不重复建商品</span></div>
        <div className={styles.scroll}><table><thead><tr><th>运单</th><th>目的仓库</th><th>运输方式</th><th>货物数量</th><th>物流状态</th><th>操作</th></tr></thead>
          <tbody>{shipments.map(s=><tr key={s.id}><td><button type="button" onClick={()=>setFocusedShipmentId(s.id)}>{s.shipment_number}</button></td><td>{s.destination_warehouse_name??'—'}</td><td>{s.transport_mode}</td><td>{shipmentCargo.filter(c=>c.shipment_id===s.id).reduce((a,c)=>a+n(c.quantity),0)}</td><td>{label(s.status)}</td><td>
            {s.status==='DRAFT'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/logistics/shipments/${s.id}/release`,{method:'POST',body:'{}'}),'发运单已下达')}>下达发运</button>:null}
            {s.status==='RELEASED'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/logistics/shipments/${s.id}/dispatch`,{method:'POST',body:'{}'}),'已记录真实出库')}>确认出库</button>:null}
            {s.status==='DISPATCHED'?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/logistics/shipments/${s.id}/milestones`,{method:'POST',body:JSON.stringify({eventType:'DEPARTED'})}),'运输事件已记录')}>记录启运</button>:null}
            {['IN_TRANSIT','ARRIVED'].includes(s.status)?<button disabled={busy} onClick={()=>void run(()=>api(`/v1/logistics/shipments/${s.id}/milestones`,{method:'POST',body:JSON.stringify({eventType:s.route_type==='FACTORY_TO_DOMESTIC_WAREHOUSE'?'DELIVERED_WAREHOUSE':'DELIVERED_GERMANY_WAREHOUSE'})}),'已记录仓库签收事件')}>确认已送达</button>:null}
          </td></tr>)}
          {!shipments.length?<tr><td colSpan={6}>尚无关联发运批次。生产和真实工厂库存确认后再发运。</td></tr>:null}</tbody></table></div>
        <form className={styles.subform} onSubmit={createShipment}>
          <h4>＋ 新建发运批次</h4><div className={styles.fields}>
            <label>发货库位<select name="origin" required defaultValue=""><option value="">选择工厂待发库位</option>{facts.warehouse.locations.filter(l=>facts.warehouse.warehouses.some(w=>w.id===l.warehouse_id&&w.partner_id===selected.supplier_partner_id&&w.country_code==='CN'&&w.active)).map(loc=><option key={loc.id} value={loc.id}>{warehouseFor(loc.id)?.name} / {loc.code}</option>)}</select></label>
            <label>目的仓库 / 库位<select name="destination" required defaultValue=""><option value="">选择国内仓或德国仓</option>{facts.warehouse.locations.filter(l=>['CN','DE'].includes(warehouseFor(l.id)?.country_code??'')).map(loc=><option key={loc.id} value={loc.id}>{warehouseFor(loc.id)?.name} / {loc.code}</option>)}</select></label>
            <label>运输方式<select name="mode" defaultValue="SEA"><option value="SEA">海运</option><option value="ROAD">陆运</option><option value="RAIL">铁路</option><option value="AIR">空运</option><option value="MULTIMODAL">多式联运</option></select></label>
            <label>预计发货<input type="date" name="etd"/></label>
            <label>预计到仓<input type="date" name="eta"/></label>
          </div><div className={styles.actions}><button className={styles.primary} disabled={busy||!available('warehouse')}>创建发运批次</button></div>
        </form>
        {focus&&focus.status==='DRAFT'?<form className={styles.subform} onSubmit={e=>{
          e.preventDefault();const f=new FormData(e.currentTarget);const id=String(f.get('sku')??'');const qty=Number(f.get('quantity'));const stock=facts.inventory.balances.filter(b=>b.location_id===focus.origin_location_id&&b.sku_id===id).reduce((s,b)=>s+n(b.available),0);
          if(!Number.isInteger(qty)||qty<=0||qty>stock){setMessage('工厂库位可用数量不足；不得凭生产计划虚构在库库存');return;}
          void run(()=>api(`/v1/logistics/shipments/${focus.id}/cargo`,{method:'POST',body:JSON.stringify({itemKind:'SKU',itemId:id,quantity:qty})}),'已预留真实库存到发运批次');
        }}>
          <h4>分配货物 · {focus.shipment_number}</h4><div className={styles.fields}>
            <label>采购 SKU<select name="sku" required defaultValue=""><option value="">选择货物</option>{poLines.filter(l=>l.sku_id).map(l=><option key={l.id} value={l.sku_id!}>{l.sku}</option>)}</select></label>
            <label>本批数量<input name="quantity" type="number" min="1" step="1" required/></label>
          </div><div className={styles.actions}><button className={styles.primary} disabled={busy||!available('inventory')}>分配工厂在库货物</button></div>
          <p className={styles.hint}>必须先通过真实工厂成品入库记录形成可用库存，然后才能发运；发运后会扣除发货库位库存。</p>
        </form>:null}
        <div className={styles.divider}/>
        <h3>运费、关税和清关费用</h3>
        {shipments.length>0?<div className={styles.fields}><label>费用关联批次<select value={focus?.id??''} onChange={e=>setFocusedShipmentId(e.target.value)}>{shipments.map(s=><option key={s.id} value={s.id}>{s.shipment_number}</option>)}</select></label></div>:null}
        {focus&&!(linkedBatches.some(b=>b.shipment_id===focus.id))?<form className={styles.subform} onSubmit={createBatch}>
          <input type="hidden" name="shipment" value={focus.id}/><div className={styles.fields}><label>结算币种<select name="currency" defaultValue={selected.currency}><option>CNY</option><option>EUR</option><option>USD</option></select></label></div>
          <button disabled={busy||!available('finance')}>为本批次建立费用记录</button>
        </form>:null}
        {focus&&linkedBatches.filter(b=>b.shipment_id===focus.id).map(batch=><div key={batch.id}>
          <p>费用单 {batch.id.slice(0,8)} · {batch.status==='FINALIZED'?'已结算':'待结算'} · 总费用 {amount(linkedCosts.filter(c=>c.batch_id===batch.id).reduce((x,c)=>x+n(c.batch_currency_amount),0),batch.currency)}</p>
          {batch.status==='DRAFT'?<form className={styles.subform} onSubmit={addCost}>
            <input name="batch" type="hidden" value={batch.id}/>
            <div className={styles.fields}>
              <label>费用类型<select name="category"><option value="FREIGHT">运费</option><option value="INSURANCE">保险费</option><option value="DUTY">关税</option><option value="OPERATIONAL_FEE">清关费 / 操作费</option><option value="IMPORT_VAT">进口增值税（不计成本）</option><option value="OTHER">其他费用</option></select></label>
              <label>实际费用（{batch.currency}）<input type="number" name="amount" min="0" step="0.01" required/></label>
              <label>费用凭证<input name="note" placeholder="物流账单 / 清关票据"/></label>
            </div><button disabled={busy}>录入并按 SKU 数量分摊</button>
          </form>:null}
          <div className={styles.scroll}><table><thead><tr><th>货物 / SKU</th><th>发货数量</th><th>累计成本分摊</th><th>单件成本增量</th></tr></thead><tbody>
            {shipmentCargo.filter(c=>c.shipment_id===batch.shipment_id).map(c=>{
              const sum=(facts.finance.landedAllocations??[]).filter(a=>a.cargo_id===c.id&&linkedCosts.some(t=>t.id===a.component_id&&t.batch_id===batch.id&&t.category!=='IMPORT_VAT')).reduce((x,a)=>x+n(a.allocated_amount),0);
              return <tr key={c.id}><td>{c.sku??c.id.slice(0,8)}</td><td>{c.quantity}</td><td>{amount(sum,batch.currency)}</td><td>{n(c.quantity)>0?amount(sum/n(c.quantity),batch.currency):'—'}</td></tr>;
            })}
          </tbody></table></div>
          {batch.status==='DRAFT'&&linkedCosts.some(c=>c.batch_id===batch.id)?<button disabled={busy} onClick={()=>{
            if(window.confirm('已收齐本次运输实际费用凭证？结算后不可继续添加费用。'))void run(()=>api(`/v1/finance/landed-cost/${batch.id}/finalize`,{method:'POST',body:'{}'}),'实际费用已完成结算。');
          }}>确认本批费用结算</button>:null}
        </div>)}
        <p className={styles.hint}>物流询价接口仍未接通，当前不显示虚构的预估价；实际费用统一写入现有财务到岸成本域。不同币种需先办理汇率核算。</p>
      </div>:null}
      {selectedStep==='receipt'?<div className={styles.content}>
        <div className={styles.panelHead}><h3>仓库实际入库</h3><span>累计入库 {received} / {ordered}</span></div>
        <div className={styles.scroll}><table><thead><tr><th>批次</th><th>目的仓</th><th>SKU</th><th>应收</th><th>已收</th><th>待收</th><th>本次实收入库</th></tr></thead><tbody>
          {shipmentCargo.map(c=>{
            const sh=shipments.find(x=>x.id===c.shipment_id);
            if(!sh)return null;
            const done=cargoReceived(c.id),pending=n(c.quantity)-done;
            return <tr key={c.id}><td>{sh.shipment_number}</td><td>{warehouseFor(sh.destination_location_id)?.name??'—'}</td><td>{c.sku??'整车'}</td><td>{c.quantity}</td><td>{done}</td><td>{pending}</td>
              <td>{sh.status==='DELIVERED'&&pending>0&&!sh.inventory_received_at?<form className={styles.actions} onSubmit={e=>receiveCargo(e,sh.id,c.id)}>
                <input aria-label="本次实收数量" name="quantity" type="number" min="1" max={pending} step="1" defaultValue={pending} required style={{width:66}}/>
                <input aria-label="收货凭证及货损备注" name="note" placeholder="签收单号 / 差异" style={{width:150}}/>
                <button disabled={busy}>确认入库</button>
              </form>:pending===0?'已入库':'等待真实签收'}</td></tr>;
          })}
          {!shipmentCargo.length?<tr><td colSpan={7}>暂无可入库的发运货物</td></tr>:null}
        </tbody></table></div>
        <p className={styles.hint}>只确认已取得真实签收凭证且数量一致的发运批次。第三方海外仓须先核验其 WMS 回执；数量短少、破损时只录合格实收数量，未收货物不计库存。</p>
      </div>:null}
    </section>:<p className={styles.warning}>当前单据未在已授权的采购数据中找到。请返回列表核验，不要重复建单。</p>}
  </div>;
}
