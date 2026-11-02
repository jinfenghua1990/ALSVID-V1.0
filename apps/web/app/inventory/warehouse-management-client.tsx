'use client';

import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import styles from './warehouse-management.module.css';

type Warehouse = {
  id:string; code:string; name:string; country_code:string; timezone:string;
  partner_name:string|null; active:boolean;
};
type WarehouseSummary = {warehouses:Warehouse[];locations:unknown[];stocktakes:unknown[];counts:unknown[]};
type Balance = {
  item_kind:'PART'|'SKU'|'VEHICLE'; warehouse_code:string; warehouse_name:string;
  location_code:string; on_hand:string; reserved:string; available:string; unit:string;
  sku:string|null; sku_name:string|null; part_number:string|null; part_name:string|null; frame_number:string|null;
};
type InventorySummary = {balances:Balance[];movements:unknown[];reservations:unknown[]};
type View = 'settings'|'stock';
const kindOf=(country:string)=>country==='CN'?'国内本地仓':'海外仓';
const itemName=(item:Balance)=>item.sku||item.part_number||item.frame_number||'未知对象';
const itemType:Record<Balance['item_kind'],string>={SKU:'商品 SKU',PART:'生产零件',VEHICLE:'整车 VIN'};

async function controlApi<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
  const res=await fetch('/api/control'+path,{method,cache:'no-store',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),...(signal?{signal}:{})});
  const payload=await res.json().catch(()=>null) as {data?:T;message?:string}|null;
  if(!res.ok)throw new Error(res.status===401?'登录状态已失效':res.status===403?'没有仓库或库存访问权限':payload?.message||'仓库接口请求失败');
  if(!payload||!('data' in payload))throw new Error('仓库接口返回的数据格式异常');
  return payload.data as T;
}
export default function WarehouseManagement({view}:{view:View}){
  const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
  const [balances,setBalances]=useState<Balance[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [region,setRegion]=useState<'ALL'|'DOMESTIC'|'OVERSEAS'>('ALL');
  const [selectedCode,setSelectedCode]=useState('ALL');
  const [itemKind,setItemKind]=useState<'ALL'|Balance['item_kind']>('ALL');
  const [draft,setDraft]=useState<'create'|Warehouse|null>(null);
  const [deleting,setDeleting]=useState<Warehouse|null>(null);
  const [confirmationCode,setConfirmationCode]=useState('');
  const [deleteError,setDeleteError]=useState('');
  const [draftRegion,setDraftRegion]=useState<'DOMESTIC'|'OVERSEAS'>('DOMESTIC');
  const [country,setCountry]=useState('CN');
  const [timezone,setTimezone]=useState('Asia/Shanghai');
  const [busy,setBusy]=useState(false);

  const reload=useCallback(async(signal?:AbortSignal):Promise<boolean>=>{
    setStatus('loading');setError('');
    try{
      const w=await controlApi<WarehouseSummary>('/v1/warehouse','GET',undefined,signal);
      if(!w||!Array.isArray(w.warehouses))throw new Error('仓库列表格式异常');
      let nextBalances:Balance[]=[];
      if(view==='stock'){
        const inv=await controlApi<InventorySummary>('/v1/inventory','GET',undefined,signal);
        if(!inv||!Array.isArray(inv.balances))throw new Error('仓库库存格式异常');
        nextBalances=inv.balances;
      }
      if(signal?.aborted)return false;
      setWarehouses(w.warehouses);setBalances(nextBalances);setStatus('ready');
      return true;
    }catch(reason){
      if(signal?.aborted)return false;
      setStatus('error');setError(reason instanceof Error?reason.message:'读取失败');
      setWarehouses([]);setBalances([]);
      return false;
    }
  },[view]);
  useEffect(()=>{const controller=new AbortController();void reload(controller.signal);return()=>controller.abort()},[reload]);

  function openCreate(){
    setDraftRegion('DOMESTIC');setCountry('CN');setTimezone('Asia/Shanghai');setDraft('create');setNotice('');
  }
  function openEdit(w:Warehouse){
    setDraftRegion(w.country_code==='CN'?'DOMESTIC':'OVERSEAS');
    setCountry(w.country_code);setTimezone(w.timezone);setDraft(w);setNotice('');
  }
  function openDelete(w:Warehouse){setDraft(null);setDeleting(w);setConfirmationCode('');setDeleteError('');setNotice('')}
  async function confirmDelete(){
    if(!deleting||busy||confirmationCode.trim()!==deleting.code)return;
    setBusy(true);setDeleteError('');
    try{
      const result=await controlApi<{id:string;code:string;deleted:true}>(
        '/v1/warehouse/warehouses/'+encodeURIComponent(deleting.id),'DELETE',{expectedCode:deleting.code}
      );
      if(!result||result.deleted!==true||result.code!==deleting.code)throw new Error('删除结果异常，请刷新核对仓库');
      const code=deleting.code;setDeleting(null);setConfirmationCode('');
      const verified=await reload();
      setNotice(verified?'仓库 '+code+' 已删除，列表已重新核对。':'删除接口已返回成功，但列表回读失败，请刷新核验仓库 '+code+'。');
    }catch(reason){setDeleteError(reason instanceof Error?reason.message:'仓库删除失败');}
    finally{setBusy(false)}
  }
  function switchRegion(next:'DOMESTIC'|'OVERSEAS'){
    setDraftRegion(next);setCountry(next==='DOMESTIC'?'CN':'DE');
    setTimezone(next==='DOMESTIC'?'Asia/Shanghai':'Europe/Berlin');
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!draft||busy)return;
    const form=new FormData(event.currentTarget);
    const name=String(form.get('name')??'').trim();
    const code=String(form.get('code')??'').trim().toUpperCase();
    const zone=timezone.trim();
    const cc=country.trim().toUpperCase();
    if(!name||!zone){setNotice('仓库名称和时区不能为空');return;}
    if(draft==='create' && (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)||!/^[A-Z]{2}$/.test(cc)||((cc==='CN')!==(draftRegion==='DOMESTIC')))){
      setNotice('请核对仓库编码、两位国家代码及国内/海外类型');return;
    }
    setBusy(true);setNotice('');
    try{
      if(draft==='create'){
        await controlApi('/v1/warehouse/warehouses','POST',{code,name,countryCode:cc,timezone:zone});
      }else{
        await controlApi('/v1/warehouse/warehouses/'+encodeURIComponent(draft.id),'PATCH',{
          name,timezone:zone,expectedName:draft.name,expectedTimezone:draft.timezone
        });
      }
      setDraft(null);
      const verified=await reload();
      setNotice(verified?'仓库档案已保存并重新读取。':'仓库写入已成功，但回读失败，请先刷新核对，不要重复创建。');
    }catch(reason){
      setNotice(reason instanceof Error?reason.message:'保存失败，请重试');
    }finally{setBusy(false)}
  }

  const filteredWarehouses=useMemo(()=>warehouses.filter(w=>
    (region==='ALL'||(region==='DOMESTIC'?w.country_code==='CN':w.country_code!=='CN'))
    &&(!query.trim()||[w.code,w.name,w.country_code,w.partner_name??''].some(value=>value.toLowerCase().includes(query.trim().toLowerCase())))
  ),[warehouses,region,query]);
  const byCode=useMemo(()=>new Map(warehouses.map(w=>[w.code,w])),[warehouses]);
  const filteredBalances=useMemo(()=>balances.filter(row=>{
    const w=byCode.get(row.warehouse_code);
    return (selectedCode==='ALL'||row.warehouse_code===selectedCode)
      &&(region==='ALL'||(region==='DOMESTIC'?w?.country_code==='CN':w&&w.country_code!=='CN'))
      &&(itemKind==='ALL'||row.item_kind===itemKind)
      &&(!query.trim()||[row.warehouse_code,row.warehouse_name,row.location_code,row.sku??'',row.sku_name??'',row.part_number??'',row.part_name??'',row.frame_number??''].some(value=>value.toLowerCase().includes(query.trim().toLowerCase())));
  }),[balances,byCode,selectedCode,region,itemKind,query]);

  return <section className={styles.workspace} aria-label={view==='settings'?'仓库设置':'仓库库存'}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>库存管理 / 仓库档案</p><h1>{view==='settings'?'仓库设置':'仓库库存'}</h1>
        <p>{view==='settings'?'维护仓库主档案；国内/海外仓由仓库所在国家判定，所有仓库共用一个库存系统。':'按真实仓库、库位与 SKU 查看库存台账；这里不创建第二套库存。'}</p></div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.secondary} onClick={()=>void reload()} disabled={status==='loading'||busy}>刷新</button>
        {view==='settings'?<button type="button" className={styles.primary} onClick={openCreate} disabled={status!=='ready'||busy}>＋ 新建仓库</button>:<a className={styles.secondary} href="/admin/inventory/warehouses">仓库设置</a>}
      </div>
    </header>
    {notice?<p className={styles.notice} role="status">{notice}</p>:null}
    {status==='error'?<p className={styles.error} role="alert">数据读取失败：{error}。读取异常不代表仓库或库存为零。</p>:null}
    {status==='loading'?<p className={styles.notice} role="status">正在读取实际{view==='settings'?'仓库档案':'库存台账'}…</p>:null}
    <div className={styles.filters}>
      <label>筛选仓库或商品<input value={query} onChange={e=>setQuery(e.target.value)} placeholder={view==='settings'?'仓库编号 / 名称':'按仓库/SKU / VIN / 库位搜索'} /></label>
      <label>仓库类型<select value={region} onChange={e=>setRegion(e.target.value as typeof region)}>
        <option value="ALL">全部仓库</option><option value="DOMESTIC">国内本地仓</option><option value="OVERSEAS">海外仓</option>
      </select></label>
      {view==='stock'?<><label>所属仓库<select value={selectedCode} onChange={e=>setSelectedCode(e.target.value)}>
        <option value="ALL">全部仓库编号</option>{warehouses.map(w=><option key={w.id} value={w.code}>{w.code} · {w.name}</option>)}
      </select></label><label>库存对象<select value={itemKind} onChange={e=>setItemKind(e.target.value as typeof itemKind)}>
        <option value="ALL">全部类型</option><option value="SKU">商品 SKU</option><option value="PART">生产零件</option><option value="VEHICLE">整车 VIN</option>
      </select></label></>:null}
    </div>
    {status==='ready'&&view==='settings'?<>
      <p className={styles.summary}>当前 {filteredWarehouses.length} 个仓库 · 国内本地仓 {warehouses.filter(w=>w.country_code==='CN').length} 个 · 海外仓 {warehouses.filter(w=>w.country_code!=='CN').length} 个</p>
      <div className={styles.tableWrap}><table aria-label="仓库设置表"><thead><tr><th>仓库编号</th><th>仓库名称</th><th>仓库类型</th><th>国家</th><th>时区</th><th>运营方</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{filteredWarehouses.length?filteredWarehouses.map(w=><tr key={w.id}>
          <td><strong>{w.code}</strong></td><td>{w.name}</td><td>{kindOf(w.country_code)}</td><td>{w.country_code}</td><td>{w.timezone}</td><td>{w.partner_name??'自营 / 未关联'}</td>
          <td>{w.active?'启用':'停用'}</td><td><div className={styles.tableActions}><button type="button" className={styles.rowButton} disabled={busy} onClick={()=>openEdit(w)}>编辑</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={()=>openDelete(w)}>删除</button></div></td>
        </tr>):<tr><td colSpan={8} className={styles.empty}>没有匹配的仓库；可点击“新建仓库”建立真实档案。</td></tr>}</tbody>
      </table></div>
      <p className={styles.footnote}>仅未使用过的空仓可删除；有库存、库存流水、盘点或第三方仓关联时禁止删除。仓库编号、所属国家与仓库类型在建档后保持不变；仓库名称、时区支持编辑。第三方仓 API 与仓库 / SKU 映射通过 <a href="/settings/integrations">系统集成</a> 配置，未配置不会伪装为已连接。</p>
    </>:null}
    {status==='ready'&&view==='stock'?<>
      <p className={styles.summary}>找到 {filteredBalances.length} 条库存位置记录 · 现存 / 预留 / 台账可用均读取统一库存系统</p>
      <div className={styles.tableWrap}><table aria-label="仓库库存表"><thead><tr><th>仓库编号 / 名称</th><th>仓库类型</th><th>库存对象</th><th>商品 / SKU / VIN</th><th>库位</th><th>现存</th><th>预留</th><th>台账可用</th></tr></thead>
        <tbody>{filteredBalances.length?filteredBalances.map((row,i)=>{
          const w=byCode.get(row.warehouse_code);
          return <tr key={[row.item_kind,itemName(row),row.warehouse_code,row.location_code,i].join(':')}>
            <td><strong>{row.warehouse_code}</strong><small>{w?.name??row.warehouse_name}</small></td>
            <td>{w?kindOf(w.country_code):'仓库未登记'}</td><td>{itemType[row.item_kind]}</td>
            <td><strong>{itemName(row)}</strong><small>{row.sku_name??row.part_name??''}</small></td>
            <td>{row.location_code}</td><td>{row.on_hand} {row.unit}</td><td>{row.reserved} {row.unit}</td><td><strong>{row.available} {row.unit}</strong></td>
          </tr>;
        }):<tr><td colSpan={8} className={styles.empty}>当前筛选范围没有库存台账记录；不代表正式商城缺货。</td></tr>}</tbody>
      </table></div>
      <p className={styles.footnote}>仓库台账可用量 ≠ 官网可售库存。官网还须检查上架、市场范围、渠道分配和支付履约条件。<a href="/admin/inventory#movement-history">出入库 / 调拨</a>、<a href="/admin/inventory#stocktake">盘点</a>继续使用原有受控库存流程。</p>
    </>:null}
    {deleting?<div className={styles.overlay} role="presentation" onMouseDown={()=>{if(!busy)setDeleting(null)}}>
      <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-label="二次确认删除仓库" onMouseDown={e=>e.stopPropagation()}
        onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDeleting(null)}}>
        <div className={styles.dialogHead}><div><h2>二次确认删除仓库</h2><p>删除不可撤销，请仔细核对仓库信息。</p></div>
          <button type="button" className={styles.iconButton} disabled={busy} aria-label="关闭" onClick={()=>setDeleting(null)}>×</button></div>
        <p className={styles.deleteTarget}>仓库编号：<strong>{deleting.code}</strong><span>仓库名称：{deleting.name}</span></p>
        <p className={styles.deleteWarning}>如存在库存、库存预留、出入库历史、盘点或第三方仓映射，系统禁止删除。删除空仓不会清空任何库存。</p>
        <label>请再次输入仓库编号 {deleting.code} 以确认
          <input aria-label="再次输入仓库编号" autoFocus autoComplete="off" value={confirmationCode}
            onChange={e=>setConfirmationCode(e.target.value.toUpperCase())} placeholder="输入完整仓库编号" disabled={busy}/>
        </label>
        {deleteError?<p className={styles.error} role="alert">{deleteError}</p>:null}
        <div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={busy} onClick={()=>setDeleting(null)}>取消</button>
          <button type="button" className={styles.dangerPrimary} disabled={busy||confirmationCode.trim()!==deleting.code}
            onClick={()=>void confirmDelete()}>{busy?'核验并删除中…':'确认删除仓库'}</button></div>
      </section>
    </div>:null}
    {draft?<div className={styles.overlay} role="presentation" onMouseDown={()=>{if(!busy)setDraft(null)}}>
      <form key={draft==='create'?'create':draft.id} className={styles.dialog} role="dialog" aria-modal="true" aria-label={draft==='create'?'新建仓库':'编辑仓库'} onSubmit={e=>void save(e)}
        onMouseDown={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'&&!busy)setDraft(null)}}>
        <div className={styles.dialogHead}><div><h2>{draft==='create'?'新建仓库':'编辑仓库'}</h2><p>先建立仓库主档案，不自动生成库存和第三方连接。</p></div><button type="button" className={styles.iconButton} disabled={busy} onClick={()=>setDraft(null)} aria-label="关闭">×</button></div>
        {draft==='create'?<>
          <label>仓库类型<select value={draftRegion} onChange={e=>switchRegion(e.target.value as typeof draftRegion)} disabled={busy}>
            <option value="DOMESTIC">国内本地仓</option><option value="OVERSEAS">海外仓</option>
          </select></label>
          <label>仓库编号<input name="code" required maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,31}" placeholder="CN-SH-01 / DE-BERLIN" disabled={busy}/></label>
        </>:<>
          <label>仓库编号<input value={draft.code} disabled /></label>
          <label>仓库类型<input value={kindOf(draft.country_code)} disabled /></label>
        </>}
        <label>仓库名称<input name="name" defaultValue={draft==='create'?'':draft.name} maxLength={120} required placeholder="例如：上海本地仓" disabled={busy}/></label>
        <label>国家代码（ISO 两位）<input name="countryCode" value={country} onChange={e=>setCountry(e.target.value.toUpperCase())} minLength={2} maxLength={2} pattern="[A-Z]{2}" required disabled={busy||draft!=='create'}/></label>
        <label>时区<input name="timezone" value={timezone} onChange={e=>setTimezone(e.target.value)} required maxLength={100} placeholder="Asia/Shanghai" disabled={busy}/></label>
        <p className={styles.formNote}>{draft==='create'?'可先建立仓库，再配置库位、第三方仓服务商及 SKU 映射。':'仓库编号与国家固定，避免已关联的库存流水失去归属。'}</p>
        <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={()=>setDraft(null)} disabled={busy}>取消</button><button type="submit" className={styles.primary} disabled={busy}>{busy?'保存中…':'保存仓库'}</button></div>
      </form>
    </div>:null}
  </section>;
}
