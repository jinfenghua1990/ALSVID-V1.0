import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '交付', title: '渠道交付', description: '记录车辆从 ALSVID 到经销商、再到最终客户的真实交付事实。' },
  { eyebrow: '所有权', title: '所有权关系', description: '只有可信交付、激活或人工审核成立后才建立车辆所有权。' },
  { eyebrow: '转让', title: '所有权变更', description: '后续用可审计流程处理二手转让或所有权更正。' },
] as const;

export default async function VehicleOwnershipPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/vehicle360/ownership')} footer="ALSVID · Vehicle 360"><PortalSectionPage eyebrow="VEHICLE 360 / OWNERSHIP" title="交付 / 所有权" description="车辆交付与所有权页面已经就位。没有真实交付关系时保持空置。" cards={cards} /></AppShell>;
}
