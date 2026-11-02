import Link from 'next/link';
import { requirePortalSession } from '../../../_lib/portal-access';
import { OwnerShell } from '../../../_components/owner-shell';
import styles from '../../owner-portal.module.css';

export default async function RegisterVehiclePage() {
  await requirePortalSession('my', '/my/vehicles/register');

  return (
    <OwnerShell activeHref="/my/vehicles/register">
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>ADD VEHICLE</p>
          <h1>添加你的 ALSVID</h1>
          <p>先用 VIN / 车架号识别车辆，再验证交付或所有权关系。仅知道车架号不会自动取得车辆访问权限。</p>
        </header>

        <section className={styles.contentGrid}>
          <article className={styles.card}>
            <div className={styles.form} role="form" aria-label="车辆绑定预览">
              <div className={styles.field}>
                <label htmlFor="vin">VIN / 车架号</label>
                <input id="vin" name="vin" placeholder="输入车辆 VIN 或车架号" autoComplete="off" />
                <small>通常可以在车架铭牌、交付资料或购买记录中找到。</small>
              </div>
              <button className={styles.disabledButton} type="button" disabled>继续核验</button>
              <div className={styles.notice}>当前先完成 UI。车辆识别与所有权核验接口接入后，这里才会真正执行绑定，不会写入模拟车辆。</div>
            </div>
          </article>

          <aside className={styles.card}>
            <h2>为什么需要核验？</h2>
            <p>My ALSVID 会展示保修、维修、服务历史等车主数据，因此车辆必须先建立可信的所有权关系。</p>
            <div className={styles.steps}>
              <div className={styles.step}><span className={styles.stepIndex}>A</span><div><strong>在线购买</strong><p>可结合 ALSVID 正式订单、交付记录与 VIN 事实核验。</p></div></div>
              <div className={styles.step}><span className={styles.stepIndex}>B</span><div><strong>经销商购买</strong><p>可结合 Dealer 交付记录建立车辆关系。</p></div></div>
              <div className={styles.step}><span className={styles.stepIndex}>C</span><div><strong>其他情况</strong><p>进入人工审核，不直接自动取得车辆权限。</p></div></div>
            </div>
            <Link className={styles.secondaryAction} href="/my/vehicles">返回我的车辆</Link>
          </aside>
        </section>
      </div>
    </OwnerShell>
  );
}
