# ALSVID 独立站商品、URL、SEO 和 SKU 技术规范（v1.2）

> 负责人新决策：2026-11-03。规范生效范围、代码实现、CI 通过、真实生产部署、SEO 收录需分别核验。
> `2-3-3` 是 ALSVID 自主企业编码规范，**不是** DIN 强制国家标准。

## 1. 商品身份、SKU 与配件归属

- ALSVID 自建独立站，Google SEO 优先；URL/页面名称面向搜索和用户，内部稳定数值主键/外键面向数据库、订单、BOM 与库存。商业 SKU 与数值主键各司其职，不能互相取代。
- 新建商品使用 2 字符归属前缀 + 连字符 + 3 字母品类代码 + 连字符 + 3 位规格代码：`A1-EBI-BLK`（共 10 字符、含两条连字符）。统一大写 ASCII 字母数字；重复 SKU 拒绝保存。
- 车型代号 `A1` / `A1-ULTRA` 不等于 SKU 前缀。每个新车型在建档时确认唯一的两位前缀，例如 `A1`→`A1`，`A1-ULTRA`→`AU`；不能简单截断造成冲突。内部商品 ID 继续稳定，历史数字主键不重编号。
- 专属配件归属车型前缀（但仍须有明确的物理兼容关系），ALSVID 多车型共用采用 `AL`，真正通用骑行周边采用 `UN`。同一个真实物料只建立一份库存/主档，适配多个车型通过独立的兼容关系维护，不凭前缀自动判定适配。独立兼容关系的全面实施需另行验收。
- 受控品类：`EBI` 整车、`BAT` 电池、`CHG` 充电器、`MOT` 电机、`RCK` 后货架、`FND` 挡泥板、`LCK` 车锁、`HLM` 头盔、`BAG` 车包。末尾三字符使用统一登记的颜色/容量/尺码规格（如 `BLK`, `WHT`, `GRY`, `500`, `750`, `STD`, `MBK`），不得在不同商品中自创冲突解释。
- GTIN/EAN、MPN 不得以 SKU 伪造替代；无正式有效 GTIN 时省略字段，不得一律将 Merchant Center `identifier_exists` 设置为 `no`。

## 2. 官网页面与 URL

已发布的四个官方整车页面必须保留，且保持现有稳定 URL（支持的各语言目录采用相同后缀）：

| URL | 当前车型归属 | 要求 |
| --- | --- | --- |
| `/zh/explore/fc1` | `A1-ULTRA` | 保留现有详情页 |
| `/zh/explore/fc2` | `L1-PRO` | 保留现有详情页 |
| `/zh/explore/l7` | `A1` | 保留现有详情页 |
| `/zh/explore/l1` | `L1` | 保留现有详情页 |

- 既有六位数字商品 URL 应重定向到上述四个稳定页面，不再将内部数字 ID 作为页面 canonical。旧 `/explore/l8` 继续重定向到 `/explore/l1`，保障历史入站链接。
- 对未来正式上架的新车型，SEO 推荐路径是 `/[lang]/bikes/[model-slug]`（例 `/de/bikes/a2`）；**新建后台车型草稿不自动创建公开路由，也不代表已经被 Google 收录**。新增公开页面需经发布审批、真实媒体验收、SEO 与网站部署测试。
- 新专属配件推荐 `/[lang]/accessories/[model]-[part-slug]`，通用配件 `/[lang]/accessories/[descriptive-slug]`，不放内部数字 ID 或 SKU。
- URL 使用小写、人可读词和连字符；尾斜杠策略统一；历史地址使用真实重定向，而不是一键删除有外链的页面。Google 不承诺纯语义 URL 可保证排名或 100% 权重转移。

## 3. 国际化、颜色变体、结构化数据

- 当前官网已有中文 `/zh`、德语 `/de`、英文 `/en`。法语 `/fr`、荷兰语 `/nl` 作为未来规划，须具备真实页面和翻译后才能对外标注 hreflang，不可给不存在的页面生成 alternate。
- 不同语言页面使用各自 self-canonical，并互相 hreflang 引用；`x-default` 指向实际存在的国际入口。
- 普通颜色与配置可通过 `?color=matte-black`、`?battery=750wh` 等参数选择。若支持变体分享，则带参直达应通过 SSR 恢复相应图片、SKU、价格与库存，且保证无闪烁；主页面为默认 canonical，独立变体可索引策略需按实际内容单独评估。
- Title/H1 使用当地语言及真实品类关键词，图片文件名/alt 清楚描述实物。已真实上架的商品才输出匹配页面的 `ProductGroup`、`Product`、`Offer` 结构化数据；库存、价格、GTIN、产品图片禁止虚构。Google Merchant Center Feed 与落地页参数需独立验收。
- Search Console 索引与 Merchant Center 审核需真实检查，不能把代码部署等同于收录成功。

## 4. 数据与发布保护

- 稳定产品主键、数值 SKU 主键、跨领域订单/BOM/仓储记录和历史展示 SKU 不做破坏性重编。库存以仓库流水/WMS 权威事实为准；商品停用不能级联删除历史记录。
- 本阶段「产品研发 → 整车产品 → 新建整车」负责新建车型主档和归属前缀；商业版本、颜色 SKU、BOM、售卖价格/库存与官网发布仍需各自流程确认，不因新建车型直接公开销售。
- 任何移除旧产品展示，应先区分产品页面、展示预览、数据库产品行、历史交易。保留四条指定页面；非上述页面的旧展示内容要通过映射核验和安全重定向处理，严禁误删订单或引用。
- 所有修改走任务分支、PR、CI、容器验收、main 精确 SHA 的 GitHub 生产发布；发布后核验线上实际版本和登录/商品创建功能。不能将文档、提交或绿色 CI 当成已经上线的证明。

Google 官方参考：
- https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites
- https://developers.google.com/search/docs/appearance/structured-data/product-variants
- https://developers.google.com/search/docs/specialty/international/localized-versions
