# ALSVID Admin 设计同步历史（已退役）

> 2026-11-02：85 页 Ardot 演示页面、独立样例表单/图表、旧工作台 V2/V3 及生成器已从运行代码移除。此文件不是现行功能目录。

## 当前唯一实现

- 正式 Admin 由 apps/web/app/admin 与 _design/renderer.tsx 的真实业务组件组成；仍复用统一 Neon/R2、API、权限。
- _design/synced-screens.json 现仅保存 13 个已实现路由的元数据，不包含模拟订单、VIN、客户或经营 KPI。
- 旧的深层书签被引导到对应的真实业务列表，不再由旧样例渲染器展现虚构记录。
- 旧的 scripts/sync-admin-design.cjs、scripts/admin-design-refinements.cjs、_design/screens-a/b/c.ts、_design/sync-manifest.json 已删除。不得重新导入平行后台框架。
- 仍被使用的 CSS 选择器已归并至 theme.css；theme-legacy.css 独立文件已移除。
- 新页面必须使用实际业务 API、权限、表格和保存流程，不得采用历史演示数据作为生产事实。

历史设计稿只作为需求参考，不是部署或业务验收依据。当前 SHA 的 CI、浏览器测试及发布后核验仍为必需步骤。
