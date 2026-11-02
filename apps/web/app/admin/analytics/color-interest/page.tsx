import type { Metadata } from 'next';
import { backendFetch } from '../../../api/_lib/backend';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'A1 Ultra 颜色偏好 · ALSVID Admin' };

type Summary = {
  productCode: string;
  total: number;
  lastSelection: string | null;
  colours: { code: string; count: number }[];
  variants: { model: string; colour: string; count: number }[];
};

const palette: Record<string,{name: string;colour: string;availability: string}> = {
  sample: {name:'绿色样车',colour:'#2e5850',availability:'样车展示'},
  black: {name:'石墨黑',colour:'#252c31',availability:'缺货'},
  blue: {name:'深海蓝',colour:'#29546d',availability:'缺货'},
  silver: {name:'月光银',colour:'#b9c5ca',availability:'缺货'},
};

export default async function ColourInterestReport() {
  let report: Summary | null = null;
  let error = '';
  try {
    const response = await backendFetch('/v1/colour-interest/summary');
    if (!response.ok) error = '暂时无法读取偏好统计，请检查管理员登录和 API 状态。';
    else {
      const result: {data: Summary} = await response.json();
      report = result.data;
    }
  } catch {
    error = '暂时无法连接统计服务，未显示虚构数据。';
  }
  const total = report?.total ?? 0;
  const format = new Intl.NumberFormat('zh-CN');
  return (
    <main className={styles.page}>
      <nav className={styles.crumb}><a href="/admin/analytics">← 返回数据总览</a><a href="/admin/product">产品中心</a></nav>
      <div className={styles.head}><span>ALSVID / 产品需求信号</span><h1>A1 Ultra 颜色偏好</h1><p>查看消费者在官网选配页主动保存的颜色与车型。缺货颜色同样计入偏好分析。</p></div>
      {error ? <div role="alert" className={styles.empty}>{error}</div> : <>
        <div className={styles.totals}>
          <div><small>偏好会话数</small><strong>{format.format(total)}</strong></div>
          <div><small>商品型号</small><strong>{report?.productCode ?? 'A1-ULTRA'}</strong></div>
          <div><small>最近一次选择</small><strong className={styles.date}>{report?.lastSelection ? new Date(report.lastSelection).toLocaleString('zh-CN',{timeZone:'Europe/Berlin'}) + '（柏林）' : '暂无记录'}</strong></div>
        </div>
        <section className={styles.panel}>
          <h2>颜色受欢迎程度</h2>
          <p className={styles.hint}>统计同一浏览会话最后选中的颜色；不代表独立客户数、可售库存或订单量。</p>
          {total===0 ? <p className={styles.empty}>尚未收集到真实选择。消费者主动点击保存颜色偏好后，此处才会更新。</p> :
            Object.entries(palette).map(([code, colour])=>{
              const count=report?.colours.find(item=>item.code===code)?.count??0;
              const percent=total?Math.round(100*count/total):0;
              return <div className={styles.ranking} key={code}>
                <div className={styles.rankingTitle}><span className={styles.dot} style={{background:colour.colour}}/><strong>{colour.name}</strong><small>{colour.availability}</small></div>
                <div className={styles.bar}><span style={{width:percent+'%'}}/></div>
                <strong>{format.format(count)} <small>次 · {percent}%</small></strong>
              </div>
            })
          }
        </section>
        <section className={styles.panel}>
          <h2>版本 × 颜色交叉统计</h2>
          <table><thead><tr><th>车型</th><th>颜色</th><th>偏好会话</th></tr></thead><tbody>
            {report?.variants.length ? report.variants.map(x=><tr key={x.model+'-'+x.colour}><td>A1 Ultra {x.model==='pro'?'Pro':'Standard'}</td><td>{palette[x.colour]?.name??x.colour}</td><td>{format.format(x.count)}</td></tr>)
            : <tr><td colSpan={3}>暂无记录</td></tr>}
          </tbody></table>
        </section>
      </>}
      <p className={styles.foot}>仅记录浏览会话的 A1 Ultra 版本、颜色和页面语言；未采集姓名、邮箱或支付资料。数据只用于产品需求判断，不代表购买承诺。</p>
    </main>
  );
}
