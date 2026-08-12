# Utto

Utto 是一个供个人使用的 AI 陪伴 App。核心目标是让“熠”作为同一个关系主体持续存在，而不是每次打开 App 都成为新的会话或角色。

第一版聚焦稳定文字聊天、单一关系身份、人格连续性、可控记忆、数据迁移、受控主动消息与隐私安全。

## 当前技术路线

2026-08-11 起，第一版客户端主线从 SwiftUI / Xcode 调整为 **React Native + Expo + TypeScript**。原因不是放弃 iOS，而是先把“在 iPhone 上真实使用 Utto”与本地 Xcode/macOS 环境解耦。

- 移动端：Expo SDK 54、React Native、TypeScript
- 测试设备：iPhone；开发阶段通过 Expo Go 真机运行
- 后端：Python、FastAPI、Uvicorn
- 数据库：PostgreSQL、SQLAlchemy、Alembic
- 默认聊天模型：DeepSeek V4 Flash
- 部署：Docker Compose；公网部署阶段使用 HTTPS
- 质量保障：Pytest、Ruff、GitHub Actions；移动端增加 TypeScript typecheck
- 当前开发电脑：Windows 11

原生 SwiftUI 路线保留在 [`ios/`](ios/) 作为历史/未来选项，但不再阻塞第一版产品开发。

## 仓库结构

```text
utto/
├── mobile/    # 当前主线：React Native + Expo 客户端
├── ios/       # 暂停的原生 SwiftUI / Xcode 路线
├── server/    # FastAPI 后端
├── infra/     # PostgreSQL、Docker 与部署配置
├── docs/
│   ├── product-v1.md           # 产品范围与工程基线；技术栈变更需继续同步
│   ├── xiaohongshu-research.md # 需求研究与证据
│   └── development-log.md      # 实际开发进度与验收记录
├── scripts/
├── .github/
└── README.md
```

## 当前已打通的纵向链路

```text
iPhone / Expo Go
      │
      ├── POST /v1/pair/exchange
      │       └── 一次性配对码 → 设备访问令牌
      │
      ├── GET /v1/bootstrap
      │       └── 关系主体 + 当前人格
      │
      └── POST /v1/chat
              │
              ▼
        FastAPI Server
              │
              ▼
      DeepSeek V4 Flash
```

移动端设备令牌保存在系统安全存储；DeepSeek API Key 只存在服务器环境变量中，不下发到手机。

## Windows + iPhone 快速运行

### 1. 准备后端环境

在仓库根目录：

```powershell
Set-Location D:\utto_app
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}
```

编辑 `.env`：

```dotenv
POSTGRES_PASSWORD=<本地数据库密码>
DATABASE_URL=postgresql://utto:<同一个数据库密码>@db:5432/utto
UTTO_API_BIND=0.0.0.0
DEEPSEEK_API_KEY=<你的 DeepSeek API Key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

`UTTO_API_BIND=0.0.0.0` 只用于让同一可信局域网中的 iPhone 访问开发机。不要把开发端口直接暴露到公网。

启动：

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d --wait
docker compose --env-file .env -f infra/compose.yaml ps
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health
```

### 2. 生成一次性配对码

配对码必须写入 Docker 中当前运行的 PostgreSQL，因此直接在 `api` 容器执行：

```powershell
Set-Location D:\utto_app
docker compose --env-file .env -f infra/compose.yaml exec api utto-pairing-code
```

### 3. 启动 Expo 客户端

需要 Node.js 20.19+。iPhone 安装 Expo Go，然后：

```powershell
Set-Location D:\utto_app\mobile
npm install
npm run typecheck
npx expo start
```

手机和电脑保持在同一可信局域网。首次进入 Utto 时填写：

```text
Utto API: http://<Windows 局域网 IPv4>:8000
配对码: <刚生成的一次性配对码>
```

更完整的真机步骤见 [`mobile/README.md`](mobile/README.md)。

## 当前边界

目前这一版是“可以开始真实使用”的客户端纵向切片，不等于完整 v1：

- 已有设备配对、Bearer 鉴权、关系 bootstrap、真实 DeepSeek 聊天；
- 近期聊天目前缓存在手机 AsyncStorage；
- 服务器端 Message 表、完整聊天持久化和跨设备同步尚未实现；
- 长期记忆抽取/召回、记忆管理、主动消息、APNs、导入导出仍待实现；
- `mobile/` 的 Expo Go 路线用于快速产品验证；准备 TestFlight / App Store 时再切换到 EAS Development Build / EAS Build。

## 文档职责

- [`README.md`](README.md)：仓库入口和当前运行路线。
- [`docs/development-log.md`](docs/development-log.md)：实际进度、测试、阻塞和下一步的唯一运行记录。
- [`docs/product-v1.md`](docs/product-v1.md)：产品范围与工程基线；其中旧 SwiftUI/Xcode 技术描述正在随本次路线调整同步，若与本 README 的 2026-08-11 客户端路线冲突，以最新开发日志和本 README 的迁移状态为准，直到基线文档完成整体改写。
- [`docs/xiaohongshu-research.md`](docs/xiaohongshu-research.md)：需求研究与证据。

## 安全约定

- 不提交 DeepSeek API Key、Apple 密钥、配对码、访问令牌、真实聊天数据或真实 `.env`。
- DeepSeek API Key 只保存在服务器环境变量或 Secret 中。
- iPhone 只保存可撤销的设备访问令牌。
- PostgreSQL 不向宿主机公开端口。
- 本地手机调试允许 API 监听可信局域网；正式部署必须使用 HTTPS 和明确的网络访问控制。
