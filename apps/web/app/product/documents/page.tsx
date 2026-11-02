import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../_design/admin-navigation';

const cards = [
  { eyebrow: '技术资料', title: '规格与说明', description: '集中展示经过审核的规格书、装配说明和技术文档。' },
  { eyebrow: '版本', title: '版本与生效范围', description: '技术资料按车型、版本和生效时间关联，避免旧资料覆盖新事实。' },
  { eyebrow: '发布', title: '对外资料', description: '后续区分内部工程资料与可提供给经销商、客户的公开资料。' },
] as const;

export default async function ProductDocumentsPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/product/documents')} footer="ALSVID · 产品中心"><PortalSectionPage eyebrow="PRODUCT / DOCUMENTS" title="技术资料" description="技术资料工作区已经就位。没有真实文档时保持空置，不生成演示文件。" cards={cards} /></AppShell>;
}
