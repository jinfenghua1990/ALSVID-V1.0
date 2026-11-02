# 商城融合：复用已有资源与核实结果（2026-10-26）

> **历史记录，非现行架构（2026-11-02）**：PR #453 已移除 CRMEB 原生 PHP/MySQL、Vue/Element UI 运行代码与源码导入自动化。以下内容仅记录 10 月 26 日阶段，不得按此文件重建独立商城服务器。现行系统以 Next.js + ALSVID API + 唯一生产 Neon/R2 为准。

负责人已有数据库、对象存储和云运行服务，要求把 Medusa 与 CRMEB 源码放入自己的 GitHub 并发布到现有官网/后台独立入口。后续明确选择改写商品功能复用现有 PostgreSQL，不再以前置 CRMEB 服务、MySQL 或新增服务器为条件。

## 已只读核实
Neon 项目和数据库均名为 ALSVID Production，生产分支 production，PostgreSQL 18，区域 aws-eu-central-1。初次资源核验仅通过连接器读取资源与表结构元数据，未获取/输出连接密码，也未使用连接器建库、迁移或修改数据。后续生产迁移通过既有 GitHub/Cloud Run 发布链执行，见下文。现有表覆盖 identity、product、commerce、inventory、finance、assets 等域。

仓库记录和原有部署链使用 Cloudflare R2 保存文件、Google Cloud Run 运行 WWW/Admin/API；已核实部署记录的项目为 alsvid-production，区域 europe-west1。实际发布仍由既有 production 环境配置确定，不切换项目。

## 当前实现
商品比较功能通过既有 Node API、身份授权和审计写入 commerce_lab.catalog_products 表。PR #372 已合并并通过现有完整生产流水线发布；迁移任务成功，Neon 表元数据也已只读确认新表存在。原业务表保留。精确版本、流水线和线上核验记录统一维护在[交付范围](COMMERCE_SOURCE_DELIVERY_SCOPE_2026-10-26.md)，不在此重复维护第二份发布清单。

此前拟定的 commerce-resource-inventory.yml 已删除：PostgreSQL 改写路径不需要盘点/创建 Cloud SQL，也不新增运维云身份。原生 PHP/MySQL 测试仅在临时 CI 中运行，不是要求负责人购买新资源。

## 源码与验收
过去曾导入 Medusa/CRMEB 对比素材；原生 CRMEB 运行快照与源码导入锁已退役，仅保留历史许可记录。实际适配范围为三语商品预览与独立中文商品管理，见 [交付范围](COMMERCE_SOURCE_DELIVERY_SCOPE_2026-10-26.md)。源码导入、fixture 浏览器验证与原生参考测试不等于全部功能已上线。独立商品功能已发布；生产真实管理员写入操作验收、R2 自定义媒体和正式交易扩展仍应按交付范围分别核验。
