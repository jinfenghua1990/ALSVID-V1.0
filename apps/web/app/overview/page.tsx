import { requireInternalPreviewSession } from '../_lib/portal-access';
import { AppShell } from '@alsvid/ui';
import { navigationFor } from '../_design/admin-navigation';
import styles from './overview.module.css';

/** 数据分析分区（对齐顶部导航「数据」模块锚点） */
const analysisPanels = [
  {
    id: 'sales',
    index: '01',
    title: '销售分析',
    desc: '经销商订单结构、渠道与区域表现、订单履约时效',
    sources: 'commerce · dealers · logistics',
  },
  {
    id: 'operations',
    index: '02',
    title: '生产与库存分析',
    desc: '产量与质检合格率、在制进度、库存周转与预警',
    sources: 'production · inventory · warehouse',
  },
  {
    id: 'service',
    index: '03',
    title: '售后与经销商分析',
    desc: '保修工单与维修时效、配件消耗、经销商活跃度',
    sources: 'after-sales · dealers · customers',
  },
] as const;

export default async function OverviewPage() {
  await requireInternalPreviewSession();
  return (
    <AppShell navigation={navigationFor('/overview')} footer="ALSVID 内部管理后台" workspaceId="overview">
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>ALSVID / DATA &amp; REPORTS</p>
            <h1>数据分析与运营报表</h1>
          </div>
          <a className={styles.portalLink} href="/admin"><span className={styles.portalDot} />返回工作台</a>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p>这里汇总销售、生产库存、售后与经销商的经营数据。所有图表在对应业务数据接入后自动生成，当前不填充演示数字。</p>
            <div className={styles.heroMeta}><span>数据接入后点亮</span><span>无模拟数据</span><span>与业务模块同源</span></div>
          </div>
          <div className={styles.flowCard}>
            <span>DATA SOURCES</span>
            <div className={styles.flow}>业务模块 <b>→</b> 数据汇总 <b>→</b> 运营报表 <b>→</b> 经营决策</div>
          </div>
        </section>

        <div className={styles.sectionHead}>
          <div><span>REPORTS</span><h2>报表分区</h2></div>
          <p>每个分区对应一组业务数据源，接入即展示。</p>
        </div>

        <section className={styles.grid} aria-label="数据分析报表分区">
          {analysisPanels.map((panel) => (
            <article className={styles.card} key={panel.id} id={panel.id}>
              <div className={styles.cardTop}><span>报表分区</span><span className={styles.index}>{panel.index}</span></div>
              <h3>{panel.title}</h3>
              <p>{panel.desc}</p>
              <div className={styles.cardFoot}>
                <div>数据来源：{panel.sources}</div>
                <div>状态：等待数据接入</div>
              </div>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
