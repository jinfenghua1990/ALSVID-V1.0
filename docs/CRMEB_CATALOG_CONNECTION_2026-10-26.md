# Historical reference (retired 2026-11-02)

The experimental CRMEB read-only catalog adapter and its preview panel were removed. ALSVID now uses its own PostgreSQL-backed catalog; do not configure `CRMEB_LAB_ORIGIN` or `CRMEB_LAB_PUBLIC_CATALOG` or reactivate a parallel CRMEB runtime. This record is retained only as migration history.

---

# CRMEB 独立商品接口试接

状态：只读适配代码；无原生 Medusa / CRMEB 引擎部署证明。所属交付为独立商城比较区，关联本 PR。

## 范围与数据权威

这是现有 modular monolith 内的隔离实验视图，不是新增业务域、数据库或订单主系统。适配器位于 apps/web/app/_experiments/commerce-lab，服务端只调用 CRMEB 公开 GET /api/products?page=1&limit=20。公共页面和受现有 Admin 守卫保护的比较区复用同一个适配器。商品仅保留外部来源命名空间 ID 与名称，不导入 ALSVID Product，不创建 SKU、订单、支付、库存或客户资料。原有演示袋和演示单继续明确标注为样机，不与外部列表混合。

未引入 Medusa SDK 或原生前台代码；不能将这一步称为完整融合。原生 CRMEB 的运行环境、独立数据库和身份部署，以及 Medusa 前台数据调用替换仍待完成。任何写入能力或独立引擎运行资源须先补 ADR，遵循 ADR 0005/0006 和单一写入权威。

## 配置与启用

服务器端配置：
- CRMEB_LAB_ORIGIN：已部署、已完成安装的独立 CRMEB HTTPS 根域名，例如 https://catalog.alsvidbike.com（仅示例，不表示该服务存在）。
- CRMEB_LAB_PUBLIC_CATALOG=enabled：单独允许 WWW 比较页展示外部商品名称。没有此标记时仅 Admin 试读。启用前确保公开商品均可公开展示。

这些不是 NEXT_PUBLIC 变量，不接受 URL 参数或浏览器填写地址。禁止添加密码、默认管理员凭据、生产客户数据或原系统访问令牌。适配器不向上游传 Cookie 或 Authorization，不跟随重定向。运维应配置可信的自有服务域名，不可指向元数据/内部管理服务；域名校验不是完整 DNS/网络隔离保证。

代码不自动创建任何云资源。现有 Cloud Run 发布工作流也未添加这些变量；需要确认服务与配置后，通过经过审查的现有部署路径配置，不在源码硬编码真实地址或秘密。未配置时立即显示未启用；错误时显示不可用，绝不假装示例数据是外部返回。

## 限制与恢复

超时 4 秒、响应上限 256 KiB、最多第一页 20 件、严格 CRMEB status=200 与 data 数组合同。名称按 React 文本渲染，不展示外部 HTML、图片 URL、评分、货币、价格、销量或库存。空列表与请求失败分开显示。每次页面请求重新读取，显示检查 UTC 时间，无后台同步或持久化。清除两个变量即可停用，既有演示与原系统不受影响。

## 验证

适配器契约测试覆盖缺失/错误配置、GET 请求与无身份转发、只保留 ID/名称、空目录、重复/非法商品、HTTP/HTML/JSON 错误、响应上限和网络失败。测试通过注入 Fetch 使用隔离响应，不证明原生 CRMEB 服务已经部署。完整 CI 与浏览器运行以本 PR 的真实结果为准。

原生接通验收仍需：配置真实 HTTPS 服务；Admin 中显示实际商品；明确启用公共目录；WWW 显示相同商品；CRMEB 改名后刷新可见；移除配置后降级；核实没有写原有业务数据。支付保持关闭。

## 依据

- https://github.com/crmeb/CRMEB/blob/master/crmeb/app/api/route/v1.php (blob 6e6038cfb13af6857d6d3b30811b15b93b93a06b)
- https://github.com/crmeb/CRMEB/blob/master/crmeb/app/api/controller/v1/store/StoreProductController.php (blob a0f5291ec2123c23a0f21c223978b9f4727b616f)
- https://github.com/crmeb/CRMEB/blob/master/crmeb/app/services/product/product/StoreProductServices.php
- https://github.com/medusajs/dtc-starter
