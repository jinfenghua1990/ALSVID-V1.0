> **2026-11-02 Shopify 运行功能退役：** ALSVID 官网商城与订单由自建 Commerce 管理。Shopify Webhook 接收/重放、后台写入表单与配置入口已从代码中移除；历史数据库迁移、外部订单与审计凭证不做破坏性删除。参见 [清理边界](docs/SHOPIFY_RETIREMENT_2026-11-02.md)。

# ALSVID

> **新增可选本地正式运行方式（2026-11-02）**：保留 Google Cloud Run 作为现有线上运行位置；获授权的本地电脑/NAS 可以通过 [本地运行说明](docs/LOCAL_PRODUCTION.md) 启动同一 ALSVID Web/API，连接既有 Neon Production 数据库、Cloudflare R2 和统一身份，不建立第二套业务数据。普通员工仍优先使用现有 HTTPS 门户，不向员工设备下发数据库或 R2 密钥。本地实机部署及员工联动尚未验收。

> 当前云端运行环境只有 Production；开发在本地进行，CI 使用临时资源。旧的云端 Development/Test 流程仅作为历史记录。

> ALSVID 是自行车品牌的企业数字化平台。这个仓库是 ALSVID 的新实现权威源（implementation authority），不是 ChaiBen-OS 或旧 ALSVID 代码的迁移副本。

> **当前执行基线（2026-10-22）：** 先读 [项目记忆索引](docs/PROJECT_MEMORY_INDEX.md) 与 [当前实现状态](docs/CURRENT_STATE.md)，再按 [ADR 0004](docs/adr/0004-portal-experience-commerce-and-supplier.md)、[ADR 0005](docs/adr/0005-alsvid-owned-storefront-and-third-party-payments.md)、[ADR 0006](docs/adr/0006-first-party-portal-auth-and-login-experience.md) 执行。Ardot 负责内部 Admin；Figma 负责外部门户 UI；ALSVID Official 承担自建 B2C 商城与订单编排，获批 PSP 处理支付；首期不依赖 Shopify。Supplier 自助按 #185 分阶段交付。本文后部保留的旧 Shopify-first 段落仅作历史背景，与 ADR 0005/0006 冲突时一律以新 ADR 和 CURRENT_STATE 为准。

这份 README 同时服务于三类读者：

1. 业务负责人：快速看懂 ALSVID 是什么、为什么这样搭；
2. 开发人员：知道系统边界和当前技术选择；
3. AI / Codex：在修改代码前理解已经确认的决策，避免重新把项目带偏。

---

## 1. ALSVID 首先解决什么问题

Shopify 可以很好地解决电商交易，WMS 可以很好地解决仓库执行，但它们都不是“自行车从出生到售后”的长期业务主档。

ALSVID 的核心价值是把这些长期事实连接起来：

- 产品、车型、SKU 与工程/BOM；
- Vehicle / VIN / 车架号；
- 客户与车辆归属关系；
- 经销商与交付关系；
- 保修、维修、售后、配件补发；
- 与 Shopify、WMS、物流等外部系统之间必要的数据关联；
- Vehicle 360 / My ALSVID 客户与服务入口；
- 后续的通信、营销、AI 辅助和运营分析。

一句话：

> **订单只是车辆来源和业务凭证；Vehicle / VIN 才是 ALSVID 的核心长期资产。**

---

## 2. ALSVID 不是什么

ALSVID 明确不做以下事情：

- 不是通用电商平台或支付机构；首期 B2C 商城由 ALSVID Commerce 负责，支付由获批 PSP 处理；
- 不是通用 OMS；
- 不是 WMS；
- 不是为了把所有 ERP/电商/仓储功能重新造一遍；
- 不复制 Shopify/WMS 的完整数据库。

这样做是为了避免重复建设、数据冲突和后期运维复杂度。

### 系统边界

