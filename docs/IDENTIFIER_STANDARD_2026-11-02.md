# ALSVID 唯一数字 ID 标准与底层排查（2026-11-02）

**决定：一条业务记录只能有一个正式、不可变的数字主键。** 商城、ADMIN、API、各领域模块必须使用对应的同一个 ID；禁止再新建另一套“内部 ID / 对外 ID”的永久双轨。当前状态是**迁移目标**，不是“已完成转换”的声明。

## 一、明确区分四类字段
1. **唯一主键 ID：** 每类 ALSVID 自有业务实体统一 `BIGINT GENERATED ... AS IDENTITY PRIMARY KEY`，关联表统一以该数值建立外键。API 层统一使用十进制字符串传递 BIGINT（防止 JS 精度丢失），表单不允许手工分配。
2. **商品与 SKU：** 保留**现有** 6 位数字 `product.models.product_id`（100001–999999）与 9 位数字 `product.skus.sku_number`（`product_id*1000+001..999`）作为正式身份，**不可重新编号**。商品和 SKU 最终不再把 `id uuid` 当主键；`sku`、`code` 仅为描述/历史资料，不得作为第二套关联键或显示成“另一个商品 ID”。
3. **业务展示单号：** 采购单 PO、生产单、物流单、财务单可有 `PO-...` 等展示号码，但应**从正式数字主键确定性生成**，不是独立分配的第二套身份；所有数据库关联只用数字主键。
4. **不是业务实体 ID 的东西：** VIN/车架号是单辆物理车的法定或追溯标识，外部 ERP/WMS 供应商订单号是带 `provider` 命名空间的外部引用，支付流水、幂等键、登录令牌不能改成可猜测的顺序令牌。它们保留各自安全或业务含义，但不得取代内部正式主键。

## 二、主干实际代码排查结果（main: 149f1cd5）

检查了主干 56 个迁移文件名和核心建表脚本；**仅 10 个主要建表迁移里就已经发现至少 78 个 UUID 主键声明**，不是只有商品表存在双重 ID。另有多处 `REFERENCES ... (id)` UUID 关联。该统计来自脚本/代码，不等同于查询现有生产库的实际行数或实时约束。

| 主数据/领域 | 当前事实 | 规范目标 |
|---|---|---|
| Product | `product.models.id uuid` 主键 + `product_id bigint` 唯一数字 | 只以既有 `product_id` 为正式数字 PK |
| SKU | `product.skus.id uuid` 主键 + `sku_number bigint` + `sku text` | 只以既有 `sku_number` 为正式数字 PK；`sku` 退出 ID 语义 |
| Variant / BOM / Build Spec | UUID 主键，且 Variant/BOM 有 `product_id` 冗余投影 | 各自数字 PK，引用 Product/SKU 数字 FK；不要二次生成产品编号 |
| Procurement | `purchase_orders.id uuid` 与 `po_number` 并存；行引用 `sku_id uuid` | 采购订单数字 PK，业务单号由其派生；采购行引用 `sku_number` |
| Production / Vehicle | 生产单/生产单位/实车 `id uuid`，另有生产单号/车架号 | 各自数字 PK；车架号保留独立实物追溯属性 |
| Warehouse / Inventory | 仓库/库位 UUID PK + 仓库 `code`；流水与预留引用 `sku_id uuid` | 仓库/库位/流水数字 PK；商品库存统一按数字 SKU FK |
| Logistics | 运单/货物 UUID PK + 发运单号，`sku_id uuid` | 运单/货物数字 PK；通过 SKU 数字 FK 连接库存 |
| Finance | 财务单、分摊批次 UUID PK + 展示号码 | 数字 PK；现有对账凭证和不可篡改账本保持 |
| Partner / Dealer / Owner | Partner UUID、历史商家代码/会员外部编码 | 一套数字 Partner ID；组织和外部证件不是主键 |
| Commerce / Service | 订单、售后/权限范围多处 UUID FK；部分业务已有数字快照 | 所有自有实体统一数字 PK，商品/SKU 只引用权威数字 |

**已发现的实际双轨代码：**
- `0047_stable_product_sku_numbers.sql` 创建数字编号，但保留 `product.models.id` 与 `product.skus.id` UUID 主键。
- `0051_shared_product_sku_links.sql` 为部分业务表额外新增 `product_id`、`sku_number`，原 `sku_id uuid` FK 并没有删除；属于过渡投影而非统一完成。
- `apps/api/src/product.controller.ts` 的 `modelId` / `variantId` 仍按 UUID 操作；`apps/web/app/_design/ecommerce-product-workspace.tsx` 虽生成数字商品详情链接，编辑、价格和库存仍通过 UUID / 文本 `sku` 映射。
- `apps/web/app/_design/record-links.ts` 对订单、实车、售后、Partner 的内部链接严格使用 UUID。
- 老采购/订单快照与证据记录里存在历史 UUID：不能靠删除新表的 UUID 列把数据关联切断。

