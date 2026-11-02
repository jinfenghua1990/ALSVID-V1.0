import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '反馈', title: '客户反馈', description: '记录客户或经销商实际提交的车辆问题、使用反馈与证据。' },
  { eyebrow: '关联', title: '车辆关联', description: '每条反馈关联到真实车辆、车型与提交主体。' },
  { eyebrow: '闭环', title: '处理结果', description: '后续与售后、维修、配件和保修处理形成可追溯闭环。' },
] as const;

export default async function VehicleFeedbackPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/vehicle360/feedback')} footer="ALSVID · Vehicle 360"><PortalSectionPage eyebrow="VEHICLE 360 / FEEDBACK" title="客户反馈记录" description="反馈工作区已经就位。没有客户或经销商的真实反馈时保持空置。" cards={cards} /></AppShell>;
}
