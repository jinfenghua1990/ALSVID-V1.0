> **本地为主开发与自动备份决定（负责人，2026-11-03）：** 代码在本机工作副本直接修改，不再要求先建 GitHub 任务分支或提 PR。每次改完运行 `scripts/local-backup.ps1`：本地提交后只推送到 GitHub `backup/local` 分支作为异地备份，该分支不触发 CI、不发布、不上线。未经负责人明确说"发布/上线"，不得推送 `main`、不得把 PR 标为 Ready、不得运行 `production-deploy.yml`；正式站（www/admin/dealer/catalog/my/service/supplier.alsvidbike.com）仍只从合并后的 `main` 经 GitHub 工作流发布，绑定确切 commit 与镜像 digest。要上线时先把本地 `main` 与远端 `main` 比对、解决差异并保留已有功能，再单独申请授权。本决定取代 2026-10-31 决定中"代码仅通过 GitHub 任务分支和 PR 修改、本地仓库不参与代码编辑"及相关表述；正式系统唯一、数据与密钥约束、发布不变量均不变。详见 [docs/COLLABORATION.md](docs/COLLABORATION.md) 与 [ADR 0007](docs/adr/0007-local-first-editing-with-github-backup-branch.md)。

> **2026-11-03 商品 SKU 更新决定：** 内部数值 Product/SKU 主键及关联保持稳定；新商品的面向仓储和客户的助记 SKU 使用 `A1-EBI-BLK` 等 2-3-3 形式，见根目录 [ECOMMERCE_SPEC.md](ECOMMERCE_SPEC.md)。本决定取代旧规则中“SKU 展示必须为九位数字”的部分，但不修改原数字主键、历史 SKU/订单/BOM。四个现有整车产品页 fc1、fc2、l7、l1 必须保留；纯数字公开 URL 不得作为 SEO Canonical。**

> **ALSVID 统一数字 ID 规范（负责人决定，2026-11-02；数字主键部分仍有效）：** 业务实体只允许一套正式数字主键和数字外键；商品沿用 6 位 product_id、SKU 沿用 9 位 sku_number，不重编号；业务单号仅作展示，型号代号不得作为第二身份。所有业务新表按 `BIGINT GENERATED AS IDENTITY` 建主键。禁止继续新增 UUID 业务主键、商品编码第二生成器或永久双轨关联。**现有 UUID 仍属待迁移历史负债，不能假称已清理。** 先读 [统一数字 ID 排查与迁移标准](docs/IDENTIFIER_STANDARD_2026-11-02.md)，通过 CI 门禁后按数据回填、跨领域替换、核验与回滚完成真实迁移；不得未经验证对生产执行破坏性 DDL。

> **Shopify removed from ALSVID runtime (owner decision, 2026-11-02):** No Shopify provider registration, webhook ingestion/replay, storefront checkout handoff or second business runtime. Do not revive archived Shopify-first plans or environment keys. Preserve existing PostgreSQL audit/order history and migrations. Refer to [Shopify retirement](docs/SHOPIFY_RETIREMENT_2026-11-02.md) and ADR 0005.

> **Owner decision (2026-10-31): one live production system for every computer.** All actual deployments and business use must connect to the same production identity, business data and Cloudflare R2. There is no separate test business environment. Never present local or mock data as production; verify the actual bindings and report any missing connection. **Code editing happens in the local checkout (owner decision 2026-11-03, superseding the earlier GitHub-task-branch-only rule): run `scripts/local-backup.ps1` after each change so GitHub `backup/local` keeps the off-machine copy — that branch triggers no CI and no release. Never push `main`, mark a PR ready or dispatch `production-deploy.yml` without the owner's explicit release authorization; production still ships only from merged `main`.** Protect production data and secrets; use authorized access, never commit credentials, and do not run destructive validation against live data. Temporary automated CI checks are not a business deployment and must not use production data or credentials. This decision supersedes conflicting earlier environment and workstation rules.

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
20. `docs/DEPLOYMENT.md` (M1 + Docker Test topology and unified Gateway)
21. `docs/PRODUCTION_RUNBOOK.md` (Production release, secrets, and rollback)
22. `docs/RELEASE_FLOW.md` (current release workflow and acceptance gates)

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