## 生产库只读审计快照（Neon ALSVID Production，2026-11-02）

使用已经连接的 **ALSVID Production** Neon 项目执行 PostgreSQL 目录查询及聚合 `SELECT`，未运行 DDL/DML，没有更改生产数据。**这是 2026-11-02 的时间点快照，不是持续同步的在线指标。**

- 当前共有 **118 个主键列**：**103 个 UUID 主键列，0 个 BIGINT 主键列**（其余是文本等其他类型）。
- 当前外键涉及 **320 个列**：其中 **281 个 UUID 外键列、34 个 BIGINT 外键列**，另有其他数据类型。BIGINT 外键并不代表它的目标实体已经有 BIGINT 主键。
- 生产库确有 6 个商品、6 个 SKU（均存在唯一数字号，未发现重复或 Product/SKU 所属关系错配）；2 个仓库；采购单、生产单、官网销售订单、库存流水、物流运单和 Finance 文档均为 0 条。
- 权限、账户、会话、审计日志等并非空库；严禁以核心订单表为 0 推断可以整体删库重建。
- 按 `pg_stat_user_tables` 只读统计仍有身份/权限/审计等活动记录，因此所有映射均应在真实备份和跨域引用核验后切换。
- 核查 `inventory.movements` 与 `logistics.shipment_cargo` 的数字 SKU 冗余投影：当前错配数量均为 0（这些表当前无流水，不能据此推断今后写入均正确）。

### 优先迁移顺序

商品/数字 SKU → Product-Engineering-定价及商城装修 → 空的采购/生产/物流/库存业务单据与仓库设置 → Finance/客户/售后 → Identity/Partner 及外部回调。**即使相关业务表当前没有记录，程序与数据库外键仍必须同时升级，不能仅修改 PostgreSQL 字段。**

## 三、实现顺序：每一批在完成全部生产/消费方的改造后才能转正

**阶段 A：真实数据只读预检。** 运行 `docs/sql/identifier-preflight-readonly.sql`，记录生产库约束、实体数量、数字重复、SKU 关系不一致、所有 UUID FK 依赖和历史外部回调；先建立加密备份和还原演练。不能只根据 GitHub 中的迁移推断生产行数。

**阶段 B：商品/SKU 主链一次性迁移。** 保留 `product_id/sku_number` 原始数值，建立数字 PK、数字外键，修改 Product → Engineering → Procurement → Commerce → Inventory → Logistics → Finance 的实体引用、接口和前端消费者。升级过程中可以临时保留 UUID 列完成迁移校验，但验收后必须消除双轨，不得无限期兼容。使用同一 PR 或明确依赖的一组 PR，不允许某一域孤立提交后让另一个机器人再补链路。

**阶段 C：其他业务实体。** Partner/仓库/采购单/生产单/物流单/销售订单/售后/Finance 等依域顺序变更，规范数字 PK 与 FK，业务单号从数字 ID 派生（原订单号码保留为不可编辑历史回执时必须明确标成“历史显示号码”）。特殊登录/支付外部令牌保留不可预测性但不得充当内部主键。

**阶段 D：去双轨与验收。** UUID 关联列、`modelId`、`skuId` 等旧 API、`?modelId=UUID` 链接彻底移除前，确认：生产库行数、订单金额、库存数量、负库存/重复出入库、外部回调幂等、VIN/售后所有外键全匹配。重点完成“数字 Product/SKU → 采购 → 生产 → 发运 → 库存 → 客户订单 → 财务”的真实集成测试和 URL 路由验收。

## 四、从本次 PR 即开始的 CI 门禁
`scripts/check-identifier-standard.mjs` 纳入 `pnpm arch:check`。在主干当前已有的 56 个历史迁移文件之外，**新增**业务表不得再建 UUID / 文本的 `id` 主键；必须使用自动生成的 BIGINT 主键；禁止新建第二套 Product/SKU 编号发生器。已有历史 UUID 不会被“门禁通过”伪装成已转换。后续真实切换时进一步收紧检查，直到历史例外清单为零。

## 五、涉及的在途变更
PR #470（生产交付工厂实收、分批入库、成本分摊）尚未合并；其 `0054_factory_finished_receipts.sql` 包含新 UUID 主键。如果先合并本规范 PR，它将被新门禁拦截，必须在 #470 内按统一数字 PK 标准调整，再跑业务测试，不能直接绕过约束。

**本文件不执行生产迁移，也不意味着已有双轨已消除。**
