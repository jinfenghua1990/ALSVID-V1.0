import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '目录', title: '适配配件', description: '按真实车型与 BOM 关系展示可替换、可升级的配件。' },
  { eyebrow: '结构', title: '爆炸图 / 3D', description: '后续接入审核后的 3D 模型与爆炸图，不使用与实车结构不一致的演示模型。' },
  { eyebrow: '售后', title: '维修引用', description: '售后工单可从此目录引用真实零部件编号与装配位置。' },
] as const;

export default async function Accessories3DPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/product/accessories-3d')} footer="ALSVID · 配件 BOM"><PortalSectionPage eyebrow="BOM / 3D CATALOG" title="配件目录 / 3D" description="配件可视化页面已经就位。真实 3D 模型和零部件关联接入前保持空置。" cards={cards} /></AppShell>;
}
