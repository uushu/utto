# Utto 开发日志

> 本文件是 Utto 开发过程的唯一运行记录，供 Work、Codex 和用户共同读取与更新。  
> 产品范围、架构和验收基线以 [`docs/product-v1.md`](product-v1.md) 为准；需求证据以 [`docs/xiaohongshu-research.md`](xiaohongshu-research.md) 为准。  
> README、Notion 文章和产品基线不再保存逐项开发记录，只链接到本文件。

---

## 1. 文档职责

本文件只记录会随开发变化的内容：

- 当前里程碑、任务和阻塞项；
- Work 冻结的任务范围与验收结论；
- Codex 实际修改的文件和实现结果；
- 实际执行的测试、命令和结果；
- 关键工程决策及其原因；
- 已知风险、遗留问题和下一步；
- Git 提交、分支、Pull Request 或 CI 状态。

本文件不记录：

- 产品愿景和长期需求；
- 完整技术方案和数据模型；
- 小红书需求证据；
- API Key、密码、令牌、真实聊天数据、VPN 或代理地址。

---

## 2. Work 与 Codex 的共同使用规则

### Work

1. 开始任务前读取 `docs/product-v1.md` 和本文件；
2. 冻结一个任务的目标、允许范围、禁止范围和验收标准；
3. 在本文件追加一条 `TASK_OPENED` 记录；
4. Codex 完成后核对实际变更和测试；
5. 追加 `ACCEPTED`、`REJECTED` 或 `CHANGES_REQUIRED` 记录；
6. 只有验收通过后，才允许更新顶部“当前状态”。

### Codex

1. 开始任务前读取 `docs/product-v1.md` 和本文件最新内容；
2. 只实现当前已冻结任务；
3. 不修改其他执行者的历史记录；
4. 完成后追加一条 `IMPLEMENTED` 记录；
5. 记录实际文件、实际命令和实际结果；
6. 未执行的检查必须写为“未执行”，不得推测通过；
7. 发现范围冲突或技术栈问题时，先记录并停止越界实现。

### 用户

- 负责本地、Xcode、真机、服务器或第三方平台上的实际验收；
- 需要时追加 `USER_VERIFIED` 记录；
- 决定是否提交、推送、合并或进入下一任务。

### 写入顺序

同一任务按以下顺序追加：

```text
Work：TASK_OPENED
→ Codex：IMPLEMENTED
→ 用户：USER_VERIFIED（需要人工运行时）
→ Work：ACCEPTED / CHANGES_REQUIRED / REJECTED
```

每次写入前必须先拉取最新版本，避免覆盖另一方刚写入的记录。

---

## 3. 当前状态

最后更新：2026-07-27

| 项目 | 当前状态 |
|---|---|
| 当前里程碑 | M0｜工程初始化 |
| M0-A | ACCEPTED（已关闭） |
| M0-B | 未开始 |
| M1 Backend | CHANGES_REQUIRED（等待真实 PostgreSQL 并发验证） |
| M1 iOS | 未开始 |
| M2 | 未开始 |
| 当前主要阻塞 | 缺少可执行 M0-B 的 macOS/Xcode 环境 |

M0-A 全部验收项已完成：GitHub Actions 云端 CI 已通过；Docker Compose、PostgreSQL、FastAPI health、Pytest/Ruff/pip check、安全扫描和 iOS 目录边界均已验证。M0-A 已关闭。

当前技术和产品范围仍以 `docs/product-v1.md` 为准。本文件中的状态不得被解释为产品范围变更。

---

## 4. 当前已知环境

- 主开发电脑：Windows 11 家庭版 24H2；
- 后端 Python：CPython 3.12.13；
- WSL：WSL 2；
- Docker Desktop：4.83.0；
- Docker Engine：29.6.2；
- Docker Compose：v5.3.1；
- 测试设备：iPhone，iOS 18.5；
- iOS 最低部署目标：iOS 18.0；
- 当前无可用原生 macOS/Xcode 环境。

环境版本变化时只更新本节和新的日志记录，不把版本状态复制到 README、Notion 或需求研究文档。

---

## 5. 开发记录

### 2026-07-27｜M0-A-03｜STATUS_SYNC

- **执行者**：Work / Codex / 用户汇总
- **状态**：本地实现与检查完成，等待仓库提交、推送和云端 CI
- **范围**：CI、Windows 启动说明、M0-A 完整验收
- **已知结果**：
  - M0-A-01 FastAPI 最小服务与 `GET /v1/health` 已完成；
  - M0-A-02 PostgreSQL、Docker Compose 与环境变量基线已完成；
  - API 与数据库容器曾实际达到 `healthy`；
  - 健康检查返回 `{"status":"ok","service":"utto-server"}`；
  - Pytest、Ruff 检查、Ruff 格式检查和 `pip check` 已通过本地检查；
  - PostgreSQL `pg_isready` 与 `SELECT 1` 已通过；
  - 未创建业务表，未提前实现聊天、人格、记忆或主动消息；
  - 当前尚需以 Git 提交、推送和 GitHub Actions 结果完成 M0-A 收口。