| 系统 | 主要负责 | ALSVID 与它的关系 |
| --- | --- | --- |
| ALSVID Commerce + PSP | 自建 WWW B2C 商品/购物袋/订单；获批 PSP 执行支付 | ALSVID 自有订单由 Commerce 维护；真实支付仍受 ADR 0005 门禁约束 |
| 外部电商渠道（如 Shopify，未来可选） | 仅在负责人单独批准后提供外部渠道事实 | 不作为首期交易依赖，不自动接管 ALSVID Commerce 的订单权威 |
| WMS | 收货、库存、拣货、包装、出库、仓库侧履约事实 | ALSVID 获取必要发货/物流事实；售后补发等场景可向 WMS 下发明确执行请求 |
| ALSVID | Vehicle/VIN、客户、经销商、保修、服务、维修、售后、车辆生命周期 | 作为品牌自己的长期业务主档和服务中枢 |

更详细边界见：[`docs/BUSINESS_BOUNDARY.md`](docs/BUSINESS_BOUNDARY.md)

---

## 2.1 ALSVID Admin 内部运营后台（V1.0 已确认）

> **AI 开发执行入口（2026-10-21）：** 先阅读 [Admin 当前优先级和分批验收要求](docs/admin/ALSVID_ADMIN_EXECUTION_PRIORITY_2026-10-21.md)，再对照 [已恢复的十大模块设计规范](docs/admin/ALSVID_ADMIN_MODULE_OPTIMIZATION_V1.md)。设计示例、已提交代码、CI 通过、正式发布和业务实测是不同状态，不得将演示数据当成真实业务。

这里讨论的是 **ALSVID 内部运营后台**，不是 ALSVID Official 官网/自建商城，也不是客户公开门户。

后台服务对象包括管理层、运营、销售、生产、仓库、采购、经销商运营和售后团队。其目标是形成品牌自己的内部运营中枢，但**不做传统 ERP 那种部门驱动、密集表格堆叠的产品形态**。

### 一级导航

```text
ALSVID Admin

├── 工作台 Dashboard
├── 产品 Product
├── 订单 Order
├── 生产 Manufacturing
├── 库存 Inventory
├── 经销商 Dealer
├── 客户 Customer
├── 售后 Service
├── 供应链 Supply Chain
├── 数据 Analytics
└── 设置 System
```

### 模块边界

#### 工作台 Dashboard

- 今日运营状态
- 销售/订单概况
- 生产进度
- 库存预警
- 待处理售后
- 供应链风险
- 需要管理人员处理的待办事项

#### 产品 Product

- 产品平台：FC / CT / FT / GT
- 产品型号
- 产品版本：Standard / PRO / Limited 等
- BOM
- 零部件
- 技术资料
- 3D 模型
- 爆炸图
- 产品生命周期

产品模块是 ALSVID 内部产品主数据与工程资料的核心，不等同于商城商品页。

#### 订单 Order

- 全部订单
- B2B / 经销商订单
- 销售订单
- 生产需求
- 配件订单
- 售后订单

订单模块是内部业务凭证与流程入口，不重建通用多渠道 OMS；自建 WWW B2C 订单由 ALSVID Commerce 管理，Admin 负责内部业务操作和跨域履约协同。

#### 生产 Manufacturing

- 生产计划
- 生产任务
- 装配流程
- QC 质量检测
- VIN / 车架号
- 电池编号 / 电机编号 / 序列号
- 出厂记录
- 生产追溯

核心原则：**每一台车都要形成可长期追溯的数字身份。**

#### 库存 Inventory

- 库存总览
- 成品库存
- 半成品库存
- 零部件库存
- 仓库
- 出入库
- 调拨
- 库存预警

#### 经销商 Dealer

- 经销商档案
- 区域
- 等级
- 授权状态
- 采购记录
- 销售情况
- 信用/合作信息

这里是 ALSVID 内部的经销商管理后台，不是 Dealer Portal 本身。

#### 客户 Customer

- 客户档案
- 购买记录
- 车辆绑定
- 保修状态
- 服务记录
- 用户标签

#### 售后 Service

