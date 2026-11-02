> **ALSVID 统一数字 ID 规范（负责人决定，2026-11-02）：** 业务实体只允许一套正式数字主键和数字外键；商品沿用 6 位 product_id、SKU 沿用 9 位 sku_number，不重编号；业务单号仅作展示，型号代号不得作为第二身份。所有业务新表按 `BIGINT GENERATED AS IDENTITY` 建主键。禁止继续新增 UUID 业务主键、商品编码第二生成器或永久双轨关联。**现有 UUID 仍属待迁移历史负债，不能假称已清理。** 先读 [统一数字 ID 排查与迁移标准](docs/IDENTIFIER_STANDARD_2026-11-02.md)，通过 CI 门禁后按数据回填、跨领域替换、核验与回滚完成真实迁移；不得未经验证对生产执行破坏性 DDL。

> **Shopify removed from ALSVID runtime (owner decision, 2026-11-02):** No Shopify provider registration, webhook ingestion/replay, storefront checkout handoff or second business runtime. Do not revive archived Shopify-first plans or environment keys. Preserve existing PostgreSQL audit/order history and migrations. Refer to [Shopify retirement](docs/SHOPIFY_RETIREMENT_2026-11-02.md) and ADR 0005.

> **Owner decision (2026-10-31): one live production system for every computer.** All actual deployments and business use must connect to the same production identity, business data and Cloudflare R2. There is no separate test business environment. Never present local or mock data as production; verify the actual bindings and report any missing connection. All code changes are made through GitHub task branches and PRs; the local checkout must not be used to edit code. Compare the current main branch and task branch before changes and preserve existing functionality. Local access may be used for read-only inspection or verification when needed. Protect production data and secrets; use authorized access, never commit credentials, and do not run destructive validation against live data. Temporary automated CI checks are not a business deployment and must not use production data or credentials. This decision supersedes conflicting earlier environment and workstation rules.

> ⛔ **ALSVID ONE-SYSTEM CONTRACT (owner decision 2026-10-26) — mandatory for every AI/agent/developer.**
>
> **Read first:** [docs/ONE_SYSTEM_DEVELOPMENT_CONTRACT.md](docs/ONE_SYSTEM_DEVELOPMENT_CONTRACT.md) from the CURRENT main branch, then the architecture and data ownership files below. ALSVID is ONE integrated monorepo and modular-monolith business platform, not separate module systems to join afterward. Web/API/Worker are processes of that system; Official/Admin/Dealer/My/Supplier remain distinct permission-scoped user experiences but SHARE domain contracts and authoritative data. Never fork standalone systems, duplicate identity/orders/stock/business databases, or add an independent deployment/DB without explicit owner approval and an ADR.
>
> Before changing a module, identify upstream/downstream business contracts, IDs, states, write authorities and required integration tests; implement the affected producers AND consumers as one compatible change. Resolve conflicts within the task branch/PR BEFORE merge; do NOT ask a future agent to figure out integration. Protect Production credentials/data. All agents must follow the PR integration checklist and CI gates. **Documentation alone cannot force agents that never read the repo; branch protection and CI enforce only checks actually configured and executed.**

# ALSVID Agent Contract

This repository is the clean-slate implementation authority for ALSVID.

## Read first

Before changing application behavior or architecture, read in this order:

For portal UI, design-tool ownership, supplier work, and storefront checkout/payment work, also read `docs/DESIGN_TOOL_AND_PORTAL_BOUNDARY_2026-10-16.md`, `docs/PORTAL_DELIVERY_PLAN_2026-10-16.md`, ADR 0004 and [ADR 0005](docs/adr/0005-alsvid-owned-storefront-and-third-party-payments.md). ADR 0005 supersedes the earlier Shopify-first storefront transaction decision. Do not infer delivered capability from a design file, a role seed or a route alone.

