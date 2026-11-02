# ALSVID Admin 旧代码退役边界（2026-11-02）

本清单以 `main` 的实际业务引用为准，不把历史设计演示、GitHub 合并或 CI 通过等同于生产业务验收。

## 当前已核对（2026-11-03，主干 46d7da53）

- 旧 `apps/web/app/app-navigation.ts` **已删除**，当前公共旧路径通过 `apps/web/app/_design/admin-navigation.ts` 读取单一 Admin 导航规范。旧文档中“仍在调用 app-navigation.ts”是历史记录，不能再作为现况。
- `apps/web/app/_components/portal-shell.tsx` 仍被 **dealer / supplier** 门户实际调用，组件不可整体删除；但 `admin` 分支、独立导航及激活判断没有实际渲染入口，本次移除以防重复菜单复活。
- `apps/web/app/_design/integrated-operations.tsx` 的 `/admin/supply/legacy` 仍映射真实供应链旧工作台；必须按业务功能和深链验收后才能退役。
- `apps/web/app/_experiments/commerce-lab` 的剩余读模块仍被 `shop-preview` 实际页面引用，不能按目录名全删；其退役边界需要先迁移真实调用方。
- `/product/media` 仍是**占位的图片/视频页面**，由旧门户导航入口使用；它不是可上传、可归档、可追溯素材的生产素材中心，不可在报表中认定已完成。
- 现有商城装修器的商品插入属于草稿/预览，不等于 WWW 发布；商品详情装修的完整发布闭环也尚未完成。
- 历史 UUID 迁移继续按数字 ID 主键的批次进行，**已合并迁移 SQL ≠ 已在生产执行或完成所有代码/API 转换**；未验证完所有历史关联前不可删除兼容字段。
- `apps/web/app/admin/[...designPath]/page.tsx` 的旧深链兼容跳转及真实业务入口仍被测试保护；旧书签/数据迁移前保留。

## 旧页面逐步退役必须满足的条件

1. 对应 `/admin` 页面能完成同样的**真实读取、编辑、保存、权限拒绝和错误恢复**；只画出一张表不算迁移。
2. 新旧页面使用相同的领域 API、业务 ID 和唯一事实数据源，不生成平行订单、SKU、库存台账或账号。
3. 生产环境用真实授权会话验收至少一个保存/刷新/返回工作流；自动 CI、浏览器样例和部署成功不能代替这一步。
4. 对已有深链和书签给出有意义的迁移目标或明确提示，避免静默重定向误导。
5. 每次仅退役经验证的单个工作台/路由；同步更新 `app-navigation.ts`、`renderer.tsx`、测试和文档，按明确 SHA 追踪 CI 与生产部署。

## 风险边界

不动 Neon 生产业务库、Cloudflare R2、历史审计记录、合法开源 LICENSE、认证守卫、Cloud Run 服务和现役支付/订单/库存行为。
