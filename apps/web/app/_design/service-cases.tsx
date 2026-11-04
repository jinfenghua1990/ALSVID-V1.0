'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import styles from './admin-records.module.css';
import { adminRecordHref, queryRecordId } from './record-links';

type CaseStatus = 'NEW'|'TRIAGED'|'IN_PROGRESS'|'RESOLVED'|'CLOSED';
type CaseCategory = 'ISSUE'|'WARRANTY_REVIEW'|'REPAIR_REQUEST';
type CaseSource = 'OWNER'|'INTERNAL';
type CaseRow = {
 id:string;caseNumber:string;vehicleId:string;frameNumber:string;sku:string;
 title:string;description:string;category:CaseCategory;status:CaseStatus;source:CaseSource;version:number;
 createdAt:string;updatedAt:string;
};
type ActivityKind = 'DIAGNOSIS'|'REPAIR_NOTE'|'WARRANTY_ASSESSMENT';
type Assessment = 'EVIDENCE_REQUIRED'|'POSSIBLY_COVERED'|'POSSIBLY_EXCLUDED';
type ActivityRow = {id:string;kind:ActivityKind;note:string;laborMinutes:number|null;assessment:Assessment|null;actorUserId:string;occurredAt:string};
type CaseDetail = {case:CaseRow;history:HistoryRow[];activities:ActivityRow[]};
type VehicleRow = { id:string;frame_number:string;sku:string };
type HistoryRow = { id:string;caseVersion:number;fromStatus:CaseStatus|null;toStatus:CaseStatus;reason:string;occurredAt:string;actorUserId:string };
const states:Record<CaseStatus,string> = { NEW:'待受理',TRIAGED:'已分诊',IN_PROGRESS:'处理中',RESOLVED:'已解决（待确认）',CLOSED:'已关闭' };
const categories:Record<CaseCategory,string> = {ISSUE:'车辆问题',WARRANTY_REVIEW:'保修待审核',REPAIR_REQUEST:'维修申请'};
const sources:Record<CaseSource,string> = {OWNER:'车主报修',INTERNAL:'内部登记'};
const nextStatus:Record<CaseStatus,CaseStatus[]> = {NEW:['TRIAGED'],TRIAGED:['IN_PROGRESS'],IN_PROGRESS:['RESOLVED'],RESOLVED:['IN_PROGRESS','CLOSED'],CLOSED:[]};

async function api<T>(path:string,method='GET',body?:unknown):Promise<T> {
 const response=await fetch('/api/control'+path,{
  method,
  cache:'no-store',
  ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),
 });
 const payload:unknown=await response.json().catch(()=>null);
 if(!response.ok){
  const message=payload&&typeof payload==='object'&&'message' in payload && typeof payload.message==='string'?payload.message:'请求未成功';
  if(response.status===403)throw new Error('当前账号没有售后权限；'+message);
  if(response.status===401)throw new Error('登录已过期，请重新登录');
  if(response.status===409)throw new Error('工单状态已变化，请刷新后重试；'+message);
  throw new Error(message);
 }
 if(!payload||typeof payload!=='object'||!('data' in payload))throw new Error('业务接口返回格式异常');
 return payload.data as T;
}

function occurred(value:string){const n=Date.parse(value);return Number.isNaN(n)?'—':new Date(n).toLocaleString('zh-CN',{hour12:false});}

