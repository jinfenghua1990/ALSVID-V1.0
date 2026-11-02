import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '邮件', title: '事务邮件', description: '查看验证码、业务通知和服务邮件所使用的真实发送 Provider 与状态。' },
  { eyebrow: '模板', title: '通知模板', description: '后续统一管理经审核的邮件与通知模板，不在业务页面散落文案。' },
  { eyebrow: '偏好', title: '通讯策略', description: '区分必要事务通知与可选品牌通讯，并保留客户偏好与授权边界。' },
] as const;

export default async function CommunicationsPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/settings/communications')} footer="ALSVID · 系统设置"><PortalSectionPage eyebrow="SYSTEM / COMMUNICATIONS" title="通讯中心" description="通讯能力通过 Provider Adapter 接入。未配置真实 Provider 时明确显示未配置，不模拟发送成功。" cards={cards} notice="当前仅建立统一通讯管理入口；真实提供商状态以后端环境配置为准。" /></AppShell>;
}
