import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '账户', title: 'My ALSVID 账户', description: '查看客户账户与已验证身份关系，不把账户本身等同于车辆所有权。' },
  { eyebrow: '车辆', title: '车库关系', description: '后续用于审核车辆进入客户车库所需的交付、激活或所有权证据。' },
  { eyebrow: '支持', title: '客户支持', description: '处理 My ALSVID 使用、车辆关联与服务入口相关的真实支持事项。' },
] as const;

export default async function CustomerMyAlsvidPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/customers/my-alsvid')} footer="ALSVID · 客户中心"><PortalSectionPage eyebrow="CUSTOMER CENTER / MY ALSVID" title="My ALSVID 支持" description="这里是内部人员处理客户账户与车辆关系问题的工作区，不替代车主门户，也不会绕过所有权验证。" cards={cards} notice="客户身份体系接入完成前，本页只保留真实流程入口和空状态。" /></AppShell>;
}
