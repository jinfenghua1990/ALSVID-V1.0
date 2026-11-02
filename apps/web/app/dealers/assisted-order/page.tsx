import { AppShell } from '@alsvid/ui';
import { requireInternalPreviewSession } from '../../_lib/portal-access';
import { PortalSectionPage } from '../../_components/portal-section-page';
import { navigationFor } from '../../app-navigation';

const cards = [
  { eyebrow: '经销商', title: '选择经销商', description: '后续从真实 Dealer 主数据选择业务员代服务的经销商。' },
  { eyebrow: '订单', title: '外部建单', description: '业务员代下单须接入获批的 ALSVID Dealer/B2B 订单接口；接入前不得模拟提交正式订单。' },
  { eyebrow: '回写', title: '订单事实回写', description: '外部订单创建成功后，将订单事实同步回 Commerce 工作区。' },
] as const;

export default async function AssistedOrderPage() {
  await requireInternalPreviewSession();
  return <AppShell navigation={navigationFor('/dealers/assisted-order')} footer="ALSVID · 经销商"><PortalSectionPage eyebrow="DEALER / ASSISTED ORDER" title="业务员代下单" description="代下单操作界面已经就位；在 Shopify / B2B API 接入前不提供本地假订单。" notice="ALSVID 只作为业务工作台和事实记录层，购物车、价格计算、支付与正式订单仍由授权 Commerce 系统负责。" cards={cards} /></AppShell>;
}
