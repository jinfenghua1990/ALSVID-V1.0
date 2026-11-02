import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../_design/admin-navigation';

const cards = [
  { eyebrow: '身份', title: '车辆身份', description: '展示真实车辆编号、车架号、车型与生产身份。' },
  { eyebrow: '生命周期', title: '车辆状态', description: '从生产、入库、出货到交付的状态只由真实业务事件推导。' },
  { eyebrow: '关系', title: '渠道与客户', description: '后续展示经销商分配、交付与可信所有权关系。' },
] as const;

export default async function VehicleRecordsPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/vehicle360/records')} footer="ALSVID · Vehicle 360"><PortalSectionPage eyebrow="VEHICLE 360 / RECORDS" title="车辆档案" description="车辆档案列表页已经就位。没有真实车辆身份时保持空置。" cards={cards} /></AppShell>;
}
