# 商城源码导入与发布范围（2026-10-26）

status: PR #375 deployed as `5cff0a37eb0911add744e4fb368056c3a2bb79e9`; production signed-in catalog operations and live R2 acceptance pending

## 负责人确认与现有资源
负责人要求把 Medusa 前台与 CRMEB 中文后台源码引入自己的 GitHub，发布至现有官网与 Admin，并保留原系统用于比较。Admin 的一级菜单为“商城方案对比”，独立二级入口为方案总览与布局比较、独立商品管理、旧版交互样机，不并入原电商业务菜单。

继续使用已有 Neon PostgreSQL、Cloudflare R2、Google Cloud Run。负责人选择改写商品功能复用现有数据库，决定见 [PostgreSQL 适配 ADR](adr/2026-10-26-commerce-comparison-postgresql.md)。开发仍直接通过 GitHub 分支与 PR 完成；“草稿私有预览”只表示未发布商品仅管理员可见，不表示私有代码仓库或另建部署环境。

负责人在 PR #375 完成代码、测试、截图审查后明确指示“**不用，直接部署**”。该确认适用于 PR #375；此前因缺少明确上线确认而产生的发布审批阻断已解除，不应继续把此版本记为等待批准或草稿。

## 已导入与已适配范围
- `external/medusa-dtc` 为固定版本官方 DTC 前台源码与许可证；商品卡适配在现有 Web 内并使用共享三语词库。CRMEB 原生 Vue 2/Element UI/PHP/MySQL 对比运行代码及静态快照在 2026-11-02 第二轮清理中移除；仅保留历史许可文本和决策记录。当前 Node/Next.js 商品编辑与统一 API 是唯一正式实现。`docs/COMMERCE_SOURCE_LOCK.json` 记录原始导入快照。
- PHP/MySQL 原生容器仅用于隔离参考验收，不是本次生产商品功能的运行依赖。
- WWW `/{zh,de,en}/shop-preview` 展示已发布实验商品，支持详情与独立预览袋；固定交互样例保留在 `/shop-preview/reference`。
- Admin `/admin/commerce-lab/catalog` 管理三语名称/说明、参考图、方案价与发布状态。`/admin/commerce-lab/catalog/{id}/preview` 支持已保存商品的三语只读预览；草稿与归档商品不向官网公开。
- 新增自定义主图上传、替换和移除，使用现有 Assets/R2；JPEG/PNG/WebP 最大 5 MiB。上传保持发布状态，移除只取消主图关联并保留对象。媒体权限、归属、乐观锁、审计与短期签名读取见 [媒体 ADR](adr/2026-10-26-comparison-product-media.md)。
- 增量迁移 0039 建立独立商品表，0040 增加封面引用与媒体关联类型。原 Product/SKU/Inventory/Finance/订单表没有被此功能重写。预览袋不创建真实订单或收款，方案价不代表正式可售价格。
- 商品比较与发布是本次交付范围。未把所有 CRMEB 模块或完整 Medusa 交易引擎适配成可用功能。

## 当前发布与核验证据
- [PR #375](https://github.com/jinfenghua1990/ALSVID/pull/375) 合并版本：`5cff0a37eb0911add744e4fb368056c3a2bb79e9`，包含先前主分支的 SEO 修复。
- [主分支 CI](https://github.com/jinfenghua1990/ALSVID/actions/runs/40341440288) 和 [完整生产发布](https://github.com/jinfenghua1990/ALSVID/actions/runs/40342257454) 成功。目标仍为 `alsvid-production` / `europe-west1`，未重定向到 `alsvid-prod`。
- Web 修订 `alsvid-web-00040-n87`，API 修订 `alsvid-api-00014-7gq`，各服务部署到 100% 流量。迁移执行 `alsvid-migrate-g8h8n` 成功；Neon 只读元数据确认 0040 的封面 UUID 字段与比较商品媒体关联类型已生效。
- 官网与 Admin `/release-check` 返回上述 SHA；API 健康检查版本一致且状态 ok。三语公共目录均连接成功并保持 noindex。
- 匿名管理 API 与主图 API 返回 401，管理/草稿预览页跳转登录（307），不存在的公共商品图返回 404，原生编辑器脚本返回 200。
- 只读核验时公共目录发布商品总数为 0。这是本次观测值，不是长期约束，也不说明没有私有草稿；未将 CI 商品或图片导入生产。

## 临时环境验收与生产验收的区别
[PR 浏览器验收](https://github.com/jinfenghua1990/ALSVID/actions/runs/40325387100) 已通过三语草稿预览、必填提示、主图上传与实际图片解码、桌面/手机布局、发布与下架检查。媒体重定向连接临时 HTTPS 图片服务，失败请求数为 0；不据此声称真实 R2 上传已验收。

主分支 CI 验证真实临时数据库上的正常登录/密码设置 → Web BFF → API → PostgreSQL → 审计 → 三语 SSR，覆盖 API 重启后的持久化、乐观锁冲突、来源拒绝、匿名拒绝与撤回。独立媒体集成测试使用真实临时 PostgreSQL 和替代 ObjectStoragePort，验证对象归属、权限与发布状态。

## 仍需完成
| 项目 | 当前情况 | 下一步 |
| --- | --- | --- |
| 正式账号操作 | 部署、匿名访问和临时真实链路通过；生产登录后的写入未验收 | 在现有账号中新增/编辑、刷新、预览、发布/撤回并核对审计，不索要密码或验证码 |
| 生产 R2 | 适配代码与现有配置已部署；临时媒体测试通过 | 用正式账号验收真实上传、草稿读取、公开读取与撤回；不新增存储服务 |
| 商品资料 | 本次观测无已发布商品 | 使用经确认的车型、三语资料与方案价；负责人允许当前阶段用占位图 |
| 正式交易 | 本区仍为比较目录与预览袋 | SKU、正式售价、可售库存、税费运费、真实订单、支付、履约和退款尚未完成本区融合 |
| CRMEB 其他模块 | 已导入源码，未全量适配 | 会员、优惠券、营销等逐项选择与验收，源码存在不能算已交付 |

初次独立目录发布见 [PR #372](https://github.com/jinfenghua1990/ALSVID/pull/372) 与 [初次生产发布](https://github.com/jinfenghua1990/ALSVID/actions/runs/40286738086)。这些是历史记录，当前应用部署版本以上述 PR #375 的 SHA 和实际核验为准。
