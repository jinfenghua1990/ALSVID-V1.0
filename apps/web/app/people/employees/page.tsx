import { AppShell } from '@alsvid/ui';
import { navigationFor } from '../../_design/admin-navigation';

const providerStatuses = [
  ['ALSVID 账户', '骨架已预留', '员工与 ALSVID User / Role 的关联将在这里统一管理。'],
  ['公司邮箱 / 目录', '未配置', '等待后续选择 Microsoft 365 或 Google Workspace 等真实提供商。'],
  ['GitHub', '未配置', '仅在岗位策略需要时邀请组织 / 团队，GitHub 不作为员工身份权威。'],
] as const;

export default function EmployeesPage() {
  return (
    <AppShell navigation={navigationFor('/people/employees')} footer="人员 / 员工中心">
      <header className="pageHeader">
        <div>
          <div className="eyebrow">人员 / 员工中心</div>
          <h1>员工只录入一次，后续账号按策略自动开通。</h1>
          <p className="pageIntro">当前阶段先搭建 ALSVID 自己的员工主数据、状态与外部系统接口骨架。真实邮箱、目录和 GitHub 自动开通将在提供商确定后接入。</p>
        </div>
        <span className="statusPill pending">模块骨架</span>
      </header>

      <div className="infoGrid">
        <section className="infoCard">
          <h2>员工主数据</h2>
          <p>作为入职、停用和后续自动开通的统一入口，不扩展成薪资或完整 HRIS。</p>
          <div className="infoRows">
            <div className="infoRow"><span>员工编号</span><strong>统一生成 / 管理</strong><span>预留</span></div>
            <div className="infoRow"><span>公司邮箱</span><strong>必须验证批准域名</strong><span>规则已确定</span></div>
            <div className="infoRow"><span>部门 / 岗位</span><strong>驱动基础权限策略</strong><span>预留</span></div>
            <div className="infoRow"><span>员工状态</span><strong>待入职 / 在职 / 停用 / 离职</strong><span>预留</span></div>
          </div>
        </section>

        <section className="infoCard">
          <h2>入职流程</h2>
          <p>后续管理员只需要创建一次员工，系统通过外部系统适配器执行各系统开通。</p>
          <div className="providerList">
            <div className="providerRow"><strong>1. 创建员工</strong><small>录入基础资料与公司邮箱</small><span className="statusPill ready">ALSVID</span></div>
            <div className="providerRow"><strong>2. 验证内部员工资格</strong><small>服务器验证批准的公司邮箱域名</small><span className="statusPill pending">待实现</span></div>
            <div className="providerRow"><strong>3. 应用岗位策略</strong><small>明确分配角色，不由第三方账号推断权限</small><span className="statusPill pending">待实现</span></div>
            <div className="providerRow"><strong>4. 开通外部系统</strong><small>邮箱、目录、GitHub 等按需要执行</small><span className="statusPill pending">后续</span></div>
          </div>
        </section>
      </div>

      <section className="infoCard" style={{ marginTop: 14 }}>
        <h2>外部系统状态</h2>
        <p>未接入的第三方必须明确显示“未配置”，不能伪装成已经可用。</p>
        <div className="providerList">
          {providerStatuses.map(([name, status, detail]) => (
            <div className="providerRow" key={name}>
              <strong>{name}</strong>
              <small>{detail}</small>
              <span className={`statusPill${status === '骨架已预留' ? ' ready' : ' pending'}`}>{status}</span>
            </div>
          ))}
        </div>
        <div className="mutedBox">当前页面仅表示 ALSVID 员工中心的 UI 与信息架构已经有正式位置。真实第三方 API、账号创建和停用动作尚未接入。</div>
      </section>
    </AppShell>
  );
}