- 服务工单
- 保修申请
- 维修记录
- 配件申请
- 服务网点
- 技术知识库
- 爆炸维修图
- 售后统计

售后需要与 Product / Parts / VIN / Customer 形成联动，而不是独立孤岛。

#### 供应链 Supply Chain

- 供应商档案
- 采购
- 采购订单
- 来料检测 IQC
- 供应商评价
- 成本

供应商档案属于 Admin 供应链；供应商自助协同是已确认的后续 Supplier Portal 目标，按独立组织权限和采购流程分阶段交付，不作为普通消费者导航。详见门户执行基线和 Issue #185。

#### 数据 Analytics

- 销售分析
- 产品分析
- 生产分析
- 库存分析
- 经销商分析
- 客户分析
- 售后分析
- 供应链分析

#### 设置 System

- 用户
- 角色
- 权限
- 审计日志
- API / Integration
- 系统配置

### UI / UX 原则

- 中文优先；
- 左侧一级导航；
- 顶部保留全局搜索、快捷操作、通知、角色/人员切换、当前用户；
- 支持亮色 / 暗色模式；
- 每一个一级模块必须有真正可工作的二级页面，不做“点进去又是一层大卡片导航”的无意义跳转；
- 可以使用表格，但表格只是信息载体，不让整个系统变成传统 ERP 的密集表格界面；
- 强调大留白、清晰层级、克制圆角、统一字体、现代科技感；
- 没有真实业务数据时允许空状态，不为了展示效果伪造运营数据；
- 一级信息架构未经明确决策不随意重构。

更详细的后台架构文档见：[`docs/ALSVID-ADMIN-ARCHITECTURE-V1.md`](docs/ALSVID-ADMIN-ARCHITECTURE-V1.md)。

后续后台 UI、数据库、API、权限和模块开发，以此 V1.0 信息架构为基准继续迭代。

---

## 3. 当前整体架构（已确认）

```text
                           GitHub
                    唯一代码 / 版本来源
                              |
                              v
                    Google Cloud Run
                      Production 运行
                              |
              +---------------+----------------+
              |                                |
              v                                v
       Neon PostgreSQL                  Cloudflare R2
        结构化业务数据                    图片/PDF/附件/媒体
              ^                                ^
              |                                |
       Local PostgreSQL                 Optional isolated test storage
              ^                                ^
              +---------------+----------------+
                              |
                    M1 Mac / GitHub CI
                    开发 / 验证计算

外部业务系统：
Shopify  <---- connectors/adapters ---->  ALSVID  <---- connectors/adapters ---->  WMS
```

### 当前主方案 / 备用方案

| 类别 | 当前主方案 | 备用 / 后续迁移方案 | 为什么这样定 |
| --- | --- | --- | --- |
| 代码源 | GitHub | 不设置第二代码权威源 | 保持版本和部署来源唯一 |
| 生产运行 | **Google Cloud Run** | **1. Railway  2. Apply.Build** | 大厂、容器原生、低运维、低流量可缩容；同时保持可迁移 |
| 数据库技术 | PostgreSQL | PostgreSQL 兼容迁移 | 开源成熟、关系数据适合 ALSVID、避免数据库锁死 |
| 数据库服务商 | **Neon PostgreSQL** | **Supabase PostgreSQL** | Neon 轻量、PostgreSQL 原生、分支适合 Test；Supabase 保留迁移能力 |
| 对象存储 | **Cloudflare R2** | 其他 S3-compatible provider | 文件与数据库分离，S3 兼容，便于未来迁移 |
| 开发 / Test 计算 | **M1 + Docker / GitHub CI** | 按需扩展隔离的临时环境 | 不维护共享云端 Development/Test |
| Test 数据库 | **本地 / CI PostgreSQL** | 按需使用独立临时数据库 | 绝不使用 Production 凭据或数据 |
| Test 对象存储 | **默认不需要** | 需要时使用隔离的临时存储或 mock | 不假设存在共享 R2 Test Bucket |
| 灾备 | **当前暂不建设完整 DR** | 未来按业务规模规划 | 现阶段避免过早增加复杂度；Q4 暂不承担 Production DR |