- Runtime decision (2026-11-02): authorized **local-first** Docker Web/API/Gateway application deployment may use the existing Production Neon/R2/secrets; the existing Cloud Run `alsvid-web`/`alsvid-api` remains another live HTTPS location and the current public site release target. Local operational preference does not prove a public cutover or tested local deployment. See `docs/LOCAL_PRODUCTION.md`; that file is the only source for prerequisites (Node 22.18+, pnpm 10.34.6, clean Git `main`, Docker Compose v2, gcloud with Secret Accessor), non-secret value sources, loopback-only `127.0.0.1:8080`, the four mandatory Secret Manager names, and post-start evidence commands. Windows requires Docker Desktop with WSL2. Do not fill `GCP_PROJECT_ID` with `alsvid-prod`; the recorded live authority is `alsvid-production`. This model keeps exactly one authoritative cloud copy of business data, objects, secrets and identity; local nodes are compute replicas only, and no replicated database, object sync or second identity store may be introduced.
- Railway and Apply.Build are unapproved alternative runtime candidates, not additional business databases or active deployments.
- Database standard: PostgreSQL.
- Production database primary: Neon PostgreSQL.
- Database migration alternative: Supabase PostgreSQL.
- Object storage primary: Cloudflare R2 behind S3-compatible ports/adapters.
- Development workflow (owner decision, 2026-11-03, supersedes 2026-10-31): edit code in the local checkout; no task branch or PR is required to make a change. After each change run `scripts/local-backup.ps1`, which commits locally and pushes only to `backup/local`, which triggers no CI and no release. Before starting work on this machine run `git status` and read recent commits, so parallel agent windows do not overwrite each other; keep uncommitted work, never `reset --hard`, never delete untracked files. Before anything reaches `main`, compare local and remote `main`, resolve differences and preserve existing functionality. CI and release gates stay unchanged and only fire on merged `main`. Every actual deployment and business session must use the shared production services and data; verify the connection rather than relying on labels.
- Production is the only active cloud runtime; the former shared Cloud Run Development/Test runtime in `alsvid-dev` is retired. **Observed live deployment (2026-10-25, run #40169393607):** `GCP_PROJECT_ID=alsvid-production`, region `europe-west1`. The separately created `alsvid-prod` project is an intended migration target, **not a verified deployed replacement**. Never silently retarget GitHub production variables, credentials, database or DNS; require an audited cutover and rollback plan.
- There is no separate test business environment. Automated CI checks may use ephemeral synthetic fixtures without production credentials; they are not a deployed business environment. Never claim an unverified production database or R2 connection is live.
- **Unified Test Gateway (owner-approved):** Development/Test remains M1 + Docker; do not create a third cloud Test runtime. Keep Web, API and Worker as separate processes/containers. For the Test Compose stack, publish the Gateway on host port 8080 as the only Web/API entry; keep Web 3000 and API 4000 internal, and keep Worker internal. Follow the explicit routing in `infra/gateway/nginx.conf`, including its Next.js/BFF/session/admin and image-upload exceptions; do not collapse all `/api/*` paths onto one upstream. Test data and credentials stay isolated from Production. See `docs/DEPLOYMENT.md`.
- **Production release and recovery invariant:** Production releases go only through the GitHub workflows from merged `main`, tied to the exact source commit and immutable image digest. Manual rollback may select only a previously merged, compatible `release_sha`. Production credentials belong in Google Cloud Secret Manager, never in the repository or GitHub variables. Application-image rollback does not reverse database migrations; use a reviewed forward migration or approved database recovery procedure. Never patch a running container. See `docs/PRODUCTION_RUNBOOK.md` and `docs/RELEASE_FLOW.md`.
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

## 本机与多 AI 协作规则（2026-11-03，负责人决定本地为主）

- 代码在本机工作副本修改，不要求任务分支和 PR。开工先跑 `git status` 并读最近提交，确认同机其他 AI 窗口有没有未提交改动；有则先沟通归属，不得覆盖、不得 `reset --hard`、不得清理未跟踪文件。
- 每次改完运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\local-backup.ps1` 备份（本地提交 + 只推 `backup/local`）。脚本发现待提交清单里有疑似密钥或本机配置文件会直接中止，此时先排查，不要绕过拦截提交凭据。
- `backup/local` 不是发布通道：它不触发 CI、不部署。未经负责人明确说"发布/上线"，不得推送 `main`、不得把 PR 标为 Ready、不得运行 `production-deploy.yml`。
- 需要上线时单独操作：先比较本地 `main` 与 GitHub `main`，解决差异并保留远端已有功能，再推 `main` 走现有 CI 与发布门禁；禁止为了过 CI 而弱化检查，也不得强推共享分支。
- 提交前检查 diff 与相关验证；交接写清基准/当前 SHA、已修改文件、验证结果、未提交内容和下一步。只在本机提交而未推备份分支的改动，等于没有备份。
- AGENTS.md 只约束实际读取并遵循它的工具；权限、分支保护和 CI 才能提供服务器侧约束。不得宣称所有机器人会自动读取。
- 不提交生产凭据或真实业务数据；代码回滚不等于数据库、对象存储和运行数据恢复。

开发入口和恢复操作见 `docs/COLLABORATION.md`。2026-11-03 负责人决定：代码在本机工作副本编辑，GitHub 只承担备份（`backup/local`）与正式发布（合并后的 `main`）两项职责，取代 2026-10-31"代码仅通过 GitHub 任务分支和 PR 修改、本地仓库不参与代码编辑"的说法。实际业务部署仍须连接同一正式身份、业务数据与 R2，不得用模拟数据冒充；不新增共享测试业务环境。

## 可选 AI 工具链（2026-10-19）

具体安装方法、隐私边界和验收状态见 [docs/AI_TOOLCHAIN.md](docs/AI_TOOLCHAIN.md)。

- Playwright 已通过 `.github/workflows/fc1-preview.yml` 在 PR 临时 CI 中使用，并新增官网多语言/桌面/移动端冒烟检查；不要在 Production 容器中安装浏览器工具。
- Superpowers 和 Claude-Mem 是特定 Agent 的可选本地技能/记忆，不取代仓库 `AGENTS.md`、`knowledge/`、`docs/`、Git 提交和 PR 交接；其他机器人不会因为安装到某一个 Codespace 就自动获得这些能力。
- HyperFrames 是可选视频产出工具，与官网交互动画的上线代码分开管理。
- 在 Codespaces 中按需手动执行 `bash scripts/setup-optional-dev-tools.sh all`；未经执行和验收不得声称工具已安装，不向第三方记忆工具传输客户隐私或生产密钥。
