# ALSVID 业务 UUID 主键集中转换（2026-11-03）
**本 PR 是批量数据库底层切换，不等于 API / 外键全部完成数字化。**
在 2026-11-03 的生产数据库审计中，其余单列 UUID PK 主要位于空业务表。对 business schemas 中所有单列 UUID PK（预计 82 张表），一次性迁移为 `record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`，对现有 UUID 主键保留 UNIQUE 用于旧 API 兼容，旧 UUID FK 原始定义保留、重建并验证。在一个事务中执行，不删数据、不覆盖商品和 SKU 原数字号。

安全例外：identity / audit / platform 不在本次迁移内。登录会话、用户和审计相关 ID 需独立处理，以避免登录中断和丢失审计证据。

正式最终标准：每个自有业务表只有一个正式数字主键；下一阶段需批量把业务外键和各领域 API 切换到数字字段，并删除临时 UUID 别名。**未完成这一步前，不得声称系统已完全取消双轨。**

备份：截至本轮开始之前的生产只读快照分支 `backup-before-bulk-numeric-2026-11-03` 已建立；2026-10-31 旧 Snapshot 是过期的，不可作为这轮唯一备份。验证还应包括独立分支和 CI、实际行数及全部 FK 检查。
