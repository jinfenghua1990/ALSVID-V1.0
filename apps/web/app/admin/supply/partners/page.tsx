import AdminScreen from '../../../_design/renderer';
import { screenById } from '../../../_design';

export const metadata = { title: '供应商与工厂管理 · ALSVID Admin' };

export default function Page() {
  const screen = {
    ...screenById('supply'),
    route: '/admin/supply/partners',
    title: '供应商与工厂管理',
    subtitle: '统一合作方主档；生产采购单复用工厂身份',
  };
  return <AdminScreen screen={screen} />;
}
