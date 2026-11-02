import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '图片', title: '产品图片', description: '管理真实白底图、场景图、细节图及其车型适用范围。' },
  { eyebrow: '视频', title: '产品视频', description: '后续保存审核通过的视频素材与外部对象存储引用。' },
  { eyebrow: '发布', title: '渠道素材', description: '区分官网、经销商、平台渠道可使用的已批准素材。' },
] as const;

export default async function ProductMediaPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/product/media')} footer="ALSVID · 产品中心"><PortalSectionPage eyebrow="PRODUCT / MEDIA" title="图片 / 视频素材" description="素材中心页面已经就位。没有上传真实素材时保持空置。" cards={cards} /></AppShell>;
}
