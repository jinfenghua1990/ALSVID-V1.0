# ALSVID 本地 Production 运行（共享云端数据）

> 状态：新增可选本地运行配置；**不是已部署或已验收**。Cloud Run 继续运行，不删除服务、不切 DNS、不改变原自动发布工作流。所有真实业务实例共用既有 Production 身份/数据库/R2。

## 目标与边界

- 代码：仍以 `jinfenghua1990/ALSVID` 的已合并 `main` 为唯一代码权威；本地部署使用干净的主分支代码。
- 云端运行端：现有 Google Cloud Run `alsvid-web`/`alsvid-api` 保留，仍可供官网、Admin 与员工使用。
- 本地运行端：本机 Docker 仅启动 `gateway`、`web`、`api`，地址 `http://127.0.0.1:8080`，默认只绑定回环地址，**不对局域网或互联网开放**。
- 数据：唯一现有 Neon PostgreSQL Production 数据库，存储为现有 Cloudflare R2 Production bucket；身份/授权同数据库统一。运行时连接现有 Cloud Run 使用的同名 Secret Manager 资源。
- 不启动第二个 PostgreSQL/MinIO，不运行 Worker/轮询任务，不自动执行 schema migration、seed/admin bootstrap，不初始化、删除或复制生产数据。
- 每名员工使用自己的账号和最小权限。**普通员工访问现有 HTTPS Cloud Run 业务入口即可，不要给每台员工电脑分发 Neon/R2/Secret Manager 凭据**。本地完整 API 部署只供获授权的运维节点，员工从任何电脑访问同一服务即可看到同一权威数据（受权限、缓存与同步时间约束）。
- 本机 HTTP 仅用于回环访问，不支持未经 TLS、身份防护审查就开放到公网。若将来需要 NAS 作为共享入口，需单独审查 Cloudflare Access/Tunnel、TLS、访问控制、可用性、限流和 DNS，不能直接把 8080 映射到 `0.0.0.0`。
- 密钥以 Google Secret Manager 为来源，由有权限的操作员在启动时读取，并传给容器运行环境；**Docker 宿主机管理员仍可能通过运行时/inspect 读取容器环境变量**。因此不得把 Docker 宿主机或 Secret Accessor 权限授予普通员工。

## 首次准备（授权运维电脑）

### 前置条件

| 依赖 | 要求 | 校验 |
| --- | --- | --- |
| Node.js | `>=22.18.0`（根 `package.json` engines） | `node -v` |
| pnpm | `10.34.6`（`packageManager`，用 `corepack enable` 启用） | `pnpm -v` |
| Git | 仓库必须是干净 `main` | `git branch --show-current`、`git status --porcelain` |
| Docker | Docker Compose v2 | `docker compose version` |
| Google Cloud CLI | 已 `gcloud auth login`，身份具备目标项目 `Secret Manager Secret Accessor` 与 Cloud Run 只读权限 | `gcloud auth list` |

平台支持：macOS/Linux 使用 Docker Engine 或 Docker Desktop；Windows 使用 Docker Desktop（WSL2 后端）。启动脚本只调用 `docker` 与 `gcloud`，不依赖 bash。

与 `docs/DEVELOPMENT_WORKFLOW.md` 的关系：该文件的“不在本地 clone/安装依赖/启动 localhost 开发服务”约束针对**开发工作站**；本文件是**授权运维节点**运行同一 Production 应用的可选例外。例外不改变开发流程、CI 与发布门禁，也不允许在本地修改代码。

合规 checkout（压缩包或普通解压目录无法通过启动校验，脚本要求 Git 分支为 `main` 且工作区干净）：

```bash
gh repo clone jinfenghua1990/ALSVID
cd ALSVID
git checkout main
git pull --ff-only
cp infra/local-production.env.example infra/.env.local
```

仅在 `infra/.env.local` 填入 **非密钥** 配置。取值必须来自实际运行中的 Cloud Run，不得凭记忆填写：

```bash
gcloud run services describe alsvid-api --project <GCP_PROJECT_ID> --region <GCP_REGION> \
  --format='value(spec.template.spec.containers[0].env)'
```

- `GCP_PROJECT_ID` / `GCP_REGION`：以现有 `alsvid-web`/`alsvid-api` 实际所在的项目与区域为准。已记录的线上权威是 `alsvid-production`（`europe-west1`）；`alsvid-prod` 是未验证的迁移目标，**不得直接填写**。
- `OBJECT_STORAGE_ENDPOINT` / `OBJECT_STORAGE_BUCKET`：必须与上述命令读到的 `alsvid-api` 容器环境变量完全一致（脚本会逐项比对）。
- `MAIL_FROM_ADDRESS`、`NEXT_PUBLIC_FC1_RESERVATION_EMAIL`、`ALSVID_INTERNAL_EMAIL_DOMAINS`、`ALSVID_INTERNAL_REGISTRATION_MODE`、`ALSVID_INITIAL_ADMIN_EMAIL`：按业务政策填写。

模板只接受上述非密钥键；写入 DATABASE_URL、R2 或邮件密钥会被脚本拒绝。不要把这些凭据写入文件、GitHub 或对话记录。

