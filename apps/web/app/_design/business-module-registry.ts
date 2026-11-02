/**
 * ALSVID Admin IA: one code-owned top-level module registry.
 * It describes routing and implementation progress, not ERP/Commerce data authority.
 * Keep business boundaries in docs/ALSVID_ADMIN_IA.md in sync.
 */
export type ModuleReadiness = 'core' | 'partial' | 'early';

export type BusinessModule = {
  label: string;
  href: string;
  description: string;
  legacyAreas: readonly string[];
  readiness: ModuleReadiness;
  focus: string;
};

export const ADMIN_MODULES: readonly BusinessModule[] = [
  { label: '工作台', href: '/admin', description: '跨模块运营概览、待办与异常', legacyAreas: ['工作台'], readiness: 'core', focus: '跨模块待办、业务异常与模块入口' },
  { label: '产品研发', href: '/admin/product', description: '整车产品、零配件与技术平台档案', legacyAreas: ['产品'], readiness: 'partial', focus: '商品信息由业务人员自行建档，不预设型号' },
  { label: '商城运营', href: '/admin/ecommerce', description: '自建商城商品发布、首页展示、DE/AT 价格与 B2C 订单', legacyAreas: ['电商'], readiness: 'partial', focus: '商城可售判定、结账支付与真实交易闭环' },
  { label: '经销商管理', href: '/admin/dealers', description: '经销商档案、授权、报价与 B2B 订单协同', legacyAreas: ['经销商'], readiness: 'partial', focus: '经销商授权、阶梯价格、B2B 下单与交付' },
  { label: '库存管理', href: '/admin/inventory', description: '仓库、库位、整车与零配件库存、预留及盘点', legacyAreas: ['库存'], readiness: 'partial', focus: '真实仓库与库存余额一行一条' },
  { label: '供应链管理', href: '/admin/supply', description: '一张生产交付总单贯穿采购、生产、发运费用和入库', legacyAreas: ['供应链','生产','物流'], readiness: 'partial', focus: '真实生产采购单、分批运输、清关、费用、收货串联' },
  { label: '客户与车主', href: '/admin/customers', description: '客户档案、车主身份、车辆归属与服务历史', legacyAreas: ['客户'], readiness: 'partial', focus: '客户 / 车主资料弹窗、VIN 归属认证与档案联动' },
  { label: '售后服务', href: '/admin/after-sales', description: '保修、维修工单、配件申请和服务网点', legacyAreas: ['售后'], readiness: 'partial', focus: '售后工单 SLA、保修证据与配件库存联动' },
  { label: '财务管理', href: '/admin/finance', description: '应收应付、发票、收付款、核对和成本分配', legacyAreas: ['财务'], readiness: 'partial', focus: 'PSP 实际收款、退款凭证、结算与税务处理' },
  { label: '经营分析', href: '/admin/analytics', description: '访客、流量来源、页面流失、销售转化与售后退款指标', legacyAreas: ['数据'], readiness: 'early', focus: '逐项接入埋点与订单数据，缺失数据不显示虚假指标' },
  { label: '设置', href: '/admin/settings', description: '身份权限、审计、邮件、集成与系统架构', legacyAreas: ['设置'], readiness: 'partial', focus: '角色权限、通知中心与第三方集成健康状态' },
];

