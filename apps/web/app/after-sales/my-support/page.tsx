import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../_design/admin-navigation';

const cards = [
  { eyebrow: '车主门户', title: 'My ALSVID 请求', description: '后续汇总车主门户实际发起的售后与服务请求。' },
  { eyebrow: '沟通', title: '客户沟通', description: '记录围绕车辆和工单发生的真实服务沟通。' },
  { eyebrow: '闭环', title: '处理结果', description: '服务完成后将结果回写到车辆档案与车主可见范围。' },
] as const;

export default async function MySupportPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/after-sales/my-support')} footer="ALSVID · 售后服务"><PortalSectionPage eyebrow="AFTER SALES / MY ALSVID" title="My ALSVID 支持" description="车主门户支持工作区已经就位。没有真实客户请求时保持空置。" cards={cards} /></AppShell>;
}