---

## 4. 为什么 Production 首选 Google Cloud Run

当前 ALSVID 主要是内部运营 + 经销商/售后 + 客户 Vehicle/My ALSVID 访问，不是秒级高并发交易平台。

Cloud Run 当前更适合，因为：

- Google 大型云服务商，长期稳定性和生态更有信心；
- 直接运行 Docker/container；
- 低流量可以缩容，减少空闲成本；
- 不需要自己维护 VPS 操作系统、防火墙、证书和进程；
- 可以从 GitHub/CI 构建部署；
- 没有自有域名时也可先使用 Cloud Run 提供的 HTTPS 地址；
- 后续需要 IAM、Secret Manager、日志等能力时可以逐步增加。

### 为什么不是永久绑定 Cloud Run

ALSVID 必须保持：

- Docker 化；
- 环境变量/Secret 配置解耦；
- 业务 Domain 不依赖 Google 专属 API；
- 数据库保持 PostgreSQL 标准；
- 对象存储保持 S3-compatible 抽象。

因此 Cloud Run 是**当前首选**，不是永久锁死。

备用顺序已经确认：

1. Railway
2. Apply.Build

详细原因见：[`docs/RUNTIME_DECISION.md`](docs/RUNTIME_DECISION.md)

---

## 5. 为什么数据库使用 Neon PostgreSQL

数据库技术标准是 PostgreSQL，而不是“Neon 专属数据库”。

选择 Neon 作为当前主服务商，主要因为：

- PostgreSQL 原生；
- 托管/Serverless，减少数据库服务器维护；
- 数据分支（branching）适合 Test / migration / reset；
- 对当前 ALSVID 规模简单、成本友好；
- 不需要把 ALSVID 绑定到额外后端平台能力。

### 为什么 Supabase 不是当前主方案

Supabase 也是优秀的 PostgreSQL 平台，而且管理界面、Auth/Storage/Realtime 等整套能力更丰富。

但 ALSVID 已经有自己的：

- Web；
- API；
- Identity/权限；
- R2 文件存储；
- Domain 业务层。

所以目前不需要为了附加能力增加平台耦合。

结论：

- **Primary: Neon PostgreSQL**
- **Migration alternative: Supabase PostgreSQL**

如果以后 Neon 在成本、运维、区域或功能方面不再合适，可以迁移 Supabase，而不是重写 ALSVID。

详细原因见：[`docs/DATABASE_DECISION.md`](docs/DATABASE_DECISION.md)

---

## 6. 为什么对象存储使用 Cloudflare R2

图片、PDF、售后照片、维修附件、说明书、视频等二进制文件不应该直接塞进 PostgreSQL。

正确分工：

```text
PostgreSQL
= 文件的业务关系、metadata、object key、权限状态

R2
= 真正的文件 bytes
```

选择 R2 是因为：

- S3-compatible；
- 适合 Presigned URL 和受控文件访问；
- 文件与数据库解耦；
- 当前成本入口低；
- 后续可以利用 Cloudflare 全球网络；
- 如果未来更换对象存储，业务 Domain 不需要推倒重写。

### 测试中的对象存储

常规单元测试和 CI 不依赖常驻对象存储。确实需要验证签名 URL、CORS 或外部访问行为时，使用明确隔离、按需启用的临时资源；不得把 Production 凭据放入 CI，也不要把历史上的 R2 Test 配置当作仍在运行。

详细原因见：[`docs/STORAGE_DECISION.md`](docs/STORAGE_DECISION.md)

---

## 7. 开发 / CI / Production 怎么分

ALSVID 只有一个 live cloud runtime：Production。开发在本地完成，自动化验证由临时 GitHub Actions runner 执行；已退役的 `alsvid-dev` 不再是发布或验收阶段。

### Local development / CI

```text
GitHub branch / PR
       ↓
M1 Docker or ephemeral GitHub CI
       ↓
isolated local / temporary test data
```

