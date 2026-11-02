import AdminScreen from '../../../_design/renderer';
import { screenById } from '../../../_design';

export const metadata = { title: '原采购工作台 · ALSVID Admin' };

export default function Page() {
  const screen = { ...screenById('supply'), route: '/admin/supply/legacy' };
  return <AdminScreen screen={screen} />;
}
