# F8 → L1 真实商品合并（2026-11-03）

**目标：** 保留唯一经营商品 L1（product_id **100006**），将历史 F8（product_id **100001**）的有效商品信息并入 L1。SKU 身份和历史引用**不重新编号、不删除**。

## 生产数据只读预检
- F8：`F-20-20261028`，ACTIVE，1 个 DEFAULT 版本，1 个 SKU `100001001`；数据库描述/custom_fields 为空。
- L1：`L1`，DRAFT，1 个 DEFAULT 版本，1 个 SKU `100006001`；数据库描述/custom_fields 为空。
- 二者技术平台和商品类型一致；均无 BOM、数据库附件关联或 catalog_publications。
- 已检查含商品、SKU、版本及对象引用列的 20 张非主数据业务表，F8 命中数均为 0；零价格、零库存流水、零采购/生产/官网订单行。若上线前产生引用，迁移自动报错且事务回滚。
- 官网旧 `/explore/l8` 已以 L1 命名展示图片、参数和详情；其图片存放在 `apps/web/public/products/l8`，并非生产数据库附件。数据库迁移不创建虚构的 BOM、规格、库存、价格或资产记录。

## 迁移
文件：`packages/database/migrations/0061_merge_f8_into_l1.sql`

1. 检查 F8/L1 身份、平台、类型、默认版本/SKU、属性冲突及下游实际引用。
2. L1 继承 F8 的商品名称（车型名 F8 改成 L1）、缺失描述、扩展字段、默认版本/SKU 属性。
3. L1 及 SKU `100006001` 激活，F8、旧版本和 SKU `100001001` 退役，但不删除或重编号；历史来源记录保留数据库追溯。
4. WWW 旧 `/explore/100001` 指向正式 L1 详情；未发布时转到原 `/explore/l8` 预览。
5. 不自动发布 `catalog_publications`；上线仍须通过原有审核。无价格、库存或生产事实时不得伪造。

## 验证状态
- 在 Neon ALSVID Production 的**隔离数据库分支** `review-f8-l1-merge-20261103` 实际运行 SQL 并复核，测试结果：
  - 商品 `100001`: RETIRED；商品 `100006`: ACTIVE。
  - SKU `100001001`: RETIRED；SKU `100006001`: ACTIVE。
  - L1 名称：`ALSVID L1 20英寸碳纤维折叠电动自行车 20后轮毂驱动`。
- 随后只读复查**生产主分支**：F8 仍 ACTIVE，L1 仍 DRAFT；即**生产数据没有被此验证更改**。
- 生产部署、迁移应用、网页端到端验收：**尚未完成**。在发布前复查 DB 依赖及 CI，且用户确认生产写入后再执行。

## 生产上线后必须核验
```sql
SELECT product_id,code,name,status FROM product.models
WHERE product_id IN (100001,100006) ORDER BY product_id;
SELECT product_id,sku_number,sku,name,status FROM product.skus
WHERE sku_number IN (100001001,100006001) ORDER BY sku_number;
SELECT filename,applied_at FROM platform.schema_migrations
WHERE filename='0061_merge_f8_into_l1.sql';
```
再检查官网 `/zh/explore/l8`、`/zh/explore/100001`、发布后的 `/zh/explore/100006` 及 Admin 商品列表。