- **下一步**：完成提交和推送，查看 GitHub Actions 真实结果，再由 Work 决定 M0-A 是否正式关闭。

### 2026-07-27｜M0-A-02｜ACCEPTED

- **执行者**：Codex 实现，用户与 Work 验收
- **状态**：通过
- **范围**：PostgreSQL、Docker Compose、环境变量与容器健康检查
- **主要产物**：
  - `.env.example`；
  - `infra/compose.yaml`；
  - `server/Dockerfile`；
  - `server/.dockerignore`；
  - 相关 `.gitignore` 更新。
- **验收结果**：
  - API 和 PostgreSQL 容器均达到健康状态；
  - PostgreSQL 未向宿主机公开端口；
  - API 仅绑定本地开发地址；
  - 未创建 ORM 业务模型、迁移或种子数据；
  - 真实 `.env` 与敏感数据未提交。

### 2026-07-27｜M0-A-01｜ACCEPTED

- **执行者**：Codex 实现，用户与 Work 验收
- **状态**：通过
- **范围**：FastAPI 最小服务与健康检查
- **主要产物**：
  - `server/pyproject.toml`；
  - `server/src/utto_server/__init__.py`；
  - `server/src/utto_server/main.py`；
  - `server/tests/test_health.py`；
  - 根目录 `.gitignore` 相关配置。
- **验收结果**：
  - 仅注册 `GET /v1/health`；
  - 返回 HTTP 200；
  - JSON 完整比对通过；
  - 未提前实现后续业务功能。

### 2026-07-27 23:00｜M0-A｜ACCEPTED（已关闭）

- **执行者**：Claude Code 审计，项目 GPT 验收
- **状态**：ACCEPTED
- **目标**：M0-A 最终历史验收 — 确认所有 M0-A 验收项完成，M0-A 正式关闭
- **验收结果**：
  - Git 状态正常，main 与 origin/main 一致，工作区干净
  - Docker Compose 验证通过（api + db healthy）
  - PostgreSQL pg_isready / SELECT 1 通过
  - FastAPI /v1/health 精确返回
  - Pytest 24 passed，Ruff / pip check 通过
  - GitHub Actions 云端 CI 已确认通过
  - 安全扫描通过（无密钥、VPN 或代理泄露）
  - iOS 目录符合 M0-A 边界（无伪造 .xcodeproj）
  - 文档职责清晰，开发流水仅记录于 development-log.md
- **已处理遗留项**：无
- **下一步**：M0-B（需 macOS/Xcode 环境）；M1 Backend 并发安全修复

### 2026-07-27 23:30｜M1-BE-CONCURRENCY｜IMPLEMENTED / WAITING REVIEW

- **执行者**：Claude Code (DeepSeek)
- **状态**：IMPLEMENTED / WAITING REVIEW
- **基线提交**：未提交
- **目标**：修复 M1 Backend pairing exchange 的 IntegrityError 恢复路径并发风险
- **问题原因**：
  - `except IntegrityError` 中 `db.rollback()` 释放了事务锁
  - rollback 后 `pairing.used_at = now` 被回滚
  - 原代码重查 pairing code 时仅按 ID 查询，未重新过滤 `used_at IS NULL` 和 `expires_at > now`
  - 若另一事务在 rollback 间隙消费了同一配对码，可能绕过一次性限制
- **修复方案**：
  - rollback 后重新以 `with_for_update()` 锁定 pairing code 行
  - 重查时加回 `used_at.is_(None)` 和 `expires_at > now` 过滤条件
  - 若配对码已失效（被消费或过期），返回 403 而非继续创建 device
- **修改文件**：
  - server/src/utto_server/routers/pairing.py（IntegrityError 恢复路径）
  - server/tests/test_concurrency_pg.py（新建，4 条 PostgreSQL 并发测试）
- **测试结果**：
  - SQLite 自动测试：24 passed，1 skipped（concurrency_pg 跳过）
  - PostgreSQL 并发测试：4 passed（同码二会话、异码二会话、过期恢复、已用恢复）
  - Ruff check：All checks passed!
  - Ruff format：16 files already formatted
  - pip check：No broken requirements found
- **未执行检查**：多线程真实并发测试（Python threading + PostgreSQL FOR UPDATE 在 Docker 容器中有 test client 依赖冲突，以顺序双会话测试覆盖等价逻辑）
- **下一步**：项目 GPT 验收

