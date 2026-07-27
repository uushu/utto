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
- 当前开发电脑：Windows 11 家庭版 24H2

Windows 11 先完成文档、后端、数据库与 Docker 工作；真正的 iOS 工程初始化、编译、签名、模拟器和真机调试，需要可运行对应 Xcode 的 macOS 环境。
- 质量保障：Pytest、Ruff、GitHub Actions
- 当前开发电脑：Windows 11 家庭版 24H2


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

实际开发进度、测试结果和当前阻塞统一查看 [`docs/development-log.md`](docs/development-log.md)。

## Windows 11 本地启动与验证

以下命令使用 Windows PowerShell，在仓库根目录 `D:\utto_app` 执行。需要提前安装并启动 Docker Desktop，使用 Linux containers；本地 Python 测试需要 CPython 3.12。

### 准备本地环境变量

首次启动时，从示例创建本地 `.env`：

```powershell
Set-Location D:\utto_app
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}
```

打开 `.env`，替换所有 `change-me` 占位值。`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须一致。不要提交 `.env`，也不要在日志或验收报告中输出密码和连接串。

先校验 Compose 配置：

```powershell
docker compose --env-file .env -f infra/compose.yaml config --quiet
```

### 启动并查看状态

构建并启动 FastAPI 与 PostgreSQL，并等待两个服务通过健康检查：

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d --wait
docker compose --env-file .env -f infra/compose.yaml ps
```

正常状态下，`api` 和 `db` 都应显示为 `healthy`。API 只监听宿主机的 `127.0.0.1:8000`，PostgreSQL 不向宿主机暴露端口。

### 检查 FastAPI

```powershell
$health = Invoke-RestMethod http://127.0.0.1:8000/v1/health
$health | ConvertTo-Json -Compress
```

预期输出：

```json
{"status":"ok","service":"utto-server"}
```

### 运行后端测试

首次运行前，用 CPython 3.12 创建虚拟环境。如果已有 `.venv`，命令会直接复用；只有首次创建时才使用当前 `python`，并在版本不是 3.12 时停止。

```powershell
Set-Location D:\utto_app\server
$venvPython = ".\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    $systemPythonVersion = python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
    if ($systemPythonVersion -notlike "3.12.*") {
        throw "CPython 3.12 is required; current python is $systemPythonVersion"
    }
    python -m venv .venv
}

& $venvPython --version
& $venvPython -m pip install -e ".[dev]"
& $venvPython -m pytest
& $venvPython -m ruff check src tests
& $venvPython -m ruff format --check src tests
& $venvPython -m pip check
Set-Location D:\utto_app
```

这些测试只访问进程内 FastAPI 测试客户端和本地服务，不需要访问真实业务接口或外部模型。

### 停止服务

普通停止会删除容器和 Compose 网络，但保留 PostgreSQL 具名数据卷：

```powershell
docker compose --env-file .env -f infra/compose.yaml down
```

不要使用 `docker compose down -v`，否则会删除本地 PostgreSQL 数据。

## Windows 11 本地启动与验证

以下命令使用 Windows PowerShell，在仓库根目录 `D:\utto_app` 执行。需要提前安装并启动 Docker Desktop，使用 Linux containers；本地 Python 测试需要 CPython 3.12。

### 准备本地环境变量

首次启动时，从示例创建本地 `.env`：

```powershell
Set-Location D:\utto_app
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
}
```

打开 `.env`，替换所有 `change-me` 占位值。`POSTGRES_PASSWORD` 与 `DATABASE_URL` 中的密码必须一致。不要提交 `.env`，也不要在日志或验收报告中输出密码和连接串。

先校验 Compose 配置：

```powershell
docker compose --env-file .env -f infra/compose.yaml config --quiet
```

### 启动并查看状态

构建并启动 FastAPI 与 PostgreSQL，并等待两个服务通过健康检查：

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d --wait
docker compose --env-file .env -f infra/compose.yaml ps
```

正常状态下，`api` 和 `db` 都应显示为 `healthy`。API 只监听宿主机的 `127.0.0.1:8000`，PostgreSQL 不向宿主机暴露端口。

### 检查 FastAPI

```powershell
$health = Invoke-RestMethod http://127.0.0.1:8000/v1/health
$health | ConvertTo-Json -Compress
```

预期输出：

```json
{"status":"ok","service":"utto-server"}
```

### 运行后端测试

首次运行前，用 CPython 3.12 创建虚拟环境。如果已有 `.venv`，命令会直接复用；只有首次创建时才使用当前 `python`，并在版本不是 3.12 时停止。

```powershell
Set-Location D:\utto_app\server
$venvPython = ".\.venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    $systemPythonVersion = python -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
    if ($systemPythonVersion -notlike "3.12.*") {
        throw "CPython 3.12 is required; current python is $systemPythonVersion"
    }
    python -m venv .venv
}

& $venvPython --version
& $venvPython -m pip install -e ".[dev]"
& $venvPython -m pytest
& $venvPython -m ruff check src tests
& $venvPython -m ruff format --check src tests
& $venvPython -m pip check
Set-Location D:\utto_app
```

这些测试只访问进程内 FastAPI 测试客户端和本地服务，不需要访问真实业务接口或外部模型。

### 停止服务

普通停止会删除容器和 Compose 网络，但保留 PostgreSQL 具名数据卷：

```powershell
docker compose --env-file .env -f infra/compose.yaml down
```

不要使用 `docker compose down -v`，否则会删除本地 PostgreSQL 数据。

## 安全约定

- 不向仓库提交 DeepSeek API Key、Apple 密钥、配对码、访问令牌、真实聊天数据或真实 `.env`。
- API Key 只保存在服务器环境变量或 Docker Secret 中。
- iPhone 只保存可撤销的设备访问令牌。
- 代理地址、VPN 配置和个人服务器凭据不得写入代码、日志或公开文档。
