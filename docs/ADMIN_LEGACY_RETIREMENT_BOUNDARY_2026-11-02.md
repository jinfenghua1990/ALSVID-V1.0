# ALSVID Admin 旧代码退役边界（2026-11-02）

本清单以 `main` 的实际业务引用为准，不把历史设计演示、GitHub 合并或 CI 通过等同于生产业务验收。

## 本轮已核对

- `apps/web/app/app-navigation.ts` 的 `navigationFor()` 正被 `apps/web/app/_components/operations-frame.tsx`、`apps/web/app/overview/page.tsx`、`apps/web/app/vehicle360/page.tsx`、`apps/web/app/partners/partners-client.tsx` 等页面/组件调用。**不可删除**。
- `apps/web/app/_design/renderer.tsx` 的 `menuDestination()` 正在构建现役 Admin 二级菜单地址；不是死映射。**不可直接整段移除**。
- `apps/web/app/admin/[...designPath]/page.tsx` 的旧深链兼容转跳仍被回归测试保护；改为 404 或显式提示前，需评估书签影响。
- 旧 `/product`、`/commerce`、`/supply`、`/inventory`、`/production` 等路由承载或导航到真实业务 UI，现阶段保留；不要按另一路由目录结构整批删除。
- `apps/web/app/_design/live-workbench-todos-contract.ts` 和 `p0-operations-contract.ts` 的唯一生产引用来自已在 PR #461 删除的两个演示组件，剩余引用只有各自的旧测试；本轮连同专属测试删除。真实 API 的存在性断言迁入现役 Admin 测试。

## 旧页面逐步退役必须满足的条件

1. 对应 `/admin` 页面能完成同样的**真实读取、编辑、保存、权限拒绝和错误恢复**；只画出一张表不算迁移。
2. 新旧页面使用相同的领域 API、业务 ID 和唯一事实数据源，不生成平行订单、SKU、库存台账或账号。
3. 生产环境用真实授权会话验收至少一个保存/刷新/返回工作流；自动 CI、浏览器样例和部署成功不能代替这一步。
4. 对已有深链和书签给出有意义的迁移目标或明确提示，避免静默重定向误导。
5. 每次仅退役经验证的单个工作台/路由；同步更新 `app-navigation.ts`、`renderer.tsx`、测试和文档，按明确 SHA 追踪 CI 与生产部署。

## 风险边界

不动 Neon 生产业务库、Cloudflare R2、历史审计记录、合法开源 LICENSE、认证守卫、Cloud Run 服务和现役支付/订单/库存行为。
