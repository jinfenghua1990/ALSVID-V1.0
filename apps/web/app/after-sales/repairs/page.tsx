import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../_design/admin-navigation';

const cards = [
  { eyebrow: '维修', title: '维修记录', description: '记录真实车辆的检测、维修动作、工时与处理结论。' },
  { eyebrow: '配件', title: '配件使用', description: '关联实际使用或更换的零部件、数量与批次。' },
  { eyebrow: '证据', title: '维修证据', description: '后续保存图片、报告、经销商说明和客户确认等证据。' },
] as const;

export default async function RepairsPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/after-sales/repairs')} footer="ALSVID · 售后服务"><PortalSectionPage eyebrow="AFTER SALES / REPAIRS" title="维修 / 配件记录" description="维修与配件记录页面已经就位。没有真实维修事实时保持空置。" cards={cards} /></AppShell>;
}
