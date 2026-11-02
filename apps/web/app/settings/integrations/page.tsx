import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../app-navigation';
import IntegrationsAdminClient from './integrations-admin-client';

const cards = [
  { eyebrow: 'Commerce', title: '外部销售渠道（仅获批渠道）', description: '查看外部销售渠道的适配器状态与业务边界，密钥不在页面展示。' },
  { eyebrow: 'Storage', title: '对象存储', description: '后续展示 R2 等对象存储 Provider 的非敏感配置状态。' },
  { eyebrow: 'Infrastructure', title: '外部服务', description: '集中展示已批准的第三方服务连接状态、职责和健康检查入口。' },
] as const;

export default async function IntegrationsPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/settings/integrations')} footer="ALSVID · 系统设置"><><PortalSectionPage eyebrow="SYSTEM / INTEGRATIONS" title="集成" description="ALSVID 通过适配器连接专业外部系统，同时保持领域逻辑与 Provider 解耦。页面只展示非敏感状态，不保存或回显密钥。" cards={cards} notice="没有真实连接时明确保持未配置状态。" /><IntegrationsAdminClient /></></AppShell>;
}
