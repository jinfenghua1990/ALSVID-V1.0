# ADR 0007 — 本机为主开发，GitHub 仅作备份与正式发布

- 日期：2026-11-03
- 状态：负责人当日决定并已生效；备份脚本首跑证据见文末。
- 取代：2026-10-31 决定中"所有代码修改必须通过 GitHub 任务分支和 PR、本地工作副本不得编辑代码"，以及 `AGENTS.md`"多设备与多 AI 协作规则（2026-10-18）"里"一项任务一个短期分支和 PR""代码直接在 GitHub 任务分支修改"等表述。**正式系统唯一、数据与密钥保护、发布不变量、CI 门禁内容不变。**

## 决策

代码编辑地点从 GitHub 任务分支改为本机工作副本 `C:\Users\jinfe\alsvid-local`。GitHub 只保留两个职责：异地备份和正式发布。

- 改完运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\local-backup.ps1`。脚本暂存工作区改动，扫描待提交清单拦截疑似密钥/本机配置，做一次本地提交，然后只推 `HEAD:refs/heads/backup/local`。
- 阶段性留档加 `-Snapshot`，额外推带时间戳的 `backup/local-yyyyMMdd-HHmmss`；`-Message` 可写自定义提交说明。
- 未经负责人明确说"发布/上线"，不得推送 `main`、不得把 PR 标为 Ready、不得运行 `production-deploy.yml`。
- 要上线时单独走一次：先比较本地 `main` 与 GitHub `main`，解决差异并保留远端已有功能，再推 `main`，走现有 CI 与发布门禁。
- 本机多窗口协作开工前先 `git status` 并读最近提交，确认没有别的 AI 窗口未提交的改动；保留它们，不覆盖、不 `reset --hard`、不清理未跟踪文件。

## 为什么这样不会误上线

`ci.yml` 的触发条件只有 `push: branches [main]`、`pull_request: branches [main]` 和手动 `workflow_dispatch`；`auto-merge.yml` 监听 CI 完成；`production-deploy.yml` 只有手动派发。因此推 `backup/local` 不跑 CI、不自动合并、不发布，是纯副本。这条判断在决策当日读过三个工作流的 `on:` 段落核实。

## 代价与接受的边界

- 备份粒度从"每个 PR 一次评审"变成"每次脚本运行一个快照提交"，评审环节后移到上线前；同机不同窗口的改动可能被合并进同一个快照提交，这是接受的（备份要求的是不丢，不是原子）。
- 只在本机提交而未运行脚本的改动没有异地副本，硬盘故障即丢失。规则文本已把这一点写成"等于没有备份"。
- 本机之外（换电脑、需远端评审、他人接手）临时回到任务分支与 PR 流程，使用前先 `git pull` 并在保留本机改动的前提下合并。

## 不变的东西

- 一套正式业务事实：Neon PostgreSQL 结构化数据、Cloudflare R2 文件、同一身份服务；不存在第二套测试业务环境，本地节点只是算力副本。
- 正式发布仍只从合并后的 `main` 经 GitHub 工作流到 Cloud Run，绑定确切源提交与不可变镜像 digest；回滚只能选此前成功发布且兼容的 `release_sha`。
- 生产凭据留在 Google Cloud Secret Manager，不入库、不进 GitHub 变量、不出现在日志；不得对正式数据执行破坏性验证。
- `scripts/check-single-system-contract.mjs`、`pnpm arch:check` 与容器验收仍是结构性门禁，本决定不弱化任何检查。

## 验证

- 决策当日本地 `main` 与 `origin/main` 同为 `6c77e864`，工作区干净，无未推送提交，切换起点无遗留。
- 首跑证据（2026-11-03 23:31 本地）：`scripts/local-backup.ps1` 成功提交 6 个文件并推送 `backup/local` 与快照 `backup/local-20261103-233148`，两者均指向 `f5a5c0e0`；`git ls-remote` 确认远端 `refs/heads/main` 仍为 `6c77e864`，本地 `main` 领先 1 个未推送提交（符合预期）。
- 未触发流程的证据：GitHub Actions 最近一次运行仍是 `2026-11-03T12:22:23Z` 的 ALSVID Production Deploy，备份推送之后没有任何新 run。
- 脚本在 `.git/index.lock` 存在时会拒绝执行并给出等待指引（首跑期间实测拦住过一次残留锁）；确认无 git 进程且属残留后才手工删除。
