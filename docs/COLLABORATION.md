# 统一开发与版本恢复

## 日常入口

2026-11-03 负责人确认（取代 2026-10-31 表述，见 [ADR 0007](adr/0007-local-first-editing-with-github-backup-branch.md)）：**代码在本机工作副本直接修改**，不再要求先建 GitHub 任务分支或提 PR。GitHub 承担两项职责——备份与正式发布：每次改完运行 `scripts/local-backup.ps1`，脚本本地提交后只推 `backup/local`；`main` 只在负责人明确授权上线时才推。所有电脑上的实际业务部署和使用均连接同一正式身份服务、正式业务数据和 R2；不存在独立测试业务环境。优先使用正式 HTTPS 入口；如需本地运行，先确认其服务、数据库、存储、身份和凭据的实际绑定，未核实前不得标为正式或用于业务。不得自动初始化、迁移、重置或覆盖正式数据。

备份分支不触发任何流程：`ci.yml` 只监听 push `main` 与指向 `main` 的 PR，因此推 `backup/local` 不跑 CI、不合并、不发布，纯粹是异地副本。

发布路径不变：GitHub 仍是共享代码历史与唯一正式发布通道，先检查工作树、当前 `main` 和开放 PR，保留远端已有功能，沿用现有检查及发布流程。Codespaces 是可选开发工具，不是业务环境或发布前置条件。CI 可使用临时合成数据做自动检查，但不接入正式数据和凭据。生产凭据只通过授权、安全的方式提供，不提交源码或输出日志。

## AI 与交接

## 本机与多 AI 协作规则（2026-11-03）

