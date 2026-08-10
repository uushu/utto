# Utto 开发日志

> 唯一开发记录。产品范围见 [`docs/product-v1.md`](product-v1.md)，需求证据见 [`docs/xiaohongshu-research.md`](xiaohongshu-research.md)。

---

## 规则

- Work 拆任务验收，Codex 实现，用户授权提交
- 状态流：TASK_OPENED → IMPLEMENTED → ACCEPTED / BLOCKED
- 只记在本文件，不创建同类文档；不记录密码、令牌、代理地址
- 未实际执行的测试必须明确写“未执行”，不得推测通过

---

## 当前状态

最后更新：2026-08-11

| 项目 | 状态 |
|---|---|
| 当前里程碑 | M1 Mobile｜Expo 客户端纵向切片 |
| M0-A | ACCEPTED |
| M0-B 原生 iOS / Xcode | PAUSED，不再阻塞第一版 |
| M1 Backend | ACCEPTED；本分支新增 `/v1/chat` 待回归 |
| M1 Mobile | IMPLEMENTED / WAITING USER VERIFY |
| M2 长期记忆 | 未开始 |
| 当前阻塞 | 需要在 Windows 本地完成 npm/typecheck、后端回归及 Expo Go iPhone 真机验收 |

客户端路线已从 SwiftUI / Xcode-first 调整为 React Native + Expo + TypeScript。`mobile/` 为第一版主线；`ios/` 保留为未来原生路线，不再要求先完成 macOS/Xcode 环境才能继续产品开发。

---

## 当前环境

- **宿主机**：Windows 11 家庭版 24H2，WSL 2
- **后端**：CPython 3.12.13，Docker Desktop 4.83.0，Docker Compose v5.3.1
- **移动端主线**：Expo SDK 54、React Native 0.81、React 19.1、TypeScript
- **测试设备**：iPhone；开发阶段使用 Expo Go
- **原生 iOS 环境研究**：VMware + OpenCore + Sequoia Recovery 已完成到 Recovery 启动；该路线暂停

---

## 开发记录

### 2026-08-11｜M1-MOBILE-EXPO｜IMPLEMENTED / WAITING USER VERIFY

**目标**：停止让 Xcode 环境阻塞 Utto，直接建立可在 Windows 开发、iPhone Expo Go 真机运行的 AI 陪伴客户端纵向切片。

**客户端实现**：
- 新增 `mobile/`：Expo SDK 54 + React Native + TypeScript
- 首次配对页：`POST /v1/pair/exchange`
- 设备令牌使用 `expo-secure-store`
- 启动同步：`GET /v1/bootstrap`
- 聊天页：真实调用 `POST /v1/chat`
- 本机近期聊天：AsyncStorage
- 一级入口：聊天、记忆、关系、设置
- 记忆页当前明确为占位，不伪装为已完成长期记忆

**后端实现**：
- 新增鉴权接口 `POST /v1/chat`
- 服务器读取 `DEEPSEEK_API_KEY`，客户端不接触模型密钥
- 默认模型 `deepseek-v4-flash`
- 最近 20 条客户端消息作为当前临时上下文
- 若存在锁定 PersonaVersion，则把身份、用户模型、关系定义、核心性格和约定注入 system prompt
- 新增 DeepSeek 超时、HTTP 错误、异常响应处理
- 新增 `server/tests/test_chat.py`

**基础设施与文档**：
- Compose 可通过 `UTTO_API_BIND=0.0.0.0` 在可信局域网给 iPhone 开发调试；默认仍为 `127.0.0.1`
- `.env.example` 增加 DeepSeek 配置但不包含真实 Key
- `.gitignore` 增加 Node / Expo 产物
- `README.md`、`ios/README.md`、`mobile/README.md` 已切换/说明新的第一版客户端路线

**本次未声称完成**：
- 未在用户 Windows 机器执行 `npm install` / `npm run typecheck`
- 未在用户环境运行后端完整 Pytest/Ruff 回归
- 未通过 Expo Go 在 iPhone 实际扫码启动
- 未实际调用用户的 DeepSeek API Key
- 未实现服务端 Message 表、聊天永久存储、长期记忆、主动消息或 APNs

**下一步验收顺序**：
1. Windows 拉取本分支并执行移动端安装与 typecheck
2. 后端执行 Pytest/Ruff
3. Docker Compose 启动并生成一次性配对码
4. iPhone Expo Go 扫码，完成配对与真实对话
5. 通过后再合并到 `main`

---

### 2026-07-28｜M0-B-ENV｜ACCEPTED

**目标**：可信下载 macOS Sequoia Recovery 并转为 VMDK，接入虚拟机并启动。

**完成内容**：
- Apple CDN 常规下载失败（国内 CDN 证书拦截 + 代理 TUN 截断），改用 HTTP Range 串行下载
- 212 个分段全部返回 206，Content-Range 与强 ETag 逐段校验一致
- DMG 大小验证通过（888,615,275 字节），记录 SHA-256；qemu-img 可正常读取并完成 VMDK 转换
- VMX 接入 sata0:2，OpenCore 识别成功，进入 Recovery 安装界面

**产物**：`D:\macOS-VM\Utto-Sequoia\sequoia-recovery.vmdk`

**后续决策**：2026-08-11 起该原生 iOS/Xcode 路线暂停，不再作为第一版阻塞项。

---

### 2026-07-28｜M1-BE｜ACCEPTED

**目标**：M1 后端功能包实现与并发安全验证。

**产物**：4 个 ORM 模型 + singleton_key 约束，Alembic 迁移，`POST /v1/pair/exchange`（`with_for_update` 行锁），`GET /v1/bootstrap`，Bearer token 鉴权，CLI 配对码生成。

**并发修复**：`db.rollback()` 释放事务锁后重查未过滤 `used_at IS NULL`，可能绕过一次性限制。修复方案：rollback 后 `with_for_update()` 重锁 + `used_at.is_(None)` + `expires_at > now` 过滤，失效返回 403。修改 `pairing.py` 恢复路径，新建 `test_concurrency_pg.py`。

**关键决策**：
- 移除 lifespan `create_all`，生产用 Alembic
- `singleton_key UNIQUE` 防止并发创建多条 relationship
- device token：`secrets.token_urlsafe(48)`（384 bits），SHA-256 哈希存储
- 测试用文件级 SQLite

**测试结果**：SQLite 24 passed，PostgreSQL 并发 3 passed（同码互斥、不同码并发、恢复竞态），迁移 up/down/re-up 成功，集成 10/10，Ruff 全部通过。

**遗留**：Alembic 配置未包含在 Docker 镜像；CRLF 统一处理。

---

### 2026-07-27｜M0-A｜ACCEPTED

**目标**：工程初始化 — FastAPI 最小服务、PostgreSQL + Docker Compose、CI、安全扫描、iOS 目录边界。

**产物**：
- `server/src/utto_server/main.py`
- `infra/compose.yaml`，`server/Dockerfile`，`.env.example`
- `.gitignore` 相关配置

**最终验收**：
- Docker Compose（api + db）healthy
- `GET /v1/health` → `{"status":"ok","service":"utto-server"}`
- Pytest 24 passed，Ruff / pip check 通过
- GitHub Actions 通过，安全扫描通过
- Git 状态正常，main 与 origin/main 一致
- PostgreSQL 不对外暴露端口