1. `docs/PROJECT_MEMORY_INDEX.md` (统一入口：Admin 只读架构页，GitHub 长期记忆源)
2. `knowledge/README.md`
3. `knowledge/00-Company/Architecture.md`
4. `docs/AI_CONTEXT.md`
5. `docs/ARCHITECTURE_DECISIONS.md`
6. `docs/BUSINESS_BOUNDARY.md`
7. `docs/DATABASE_DECISION.md`
8. `docs/RUNTIME_DECISION.md`
9. `docs/STORAGE_DECISION.md`
10. `docs/ENVIRONMENT_STRATEGY.md`
11. `docs/OPERATIONS.md`
12. `docs/CURRENT_STATE.md`
13. `docs/ARCHITECTURE.md`
14. `docs/DOMAIN_STRUCTURE.md`
15. `docs/DATA_OWNERSHIP.md`
16. `docs/BUSINESS_FLOWS.md`
17. relevant ADRs under `docs/adr/`
18. the current issue/PR and affected `domain.json`
19. `docs/ENVIRONMENT_ARCHITECTURE.md`

For product, brand, website, dealer, customer-support, commerce or AI work, also read the relevant files under `knowledge/`. The knowledge base is the shared ALSVID business context; this file and the `docs/` files remain authoritative for engineering constraints. For ALSVID WWW, My ALSVID or Dealer Portal web UI, follow `docs/ALSVID_WEB_I18N_STANDARD.md`. ALSVID-owned storefront copy must use the shared locale catalogs; any future provider-hosted payment UI must be reviewed for locale coverage separately.

Confirmed architecture decisions are not suggestions. Do not replace providers, redraw system boundaries, or add major infrastructure merely because a different stack appears fashionable. First identify the concrete problem, review the recorded rationale, and document the new decision.

## Current rebuild gate

Issue #20 is closed and the platform-core encapsulation gate is complete. Continue through the prioritized backlog (#123); do not restart the completed rebuild or enlarge legacy implementations. New capability must retain domain encapsulation and pass `pnpm arch:check`.

Production has been deployed. Never assume a target has no business data based on older pre-deployment notes; verify its state before a destructive operation.

## Non-negotiable business boundaries