- 开工先跑 `git status` 并读最近提交，确认本机其他 AI 窗口有没有未提交改动；已有任务优先续接当前工作树状态，禁止从过期聊天快照覆盖代码。
- 一项任务一个本地提交批次，改完立刻 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\local-backup.ps1` 备份到 `backup/local`。阶段性成果加 `-Snapshot` 额外留一个带时间戳的备份分支。
- 脏工作树先保留并确认归属，不得 `reset --hard`、不得清理未跟踪文件、不得覆盖他人修改。脚本会把当时工作区全部改动做成一个快照提交，包括别的窗口留下的改动——备份前先看一眼 `git status`。
- 备份脚本发现疑似密钥或本机配置文件（`.env*`、`*.pem/*.key`、`service-account*`、`gha-creds-*`、`backups/`）会中止提交。出现中止先排查来源，不要绕过拦截。
- 未经负责人明确说"发布/上线"：不推 `main`、不把 PR 标 Ready、不运行 `production-deploy.yml`。`backup/local` 与快照分支永远不代表上线。
- 要上线时单独走一次：先比较本地 `main` 与 GitHub `main`，解决差异并保留远端已有功能，再推 `main` 触发 CI 与既有发布门禁。禁止为了过 CI 而弱化检查，不得强推共享分支。
- 交接写清仓库、基准/当前 SHA、已修改文件、验证结果、未提交内容和下一步。只提交在本机而未推备份分支的改动，等于没有异地备份。
- AGENTS.md 只约束实际读取并遵循它的工具；权限、分支保护和 CI 才能提供服务器侧约束。不得宣称所有机器人会自动读取。
- 不提交生产凭据或真实业务数据；代码回滚不等于数据库、对象存储和运行数据恢复。

本机之外仍需协作时（换电脑、需要远端评审或他人接手），临时回到 GitHub 任务分支与 PR 流程；网页/API 修改不会自动出现在本机工作副本，使用前先 `git pull` 并在保留本机改动的前提下合并。

## 唯一发布路径

保留当前链路：工作分支 → PR → CI `verify` + `containers` → main 对应提交的 CI → `production-deploy.yml` → Cloud Run。生产镜像按 SHA 记录并解析 digest；成功部署的 Actions 日志/summary 记录 Release SHA。记录最近正常版本的 SHA、工作流 run URL、镜像 digest 和迁移版本，不把可变 latest 标签当恢复点。

现有 PR Auto Merge 会对同仓库、可信作者、非 Draft 且 CI 成功的 PR 启用合并；合并后会继续 main CI 和生产发布。**Ready for review 在这里可能导致上线**，未完成验证/未获发布授权时保持 Draft。不要另加手动本机发布或另一条发布流水线。

## main 的服务器侧保护

本次检查：ALSVID 的 main 已受保护，必需 GitHub Actions 检查为 `verify`、`containers`；rulesets 列表为空。连接读取完整 branch protection 返回 403（Resource not accessible by integration），并无管理设置写入工具。账号元数据 admin=true 不等于当前连接具有 Administration 权限。因此不能确认 PR 强制要求、过期审批处理、管理员绕过、force push/delete 的完整状态，也没有宣称改过这些设置。

管理员进入 Settings → Branches，编辑现有 main 保护（不要替换或移除已有规则）：要求 PR；要求上述两项检查并要求分支更新；禁止 force push 和删除；适用时启用禁止绕过。单人维护时不要机械要求其他人一次审批而锁死自己；如有独立审核者再要求审批。保存后用具备 Administration read 权限的连接重新读取验证。不要把本次 Draft PR 直接标为 Ready，除非已接受自动合并/发布行为。

## 出错怎么恢复

- 提交历史保存每次已提交的代码快照；在文件 History 或仓库 Commits 查看、比较 SHA。没有 commit/push 的编辑不在 GitHub 历史中，禁止通过重写 main 历史来“恢复”。
- 错误普通提交：从最新 main 建恢复分支，`git revert <bad-sha>`，解决冲突、验证后提 PR。revert 新增反向提交，保留审计记录。
- 错误合并：在已合并 PR 使用 Revert 创建恢复 PR；若无按钮或有冲突，按实际合并类型处理。squash 合并 revert squash SHA；真正的 merge commit 需确认主线后用 `git revert -m 1 <merge-sha>`，不能盲用。
- 文件误删：在恢复分支执行 `git restore --source=<good-sha> -- path/to/file`，审查差异、提交并提 PR，避免恢复整棵旧代码覆盖后续工作。
- 线上故障急退：打开 Actions → ALSVID Production Deploy → Run workflow，工作流分支选择 main；release_sha 填**曾成功生产发布且仍在 main 历史中的完整 SHA**，confirm 填 deploy，rollback 选 true。当前发布门禁要求历史成功证据和三份原有发布镜像，缺失即拒绝回滚，不重建旧版。先核对数据库兼容性；工作流仍会执行迁移任务，并非数据库降级器。检查 API/Web/Worker、日志和 release SHA，随后补 revert/修复 PR，防止下次 main 发布重新引入错误。权限、镜像保留或 schema 不兼容时停止并按生产运行手册处理。
- 数据误删：GitHub **不自动备份 Neon 数据、R2 图片/附件、Cloud Run 运行数据、Secret Manager 或外部 Shopify/WMS 数据**。需要独立备份、保留策略和隔离恢复演练。先恢复到隔离目标核验，再审议切换；本次未执行任何生产数据恢复，也未确认现有备份可用。

## 其他仓库边界与本次审查

2026-10-18：ALSVID 开放 PR #203（Draft）和 #205（页面发布工作），本任务不改它们。WWW 是首屏动画参考档案，不能建立第二套正式官网发布；正式官网在 ALSVID/apps/web。CoffeeBear 是国内业务仓库，沿用其 docs/RELEASE_STANDARD.md 的候选制品与晋升路径，不复制 ALSVID 的 Node 单体环境或 Cloud Run 发布配置。两仓库 main 当前显示未保护，rulesets 为空；完整保护读取同样 403。共同的分支/PR/交接原则以各仓库的补充 PR 固化，业务代码与部署仍各自独立。

本次配置只代表可审查方案；Codespaces 实例创建/重建和实际容器运行必须另有真实证据。参考：[重开 Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/opening-an-existing-codespace)、[Revert PR](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/reverting-a-pull-request)。
