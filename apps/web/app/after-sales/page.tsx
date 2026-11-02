import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../_lib/portal-access';
import { PortalSectionPage } from '../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '工单', title: '售后申请', description: '汇总客户与经销商真实提交的售后、保修与问题申请。' },
  { eyebrow: '保修', title: '保修判定', description: '依据车辆身份、交付、保修政策和证据进行审核，不自动假设符合条件。' },
  { eyebrow: '闭环', title: '处理进度', description: '后续串联维修、配件、经销商服务和客户通知。' },
] as const;

export default async function AfterSalesPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/after-sales')} footer="ALSVID · 售后服务"><PortalSectionPage eyebrow="AFTER SALES / WARRANTY" title="售后 / 保修" description="ALSVID 售后工作台页面已经就位。没有真实售后申请时保持空置。" cards={cards} /></AppShell>;
}