### Production

```text
reviewed main commit
       ↓
exact-commit CI
       ↓
Google Cloud Run (alsvid-production / europe-west1)
       ↓
Production Neon / R2 / secrets
```

Production credentials and data never enter local development or CI. A test configuration label does not prove a real provider connection.

### 发布流程

1. 在 GitHub 分支上提交 Pull Request 到 `main`；
2. CI 执行迁移、类型检查、测试、构建及容器启动验收；
3. 审核通过并合并后，对同一 `main` commit 执行 CI；
4. 生产工作流通过检查后运行迁移、部署并验证健康状态；
5. 手动回滚复用已发布镜像 digest，不重新构建旧版本；数据库迁移不会自动回滚。

历史的云端 Development/Test 与自动 promotion 工作流已经退出当前流程。当前文档不代表任何云资源已被删除；资源状态必须通过实时云端清单确认。

详细说明见：[`docs/ENVIRONMENT_STRATEGY.md`](docs/ENVIRONMENT_STRATEGY.md)。

---

## 8. Shopify / WMS 数据怎么进入 ALSVID

当前不追求永久实时同步。

默认方案：

- 每天至少一次同步/校准；
- 平时客户/员工页面读取 ALSVID 缓存的最近成功数据；
- My ALSVID / 售后页面提供 **“更新最新状态”** 按钮；
- 用户手动刷新时，再去 Shopify/WMS 获取这个页面需要的最新事实；
- 页面显示“最后更新时间”和“预计刷新时间”；
- 手动刷新设置短时间 cooldown，避免连续重复请求；
- 未来真的出现秒级业务需求，再增加 Webhook/实时机制。

ALSVID 保存的是 Vehicle 360、客户服务、售后所需要的外部事实，而不是完整克隆 Shopify/WMS 数据库。

---

## 9. Q4 当前怎么定位

Q4 **当前不承担正式 Production 运行，也不建设完整容灾/灾备体系**。

现阶段不投入：

- 多地域热备；
- 自动灾难切换；
- 复杂离线备份体系；
- Q4 作为生产备机。

这不是说“永远不备份”，而是明确把完整 Backup/DR 放到后续业务规模真正需要时再设计。

---

## 10. 当前成本和复杂度原则

ALSVID 当前阶段优先级：

1. 稳定；
2. 简单；
3. 低运维；
4. 正常全球访问；
5. 尽量利用免费/低成本额度；
6. 保持可迁移，不为了免费把系统锁在小平台。

允许为大厂服务绑定支付方式，但目标是当前低使用量阶段尽量保持非常低的实际运行费用。

---

## 11. Clean-slate rules

- No legacy runtime code is copied into this repository.
- No legacy database migration chain is inherited.
- No backward compatibility with ChaiBen-OS or the previous ALSVID API is required unless a future ADR explicitly approves it.
- Historical repositories may be consulted for business requirements only.
- 1688, JackYun/吉客云, domestic China sales/tax/accounting workflows, and CoffeeBear business logic do not belong here.
- Shopify/WMS are external systems; ALSVID does not recreate a general-purpose OMS.

---

## 12. Product / domain direction

ALSVID is organized by durable business domains rather than by screens:

- Identity & Access
- Partners
- Product
- Engineering
- Procurement
- Production
- Inventory
- Warehouse
- Logistics & Export
- Commerce
- Finance
- Vehicle
- Dealer
- Customer
- Service & Warranty
- Communications
- Marketing
- Assets
- Integrations
- Audit & Compliance

The system begins as a modular monolith with explicit domain boundaries and contracts. This keeps deployment simple now while preserving a future path to split selected workloads when scale or organizational needs justify it.

---

## 13. ALSVID 官网商城架构（已确认）

ALSVID 官网采用：

> 品牌官网 + ALSVID 自建商城（首期不依赖 Shopify）

不是：

```text
品牌官网
+
独立商城
```

而是：

