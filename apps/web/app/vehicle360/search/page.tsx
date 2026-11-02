import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../_design/admin-navigation';

const cards = [
  { eyebrow: 'VIN', title: '车架号查询', description: '真实查询接口接入后，可按车架号定位车辆档案。' },
  { eyebrow: '车型', title: 'SKU / 车型筛选', description: '按真实车型与 SKU 缩小车辆范围。' },
  { eyebrow: '结果', title: '车辆结果', description: '只有授权可见的车辆才会出现在查询结果中。' },
] as const;

export default async function VehicleSearchPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/vehicle360/search')} footer="ALSVID · Vehicle 360"><PortalSectionPage eyebrow="VEHICLE 360 / SEARCH" title="VIN / 车架号查询" description="查询页面结构已经完成；在真实车辆查询接口接入前不提供假搜索结果。" cards={cards} /></AppShell>;
}
