# Utto 开发日志

> 唯一开发记录。产品范围见 [`docs/product-v1.md`](product-v1.md)，需求证据见 [`docs/xiaohongshu-research.md`](xiaohongshu-research.md)。

---

## 规则

- Work 拆任务验收，Codex 实现，用户授权提交
- 状态流：TASK_OPENED → IMPLEMENTED → ACCEPTED / BLOCKED
- 只记在本文件，不创建同类文档；不记录密码、令牌、代理地址

---

## 当前状态

最后更新：2026-07-28

| 项目 | 状态 |
|---|---|
| 当前里程碑 | M0｜工程初始化 |
| M0-A | ACCEPTED |
| M0-B | macOS 安装中 |
| M1 Backend | ACCEPTED |
| M1 iOS | 未开始 |
| M2 | 未开始 |
| 当前阻塞 | Xcode 尚未安装，SwiftUI 工程尚未构建验收 |

---

## 当前环境

- **宿主机**：Windows 11 家庭版 24H2，WSL 2
- **后端**：CPython 3.12.13，Docker Desktop 4.83.0，Docker Compose v5.3.1
- **iOS**：iPhone iOS 18.5，最低部署目标 iOS 18.0
- **macOS 虚拟机**：VMware Workstation Pro 17.6.4，OC4VM 3.0.0 AMD，工作目录 `D:\macOS-VM\Utto-Sequoia`
- **恢复介质**：Sequoia Recovery VMDK（`sequoia-recovery.vmdk`，2.3 GB），已验证
- macOS 安装中，Xcode 尚未安装

---

## 开发记录

### 2026-07-28｜M0-B-ENV｜ACCEPTED

**目标**：可信下载 macOS Sequoia Recovery 并转为 VMDK，接入虚拟机并启动。

**完成内容**：
- Apple CDN 常规下载失败（国内 CDN 证书拦截 + 代理 TUN 截断），改用 HTTP Range 串行下载
- 212 个分段全部返回 206，Content-Range 与强 ETag 逐段校验一致
- DMG 大小验证通过（888,615,275 字节），记录 SHA-256；qemu-img 可正常读取并完成 VMDK 转换
- VMX 接入 sata0:2，OpenCore 识别成功，进入 Recovery 安装界面

**产物**：`D:\macOS-VM\Utto-Sequoia\sequoia-recovery.vmdk`

**下一步**：macOS 安装完成后装 Xcode，执行 M0-B 工程验收。

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

**下一步**：M1 iOS（等 M0-B 环境）。

---

### 2026-07-27｜M0-A｜ACCEPTED

**目标**：工程初始化 — FastAPI 最小服务、PostgreSQL + Docker Compose、CI、安全扫描、iOS 目录边界。

**产物**：
- `server/src/utto_server/main.py`，仅注册 `GET /v1/health`
- `infra/compose.yaml`，`server/Dockerfile`，`.env.example`
- `.gitignore` 相关配置

**最终验收**（项目 GPT）：
- Docker Compose（api + db）healthy
- `GET /v1/health` → `{"status":"ok","service":"utto-server"}`
- Pytest 24 passed，Ruff / pip check 通过
- GitHub Actions 通过，安全扫描通过
- Git 状态正常，main 与 origin/main 一致
- PostgreSQL 不对外暴露端口，未建业务表

**下一步**：M0-B（macOS/Xcode）；M1 Backend 开发。