```text
ALSVID 官网

        |
        |
        +---- ALSVID Commerce
        |        商品 / Variant / 预览购物袋
        |        自建 B2C 订单编排（发布门禁后）
        |        +---- 获批 PSP 负责支付
        |        +---- Finance 记录验证后的支付事实
        |
        +---- My ALSVID
        |        会员体系
        |        车辆管理
        |        售后服务
        |
        +---- Dealer Portal
                 经销商体系
                 B2B采购
```

---

### 13.1 官网定位

ALSVID 官网同时承担：

- 品牌展示
- 产品展示
- 产品购买
- 配件销售
- 用户登录
- 车主服务入口
- 经销商合作入口

用户访问：

```text
www.alsvidbike.com
```

即可完成：

```text
了解品牌

↓

查看产品

↓

购买自行车

↓

注册车辆

↓

享受售后服务
```

---

### 13.2 官网顶部导航结构（已确认）

```text
ALSVID


自行车

配件

服务

关于我们

经销商合作


购买

登录

搜索
```

---

### 13.3 自行车产品体系

自行车作为官网核心入口。

产品按照平台体系管理：

```text
自行车

├── FC Series
│       Folding Carbon
│       碳纤维折叠平台
│
├── CT Series
│       City Touring
│       城市通勤平台
│
├── FT Series
│       Fat Tire
│       胖胎探索平台
│
└── GT Series
        Grand Touring
        长途旅行平台
```

产品页面包含：

- 产品介绍
- 技术参数
- 图片/视频
- 工程设计
- 配件推荐
- Shopify购买入口

---

### 13.4 配件体系

配件作为独立商业生态。

包括：

```text
配件

├── 车身配件
│
├── 骑行装备
│
├── 升级套件
│
└── 维修零件
```

配件在 ALSVID 自建产品中心展示；真实售价、库存、适配和支付未核验前不开放真实购买。

未来支持：

- 产品关联推荐
- 车型匹配
- 升级方案

---

### 13.5 My ALSVID 会员体系

My ALSVID 是公开给车主使用的会员系统。

不是后台系统。

用户登录后可以：

```text
My ALSVID

├── 我的车辆
│
├── 车辆注册
│
├── VIN / 车架号绑定
│
├── 保修查询
│
├── 维修服务
│
├── 服务记录
│
├── 用户手册
│
└── 服务网点
```

---

#### My ALSVID 与后台关系

用户看到：

```text
我的车辆

FC1

保修有效
```

后台管理：

```text
Vehicle 360

VIN

生产批次

销售渠道

购买记录

质保状态

维修历史

配件记录
```

---

My ALSVID 数据进入 ALSVID 后台运营系统。

---

### 13.6 经销商体系（Dealer）

经销商不是普通消费者。

对象：

- 自行车店
- 区域代理商
- 国家总代理
- 户外运动零售商

入口：

```text
经销商合作
```

包含：

```text
Dealer Portal

├── 经销商申请
│
├── 经销商登录
│
├── 产品目录
│
├── B2B采购
│
├── 订单管理
│
└── 市场支持资料
```

---

### 13.7 供应商体系说明

内部供应商档案、采购批准、生产与质量管理留在 Admin；外部供应商通过独立 Supplier Portal 自助提交报价/提案、确认 PO、交期、进度、发货通知和文件。Supplier Portal 是已确认的后续建设目标，当前尚未交付，不再把它解释为“永远只有内部档案”。

“供应商自己下单”区分为：上游供货的提案与履约协同，或同一企业作为 B2B 买家向 ALSVID 买货。前者由 ALSVID Procurement 管理；后者走获批的 Dealer/B2B 采购路径，首期不默认依赖 Shopify B2B。正式采购批准、收货/QC、入账和付款仍由授权流程处理。

官网不因预留 Supplier 就新增普通消费者主导航；通过邀请或经过验收的合作入口访问。执行与验收见 [门户实施台账](docs/PORTAL_DELIVERY_PLAN_2026-10-16.md)。

---

