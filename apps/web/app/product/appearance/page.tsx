import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../_design/admin-navigation';

const cards = [
  { eyebrow: '外观', title: '颜色方案', description: '管理真实车型可用的颜色、表面处理与展示名称。' },
  { eyebrow: '适用范围', title: '车型关联', description: '将外观方案关联到具体 Model / Variant / SKU，不创建不存在的配置。' },
  { eyebrow: '素材', title: '展示素材', description: '后续引用已审核的产品图片和颜色样片。' },
] as const;

export default async function ProductAppearancePage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/product/appearance')} footer="ALSVID · 产品中心"><PortalSectionPage eyebrow="PRODUCT / APPEARANCE" title="外观与颜色" description="产品外观配置页面已经就位。没有真实颜色与车型关联时保持空置。" cards={cards} /></AppShell>;
}
