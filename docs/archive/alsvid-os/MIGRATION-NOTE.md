# ALSVID-OS 归档说明

本目录保存已停更的独立 Python 重写分支 `jinfenghua1990/ALSVID-OS` 的历史资料，供追溯与查证。

## 来源

| 项 | 值 |
|---|---|
| 源仓库 | `jinfenghua1990/ALSVID-OS`（2026-11-24 归档后删除） |
| 最后提交 | `f24a484bb5dc4f8e24ee6cb9a1a4f3b8e0f9171e`（2026-10-10） |
| 文件数 | 108 |
| 归档时间 | 2026-11-24 |

## 归档内容

- `alsvid-os-source.zip`：源仓库完整快照（108 个文件，含 Python 后端、测试、文档与配置）。
- `docs/`：源仓库中 17 份本仓库同名文件不存在的文档原文。
- `SOURCE-README.md` / `SOURCE-AGENTS.md`：源仓库根目录说明原文。

## 权威边界

本归档**不是**当前实现，也不是可运行系统。ALSVID 的唯一实现权威是本仓库 `ALSVID-V1.0`：

- `README.md`、`AGENTS.md`、`docs/CURRENT_STATE.md`、`docs/ARCHITECTURE.md`、`docs/DATA_OWNERSHIP.md`、`docs/PRODUCT_ARCHITECTURE.md` 等为现行权威文档；
- 源仓库里与现行文档同名的 4 份文件（`ARCHITECTURE.md`、`CURRENT_STATE.md`、`DATA_OWNERSHIP.md`、`PRODUCT_ARCHITECTURE.md`）内容已被本仓库版本取代，未复制，避免双权威；
- 源仓库的 Python 源码只以 ZIP 快照保留，不进入运行树，避免形成第二套实现。

需要查证旧设计决策时读本目录；开发实现只以本仓库现行文档与代码为准。