### 13.8 官网与后台系统边界

#### ALSVID Commerce 与外部渠道边界

首期由 ALSVID Commerce 管理：

```text
商品 / Variant / SKU 选择

浏览器本地预览购物袋

自建 B2C 订单编排（真实订单尚未开放）

订单可见状态
```

获批 PSP 负责支付处理；支付状态必须服务端验证。Shopify 仅是未来可能的外部渠道，未获负责人明确批准前不接入、不复制其订单事实，也不把其作为首期结账依赖。

---

#### ALSVID 后台

负责：

```text
Vehicle

VIN

客户

经销商

保修

维修

售后

车辆生命周期管理
```

---

#### 数据关系

```text
消费者

   |

ALSVID 官网

   |

ALSVID Commerce 订单 / 获批 PSP 支付事实

   |

ALSVID Admin 运营与履约

   |

Vehicle / VIN / 售后生命周期
```

---

### 13.9 官网首页规划方向

首页不是传统电商页面。

定位：

```text
品牌体验
+
产品体验
+
购买入口
+
车主生态
```

首页结构：

```text
第一屏

旗舰产品 FC1


↓

产品平台

FC / CT / FT / GT


↓

工程设计


↓

配件生态


↓

My ALSVID 服务体系


↓

经销商合作


↓

品牌故事
```

---

### 13.10 设计原则

ALSVID 官网参考方向：

- Apple 产品体验
- DJI 科技展示
- Tesla 用户生态
- 国际自行车品牌专业感

原则：

- 简洁
- 高端
- 产品优先
- 少菜单
- 强视觉
- 强品牌体验

---

## 14. Technical baseline

- TypeScript end-to-end
- Next.js + React for web applications
- NestJS for application/API services
- PostgreSQL as the authoritative relational database contract
- Cloudflare R2 / S3-compatible object storage for binary assets
- Background worker for asynchronous jobs, integrations, AI-assisted processing, and long-running workflows
- API/event contracts shared through versioned packages
- Docker/container-based Production delivery

---

## 15. Repository layout

```text
apps/
  web/        # Internal Admin, Dealer Portal, My ALSVID web surfaces
  api/        # NestJS modular-monolith API
  worker/     # async jobs, integrations, workflow execution
packages/
  database/   # PostgreSQL connection and migration runner
  contracts/  # API/event schemas and shared identifiers
  config/     # shared configuration primitives
  ui/         # ALSVID design system
  testing/    # test helpers and fixtures
domains/
  identity/
  audit/
  partners/
  product/
  engineering/
  assets/
infra/         # local and production infrastructure definitions
docs/          # architecture, boundaries, decisions, ownership and operations
```

---

## 16. AI / 新开发者必须先读

