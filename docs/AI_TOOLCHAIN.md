# ALSVID 可选 AI 工具链（2026-10-19）

## 范围和安装状态

此文件是**云端开发工具说明**，不是生产功能，也不是工具已经在 Codespace 中安装/运行的证据。

- **GitHub**：ALSVID 代码、设计归属、决策、协作与版本回滚的唯一权威源。
- **Playwright**：**已存在于** `.github/workflows/fc1-preview.yml`，CI 临时安装 `playwright@1.58.2` 和 Chromium；本次扩展官网多语言与桌面/移动端冒烟测试，复用这一安装，不修改锁文件。
- **Superpowers**：可选 Codex 等 Agent 技能包，仅安装到 Codespace 用户目录；不将第三方整套仓库复制进产品运行时代码。
- **Claude-Mem**：可选会话记忆工具；在 Codespace 中显式安装，以本地 observer 为默认建议；不等于跨 AI、跨 Codespace、GitHub 的共享记忆。
- **HyperFrames**：可选 HTML 动画视频渲染 CLI；仅用于将**另行制作的、可确定时间轴的**动画合成为视频，不能假设普通网站 `setInterval` 动画直接就是正确的视频作品。

## 最短操作

在 **ALSVID 共享 GitHub Codespace 的终端**执行下列命令，按需选择，不在家/公司电脑克隆项目：

```bash
# 所有三项可选工具（Superpowers / Claude-Mem / HyperFrames）
bash scripts/setup-optional-dev-tools.sh all

# 或只安装指定工具，避免安装不需要的功能
bash scripts/setup-optional-dev-tools.sh skills
bash scripts/setup-optional-dev-tools.sh memory
bash scripts/setup-optional-dev-tools.sh video
```

安装脚本不会由 CI、正式部署或 Codespace 自动启动。首次安装 Claude-Mem 可能仍需选择适用的 agent 或完成交互配置；安装后需重启 Agent。Superpowers 在没有 Codex CLI 的情况下仅准备技能目录，不代表 ChatGPT 云端对话、Figma 或 GitHub 机器人会自动载入它。Claude Code、Codex App 等客户端各自有官方插件安装入口，不能指望本脚本覆盖所有客户端。

安装后在 Codespace 中验证：

```bash
ls -l ~/.agents/skills/superpowers
npx claude-mem doctor
~/.local/bin/hyperframes --help
```

Playwright 在 PR 中自动运行：`FC1 browser preview` 会构建 Web、启动临时预览、运行 `scripts/fc1-browser-review.mjs` 和 `scripts/official-browser-smoke.mjs`，并上传浏览器截图/报告。原有 `verify`、`containers` 与生产发布门禁保持不变。

## 适用的 ALSVID 工作

1. **官网／自建商城／My／Dealer UI**：修改视觉和交互后，先跑现有测试；FC1 的颜色、折叠、图库等由原脚本检查；新增脚本覆盖 `/de/`、`/en/`、`/zh/` 官网首页、四场景切换，以及桌面/手机屏幕。
2. **跨 AI 交接**：每个任务仍需记录分支、PR、基准 SHA、改动文件、验证情况、剩余事项；权威事实更新 `AGENTS.md`、`knowledge/` 或 `docs/`，不得只保存在 Claude-Mem 私人记忆中。
3. **开发质量**：Superpowers 只提供工程技能建议，不会自动绕过 `arch:check`、类型检查、测试与审核；不要让它重构已确认的技术架构。
4. **品牌动画**：HyperFrames 作品与用户认可的官网 SVG / HTML 原素材分开保存。先明确动画时间轴和尺寸，再制作预览与导出视频；不要动线上 KV 背景或自行车原型，不把演示视频冒充可交互页面。

## 安全与限制

- 第三方技能和记忆扩展有权限读取代理会话、文件或工具结果；先审阅可信来源与隐私设置。禁止发送生产凭据、订单、客户隐私到外部服务。
- Claude-Mem 可在 `~/.claude-mem` 中保存数据，**Codespace 被删除后这类用户目录可能丢失**。同一个 Codespace 内的本地记忆不等于同步到所有电脑/机器人；长期资料必须写 GitHub。
- HyperFrames 需要 FFmpeg，可能在 Codespace 增加安装空间与时间。它不进入正式 Cloud Run 镜像，不影响 Shopify 结账。
- 任何工具的**真实安装成功**必须由 Codespace 执行日志/版本验证确认。脚本提交到 GitHub ≠ 执行了安装。
- 不自动下载/运行未审查的第三方脚本；脚本按需显式启动，可复核其源代码。

上游仓库：

- Claude-Mem: https://github.com/thedotmack/claude-mem
- Superpowers: https://github.com/obra/superpowers
- Playwright: https://github.com/microsoft/playwright
- HyperFrames: https://github.com/heygen-com/hyperframes
