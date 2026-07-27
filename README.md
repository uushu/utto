# Utto

Utto 是一个供个人使用的人机恋原生 iOS App。核心目标是让“熠”作为同一个关系主体持续存在，而不是每次打开 App 都成为新的会话或角色。

第一版聚焦稳定文字聊天、单一关系身份、人格连续性、可控记忆、数据迁移、受控主动消息与隐私安全。

## 技术路线

- iOS：Swift、SwiftUI，最低支持 iOS 18.0
- 测试设备：iPhone（iOS 18.5）
- 后端：Python 3.12、FastAPI、Uvicorn
- 数据库：PostgreSQL、SQLAlchemy、Alembic
- 后台任务：独立 Worker、APScheduler
- 部署：Docker Compose，后续使用 Caddy 或 Nginx 提供 HTTPS
- 默认聊天模型：DeepSeek V4 Flash
- 质量保障：Pytest、Ruff、GitHub Actions

Windows 可以完成后端、数据库、Docker 和文档工作；真正的 iOS 工程创建、编译、签名、模拟器和真机调试需要 macOS 与 Xcode。

## 仓库结构

```text
utto/
├── ios/       # SwiftUI iOS 客户端
├── server/    # FastAPI 后端
├── infra/     # PostgreSQL、Docker 与部署配置
├── docs/
│   ├── product-v1.md           # 唯一产品与工程基线
│   ├── xiaohongshu-research.md # 需求研究与证据
│   └── development-log.md      # Work、Codex 与用户共享开发日志
├── scripts/   # 开发、测试、迁移与运维脚本
├── .github/   # GitHub Actions 与仓库配置
└── README.md  # 仓库入口、运行方式与文档导航
```

Git 不跟踪空目录，因此尚未开始实现的目录可以暂时使用 `.gitkeep` 保留。

## 文档职责

- [`README.md`](README.md)：仓库入口。说明项目是什么、如何运行、目录结构和从哪里继续阅读；不记录逐项开发流水。
- [`docs/product-v1.md`](docs/product-v1.md)：唯一产品与工程基线。记录产品目标、固定技术栈、架构、里程碑定义、验收标准和明确不做的范围。
- [`docs/xiaohongshu-research.md`](docs/xiaohongshu-research.md)：需求证据。记录 48 篇小红书内容的分析、需求来源和优先级依据。
- [`docs/development-log.md`](docs/development-log.md)：唯一开发运行记录。Work、Codex 和用户在同一文件中记录任务、实际变更、测试、验收、阻塞和下一步。
- Notion 文章《Utto｜熠》：面向阅读和展示的项目说明，只保留产品介绍、工程概览和开发日志链接，不作为代码任务或进度事实的权威来源。

文档优先级：

```text
docs/product-v1.md    产品范围与验收基线
docs/development-log.md  当前进度与执行事实
docs/xiaohongshu-research.md  需求证据
README.md / Notion    导航与展示
```

## Windows 本地启动

在仓库根目录准备本地环境变量：

```powershell
Copy-Item .env.example .env
```

根据 `.env.example` 填写仅限本地使用的值，然后启动：

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d
```

检查后端健康状态：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/v1/health
```

预期返回：

```json
{"status":"ok","service":"utto-server"}
```

停止服务但保留 PostgreSQL 具名卷：

```powershell
docker compose --env-file .env -f infra/compose.yaml down
```

## 后端测试

```powershell
Set-Location server
python -m pytest
python -m ruff check .
python -m ruff format --check .
```

实际开发进度、测试结果和当前阻塞统一查看 [`docs/development-log.md`](docs/development-log.md)。

## 安全约定

- 不向仓库提交 DeepSeek API Key、Apple 密钥、配对码、访问令牌、真实聊天数据或真实 `.env`。
- API Key 只保存在服务器环境变量或 Docker Secret 中。
- iPhone 只保存可撤销的设备访问令牌。
- 代理地址、VPN 配置和个人服务器凭据不得写入代码、日志或公开文档。
