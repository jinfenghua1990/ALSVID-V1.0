import Link from 'next/link';
import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../_lib/portal-access';
import { navigationFor } from '../_design/admin-navigation';
import styles from './vehicle360.module.css';

const steps = [
  { name: '生产', detail: '生产完成后形成车辆身份' },
  { name: '质检', detail: '记录人工质检与报告' },
  { name: '入库', detail: '记录仓库接收事实' },
  { name: '出货', detail: '关联物流与出库信息' },
  { name: '经销商', detail: '记录渠道交付事实' },
  { name: '客户', detail: '完成客户 / 所有权关联' },
  { name: '售后', detail: '按反馈形成维修记录' },
] as const;

export default async function Vehicle360Page() {
  await requireInternalPreviewSession();
  return (
    <AppShell navigation={navigationFor('/vehicle360')} footer="ALSVID · Vehicle 360">
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>VEHICLE 360</p>
          <h1>每一台车，都有完整的业务档案。</h1>
          <p>Vehicle 360 用于追踪一台 ALSVID 自行车从生产、质检、出货、经销商交付到客户与售后的完整事实。车辆当前不联网，因此不展示 GPS、电池健康、OTA 或任何虚构的实时状态。</p>
        </div>
        <div className={styles.heroMeta}>
          <span>追踪范围</span>
          <strong>生产 → 售后</strong>
          <span>数据来源</span>
          <strong>人工录入 / 业务系统事实</strong>
        </div>
      </section>

      <div className={styles.toolbar}>
        <label className={`${styles.search} ${styles.searchDisabled}`} title="车辆搜索将在真实车辆档案查询接口接入后启用">
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="车辆搜索待接入" aria-label="车辆搜索待接入" disabled />
        </label>
        <Link className={styles.action} href="/production">录入车辆流程</Link>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>全流程追踪</h2>
          <p>只有发生过的业务事实才会进入时间线。</p>
        </div>
        <div className={styles.lifecycle}>
          {steps.map((step, index) => (
            <article className={styles.step} key={step.name}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step.name}</strong>
              <small>{step.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.grid}`}>
        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <h3>车辆档案</h3>
            <span>VIN / 车架号</span>
          </header>
          <div className={styles.empty}>
            <strong>暂无车辆档案</strong>
            <p>录入或同步真实车辆身份后，这里显示车型、生产批次、供应商、交付与所有权信息。</p>
            <Link href="/production">进入生产 / 质检 →</Link>
          </div>
        </article>

        <article className={styles.panel}>
          <header className={styles.panelHead}>
            <h3>售后记录</h3>
            <span>客户 / 经销商反馈</span>
          </header>
          <div className={styles.empty}>
            <strong>暂无售后记录</strong>
            <p>客户或经销商发生真实反馈后再形成记录；没有反馈时保持空置。</p>
          </div>
        </article>
      </section>

      <aside className={styles.scope}>
        <b>i</b>
        <p>Vehicle 360 当前是“全流程业务追踪”，不是联网车辆数字孪生。未来如果车辆增加 GPS、BMS、智能锁或 OTA，再在现有车辆档案上增加对应数据域，不需要推翻现在的结构。</p>
      </aside>
    </AppShell>
  );
}