在修改 ALSVID 架构或业务边界前，至少先读：

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/AI_CONTEXT.md`](docs/AI_CONTEXT.md)
3. [`docs/ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md)
4. [`docs/BUSINESS_BOUNDARY.md`](docs/BUSINESS_BOUNDARY.md)
5. [`docs/DATABASE_DECISION.md`](docs/DATABASE_DECISION.md)
6. [`docs/RUNTIME_DECISION.md`](docs/RUNTIME_DECISION.md)
7. [`docs/STORAGE_DECISION.md`](docs/STORAGE_DECISION.md)
8. [`docs/ENVIRONMENT_STRATEGY.md`](docs/ENVIRONMENT_STRATEGY.md)
9. [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
10. `docs/CURRENT_STATE.md` / `docs/ARCHITECTURE.md` / `docs/DATA_OWNERSHIP.md` / `docs/BUSINESS_FLOWS.md`

### 重要规则

> 不要因为换了 AI、换了开发人员、出现了一个新云平台，就自动推翻已经确认的架构。

任何重大变更都必须先回答：

- 当前方案解决了什么问题？
- 新方案具体解决了哪个真实问题？
- 会不会破坏 ALSVID 的业务边界？
- 能不能回滚？
- 是否真的值得增加复杂度？

---

## 17. Local bootstrap

本地开发使用 Docker；CI 使用临时 PostgreSQL 和容器。生产发布遵循 [`docs/ENVIRONMENT_STRATEGY.md`](docs/ENVIRONMENT_STRATEGY.md)，不依赖云端 Development/Test。

Typical local setup starts with:

```bash
pnpm install
pnpm dev
```

Use repository scripts/infra definitions documented in the current branch rather than copying credentials into source control.

---

## 18. 最后一句

ALSVID 的目标不是“把所有系统都自己做一遍”，而是：

> **把品牌最重要、最长期的 Vehicle / VIN / Customer / Dealer / Warranty / Service 数据掌握在自己手里，同时让 PSP、WMS、云数据库、对象存储和运行平台都保持可替换；Shopify 不是首期 B2C 交易依赖。**


## 四大门户与自建商城边界（当前执行基准）

**所有 AI / 开发人员在设计官网、商城、Admin、Dealer 或 My 功能前，先阅读 [`docs/PROJECT_MEMORY_INDEX.md`](docs/PROJECT_MEMORY_INDEX.md)、[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) 和 ADR 0005/0006。**

四个核心产品边界：**ALSVID Official**（www.alsvidbike.com，品牌官网 + 自建 B2C 商城）、**ALSVID Admin**（admin.alsvidbike.com，内部运营）、**ALSVID Dealer Portal**（dealer.alsvidbike.com，经销商业务）、**My ALSVID**（my.alsvidbike.com，车主会员与售后），另有分阶段交付的 Supplier Portal。B2C 商品、购物袋、订单与结账由 ALSVID 自有 Commerce 负责；支付由获批 PSP 处理，未通过发布门禁前不得真实收款。首期不依赖 Shopify，也不拆出独立公开 Shop 站点；不把内部 Portal Launcher 当成公开首页。

[`docs/FOUR_PORTALS_AND_SHOPIFY_2026-10-13.md`](docs/FOUR_PORTALS_AND_SHOPIFY_2026-10-13.md) 是早期规划，其中 Shopify-first 交易与 My 登录方案已分别被 ADR 0005 和 ADR 0006 取代。它保留为历史依据，不再作为当前实现指令。正式域名、上线证据与未完成项以 [`docs/PORTAL_DOMAINS.md`](docs/PORTAL_DOMAINS.md)、[`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md) 和对应 Issue/PR 为准。

门户固定地址、历史开发地址与当前验证范围见 [`docs/PORTAL_DOMAINS.md`](docs/PORTAL_DOMAINS.md)。


## 正式域名规范与迁移状态

新生成的门户链接统一使用 `alsvidbike.com`（例如 `www.alsvidbike.com`、`my.alsvidbike.com`、`admin.alsvidbike.com`、`dealer.alsvidbike.com`）。旧 `chaibenn.com` 为迁移/历史域名。DNS、TLS、Cloud Run 自定义域名、认证回调和 Resend 发件域必须通过实际验收后，才能认定生产切换完成；详见 [docs/PORTAL_DOMAINS.md](docs/PORTAL_DOMAINS.md)。

## 独立项目入口与命名（2026-10-14）

正式项目名称为 **ALSVID Official（ALSVID 官网）**、**My ALSVID（车主中心 / 我的车库）**、**ALSVID Dealer Portal（经销商平台）**、**ALSVID Admin（内部运营中心）**。四者是独立前端项目，通过统一身份认证及部分数据联动协作，大部分关系是跨应用跳转，不是同一系统页面。

Admin 顶部右侧应用切换器建议显示 `ALSVID Apps`，入口为 **官网、车主中心、经销商平台**。详细规范见 [docs/APP_ENTRY_ARCHITECTURE.md](docs/APP_ENTRY_ARCHITECTURE.md)；正式命名见 [docs/SYSTEM_NAMING.md](docs/SYSTEM_NAMING.md)。本次为文档规范更新，不代表四前端拆分、切换器 UI、SSO 或域名已全部上线。