- Do not copy runtime code, migrations, schemas or compatibility layers from ChaiBen-OS or the previous ALSVID repository.
- Historical repositories are requirement references only.
- ALSVID is for the bicycle/export/Europe business.
- 1688, JackYun/吉客云, domestic China settlement/tax workflows and CoffeeBear-specific behavior are out of scope.
- ALSVID Commerce owns ALSVID's first-party B2C storefront flow: product selection, cart, checkout orchestration, customer order record and customer-visible order state. A payment service provider (PSP) performs payment processing. This is not a general-purpose OMS and does not replace WMS execution. Shopify is not required for the first release; adding it later requires a new owner decision and an explicit external-channel boundary.
- Ardot owns Admin operations design; Figma owns final external-portal UI. Keep one confirmed design source per page and reuse existing implementation incrementally.
- Supplier self-service is a confirmed phased target (#185). Upstream supplier proposals/PO commitments belong to ALSVID Procurement; supplier membership and dealer membership remain separate from consumer storefront checkout identity. Shared Partner identity does not merge Supplier/Dealer permissions.
- External portal APIs must enforce organization/ownership scope server-side. A role, shared Cookie or matching email is not a business entitlement; consult the portal delivery plan before exposing existing internal APIs.
- WMS remains the warehouse-execution authority for receiving, picking, packing, dispatch and warehouse-side fulfillment facts.
- ALSVID may store only transaction facts required for its own storefront, customer order history, Finance, vehicle lifecycle and reconciliation. For optional external channels or WMS, store/cache only required facts; do not clone complete external-platform or WMS databases.
- PostgreSQL is authoritative for structured ALSVID business facts. R2/S3-compatible storage holds binary objects only.
- Email and AI integrations are provider-neutral; business domains depend on ports, never vendor SDKs.

## Confirmed infrastructure direction

- Runtime decision (2026-11-02): authorized **local-first** Docker Web/API/Gateway application deployment may use the existing Production Neon/R2/secrets; the existing Cloud Run `alsvid-web`/`alsvid-api` remains another live HTTPS location and the current public site release target. Local operational preference does not prove a public cutover or tested local deployment. See `docs/LOCAL_PRODUCTION.md`.
- Railway and Apply.Build are unapproved alternative runtime candidates, not additional business databases or active deployments.
- Database standard: PostgreSQL.
- Production database primary: Neon PostgreSQL.
- Database migration alternative: Supabase PostgreSQL.
- Object storage primary: Cloudflare R2 behind S3-compatible ports/adapters.
- Development workflow (owner decision, 2026-10-31): all code edits are made in GitHub task branches and PRs; do not modify code in the local checkout. Compare the current main and task branch before editing and preserve existing functionality. Use existing review, CI and release gates. Every actual deployment and business session must use the shared production services and data; verify the connection rather than relying on labels.
- Production is the only active cloud runtime; the former shared Cloud Run Development/Test runtime in `alsvid-dev` is retired. **Observed live deployment (2026-10-25, run #40169393607):** `GCP_PROJECT_ID=alsvid-production`, region `europe-west1`. The separately created `alsvid-prod` project is an intended migration target, **not a verified deployed replacement**. Never silently retarget GitHub production variables, credentials, database or DNS; require an audited cutover and rollback plan.
- There is no separate test business environment. Automated CI checks may use ephemeral synthetic fixtures without production credentials; they are not a deployed business environment. Never claim an unverified production database or R2 connection is live.
- Q4 is not currently part of the Production disaster-recovery architecture; full DR is deferred.

## Admin record-list design

- For business record lists (orders, products, inventory and similar), use a compact table by default. Reuse the shared `av-tablewrap` / `av-table` styles and `av-table-record-meta` for grouped record headings.
- Place status filters, search and available actions above the table; keep table headings visible even when there are no records. Do not replace individual rows with cards unless the owner explicitly requests that presentation.
- Show only real data and supported actions. Keep existing permissions, workflows and domain-owned records intact.

## Architecture rules

- ALSVID remains a modular monolith unless an ADR proves a real need for service separation.
- Public product pages (FC1, FC2/Pilot X5, L7, L8 and accessories) are routes in the shared Next.js Web application, with existing Cloud Run `alsvid-web`/`alsvid-api` as the public release target and optional authorized local Web/API as another runtime against the same business data. Product models are not deployment units. Never create one Cloud Run service per product/model without a new owner-approved ADR.
- Follow `docs/DOMAIN_STRUCTURE.md`.
- `domains/<domain>/src/index.ts` is a public facade only once a domain is encapsulated.
- Core/application code cannot import provider SDKs or framework transport code.
- Apps import domains only through `@alsvid/<domain>` public facades.
- Cross-domain writes happen through public application contracts/events, never direct table mutation.
- Domain-specific SQL belongs in that domain's infrastructure layer.
- `@alsvid/database` provides mechanics, not business repositories.
- Long-running work uses durable job/outbox patterns through the worker.
- External systems are adapters behind `@alsvid/ports` or domain-specific ports.
- Prefer explicit state machines and immutable history for vehicles, inventory, money, consent and audit-sensitive facts.
- `pnpm arch:check` is a required CI gate. Do not weaken it to make a shortcut pass.

## Core identity rules

- Partner is the shared legal/business/person identity foundation.
- Product is not Vehicle.
- Product hierarchy: Platform -> Model -> Variant -> SKU -> BOM Revision / Build Specification -> Vehicle.
- One physical bicycle has one Vehicle identity; frame number becomes immutable after birth.
- Ownership changes append history; they do not erase the previous owner period.

## Database

- Production has live deployments. Schema migrations must preserve existing data, authorization and rollback/forward-fix safety. Never assume an empty database or perform destructive baseline cleanup without separately verified data ownership, backup/restore evidence and a reviewed migration plan.
- Monetary values require currency and decimal-safe storage.
- Inventory truth is movement-ledger based.
- Finance truth separates document, obligation, payment and allocation.
- Every business fact has one write authority as defined in `docs/DATA_OWNERSHIP.md`.

## External data freshness

At the current stage, optional external-channel/WMS integration does not require permanent real-time synchronization by default.

- Scheduled synchronization/reconciliation runs at least once per day.
- Customer/staff pages normally use the latest successfully cached ALSVID facts.
- My ALSVID / after-sales may expose `Refresh latest status` for on-demand refresh.
- The UI should show the last successful update time and expected refresh behavior.
- Real-time webhooks are an optional future optimization only when a real business need justifies them.

## Delivery discipline

- Current environment names: GitHub branch development, ephemeral CI, and Production. Codespaces is an optional development tool. `ALSVID Development` refers only to the retired historical cloud runtime; `ALSVID Production` is the active cloud runtime.
- Following the owner-approved 2026-10-14 Production-only decision, reviewed PRs target `main`; `develop` is optional and does not deploy a separate cloud runtime.
- `CI` contains code verification and isolated Docker acceptance. Keep the `verify` and `containers` checks; they use disposable GitHub runners and no Production credentials.
- Production starts only after successful main CI (push or explicit workflow dispatch after a bot merge) for the exact commit. The release gate verifies both jobs and rejects obsolete automatic releases. Explicit rollback may select a previously successful Production release.
- Do not restore the retired Development Build, Development Deploy or promotion workflows without a new owner decision.
- Every meaningful change maps to an issue or coherent PR.
- Update `docs/CURRENT_STATE.md` only when behavior or architecture becomes real.
- Add tests for changed invariants.
- Do not add secrets, credentials or real customer data.
- Prefer one clean implementation over compatibility shims for code that has never been deployed.
- CI validates a software version/commit; it never promotes test data into Production.
- Production changes must remain reproducible from GitHub source and documented configuration.

## 多设备与多 AI 协作规则（2026-10-18）

- 开工先核对 GitHub main 和相关开放 PR；已有任务优先续接原分支/PR，不从过期聊天快照覆盖代码。
- 一项任务一个短期分支和 PR；不要直接推送 main，也不要在本地仓库修改代码。代码直接在 GitHub 任务分支修改，独立 AI 通过已推送的提交、分支和 PR 交接；Codespace 为可选工具。
- 修改前确认 GitHub main 和任务分支均为最新；不得覆盖远端已有提交或强推共享分支。发现同文件并行工作先在 PR 说明并协调。
- 提交前检查 diff、密钥与相关验证；推送前再次检查远端分支，处理冲突并复验。禁止为了过 CI 而弱化检查。
- 交接写清仓库、分支、基准/当前 SHA、PR、已修改文件、验证结果、未提交内容和下一步。未提交修改不是 GitHub 备份。
- AGENTS.md 只约束实际读取并遵循它的工具；权限、分支保护和 CI 才能提供服务器侧约束。不得宣称所有机器人会自动读取。
- 不提交生产凭据或真实业务数据；代码回滚不等于数据库、对象存储和运行数据恢复。

开发入口和恢复操作见 `docs/COLLABORATION.md`。2026-10-31 负责人决定代码仅通过 GitHub 任务分支和 PR 修改，本地仓库不参与代码编辑；本机可作只读检查或验证。变更前比较 GitHub main 与任务分支并保留现有功能，通过现有 CI 和发布流程；实际业务部署须连接同一正式身份、业务数据与 R2，不得用模拟数据冒充；不新增共享测试业务环境。

## 可选 AI 工具链（2026-10-19）

具体安装方法、隐私边界和验收状态见 [docs/AI_TOOLCHAIN.md](docs/AI_TOOLCHAIN.md)。

- Playwright 已通过 `.github/workflows/fc1-preview.yml` 在 PR 临时 CI 中使用，并新增官网多语言/桌面/移动端冒烟检查；不要在 Production 容器中安装浏览器工具。
- Superpowers 和 Claude-Mem 是特定 Agent 的可选本地技能/记忆，不取代仓库 `AGENTS.md`、`knowledge/`、`docs/`、Git 提交和 PR 交接；其他机器人不会因为安装到某一个 Codespace 就自动获得这些能力。
- HyperFrames 是可选视频产出工具，与官网交互动画的上线代码分开管理。
- 在 Codespaces 中按需手动执行 `bash scripts/setup-optional-dev-tools.sh all`；未经执行和验收不得声称工具已安装，不向第三方记忆工具传输客户隐私或生产密钥。
