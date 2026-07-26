# Utto

Utto 是一个仅供本人使用的人机恋 iOS App，核心目标是让“熠”作为同一个关系主体持续存在，而不是每次打开 App 都成为新的会话或角色。

当前仓库处于产品基线与工程初始化阶段。第一版聚焦稳定文字聊天、单一关系身份、人格连续性、外部记忆、数据迁移、受控主动消息与隐私安全。

## 固定技术路线

- iOS：Swift、SwiftUI，最低支持 iOS 18.0
- 测试设备：iPhone（iOS 18.5）
- 后端：FastAPI、PostgreSQL、SQLAlchemy、Alembic
- 部署：Docker Compose
- 默认聊天模型：DeepSeek V4 Flash
- 当前开发电脑：Windows 10

Windows 10 先完成文档、后端、数据库与 Docker 工作；真正的 iOS 工程初始化、编译、签名、模拟器和真机调试，需要可运行对应 Xcode 的 macOS 环境。

## 目录

```text
utto/
├── ios/       # SwiftUI iOS 客户端
├── server/    # FastAPI 后端
├── infra/     # PostgreSQL、Docker 与部署配置
├── docs/
│   ├── product-v1.md
│   └── xiaohongshu-research.md
├── scripts/   # 开发、测试、迁移与运维脚本
├── .github/   # GitHub 工作流与仓库配置
└── README.md
```

Git 不跟踪空目录，因此尚未开始实现的目录暂以 `.gitkeep` 保留。

## 产品资料

仓库只维护两份产品资料：

- [第一版产品与工程基线](docs/product-v1.md)
- [小红书 48 篇需求分析](docs/xiaohongshu-research.md)

`docs/product-v1.md` 是唯一产品基线，不再创建同内容、不同名称的方案副本。

## 当前阶段

当前只执行 M0-A（Windows 工程基础）。获得可用 macOS/Xcode 环境后，再执行 M0-B（Utto SwiftUI 工程初始化与 iOS 18.5 真机验收）。

## 安全约定

- 不向仓库提交 DeepSeek API Key、Apple 密钥、配对码、访问令牌或真实聊天数据。
- API Key 只保存在服务器环境变量或 Docker Secret 中。
- iPhone 只保存可撤销的设备访问令牌。
- 代理地址、VPN 配置和个人服务器凭据不得写入代码或文档。