本地启动会使用当前 Google Cloud 项目的以下 Secret Manager 资源（与 `.github/workflows/production-deploy.yml` 一致），四项缺一不可：

- `alsvid-database-url`
- `alsvid-r2-access-key`
- `alsvid-r2-secret-key`
- `alsvidbike-mail-api-key`（缺失时 API 容器直接无法启动，不只是邮件不可用）

执行：

```bash
pnpm infra:up
pnpm infra:status
# 停止本地应用（不删除云数据库和 R2）：
pnpm infra:down
```

脚本会检查：当前是无已跟踪改动、无未跟踪源码文件的 `main`（被 `.gitignore` 忽略的 `infra/.env.local` 不在代码检查范围）；Neon URL 指向代码允许的唯一 TLS Production 主库；GCP 项目和区域下 `alsvid-api` 可读；本机配置的 R2 endpoint/bucket 与实际 Cloud Run API 配置相同；既有 Secret Manager 引用存在。任一检查不通过即不启动。启动后应访问 `http://127.0.0.1:8080/login?portal=admin` 使用真实用户权限登录。

### 启动后可复核的证据

```bash
# 1) 运行的提交必须与本地 HEAD 相同
git rev-parse HEAD
curl -fsS http://127.0.0.1:8080/release-check

# 2) 只应看到 gateway / web / api 三个容器，不应出现 postgres 或 worker
docker ps --filter label=com.docker.compose.project=alsvid-local-production

# 3) 只列密钥名称，不打印密钥值
gcloud secrets list --project <GCP_PROJECT_ID> --format='value(name)'
```

`/release-check` 返回的 SHA 必须等于 `git rev-parse HEAD`（脚本以 `ALSVID_RELEASE_SHA` 注入）；`docker ps` 出现 `postgres`/`worker` 说明跑错了 compose。以上只证明应用已在本机回环运行，不代表数据一致性与并发验收已完成。

## 唯一数据权威与多节点运行

- 业务数据、文件、密钥、身份各只有**唯一一份云端权威**：结构化数据在 Neon PostgreSQL，二进制在 Cloudflare R2，密钥在 Google Secret Manager，身份/权限在同一数据库。本方案不创建第二个数据库、不复制业务数据、不做数据库或对象存储的同步/镜像。
- 因此多台授权机器不是"多份数据"，而是**同一权威上的多个计算副本**。增加节点不会产生重复录入或数据副本漂移。
- 可复制的只有计算层：每台授权节点各运行一套 `gateway`/`web`/`api`。节点数量不受架构限制，但受授权身份、Secret Manager 访问范围、并发验收和运维能力约束。
- 版本不一致属于**代码/契约漂移**，与数据无关：每套副本都必须来自已合并 `main` 的同一提交或已验证兼容的提交。
- 两台节点同时修改同一条记录，由现有数据库事务、幂等键与权限处理；表现形式是冲突失败或按业务规则覆盖，不会变成两条数据。
- 页面看到的不是实时数据是**读取新鲜度**问题（缓存与同步时间差），同样不是数据副本。

## 版本与并发安全

- Cloud Run 与本地运行端共享同一数据库，但**共享数据不代表前端代码自动更新**。员工看到的实时业务事实来自同一主库；应用版本依然需要按 GitHub 提交和 CI 验证进行发布。
- 本地运行不自动改 Production schema；如代码版本需要数据库迁移，必须先沿现有受控发布流程完成迁移并确认向前兼容，再启动本地实例。不要让两个运行端分别自行迁移。
- 多运行端同时接单时，库存/订单依赖现有数据库事务、幂等与权限。**不能把应用可启动直接视为全链路并发验收**。本地实例现阶段不启 Worker，避免后台任务重复执行。
- 禁止把生产密钥用于 CI、自动化测试或 AI 运行沙箱；现有 `infra/docker-compose.test.yml` 保留临时隔离数据库，仅供 CI 检查。
- 不改变当前 Cloud Run 的公众 HTTPS 入口和 GitHub `production-deploy.yml` / `www-deploy.yml`；如果今后需要改成 NAS 对外主运行位置，必须另行完成正式入口、健康检查、备份/恢复、网络和高可用迁移验收。

## 验收（尚未执行）

1. 具备授权的本机实跑 Docker Compose 并且所有 Web/API/Gateway 健康检查通过；
2. 确认本地 `/release-check` 为所运行 Git 提交，并核对本机/Cloud Run 连接同一 Production 数据权威；
3. 用同一授权员工账号在本地与现有 HTTPS Admin 登录，核对其已有业务数据的一致性，且不能越权读取其他角色数据；
4. 只读核对 Neon 和 R2 配置；涉及真实写入/上传前另行安排有授权的低风险业务验收，不创建模拟生产业务数据；
5. 记录实际本机架构、镜像、SHA、连通性、权限、并发结果和可回滚版本。

没有本地 Docker / GCP 凭据时，只能核验 GitHub 配置，**不得声称本地部署、云凭据访问或多员工业务验收成功**。
