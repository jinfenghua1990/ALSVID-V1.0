import AdminScreen from '../../../_design/renderer';
import type { Screen } from '../../../_design';
import WarehouseManagement from '../../../inventory/warehouse-management-client';

const settings=true;
export const metadata = { title: '仓库设置 · ALSVID Admin' };
const screen: Screen = {id:'warehouse-settings',area:'库存',route:'/admin/inventory/warehouses',title:'仓库设置',subtitle:'',sourceNode:'module:inventory',blocks:[]};
export default function Page(){return <AdminScreen screen={screen} hidePageHeading><WarehouseManagement view="settings" /></AdminScreen>;}