export function ServiceCaseClient() {
 const [cases,setCases]=useState<CaseRow[]>([]);
 const [queueFilter,setQueueFilter]=useState<'ALL'|'NEW'|'TRIAGED'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'>('ALL');
 const [sourceFilter,setSourceFilter]=useState<'ALL'|'OWNER'|'INTERNAL'>('ALL');
 const [caseQuery,setCaseQuery]=useState('');
 const filteredCases=cases.filter(c=>(queueFilter==='ALL'||c.status===queueFilter)
  &&(sourceFilter==='ALL'||(c.source??'INTERNAL')===sourceFilter)
  &&[c.caseNumber,c.frameNumber,c.sku,c.title].some(v=>v.toLowerCase().includes(caseQuery.trim().toLowerCase())));
 const queueCounts=Object.fromEntries((['NEW','TRIAGED','IN_PROGRESS','RESOLVED','CLOSED'] as CaseStatus[]).map(key=>[key,cases.filter(c=>c.status===key).length])) as Record<CaseStatus,number>;
 const [vehicles,setVehicles]=useState<VehicleRow[]>([]);
 const [intakeVehicleId,setIntakeVehicleId]=useState('');
 const [requestedCaseId,setRequestedCaseId]=useState<string|null>(null);
 const [selected,setSelected]=useState('');
 const [detail,setDetail]=useState<CaseDetail|null>(null);
 const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [message,setMessage]=useState('');
 const [actionMessage,setActionMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [reason,setReason]=useState('');
 const [target,setTarget]=useState<CaseStatus>('TRIAGED');
 const [readAt,setReadAt]=useState('');
 const [activityKind,setActivityKind]=useState<ActivityKind>('DIAGNOSIS');
 const retryActivity=useRef<{fingerprint:string;requestId:string}|null>(null);

 async function reload() {
  setStatus('loading');setMessage('');
  try {
   const [rows,vehicleRows]=await Promise.all([api<CaseRow[]>('/v1/service/cases'),api<VehicleRow[]>('/v1/vehicles')]);
   if(!Array.isArray(rows)||!Array.isArray(vehicleRows))throw new Error('接口未返回可用的记录列表');
   setCases(rows);setVehicles(vehicleRows);setStatus('ready');
   setReadAt(new Date().toLocaleString('zh-CN',{hour12:false}));
  }catch(error){setStatus('error');setMessage(error instanceof Error?error.message:'读取失败');}
 }
 useEffect(()=>{
  // Deep links only focus/prepare records; they never trigger a business mutation.
  const caseId=queryRecordId('caseId');
  const vehicleId=queryRecordId('vehicleId');
  setRequestedCaseId(caseId);
  if(caseId)setSelected(caseId);
  if(vehicleId)setIntakeVehicleId(vehicleId);
  void reload();
 },[]);
 useEffect(()=>{
  if(!selected){setDetail(null);return;}
  let active=true;setDetail(null);setMessage('');
  void api<CaseDetail>('/v1/service/cases/'+encodeURIComponent(selected))
    .then(data=>{if(active){setDetail(data);setTarget(nextStatus[data.case.status][0]??'TRIAGED');setReason('');}})
    .catch(error=>{if(active)setMessage(error instanceof Error?error.message:'读取工单明细失败');});
  return()=>{active=false;};
 },[selected]);

 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  const formElement=event.currentTarget;
  const form=new FormData(formElement);
  const vehicleId=String(form.get('vehicleId')??'');
  const category=String(form.get('category')??'ISSUE') as CaseCategory;
  const title=String(form.get('title')??'').trim();
  const description=String(form.get('description')??'').trim();
  if(!vehicleId||title.length<5){setActionMessage('必须选择已经出生的车辆，问题标题不少于五个字');return;}
  setBusy(true);setActionMessage('');
  try {
   const created=await api<CaseRow>('/v1/service/cases','POST',{vehicleId,category,title,description});
   setActionMessage('已保存真实工单 '+created.caseNumber);
   formElement.reset();setIntakeVehicleId('');
   await reload();setSelected(created.id);
   window.history.replaceState(null,'',adminRecordHref('service',created.id));
  }catch(error){setActionMessage(error instanceof Error?error.message:'工单创建失败');}
  finally{setBusy(false);}
 }

 async function changeStatus(){
  if(!detail||!reason.trim()||busy)return;
  setBusy(true);setActionMessage('');
  try {
   await api('/v1/service/cases/'+encodeURIComponent(detail.case.id)+'/transition','POST',{
    expectedVersion:detail.case.version,toStatus:target,reason:reason.trim(),
   });
   const refreshed=await api<CaseDetail>('/v1/service/cases/'+encodeURIComponent(detail.case.id));
   setDetail(refreshed);setCases(current=>current.map(c=>c.id===refreshed.case.id?refreshed.case:c));
   setTarget(nextStatus[refreshed.case.status][0]??'TRIAGED');setReason('');
   setActionMessage('状态更新已保存到历史与审计');
  }catch(error){setActionMessage(error instanceof Error?error.message:'状态更新失败');}
  finally{setBusy(false);}
 }


 async function recordActivity(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!detail||busy)return;
  const formElement=event.currentTarget;
  const data=new FormData(formElement);
  const note=String(data.get('activityNote')??'').trim();
  const kind=activityKind;
  const assessment=kind==='WARRANTY_ASSESSMENT'?String(data.get('assessment')??'') as Assessment:undefined;
  const laborMinutes=kind==='REPAIR_NOTE'?Number(data.get('laborMinutes')):undefined;
  if(note.length<10||note.length>3000){setActionMessage('说明需要 10 至 3000 字符');return;}
  const payload={kind,note,...(assessment?{assessment}:{}),...(laborMinutes!==undefined?{laborMinutes}:{})};
  const fingerprint=JSON.stringify([detail.case.id,payload]);
  const requestId=retryActivity.current?.fingerprint===fingerprint?retryActivity.current.requestId:crypto.randomUUID();
  retryActivity.current={fingerprint,requestId};
  setBusy(true);setActionMessage('');
  try{
   await api('/v1/service/cases/'+encodeURIComponent(detail.case.id)+'/activities','POST',{...payload,clientRequestId:requestId});
   const refreshed=await api<CaseDetail>('/v1/service/cases/'+encodeURIComponent(detail.case.id));
   setDetail(refreshed);retryActivity.current=null;
   formElement.reset();setActivityKind('DIAGNOSIS');
   setActionMessage('已保存处理证据及审计记录');
  }catch(error){setActionMessage(error instanceof Error?error.message:'提交失败；原表单已保留可重试');}
  finally{setBusy(false);}
 }

 return <div className={styles.stack}>
  <section className="av-card">
   <div className={styles.heading}>
    <div>
     <h2 className="av-cardtitle">售后工单 · 真实操作</h2>
     <p className={styles.muted}>仅 ALSVID 内部授权员工可操作；不自动判定保修、不发起配件扣减、不关联未经验证的客户所有权。</p>
    </div>
    <button type="button" className="av-btn" disabled={busy||status==='loading'} onClick={()=>{void reload();}}>刷新工单</button>
   </div>
   <p className={styles.muted}>最近读取：{readAt||'尚未读取'}；最多展示最新 200 条工单。</p>
   {status==='ready'?<div className={styles.stack}>
    <div className="av-pageactions" role="group" aria-label="售后工单状态筛选">
     {([['ALL','全部'],['NEW','待受理'],['TRIAGED','已分诊'],['IN_PROGRESS','处理中'],['RESOLVED','待确认'],['CLOSED','已关闭']] as const).map(([key,label])=><button key={key} type="button" className="av-btn" aria-pressed={queueFilter===key} onClick={()=>setQueueFilter(key)}>{label} · {key==='ALL'?cases.length:queueCounts[key]}</button>)}
    </div>
    <label>搜索工单号、车架号、SKU 或标题<input className={styles.search} type="search" value={caseQuery} onChange={event=>setCaseQuery(event.target.value)} placeholder="筛选当前已读取的真实工单" /></label>
    <label>来源
     <select className={styles.search} value={sourceFilter} onChange={event=>setSourceFilter(event.target.value as 'ALL'|'OWNER'|'INTERNAL')}>
      <option value="ALL">全部来源</option>
      <option value="OWNER">车主报修</option>
      <option value="INTERNAL">内部登记</option>
     </select>
    </label>
    <p className={styles.muted}>当前显示 {filteredCases.length} / {cases.length} 条；仅筛选已读取记录，未接入负责人及 SLA 时不展示虚构的待分配或超时数量。</p>
   </div>:null}
   {status==='loading'?<p role="status">正在读取真实售后记录…</p>:status==='error'?<p role="alert" className={styles.error}>{message}（不能将失败视作 0 条）</p>:<>
    {filteredCases.length?<div className={styles.tableScroll}>
     <table className={styles.table}>
      <thead><tr><th>工单号</th><th>车辆</th><th>分类 / 标题</th><th>来源</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>{filteredCases.map(c=><tr key={c.id}>
       <td><a href={adminRecordHref('service',c.id)}>{c.caseNumber}</a></td><td><a href={adminRecordHref('vehicle',c.vehicleId)}>{c.frameNumber}</a> · {c.sku}</td><td>{categories[c.category]} · {c.title}</td>
       <td><span className={styles.tag}>{sources[c.source??'INTERNAL']}</span></td>
       <td>{states[c.status]}</td><td><a href={adminRecordHref('service',c.id)} className={styles.linkButton}>查看 / 处理</a></td>
      </tr>)}</tbody>
     </table>
    </div>:<p className={styles.notice}>{cases.length?'当前筛选无匹配工单':'没有已保存的真实售后工单'}</p>}
   </>}
  </section>

  <section className="av-card">
   <h2 className="av-cardtitle">创建售后受理记录</h2>
   <p className={styles.muted}>必须先通过真实生产和质检生成 Vehicle 记录。此入口只创建内部问题记录，保修范围需要后续人工审核。</p>
   {intakeVehicleId&&status==='ready'&&!vehicles.some(v=>v.id===intakeVehicleId)?<p className={styles.error} role="alert">链接指定的车辆不在当前授权列表中；不能自动填入其他车辆。<a href="/admin/production">查看车辆登记</a></p>:null}
   <form onSubmit={event=>{void submit(event);}} className={styles.stack}>
    <label>关联车辆（车架号 / SKU）
     <select name="vehicleId" required disabled={busy||status!=='ready'} className={styles.search} value={intakeVehicleId} onChange={event=>setIntakeVehicleId(event.target.value)}>
      <option value="">请选择真实车辆</option>
      {vehicles.map(v=><option key={v.id} value={v.id}>{v.frame_number} · {v.sku}</option>)}
     </select>
    </label>
    <label>业务分类
     <select name="category" className={styles.search} defaultValue="ISSUE">
      <option value="ISSUE">车辆问题</option><option value="WARRANTY_REVIEW">保修待审核</option><option value="REPAIR_REQUEST">维修申请</option>
     </select>
    </label>
    <label>问题标题<input name="title" minLength={5} maxLength={160} required className={styles.search} placeholder="例如：刹车异响需要检查" /></label>
    <label>情况说明<textarea name="description" maxLength={4000} rows={3} className={styles.search} placeholder="记录问题现象，不填写不必要的个人隐私" /></label>
    <div><button className="av-btn" type="submit" disabled={busy||status!=='ready'||!vehicles.length}>{busy?'保存中…':'创建工单并保存'}</button></div>
   </form>
  </section>

  {selected?<section className="av-card">
   <div className={styles.heading}><h2 className="av-cardtitle">工单详情与处理记录</h2>
    <button className="av-btn" type="button" onClick={()=>setSelected('')}>关闭详情</button></div>
   {message?<p role="alert" className={styles.error}>{message}</p>:null}
   {requestedCaseId&&status==='ready'&&!cases.some(row=>row.id===requestedCaseId)?<p role="status" className={styles.notice}>此链接定位的工单未出现在最近 200 条列表中；正在通过工单 ID 查询详情，若无权限或不存在将显示错误。</p>:null}
   {!detail?<p>正在读取详情…</p>:<>
    <p><strong>{detail.case.caseNumber}</strong> · <a href={adminRecordHref('vehicle',detail.case.vehicleId)}>{detail.case.frameNumber}（查看车辆）</a> · <span className={styles.tag}>{sources[detail.case.source??'INTERNAL']}</span> · {states[detail.case.status]} · 版本 {detail.case.version}</p>
    <p><a href={adminRecordHref('service',detail.case.id)}>复制 / 打开此工单专属链接 →</a></p>
    <p>{detail.case.title}</p><p className={styles.muted}>{detail.case.description||'没有额外说明'}</p>
    {nextStatus[detail.case.status].length?<div className={styles.stack}>
     <label>下一业务状态<select className={styles.search} value={target} onChange={event=>setTarget(event.target.value as CaseStatus)}>
      {nextStatus[detail.case.status].map(state=><option key={state} value={state}>{states[state]}</option>)}
     </select></label>
     <label>处理原因（必填）<textarea className={styles.search} minLength={3} maxLength={1000} rows={2} required value={reason} onChange={event=>setReason(event.target.value)} /></label>
     <div><button className="av-btn" type="button" disabled={busy||reason.trim().length<3} onClick={()=>{void changeStatus();}}>保存处理结果</button></div>
    </div>:<p className={styles.notice}>工单已关闭；不能再执行其他状态变更。</p>}

    <h3>诊断、维修和保修初步评估</h3>
    <p className={styles.muted}>内部事实记录并非最终保修资格判定；不自动建立车主归属、费用、配件领用或库存扣减。</p>
    {['TRIAGED','IN_PROGRESS'].includes(detail.case.status)?<form className={styles.stack} onSubmit={event=>{void recordActivity(event);}}>
     <label>记录类型<select className={styles.search} value={activityKind} disabled={busy} onChange={event=>setActivityKind(event.target.value as ActivityKind)}>
      <option value="DIAGNOSIS">诊断与现场检查</option>
      {detail.case.status==='IN_PROGRESS'?<option value="REPAIR_NOTE">维修过程与工时</option>:null}
      <option value="WARRANTY_ASSESSMENT">保修初审意见（非最终批准）</option>
     </select></label>
     {activityKind==='REPAIR_NOTE'?<label>实际工作分钟（不产生应付费用）
      <input className={styles.search} type="number" min={0} max={1440} step={1} name="laborMinutes" defaultValue={0} required />
     </label>:null}
     {activityKind==='WARRANTY_ASSESSMENT'?<label>初审意见（不代表保修资格或法律承诺）
      <select className={styles.search} name="assessment" defaultValue="EVIDENCE_REQUIRED" required>
       <option value="EVIDENCE_REQUIRED">缺少证据，需要进一步核验</option>
       <option value="POSSIBLY_COVERED">可能符合保修范围（初审）</option>
       <option value="POSSIBLY_EXCLUDED">可能不符合保修范围（初审）</option>
      </select></label>:null}
     <label>记录实际证据（至少 10 字符）
      <textarea className={styles.search} rows={3} name="activityNote" minLength={10} maxLength={3000} required
       placeholder="填写检查结论、维修动作或审核依据，不包含无关个人信息" />
     </label>
     <div><button type="submit" className="av-btn" disabled={busy}>{busy?'保存中…':'保存处理证据'}</button></div>
    </form>:<p className={styles.notice}>仅已分诊或处理中的工单允许新增证据；待受理、已解决和已关闭均不允许。</p>}
    <div className={styles.tableScroll}><table className={styles.table}>
     <thead><tr><th>时间与类型</th><th>记录内容</th><th>审核意见 / 工时</th><th>操作者 ID</th></tr></thead>
     <tbody>{(detail.activities??[]).map(item=><tr key={item.id}>
      <td>{occurred(item.occurredAt)} · {item.kind==='DIAGNOSIS'?'诊断':item.kind==='REPAIR_NOTE'?'维修':'保修初审'}</td>
      <td>{item.note}</td>
      <td>{item.kind==='REPAIR_NOTE'?String(item.laborMinutes??0)+' 分钟':
       item.assessment==='EVIDENCE_REQUIRED'?'待补证':
       item.assessment==='POSSIBLY_COVERED'?'可能保内':
       item.assessment==='POSSIBLY_EXCLUDED'?'可能保外':'—'}</td>
      <td>{item.actorUserId}</td>
     </tr>)}</tbody>
    </table></div>
    {!(detail.activities??[]).length?<p className={styles.notice}>暂无真实诊断、维修或保修初审记录。</p>:null}
    <h3>不可变处理历史</h3>
    <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>版本 / 时间</th><th>状态</th><th>原因</th><th>操作者 ID</th></tr></thead>
     <tbody>{detail.history.map(h=><tr key={h.id}><td>v{h.caseVersion} · {occurred(h.occurredAt)}</td><td>{h.fromStatus?states[h.fromStatus]+' → ':''}{states[h.toStatus]}</td><td>{h.reason}</td><td>{h.actorUserId}</td></tr>)}</tbody>
    </table></div>
   </>}
  </section>:null}
  {actionMessage?<p className={actionMessage.startsWith('已')||actionMessage.startsWith('状态更新')?styles.notice:styles.error} role="status">{actionMessage}</p>:null}
 </div>;
}
