import AdminScreen from '../../../_design/renderer';
import type { Screen } from '../../../_design';
import WarehouseManagement from '../../../inventory/warehouse-management-client';

const settings=false;
export const metadata = { title: '仓库库存 · ALSVID Admin' };
const screen: Screen = {id:'warehouse-stock',area:'库存',route:'/admin/inventory/stock',title:'仓库库存',subtitle:'',sourceNode:'module:inventory',blocks:[]};
export default function Page(){return <AdminScreen screen={screen} hidePageHeading><WarehouseManagement view="stock" /></AdminScreen>;}
