import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '供应关系', title: '车型供应商', description: '查看车型、零部件与真实供应商之间的业务关系。' },
  { eyebrow: '来源', title: '合作伙伴主数据', description: '供应商主体信息继续由 Partner 主数据负责，本页只维护产品关联。' },
  { eyebrow: '证据', title: '采购与工程引用', description: '后续从采购、BOM 与工程变更中引用真实供应关系。' },
] as const;

export default async function ProductSuppliersPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/product/suppliers')} footer="ALSVID · 产品中心"><PortalSectionPage eyebrow="PRODUCT / SUPPLIERS" title="供应商关联" description="产品与供应商的关联页已经就位。没有实际供应关系时保持空置。" cards={cards} /></AppShell>;
}
