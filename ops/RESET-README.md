# 业务数据清空（Reset）操作手册

> ⚠️ **不可逆操作。** 会清空 ALSVID 生产库中除登录体系外的全部业务数据。
> 目的：只保留系统框架，从零重新建档，观察新建流程中的 bug。

## 保留 / 清空范围

| 类别 | 内容 | 处理 |
| --- | --- | --- |
| 保留 | 登录与权限（`identity.users / roles / permissions / user_roles / role_permissions / sessions`） | 保留 |
| 保留 | 审计（`audit.events`）、任务框架（`platform.jobs`） | 保留 |
| 保留 | 字典（`product.product_types`、`product.model_field_definitions`） | 保留 |
| 清空 | 商品（models / skus / variants / platforms / series / 合并别名 / 发布记录 / 发布素材 / 首页绑定） | 清空 |
| 清空 | 商城（订单 / 订单行 / 价格 / 支付校验 / 履约 / 退款审核 / 渠道与映射 / 首页装修草稿）、`commerce_lab` | 清空 |
| 清空 | 工程（BOM / 构建规范 / 零件）、生产、采购、仓储、物流、伙伴（含供应商↔工厂关联）、财务、经销商、车辆、售后、库存、集成同步、资产链接 | 清空 |

共 **97 张表清空 / 10 张保留**（107 张表，来自全部 migration）。

## 执行步骤（三步，顺序不能乱）

### 第 1 步：备份

Neon 控制台 → 项目 → **Backup / Restore**（或建一个分支分支快照）。
命令行方式：

```bash
pg_dump "postgresql://<用户>:<密码>@<host>/<db>?sslmode=require" \
  --format=custom --file alsvid-backup-$(date +%Y%m%d).dump
```

### 第 2 步：预检（只读）

把 `ops/reset-business-data.dry-run.sql` 全文粘到 Neon SQL Editor 执行，确认：

1. 第 1 段列出的行数符合你的预期（哪些表里有数据一目了然）；
2. **第 2 段安全检查结果为 0 行**——如果出现任何行，说明保留表通过外键指向了业务表，把那张表加进 KEEP 名单再继续；
3. 第 3 段列出的保留表符合预期。

### 第 3 步：执行清空

把 `ops/reset-business-data.sql` 全文粘到 Neon SQL Editor 执行。

脚本特性：

- 整体在一个事务里，任一环节异常自动回滚；
- 执行后内置校验：`identity.users` 和 `product.product_types` 若被 CASCADE 误伤为空，**整个事务回滚**；
- `RESTART IDENTITY`：`product_id` 重新从 `100001` 开始，便于从零建档测试。

### 执行后验证

```sql
SELECT count(*) FROM product.models;              -- 0
SELECT count(*) FROM product.skus;                -- 0
SELECT count(*) FROM commerce.storefront_orders;  -- 0
SELECT count(*) FROM identity.users;              -- 保持原值（登录不受影响）
SELECT count(*) FROM product.product_types;       -- 保持原值
```

然后登录 Admin：商品列表为空、商城为空、订单为空，从「＋ 新建」开始重建，观察每一步是否出 bug。

## 回滚

如果清空后发现需要数据回去：Neon 控制台用第 1 步的备份做 Restore，或
`pg_restore --clean --dbname "<连接串>" alsvid-backup-YYYYMMDD.dump`。

## 边界说明

- 这个脚本**没有**接入 migration / CI，永远不会被自动执行；只存在于 `ops/` 供人工使用。
- AI 侧没有生产库凭据，执行由你在 Neon 完成；如果给我一个临时可写连接串，我也可以代跑，但**强烈建议你自己执行并盯结果**。