### 2026-07-27 22:30｜M1-BE｜ACCEPTED

- **执行者**：Claude Code (DeepSeek) 实现，项目 GPT 验收
- **状态**：ACCEPTED
- **基线提交**：未提交
- **目标**：M1 后端功能包候选实现 — 数据库表、Alembic 迁移、配对接口、bootstrap 接口
- **允许修改范围**：server/src/、server/tests/、server/pyproject.toml、Alembic 配置、.gitignore（SQLite 忽略）
- **禁止修改范围**：docs/product-v1.md、docs/xiaohongshu-research.md、ios/、infra/、.github/、README.md、Dockerfile、.env.example
- **实际修改文件**：
  - server/pyproject.toml（+sqlalchemy, psycopg2-binary, alembic, +CLI entry）
  - server/src/utto_server/main.py（移除 lifespan create_all，+router 注册）
  - server/src/utto_server/database.py（新建）
  - server/src/utto_server/models.py（新建，4 个 ORM 模型 + singleton_key 约束）
  - server/src/utto_server/schemas.py（新建）
  - server/src/utto_server/routers/__init__.py（新建）
  - server/src/utto_server/routers/auth.py（新建，Bearer token 鉴权）
  - server/src/utto_server/routers/pairing.py（新建，POST /v1/pair/exchange，含 with_for_update 行锁）
  - server/src/utto_server/routers/bootstrap.py（新建，GET /v1/bootstrap）
  - server/src/utto_server/cli.py（新建，配对码生成命令）
  - server/alembic.ini（新建）
  - server/alembic/env.py（新建）
  - server/alembic/script.py.mako（新建）
  - server/alembic/versions/52abeae6c0ae_initial_m1_tables.py（新建）
  - server/tests/conftest.py（新建）
  - server/tests/test_pairing.py（新建，10 条）
  - server/tests/test_bootstrap.py（新建，6 条）
  - server/tests/test_security.py（新建，6 条）
  - .gitignore（+utto.db）
- **测试结果**：
  - SQLite 自动测试：24 passed
  - Ruff check：All checks passed!
  - Ruff format：15 files already formatted
  - pip check：No broken requirements found
  - PostgreSQL 迁移：upgrade → downgrade → re-upgrade 均成功
  - PostgreSQL 集成验证：10/10 通过
- **未执行检查**：
  - PostgreSQL 真实并发 FOR UPDATE 验证（SQLite FOR UPDATE 为 no-op，生产环境需验证）
  - M1 iOS 接入包（需等 M0-B 完成）
- **工程决策**：
  - 移除 lifespan create_all：生产 schema 由 Alembic 管理，不在 FastAPI 启动时自动建表
  - 添加 singleton_key UNIQUE 约束：数据库级防止并发创建多条 relationship
  - 添加 with_for_update() 行锁：防止配对码并发兑换
  - device token 使用 secrets.token_urlsafe(48) = 384 bits 熵值，SHA-256 哈希存储
  - 测试使用文件级 SQLite（避免内存数据库连接池问题）
- **风险与遗留问题**：
  - Alembic 配置文件未包含在 Docker 镜像中（需后续更新 Dockerfile）
  - CRLF 换行符问题仍存在，需统一处理
- **下一步**：用户授权后提交；后续等待 M0-B 完成后执行 M1 iOS 接入包

---

## 6. 日志条目模板

后续 Work、Codex 和用户统一复制以下模板追加，不创建新的日志文件：

```markdown
### YYYY-MM-DD HH:mm｜任务编号｜状态

- **执行者**：Work / Codex / 用户
- **状态**：TASK_OPENED / IMPLEMENTED / USER_VERIFIED / ACCEPTED / CHANGES_REQUIRED / REJECTED / BLOCKED
- **基线提交**：commit SHA；未知时写“未记录”
- **目标**：
- **允许修改范围**：
- **禁止修改范围**：
- **实际修改文件**：
- **实际执行命令**：
- **测试结果**：
- **未执行检查**：
- **工程决策**：
- **风险与遗留问题**：
- **下一步**：
```

---

## 7. 状态更新规则

- 顶部“当前状态”只反映已经有日志证据的事实；
- 任务未经过 Work 验收，不得写成“已完成”；
- 本地测试通过与 GitHub Actions 通过必须分别记录；
- 后端验收、Xcode 构建、模拟器、真机、APNs 和 TestFlight 必须分别记录；
- 产品需求变化先修改 `docs/product-v1.md`，再在本文件记录变更原因；
- 研究证据变化只修改 `docs/xiaohongshu-research.md`；
- README 和 Notion 只保留概览与本文件链接，不复制开发流水账。
