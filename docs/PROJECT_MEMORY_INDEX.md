# ALSVID 统一记忆入口（GitHub 唯一归档源）

> 状态：active / 2026-10-22
> 本文是导航索引，不是新数据库，也不复制现有知识。
> `ALSVID Admin → 设置 → 系统架构` 是给负责人的只读框架视图；GitHub 保存全部可归档项目知识。

## 两层职责

- **Admin**：显示门户关系、公司内部运营模块、业务流程、基础架构及 GitHub 文档入口。Admin 的结构页不维护第二份架构事实，不承担 AI 记忆存储、不冒充实时进度。
- **GitHub**：权威保存已核准业务知识、长期规则、需求、系统设计、ADR、代码、已核验进度、PR / Issue / 提交记录。任何 ChatGPT / AI 会话中的新结论，需要提炼、核验并明确写入对应文件后才算被共享归档。
- **ChatGPT 记忆**：可提示重要约束与仓库入口，但无法保证逐字记录全部会话，亦不与 GitHub 自动双向同步。

## 从哪里找（现有文件优先）

| 需要查找 | 唯一维护处 |
| --- | --- |
| AI 工作方式、部署/权限/变更边界 | [AGENTS.md](../AGENTS.md) |
| **所有机器人共用一套 ALSVID 系统（不可拆分）/跨模块联动 / PR 强制验收** | [单一系统与多 AI 协作契约](ONE_SYSTEM_DEVELOPMENT_CONTRACT.md) |
| 公司长期业务知识与分类 | [knowledge/README.md](../knowledge/README.md) |
| 已确认的长期业务变更 | [Decision Log](../knowledge/00-Company/Decision-Log.md) |
| 业务、技术架构变更原因与被替代关系 | [docs/adr](adr/) |
| 官方网站与商城 | [knowledge/03-Systems/WWW.md](../knowledge/03-Systems/WWW.md) |
| **官网共同功能框架（ADO + Himiway）** | [ALSVID Official Website Functional Framework](ALSVID_OFFICIAL_WEBSITE_FUNCTIONAL_FRAMEWORK.md) |
| 内部 Admin | [knowledge/03-Systems/Admin.md](../knowledge/03-Systems/Admin.md) 与 [Admin IA](ALSVID_ADMIN_IA.md) |
| **Admin 全量功能目录** | [ALSVID Admin Function Catalog](ALSVID_ADMIN_FUNCTION_CATALOG.md) |
| **Admin P0 核心业务交付与验收** | [P0 Delivery 2026-10-23](ALSVID_ADMIN_P0_DELIVERY_2026-10-23.md) |
| 经销商自助 | [knowledge/03-Systems/Dealer-Portal.md](../knowledge/03-Systems/Dealer-Portal.md) |
| 车主中心 | [knowledge/03-Systems/My-ALSVID.md](../knowledge/03-Systems/My-ALSVID.md) |
| 后续供应商自助 | [knowledge/03-Systems/Supplier-Portal.md](../knowledge/03-Systems/Supplier-Portal.md) |
| 产品、平台、SKU、BOM | [knowledge/02-Products](../knowledge/02-Products/) 与 [产品架构](PRODUCT_ARCHITECTURE.md) |
| 历史 Medusa/CRMEB 对比试验（已退役原生框架） | [历史交付记录](COMMERCE_SOURCE_DELIVERY_SCOPE_2026-10-26.md)；**现行商城**遵循 [Admin IA](ALSVID_ADMIN_IA.md) 与 [发布流程](RELEASE_FLOW.md)，不得恢复独立 PHP/MySQL/Vue 运行栈 |
| 当前实施及验收证据 | [CURRENT_STATE.md](CURRENT_STATE.md)、关联 Issue/PR/具体提交 |
| 多 AI / 多电脑交接 | [COLLABORATION.md](COLLABORATION.md) |
| 部署流程 | [RELEASE_FLOW.md](RELEASE_FLOW.md) |
| 产品类型/首页 ID | [PRODUCT_TYPES_HOME_BINDINGS_2026-10-22.md](PRODUCT_TYPES_HOME_BINDINGS_2026-10-22.md) |
| 第三方仓 / WMS | [THIRD_PARTY_WAREHOUSE_INTEGRATION_2026-10-22.md](THIRD_PARTY_WAREHOUSE_INTEGRATION_2026-10-22.md) |

## 文件归档规则

1. **只维护一份权威事实**：新决策写入相关知识文件和 Decision Log；影响软件边界或替换旧决定时新增/更新 ADR，旧文档标记 superseded，不直接抹掉历史。
2. **不要把聊天记录原样倒进知识库**：提炼成日期、状态、决定、原因、影响范围、依据、未决事项。没有用户确认的内容写 draft/pending，不当成已定方案。
3. **设计规则与实现状态分开**：设计稿/接口/页面存在不等于真实数据通路已完成；只有 CI、合并提交、部署与必要的线上核验才能更新“已完成”。
4. **版本由 Git 承担**：每项工作用 PR/Issue 和提交记录交接；不覆盖其他 AI 在进行的修改。
5. **权限与保密**：本仓库当前为公开仓库。不得存储凭据、个人身份/订单详情、未脱敏供应商材料、私有 ChatGPT 聊天原文或其他敏感资料。
6. **查找顺序**：先读 AGENTS.md → 此索引 → 任务关联知识/ADR → CURRENT_STATE → 相关 Issue/PR 与代码；冲突以日期、明确 supersedes 和当前代码/上线证据核实，不能只看文件标题。

## 需要持续维护，而非声称已经完成

- 汇总既有资料的重复项与旧 Shopify 叙述，添加替代状态或交叉引用。
- 把后续对话里用户确认的决策逐条归入知识库和 Decision Log。
- 每次交接记录当前 PR、commit、CI、部署和未完成事项。
- Admin 结构图当前为手工维护的只读导航；没有实现从 GitHub 自动解析所有文件或实时健康状态。
