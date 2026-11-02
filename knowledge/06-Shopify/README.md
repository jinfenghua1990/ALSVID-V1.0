> **已退役（2026-11-02）**：此目录只保留历史决策，不再作为未来预留集成的实施清单。正式代码删除了 Shopify 接收、重放和新建渠道功能；禁止根据此处旧提案恢复。历史交易及审计记录仅作保留查询，不做数据库删除。依据 [运行退役说明](../../docs/SHOPIFY_RETIREMENT_2026-11-02.md)。

# Shopify（历史资料 / 非首期依赖）

> **当前状态（2026-10-22）：** 本目录仅保留旧 Shopify-first 规划和未来可选外部渠道参考。首期 B2C 商品目录、购物袋、订单与结账按 ALSVID 自建 Commerce 设计，支付由获批 PSP 处理；My ALSVID 使用 ALSVID 自有身份方案。依据 [ADR 0005](../../docs/adr/0005-alsvid-owned-storefront-and-third-party-payments.md) 与 [ADR 0006](../../docs/adr/0006-first-party-portal-auth-and-login-experience.md)。除非负责人重新明确批准，不得将本目录中的旧方案当成当前实施要求。

存放历史 Shopify 商品字段、内容发布、客服标签和自动化规则。商品事实先在 `02-Products/` 确认；只有未来明确启用 Shopify 连接器时，才将经核准的数据映射到这里。

旧规划曾将 Shopify 作为 B2C/B2B 买方交易与客户账户来源；该 B2C 交易决定已被 ADR 0005 取代，My 的 Shopify Customer 登录前提已被 ADR 0006 取代。ALSVID Product/Engineering 仍管理内部 SKU/BOM，Vehicle/Service 管车辆与售后，Procurement 管上游供应商协同 PO。不要将 Shopify 后台 Supplier/PO 功能推导成 ALSVID Supplier Portal 已具备。

若将来重新批准外部 Shopify 渠道，Dealer 的 Company/Location/Contact、客户账户与权限仍须在真实店铺验证。当前状态、代码缺口和验收证据统一维护在 [CURRENT_STATE](../../docs/CURRENT_STATE.md) 与对应 Issue/PR；不在知识库复制运行订单、账号或凭据。

