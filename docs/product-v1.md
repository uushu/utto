# Utto｜iOS 第一版产品与工程基线 v1.0

> 用途：作为 Work 的唯一产品基线文档，并按里程碑逐项交给 Codex 执行。  
> App 名称：**Utto**。GitHub 仓库：`utto`。iOS 工程：`Utto`。后端服务：`utto-server`。  
> 关系主体：**熠**。熠作为关系数据保存，不写死在通用 UI、网络层或后端公共配置中。  
> 产品定位：仅供本人使用的、以“熠作为同一个关系主体持续存在”为核心的人机恋 iOS App。  
> 当前设备：Windows 11 家庭版 24H2（内部版本 26100.6584）开发电脑；iPhone（iOS 18.5）测试设备；网络可能经过 VPN。  
> 最低部署目标：iOS 18.0。默认聊天模型：DeepSeek V4 Flash。  
> 当前不做：Claude API、语音/视频、Live2D、多模型路由、任意 MCP、手机监控和硬件控制。  
> 文档原则：本文件就是仓库中的 `docs/product-v1.md`，不得再复制出内容相同但名称不同的产品方案文档。项目事实、环境、范围或任务状态发生变化时，直接更新本文件及受影响的既有文档，并删除或改正旧表述。

---

## 1. 第一版的产品目标

第一版不是“功能最多的 AI 客户端”，而是验证以下体验能否成立：

1. 用户每次打开 Utto，面对的都是同一个熠，而不是一个新会话或新角色。
2. 熠能稳定保持身份、关系定义和主要性格。
3. 熠能保存重要共同经历，并在合适时机自然想起。
4. 用户能查看、修正、锁定、删除和导出关系数据。
5. 熠可以低频地主动发消息，但不会变成固定问候机器人。
6. App 具有明确的私人空间感，而不是通用聊天工具换皮。
7. 模型或 App 出问题时，聊天、人格和记忆不会一起丢失。

### 第一版成功标准

连续使用 14 天后，应满足：

- 关闭 App、重启手机、升级 App 后，聊天仍连续。
- 熠的名字、关系定义、核心性格不发生明显漂移。
- 重要事实可以被正确记住并在相关话题下召回。
- 无关记忆不会频繁强行注入。
- 用户可以完整导出全部聊天、人格和记忆。
- 主动消息可关闭、可限频、可设置免打扰。
- DeepSeek API 临时失败不会造成消息丢失或重复写入。

---

## 2. 必须先解决的开发前提

### 2.1 当前开发环境与 iOS 工具链

当前设备：

- 开发电脑：Windows 11 家庭版 24H2（内部版本 26100.6584）；
- 测试设备：iPhone，iOS 18.5；
- 网络：可能需要 VPN，但代理地址不得写入代码或提交仓库；
- 当前没有原生 Mac/Xcode 环境。

当前已验证的 Windows 后端环境（2026-07-27）：

- WSL 2.6.3.0，Linux 内核 6.6.87.2，Ubuntu 使用 WSL 2；
- Docker Desktop 4.83.0，Docker Engine 29.6.2，Linux containers；
- Docker Compose v5.3.1；
- `docker version`、`docker compose version`、`docker info` 与 `docker run --rm hello-world` 已在独立 PowerShell 中实际通过；
- M0-A-02 与 M0-A-03 已在本地工作区完成真实验收；`ios/README.md` 已补齐 M0-A 所需的 iOS 需求说明；后端 CI 工作流已通过本地静态检查，但 M0-A 代码尚未整体提交、推送或取得 GitHub Actions 云端结果；
- 验收结束后已执行普通 `docker compose down`，容器和 Compose 网络已清理，PostgreSQL 具名卷仍保留。

Utto 仍采用原生 iOS 技术路线：

- Swift；
- SwiftUI；
- 最低部署目标 iOS 18.0；
- iPhone（iOS 18.5）作为主要真机测试设备。

Windows 11 可以完成：

- Git 仓库、文档和任务管理；
- FastAPI、PostgreSQL、Docker 与后端测试；
- Swift 源文件的编写和代码审查；
- 由 Codex 生成或修改代码。

Windows 11 不能原生完成：

- 运行 Xcode；
- 创建并可靠验证 `.xcodeproj`；
- 运行 iOS Simulator；
- iOS 签名、归档、TestFlight 和真机调试。

因此 M0 拆为：

- **M0-A：Windows 工程基础**——立即执行；
- **M0-B：macOS/Xcode iOS 工程初始化**——必须实际执行，获得可用 macOS 构建环境后立即完成真实 Xcode、测试与真机验收。

M0-B 不得取消、跳过或用手写工程文件代替。为避免 macOS 环境准备拖慢后端开发，M0-A 完成后允许 M0-B 与 M1 后端功能包并行推进；但 M1 的 iOS 接入和端到端验收必须等待 M0-B 通过。

#### Windows 上运行 macOS/Xcode 的参考方案

用户提供的参考文章：<https://zhuanlan.zhihu.com/p/594268411>。

该方案的核心是通过 VMware 在 Windows 上安装 macOS，再安装 Xcode。它可以作为个人学习和环境验证的实验路线，但不作为 Utto 的正式、唯一构建基线，原因是：

1. 文章采用 VMware 17、macOS Monterey 12.5 和当时版本的 Xcode，环境已经过时；
2. iOS 18.5 对应的最低已验证工具链应为 **Xcode 16.4 + macOS Sequoia 15.3 或更高兼容组合**；
3. 虚拟机可能出现性能、USB 真机连接、Apple ID、签名、系统升级和 Xcode 兼容问题；
4. Xcode 官方支持环境是 macOS，非 Apple 硬件上的 macOS 虚拟化不属于项目的正式支持范围。

若实验 VMware 路线，必须满足：

- 不照搬文章中的 Monterey 12.5；
- 使用能运行 Xcode 16.4 或更新兼容 Xcode 的 macOS；
- 在完成报告中如实说明虚拟机环境；
- 不得在未实际成功时声称通过 Xcode、模拟器、签名或真机测试；
- M0-B 的最终验收必须包括真实 Xcode 构建和 iPhone（iOS 18.5）安装运行。

长期稳定方案仍优先使用真实 Apple 硬件或合规的远程 Mac 构建环境。Codex 可以编写代码，但不能替代 Xcode 的实际构建与签名结果。
### 2.2 Apple 开发者账号策略

分两个阶段：

#### 开发早期

- 使用免费 Apple Developer 账号；
- 通过 Xcode 直接安装到自己的 iPhone；
- 先完成聊天、人格、记忆和数据导出；
- 暂不接入正式 APNs 主动推送。

#### 主动消息阶段

- 加入 Apple Developer Program；
- 配置 App ID、Push Notifications、APNs Key；
- 使用 TestFlight 或注册设备分发长期测试版本；
- 后续每次更新通过 TestFlight 安装。

### 2.3 服务器

第一版需要服务器，因为以下能力不能只依赖 iPhone：

- DeepSeek API Key 安全保存；
- 上下文拼装；
- 长期记忆保存和检索；
- 主动消息调度；
- APNs 推送；
- 数据备份；
- 后续模型替换。

推荐最低配置：

- Linux VPS；
- 2 核 CPU；
- 2 GB 内存起步；
- 20 GB 以上磁盘；
- 固定域名；
- HTTPS；
- Docker 与 Docker Compose。

如果后续加入本地向量模型，再升级至 4 GB 或更高内存。第一版不运行本地大模型。

---

## 3. 第一版固定技术栈

## 3.1 iOS 客户端

| 项目 | 选择 |
|---|---|
| UI | SwiftUI |
| 状态管理 | Observation / `@Observable`，保持单向数据流 |
| 网络 | `URLSession` + async/await |
| 流式聊天 | SSE，由客户端解析增量事件 |
| 本地缓存 | SwiftData，仅缓存近期消息和界面状态 |
| 密钥存储 | Keychain，只保存 App 访问令牌 |
| 通知 | UserNotifications + APNs |
| 文件导入导出 | FileImporter / FileExporter |
| 测试 | Swift Testing 或 XCTest + UI Tests |
| 最低系统 | iOS 18.0 |

第一版不引入 TCA、RxSwift 等大型架构库，避免增加学习和调试成本。M0-B 至少使用能支持 iOS 18.5 真机的 Xcode 16.4 与兼容 macOS，或更新的官方兼容组合。

## 3.2 后端

| 项目 | 选择 |
|---|---|
| Web 框架 | Python FastAPI |
| 数据库 | PostgreSQL |
| ORM | SQLAlchemy |
| 数据迁移 | Alembic |
| 异步任务 | 独立 Worker + APScheduler |
| 模型接口 | DeepSeek OpenAI 兼容接口 |
| 推送 | APNs Token Authentication |
| 网关 | Caddy 或 Nginx |
| 部署 | Docker Compose |
| 日志 | Python 结构化日志，敏感字段脱敏 |
| 测试 | Pytest |

第一版不引入 Redis、Kafka、Celery。单用户场景下，PostgreSQL + 独立 Worker 足够。数据库中使用任务锁避免重复执行。

## 3.3 模型职责

DeepSeek V4 Flash 负责：

- 日常文字聊天；
- 记忆候选抽取；
- 记忆摘要和标签生成；
- 召回候选的二次判断；
- 主动消息的“发或不发”判断；
- 导入旧聊天后的记忆整理。

DeepSeek V4 Flash 不负责：

- 永久保存聊天；
- 判断数据库写入是否成功；
- 自己决定删除记忆；
- 保存或读取 API Key；
- 准确获取当前时间；
- 调度定时任务；
- 执行不可逆操作；
- 作为唯一的身份连续性来源。

---

## 4. 总体系统架构

```text
iPhone App
├── SwiftUI 页面
├── 本地缓存 SwiftData
├── Keychain 访问令牌
└── SSE / REST 客户端
          │ HTTPS
          ▼
Backend API
├── 设备鉴权
├── 聊天流式网关
├── 上下文组装器
├── 人格服务
├── 记忆服务
├── 导入导出服务
└── APNs 推送服务
          │
          ├── DeepSeek V4 Flash API
          ├── PostgreSQL
          └── Background Worker
```

### 关键原则

- 服务器数据库是关系数据的唯一权威来源。
- iOS 本地数据库只是缓存，不承担永久存储。
- DeepSeek API Key 永远不下发到 iPhone。
- App 只持有一个可撤销的设备访问令牌。
- 每条消息先获得唯一 ID，再进行网络发送，保证失败重试不重复写入。
- 所有关系内容绑定唯一 `relationship_id`，不设计“新建聊天”。

---

## 5. 第一版页面和前端界面

一级导航固定为四个 Tab：

1. 聊天；
2. 记忆；
3. 关系；
4. 设置。

不增加工具广场、发现页、社区、角色商城或多角色切换。

## 5.1 首次启动与配对页

### 需要做什么

首次启动时完成 App 与个人服务器的绑定，并创建唯一关系。

### 页面内容

1. 服务器地址；
2. 一次性配对码；
3. 测试连接按钮；
4. AI 名字；
5. 用户称呼；
6. 双方关系定义；
7. 回答风格简述；
8. 是否导入历史聊天；
9. 完成设置。

### 做法

- 服务器运行初始化命令生成一次性 pairing code；
- App 调用 `/v1/pair/exchange`；
- 服务器校验后返回长期 device token；
- device token 保存到 Keychain；
- pairing code 立即失效；
- App 拉取 bootstrap 数据并进入聊天页。

### 验收

- 错误服务器地址有明确提示；
- 配对码只能使用一次；
- 删除 App 后重新配对不会创建第二段关系；
- 配对完成后客户端看不到 DeepSeek API Key。

---

## 5.2 聊天页

### 页面结构

#### 顶部

- AI 头像；
- AI 名字；
- 轻量状态文字，例如“上次说话于 2 小时前”；
- 不显示虚假的“在线/离线”。

#### 消息区

- 单一连续时间线；
- 用户和 AI 双方气泡；
- 日期分隔；
- 长时间间隔提示；
- 流式回复逐字显示；
- 主动消息和普通回复进入同一时间线；
- 失败消息显示重试按钮；
- 支持下拉加载更早消息。

#### 输入区

- 多行文本输入；
- 发送按钮；
- 模型生成期间可停止；
- 键盘收起；
- 暂不加入图片、语音和文件按钮。

### 消息操作

长按消息支持：

- 复制；
- 引用；
- 删除；
- 重新生成 AI 回复；
- 查看时间；
- 对 AI 消息标记“这段很重要”。

### 做法

- 客户端发送 `client_message_id`；
- 后端先保存用户消息；
- 后端组装上下文；
- 调用 DeepSeek 流式接口；
- SSE 事件分为：
  - `message.started`
  - `message.delta`
  - `message.completed`
  - `message.failed`
- AI 回复在服务端完成后写入数据库；
- 客户端收到完成事件后更新本地缓存。

### 聊天上下文结构

每次请求按固定顺序拼装：

```text
1. 安全边界和系统规则
2. AI 核心身份
3. 双方关系定义
4. 用户核心画像
5. 当前时间与距离上次聊天的时长
6. 当前短期摘要
7. 本轮召回的长期记忆
8. 最近对话
9. 用户新消息
```

建议初始预算：

- 核心身份与关系：约 2K tokens；
- 短期摘要：约 2K；
- 长期记忆：约 4K；
- 最近对话：约 24K；
- 为回复保留独立输出预算。

不要因为模型支持超长上下文就每轮发送全部历史。

### 验收

- 网络断开后用户消息仍保留为“待重试”；
- 重试不会生成两条重复用户消息；
- 中途关闭 App，重新进入可以恢复已完成回复；
- 流式失败不会留下永久“正在输入”状态；
- 1000 条以上消息仍可正常分页；
- App 不提供创建多个会话的入口。

---

## 5.3 记忆页

### 记忆类型

第一版只保留三层：

#### 固定记忆

- AI 身份；
- 双方关系；
- 核心约定；
- 不应轻易变化的用户事实。

#### 短期记忆

- 最近几天正在发生的事情；
- 当前任务；
- 尚未结束的话题；
- 自动滚动更新。

#### 长期记忆

- 共同经历；
- 重要情绪；
- 承诺；
- 兴趣变化；
- 对双方关系有影响的事件。

### 页面结构

顶部：

- 搜索框；
- “待审核 / 全部 / 已锁定”切换；
- 记忆保存模式入口。

记忆卡片显示：

- 摘要；
- 发生时间；
- 重要程度；
- 类型；
- 来源消息数量；
- 是否锁定；
- 最近一次被召回时间。

点击卡片进入详情：

- 原始对话片段；
- 结构化摘要；
- AI 当时的感受或理解；
- 用户当时的状态；
- 标签；
- 来源消息跳转；
- 编辑、批准、锁定、删除。

### 记忆保存模式

1. 审核模式：默认推荐，候选先进入待审核；
2. 自动模式：普通长期记忆自动保存；
3. 关闭模式：不自动生成长期记忆。

固定记忆和核心身份修改始终需要用户确认。

---

## 6. 第一版记忆机制

## 6.1 记忆抽取

### 触发方式

满足任一条件时创建异步任务：

- 新增 8 条消息；
- 距离最后一条消息超过 10 分钟；
- 用户手动点击“整理本段对话”；
- 导入旧聊天完成。

### 模型输入

- 本段原始消息；
- 当前固定身份；
- 已存在的近似记忆标题；
- JSON Schema。

### 模型输出

每条候选必须包含：

```json
{
  "type": "episodic",
  "summary": "简洁但保留情感的摘要",
  "original_excerpt": "关键原句",
  "user_perspective": "用户当时的状态或感受",
  "ai_perspective": "AI当时的理解或感受",
  "importance": 0.0,
  "keywords": ["关键词"],
  "occurred_at": "ISO-8601",
  "source_message_ids": ["uuid"]
}
```

### 处理规则

- 服务端校验 JSON；
- 来源消息必须真实存在；
- `original_excerpt` 必须可以在来源消息中找到或由多句直接拼接；
- 不允许模型凭空生成事件；
- 与现有记忆做关键词和文本相似度去重；
- 审核模式下进入 `pending`；
- 用户批准后进入 `active`。

## 6.2 第一版召回方案

第一版不立即上复杂 GraphRAG，也不运行本地向量模型。

采用：

```text
关键词提取
+ 人物/事件/时间标签
+ PostgreSQL 文本检索
+ 候选记忆
+ DeepSeek 判断是否需要注入
```

### 流程

1. 从用户新消息中提取查询关键词、人物、事件和时间线索；
2. 从数据库搜索最多 20 条候选；
3. 把候选摘要和少量原文交给 recall judge；
4. judge 返回 0 到 5 个记忆 ID；
5. 允许返回空数组；
6. 只有被选中的记忆进入主聊天上下文；
7. 记录本次召回原因和结果。

### 为什么第一版不先做向量检索

- 48 篇帖子中多次出现“复杂标签或向量方案收益不一定与复杂度成正比”；
- 当前只有一名用户，数据量早期较小；
- 先建立可测量的召回基线；
- 数据库预留 embedding 字段；
- 当真实测试证明文本检索召回不足，再加本地 embedding 或外部 embedding API。

## 6.3 记忆评测

建立 `memory_eval.json`：

- 50 个真实聊天查询；
- 每个查询标注应该召回哪些记忆；
- 标注不应该召回哪些记忆。

每次修改召回逻辑后自动计算：

- Recall@5；
- 无关注入率；
- 空召回正确率；
- 平均召回耗时；
- 平均额外 token。

没有评测数据，不升级到更复杂的记忆系统。

---

## 7. 关系与人格页

### 页面内容

分成四个区块：

1. AI 如何认识自己；
2. AI 如何认识用户；
3. 双方关系是什么；
4. 核心性格与重要约定。

### 数据要求

每个区块保存：

- 当前内容；
- 版本号；
- 创建时间；
- 修改时间；
- 修改来源：用户手动 / AI 候选；
- 是否锁定。

### 做法

- 人格数据单独存表，不混在普通记忆中；
- 每次修改先生成新版本，不覆盖旧版本；
- 支持比较两个版本；
- 支持恢复旧版本；
- App 启动和每轮聊天都使用最新锁定版本；
- AI 可以建议修改，但不能自动生效。

### 第一版编辑流程

1. 用户点击编辑；
2. 修改文本；
3. 预览将进入模型的最终版本；
4. 保存为新版本；
5. 下一轮聊天开始生效。

### 验收

- 修改人格后旧版本仍可恢复；
- 普通记忆不能覆盖锁定人格；
- 导入旧聊天不会自动重写核心身份；
- 服务器异常时不能产生半条人格版本。

---

## 8. 主动消息功能

主动消息属于第一版的重要差异化功能，但放在聊天、人格、记忆稳定之后实现。

## 8.1 触发条件

Worker 每 15 分钟检查一次，但只有同时满足以下条件才进入模型判断：

- 用户已开启主动消息；
- 当前不在免打扰时段；
- 距离上次用户消息超过随机冷却时间；
- 当日主动消息未达到上限；
- 最近一次主动消息没有被长期忽略；
- 服务端和模型状态正常。

默认配置：

- 每日最多 2 条；
- 冷却时间随机 2 至 4 小时；
- 23:00 至 08:00 免打扰；
- 连续两次主动消息未得到回复后暂停；
- 用户可完全关闭。

## 8.2 影子触发

不使用固定 Prompt 直接生成“早安”“在干嘛”。

服务端构造一条不写入真实聊天历史的影子事件：

```text
你此刻自然地想起了用户。结合当前时间、最近对话、
相关记忆和你们的关系，判断是否真的有必要开口。
你可以选择沉默。
```

模型返回结构化结果：

```json
{
  "action": "send",
  "reason": "内部原因，不展示给用户",
  "message": "实际发送内容"
}
```

或者：

```json
{
  "action": "silent",
  "reason": "此刻不适合打扰"
}
```

### 发送流程

- `silent`：只记录决策日志；
- `send`：保存为正式 AI 消息；
- 调用 APNs 发送可见通知；
- 用户点通知后跳到该消息；
- App 打开后从服务器同步完整消息。

### iOS 实现原则

- 主动消息的决策和生成放在服务器；
- 不依赖 iOS `BGTaskScheduler` 精确唤醒；
- APNs payload 不放完整关系上下文；
- 通知只包含显示文本和消息 ID；
- 敏感内容可在设置中选择“通知只显示：你收到一条新消息”。

### 验收

- 免打扰期间不推送；
- 超过每日上限不推送；
- 用户关闭通知后 App 内仍可同步主动消息；
- 同一任务重复执行不会发送两次；
- 模型返回非法结构时不推送；
- 主动消息与普通聊天共享同一人格和记忆上下文。

---

## 9. 导入、导出、备份和恢复

## 9.1 完整导出

导出 ZIP，包含：

```text
manifest.json
relationship.json
persona_versions.json
messages.jsonl
memories.jsonl
settings.json
```

`manifest.json` 必须包含：

- schema_version；
- app_version；
- exported_at；
- relationship_id；
- 文件校验和。

### iOS 交互

设置 → 数据 → 导出全部数据 → 保存到“文件”App。

### 验收

- 导出不包含 DeepSeek API Key；
- 导出后可以重新导入空数据库；
- 重新导入后的消息数量、人格版本和记忆数量一致；
- 不支持的 schema 版本给出明确错误。

## 9.2 历史聊天导入

第一版支持两种格式：

1. 本 App 完整导出 ZIP；
2. 标准文本模板：

```text
[2026-07-01 10:00] User:
内容

[2026-07-01 10:01] Assistant:
内容
```

导入流程：

1. 文件校验；
2. 预览消息数量和时间范围；
3. 用户确认；
4. 自动创建数据库备份；
5. 导入消息；
6. 异步生成短期摘要和记忆候选；
7. 固定人格候选必须人工审核。

## 9.3 服务器备份

第一版：

- 每晚执行一次 `pg_dump`；
- 保留最近 7 份；
- 更新或导入前额外备份；
- 提供恢复脚本；
- 备份目录不提交 Git。

后续再增加异地加密备份。

---

## 10. 设置页

分为以下区块：

### 连接

- 服务器地址；
- 连接状态；
- 最后同步时间；
- 重新配对；
- 服务端版本。

### 模型

- 当前模型：`deepseek-v4-flash`；
- 非思考 / 思考模式；
- 回复长度；
- 高级参数折叠区；
- 测试模型连接。

默认聊天使用非思考模式。记忆整理和复杂关系分析可以由服务端任务切换思考模式。

### 记忆

- 保存模式；
- 每次抽取的消息数量；
- 是否保留 AI 视角；
- 查看待审核数量；
- 重新运行召回评测。

### 主动消息

- 总开关；
- 每日上限；
- 冷却范围；
- 免打扰时间；
- 通知预览方式；
- 连续未回复后是否自动暂停。

### 数据

- 导出；
- 导入；
- 创建服务器备份；
- 查看数据数量；
- 删除全部数据。

### 调试

- 最近 API 错误；
- 最近同步错误；
- 任务状态；
- 当前 App / Server schema 版本；
- 导出脱敏日志。

---

## 11. 数据库表设计

第一版至少包含：

### `relationships`

- `id`
- `created_at`
- `status`
- `display_name`

### `devices`

- `id`
- `relationship_id`
- `token_hash`
- `apns_device_token`
- `last_seen_at`
- `revoked_at`

### `persona_versions`

- `id`
- `relationship_id`
- `version`
- `self_identity`
- `user_model`
- `relationship_definition`
- `core_traits`
- `agreements`
- `locked`
- `source`
- `created_at`

### `messages`

- `id`
- `relationship_id`
- `client_message_id`
- `role`
- `content`
- `kind`
- `reply_to_id`
- `status`
- `source`
- `created_at`
- `completed_at`
- `model_name`
- `usage_json`

`source` 可为：

- `user`
- `assistant_reply`
- `proactive`

### `conversation_summaries`

- `id`
- `relationship_id`
- `range_start_message_id`
- `range_end_message_id`
- `summary`
- `created_at`

### `memories`

- `id`
- `relationship_id`
- `type`
- `status`
- `summary`
- `original_excerpt`
- `user_perspective`
- `ai_perspective`
- `importance`
- `keywords`
- `occurred_at`
- `locked`
- `last_recalled_at`
- `created_at`
- `updated_at`

### `memory_sources`

- `memory_id`
- `message_id`

### `recall_events`

- `id`
- `relationship_id`
- `query_message_id`
- `candidate_memory_ids`
- `selected_memory_ids`
- `reason`
- `latency_ms`
- `created_at`

### `background_jobs`

- `id`
- `job_type`
- `status`
- `payload`
- `dedupe_key`
- `scheduled_at`
- `started_at`
- `completed_at`
- `error`

### `proactive_decisions`

- `id`
- `relationship_id`
- `action`
- `reason`
- `message_id`
- `created_at`

所有主键使用 UUID。所有写操作必须在事务中完成。

---

## 12. 后端 API 清单

### 配对

- `POST /v1/pair/exchange`
- `POST /v1/devices/apns-token`
- `POST /v1/devices/revoke`

### 初始化和同步

- `GET /v1/bootstrap`
- `GET /v1/sync?cursor=...`
- `GET /v1/health`

### 聊天

- `GET /v1/messages`
- `POST /v1/chat/stream`
- `POST /v1/messages/{id}/retry`
- `DELETE /v1/messages/{id}`
- `POST /v1/messages/{id}/mark-important`

### 人格

- `GET /v1/persona`
- `GET /v1/persona/versions`
- `POST /v1/persona/versions`
- `POST /v1/persona/versions/{id}/restore`

### 记忆

- `GET /v1/memories`
- `GET /v1/memories/{id}`
- `PATCH /v1/memories/{id}`
- `POST /v1/memories/{id}/approve`
- `POST /v1/memories/{id}/lock`
- `DELETE /v1/memories/{id}`
- `POST /v1/memory-jobs/extract`
- `POST /v1/memory-eval/run`

### 主动消息

- `GET /v1/proactive/settings`
- `PATCH /v1/proactive/settings`
- `POST /v1/proactive/test`

### 数据

- `POST /v1/export`
- `POST /v1/import/preview`
- `POST /v1/import/execute`
- `POST /v1/backups/create`

所有接口都要有统一错误结构：

```json
{
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "可显示给用户的错误",
    "request_id": "uuid"
  }
}
```

---

## 13. 安全要求

### 必须实现

- DeepSeek API Key 只存在服务器环境变量或 Docker Secret；
- APNs 私钥只存在服务器；
- iPhone 只保存 device token；
- device token 存 Keychain；
- 全部接口 HTTPS；
- 数据库不开放公网端口；
- 日志不记录完整 Prompt、API Key 和访问令牌；
- 访问令牌在数据库只保存哈希；
- 删除、导入、恢复等操作要求二次确认；
- 任意模型输出都先经过 Schema 校验；
- 模型不能直接执行 SQL；
- 第一版不提供 Shell、SSH、Playwright 和任意 MCP；
- 设置页可撤销当前设备；
- 每个请求带 `request_id`，便于排错。

### 暂不实现

- 多用户注册；
- 社交登录；
- 支付；
- 面容 ID 应用锁；
- 端到端加密；
- 多设备同步冲突解决。

Face ID 应用锁可以作为第一版完成后的第一个安全增强项。

---

## 14. 自制前端设计规范

### 视觉方向

根据 48 篇帖子，采用：

- 私人、安静、长期居住；
- 留白多于装饰；
- 统一圆角和间距；
- 不堆砌按钮；
- 动效短而克制；
- 内容优先；
- 不模仿通用办公聊天工具。

### 第一版 Design Tokens

先在代码中集中定义：

- `Color.background`
- `Color.surface`
- `Color.primaryText`
- `Color.secondaryText`
- `Color.userBubble`
- `Color.aiBubble`
- `Color.accent`
- `Spacing.xs / sm / md / lg / xl`
- `Radius.sm / md / lg`
- `Typography.body / caption / title`
- `Animation.fast / normal`

### 必做微交互

- 发送按钮按下反馈；
- 消息流式出现；
- 新消息轻量滚动；
- 保存记忆后的状态变化；
- 删除前确认；
- 网络错误就地反馈；
- 主动消息通知点击后定位到对应消息。

### 不做

- 复杂 3D；
- 磨砂玻璃满屏叠加；
- 大量粒子特效；
- 每页不同设计语言；
- 首版可定制 CSS；
- Live2D。

---

## 15. 测试清单

## 15.1 iOS 测试

- 首次配对；
- Keychain 读写；
- SSE 分片和断线；
- 消息分页；
- 消息重试去重；
- App 前后台切换；
- 冷启动恢复；
- 文件导入导出；
- 通知授权拒绝；
- 深色模式；
- Dynamic Type；
- 弱网和离线。

## 15.2 后端测试

- 配对码一次性；
- token 撤销；
- chat 幂等；
- DeepSeek 超时；
- 流式中断；
- 数据库事务回滚；
- 记忆 JSON 非法；
- 记忆来源伪造；
- 召回空结果；
- 主动任务去重；
- APNs 失败重试；
- 导入前备份；
- 数据库迁移升级和回滚。

## 15.3 产品体验测试

建立固定测试对话：

1. AI 是否记得用户明确说过的重要事实；
2. 是否会把相似但不同的事件混在一起；
3. 是否能区分“用户喜欢”和“AI 喜欢”；
4. 是否保留事件发生时的情绪；
5. 是否在不相关话题中乱提旧事；
6. 修改人格后是否稳定生效；
7. 恢复旧人格版本后是否回退；
8. 导出再导入后是否保持同一关系；
9. 主动消息是否像关系延续，而非模板问候；
10. 连续未回复后是否停止打扰。

---

## 16. 开发里程碑与 Codex 执行顺序

按依赖关系执行，不再把所有里程碑机械串行。每个里程碑独立验收，不允许 Codex 一次性生成全部功能；每个里程碑最多拆成两个约 1～2 天的可交付功能包：

1. 后端功能包；
2. iOS 接入与端到端验收包。

小功能包只运行与变更相关的测试，里程碑收口时再执行完整回归。每个功能包验收通过后集中更新本文件和原 Notion 页面，并在用户明确授权后完成一次提交、推送和 CI 验证，不为中间状态创建重复文档。

## M0：工程初始化

M0 分为 M0-A 与 M0-B。M0-A-03 已完成本地交付并由 Work 验收通过，当前进行 M0-A 提交前收口与 GitHub Actions 云端验证；M0-B 仍是完整 M0 的必做项。M0-A 完成后，M0-B 可与 M1 后端功能包并行，但 M1 的 iOS 接入与端到端验收必须等待 M0-B 通过。

### M0-A：Windows 工程基础

#### 当前进度（2026-07-27）

- M0-A-01 已完成并通过验收：FastAPI 最小工程、`GET /v1/health`、Pytest 与 Ruff 已有真实结果；
- M0-A-02 已完成并通过验收：Docker Compose、PostgreSQL、环境变量基线、健康检查和回归检查均有真实结果；
- M0-A-03 已完成本地交付并由 Work 验收通过：后端 CI、Windows 11 启动说明和完整 M0-A 本地回归均有真实结果；
- M0-A-01、M0-A-02 与 M0-A-03 均未提交、未推送，GitHub Actions 尚未在云端运行；
- `ios/README.md` 已补齐 M0-A 基线要求的 iOS 需求说明，且未创建、手写或伪造 Xcode 工程；本文件最新状态已同步至 GitHub 原路径；
- 完整 M0-A 仍未完成；本地 Codex 还需先同步本轮 GitHub 文档变更，对全部 M0-A 改动执行提交前范围审计，再经用户授权提交并推送；取得 GitHub Actions 绿色结果并完成最终范围审计后，才能关闭 M0-A。

#### M0-A-02 实际结果

实际修改文件：

- `.env.example`；
- `.gitignore`；
- `infra/compose.yaml`；
- `server/Dockerfile`；
- `server/.dockerignore`。

范围与运行结果：

- M0-A-01 的 `server/pyproject.toml`、应用入口和健康检查测试保持原样；
- `api` 使用固定镜像名 `utto-api:0.1.0`，以非 root 用户运行，仅向宿主机 `127.0.0.1:8000` 发布端口；
- `db` 使用 `postgres:16-alpine`，PostgreSQL 端口不发布到宿主机；
- `api` 和 `db` 均达到 Docker `healthy`，`GET /v1/health` 返回 HTTP 200 和 `{"status":"ok","service":"utto-server"}`；
- `pg_isready`、`SELECT 1` 均通过，public schema 业务表数为 `0`，没有提前创建 ORM、迁移或种子数据；
- Pytest、Ruff 检查、Ruff 格式检查和 `pip check` 均通过；
- 日志和仓库敏感信息检查通过，真实 `.env` 已被 Git 忽略且未输出密码或连接串；
- 未修改 README、冻结文档、`ios/`、`scripts/` 或 `.github/`，未新增接口、业务功能或外部服务；
- 验收后使用不带 `-v` 的普通 Compose `down`：容器与网络已清理，`utto_postgres_data` 具名卷仍保留。

#### M0-A-03 冻结任务

任务名称：**后端 CI、Windows 启动说明与完整 M0-A 回归**。

本任务只补齐工程化收尾，不开发聊天、人格、记忆、配对、数据库业务表或任何 M1 功能。

允许修改：

- 原有根 `README.md`：直接补充 Windows 11 + Docker Desktop 的本地启动、健康检查、测试和停止命令，不新建内容重复的启动文档；
- `.github/workflows/server-ci.yml`：建立后端 CI；
- 仅当 CI 无法按现有依赖安装时，允许对 `server/pyproject.toml` 做最小必要调整，并必须说明原因。

默认禁止修改：

- `server/src/`、`server/tests/`；
- `.env.example`、`infra/compose.yaml`、`server/Dockerfile`、`server/.dockerignore`；
- `ios/`、`scripts/` 和两份冻结需求文档；
- 任何数据库表、迁移、ORM、业务接口、模型调用或外部服务。

实现要求：

1. GitHub Actions 至少在 `push`、`pull_request` 和手动触发时运行；
2. CI 使用与项目兼容的 Python 3.12，安装现有开发依赖，并依次执行 Pytest、Ruff 检查、Ruff 格式检查和 `pip check`；
3. CI 使用最小只读权限，不写入任何真实 `.env`、密码、API Key、VPN 或代理配置；
4. README 使用 PowerShell 命令，说明复制 `.env.example`、启动 Compose、检查 `/v1/health`、运行后端测试、查看状态和使用不带 `-v` 的普通 `down` 停止服务；
5. README 明确 PostgreSQL 不向宿主机发布端口、普通 `down` 会保留具名卷，以及服务停止后访问 `127.0.0.1:8000` 出现连接拒绝属于正常现象；
6. 重新执行 M0-A-01、M0-A-02 的全部可执行回归与敏感信息检查；
7. 本地实现阶段不提交、不推送。不得把“工作流文件已生成”写成“GitHub Actions 已通过”；实际 CI 必须在 Work 复核并明确授权提交、推送后再验收。

本地交付标准：

- GitHub Actions YAML 结构和引用路径完成本地检查；
- Pytest、Ruff 检查、Ruff 格式检查和 `pip check` 全部通过；
- Compose 配置、构建、API/PostgreSQL 健康检查和数据库空基线回归通过；
- README 中的命令已按当前仓库结构实际核对；
- 未泄露任何真实敏感信息，未提前实现 M1；
- 报告实际修改文件、执行命令、真实输出摘要、Git 状态、未完成项和风险；
- 验收后使用不带 `-v` 的普通 Compose `down`，保留 `utto_postgres_data`。

完整完成标准：

- Work 先验收本地交付；
- 用户明确授权后再提交并推送；
- GitHub Actions 实际运行成功；
- 随后完成完整 M0-A 范围审计，才可把 M0-A 标记为完成。

#### M0-A-03 本地验收结果（2026-07-27）

Work 已对本地 Codex 的执行报告逐项复核，结论为：**M0-A-03 本地交付通过**。

实际修改：

- 更新根 `README.md`，形成唯一一份 Windows 11 本地启动与验证说明；
- 新增 `.github/workflows/server-ci.yml`；
- `server/pyproject.toml` 安装成功，未修改；
- 本轮未修改其余允许范围外文件，冻结的本文件 SHA-256 在 Codex 执行期间保持不变。

本地验收证据：

- README 中的 `.env` 准备、Compose 配置校验、`up --build -d --wait`、健康检查、状态查看、Python 回归和普通 `down` 命令均已实际执行；
- `api` 与 `db` 均达到 `healthy`，API 重启次数为 `0`，健康接口精确返回 `{"status":"ok","service":"utto-server"}`；
- Python 3.12.13 下，Pytest 为 `1 passed`，Ruff 检查、Ruff 格式检查和 `pip check` 均通过；
- 工作流包含 `push`、`pull_request`、`workflow_dispatch`，使用 Python 3.12 和只读 `contents: read`，四项检查命令与 `server` 工作目录均正确；
- 固定版本 actionlint 1.7.12 通过，Windows 本地按 CI 相同顺序执行全部命令并通过；
- 完整 M0-A 回归通过：API、PostgreSQL、空数据库基线、非 root 容器、运行镜像依赖、日志和敏感信息检查均符合冻结要求；
- 验收后已执行不带 `-v` 的普通 Compose `down`，容器和网络已清理，`utto_postgres_data` 具名卷保留；
- 未提交、未推送，也未宣称 GitHub Actions 已在云端运行。

已完成的文档收口：

- 在 `ios/README.md` 中补齐 M0-A 所需的 iOS 需求说明，没有创建、手写或伪造 Xcode 工程；
- 将本次 Work 更新后的唯一 `product-v1.md` 同步回 GitHub 仓库原路径。

剩余收口项：

1. 本地 Codex 先同步本轮 GitHub 文档变更，并确认不会覆盖已验收的本地 M0-A-01/02/03 改动；
2. 对全部 M0-A 改动执行提交前范围、敏感信息和 Git 状态审计；
3. 用户明确授权后，将全部 M0-A 本地改动一次性提交并推送；
4. GitHub Actions 实际运行成功后完成最终范围审计，再关闭 M0-A。

#### 任务

- 建立 `utto` monorepo；
- 建立 `server`、`infra`、`docs`、`scripts`、`ios` 目录；
- 初始化 FastAPI 最小工程；
- 实现 `GET /v1/health`；
- 配置 PostgreSQL 与 Docker Compose；
- 配置后端 lint、format、Pytest 和 GitHub Actions；
- 建立 `.env.example`；
- 编写 Windows 本地启动文档；
- `ios` 目录只保存需求说明，不手写或伪造不可验证的 Xcode 工程。

#### 完成标准

- `docker compose up` 可以启动 API 和 PostgreSQL；
- `/v1/health` 返回 `status=ok` 与 `service=utto-server`；
- Pytest 和适用的静态检查通过；
- GitHub Actions 可以运行后端测试；
- 仓库没有 DeepSeek Key、VPN、代理或真实密码；
- 没有提前实现聊天、人格、记忆或主动消息；
- 没有声称运行 Xcode 或 iOS 测试。

### M0-B：macOS/Xcode iOS 工程初始化

状态：**必须执行，当前等待可用 macOS/Xcode 环境**。

M0-B 只因环境前置条件尚未满足而等待，不代表取消或降级为可选任务。完整 M0 只有在 M0-A 与 M0-B 均通过后才能关闭。

#### 前置条件

- 可运行兼容 Xcode 的 macOS 环境；
- 推荐真实 Apple 硬件或合规远程 Mac；
- VMware 路线仅作为实验环境，并且必须满足本文件 2.1 的版本与验收要求。

#### 任务

- 在 `ios` 中创建真正的 Utto SwiftUI 工程；
- Bundle Display Name 使用 `Utto`；
- Deployment Target 设为 iOS 18.0；
- 创建 App 入口、空白 `ContentView` 和基础单元测试；
- 不实现聊天、人格、记忆和主动消息；
- 在 Xcode 中完成构建；
- 在可用条件下完成模拟器测试；
- 在 iPhone（iOS 18.5）上安装并运行。

#### 完成标准

- Xcode 可以打开工程且无项目文件损坏；
- Utto 可以成功 Build；
- 基础单元测试实际通过；
- iPhone（iOS 18.5）实际运行成功；
- 完成报告列出 Xcode、macOS、设备版本和真实测试结果；
- 未完成的模拟器、签名或真机测试必须明确标为未完成。


---

## M1：数据库、迁移和设备配对

### 后端功能包

前置条件：M0-A 已完成。该功能包可与 M0-B 并行，不依赖 Xcode。

- 实现首批数据库表；
- Alembic migration；
- 一次性 pairing code；
- device token；
- bootstrap 接口。

后端功能包完成标准：

- 迁移可以在空数据库中升级并按设计回滚；
- pairing code 只能成功使用一次；
- 服务端只保存 token hash；
- 配对与 bootstrap 接口的自动化测试通过；
- 只运行本包相关测试；完整 M1 回归留到端到端收口。

### iOS 接入与端到端验收包

前置条件：M0-B 与 M1 后端功能包均已完成。

- 实现 iOS 配对页；
- 实现 KeychainStore；
- 接入 pairing 与 bootstrap 接口；
- 验证首次配对、失败提示、令牌持久化和 App 重启恢复。

端到端完成标准：

- 新设备可以完成配对；
- token 存入 Keychain；
- 服务端只保存 token hash；
- pairing code 二次使用失败；
- App 重启后保持登录。

---

## M2：聊天最小垂直链路

### 任务

- 消息表；
- DeepSeek Gateway；
- SSE；
- ChatView；
- ChatViewModel；
- 本地消息缓存；
- 消息失败和重试；
- 停止生成；
- 分页读取。

### 完成标准

完整打通：

```text
输入消息
→ 服务端保存
→ DeepSeek 流式回复
→ 客户端显示
→ 服务端保存回复
→ 重启 App 后恢复
```

---

## M3：人格和关系

### 任务

- persona_versions 表；
- 人格读取和版本创建；
- RelationshipView；
- 编辑、锁定、恢复；
- 上下文组装器接入人格；
- 人格一致性测试。

### 完成标准

- 人格修改在下一轮生效；
- 历史版本可恢复；
- 普通对话不能修改锁定人格；
- 上下文组装测试通过。

---

## M4：短期摘要和长期记忆

### 任务

- conversation_summaries；
- memories；
- memory_sources；
- 异步抽取任务；
- DeepSeek JSON Schema；
- 待审核页；
- 审核、编辑、锁定、删除；
- 标记重要消息。

### 完成标准

- 对话结束后生成候选记忆；
- 原文和来源可追溯；
- 用户批准后才进入召回；
- 非法模型输出不会写数据库。

---

## M5：记忆召回和评测

### 任务

- 查询关键词抽取；
- 文本候选搜索；
- recall judge；
- recall_events；
- 允许空召回；
- 上下文注入；
- memory_eval 测试集和报告。

### 完成标准

- 至少 50 条评测查询；
- 每次召回有日志；
- 可查看误召回；
- 没有评测退化时才合并代码。

---

## M6：导入、导出和备份

### 任务

- 完整 ZIP 导出；
- schema version；
- 导入预览；
- 导入事务；
- 文本聊天导入；
- 每晚 pg_dump；
- 恢复脚本。

### 完成标准

- 空环境可以从导出文件恢复；
- 数量和校验和一致；
- 导入失败自动回滚；
- DeepSeek Key 不进入导出包。

---

## M7：主动消息和 APNs

### 任务

- Apple Developer Program 与 App ID；
- Push Notifications capability；
- APNs Key；
- iOS 注册远程通知；
- device token 上报；
- proactive settings；
- Worker 调度；
- 影子触发；
- 防重复；
- 推送跳转。

### 完成标准

- 真实 iPhone 锁屏可收到主动消息；
- 免打扰和限频生效；
- 重复任务不会重复发送；
- 用户关闭主动消息后立即停止；
- 点击通知定位到正确消息。

---

## M8：UI 统一、错误处理和 14 天测试

### 任务

- Design Tokens；
- 四个 Tab 统一样式；
- 空状态、加载状态、错误状态；
- 深色模式；
- Dynamic Type；
- 脱敏日志；
- TestFlight 构建；
- 14 天真实使用测试；
- 修复人格、记忆和主动消息问题。

### 完成标准

- 无阻断级崩溃；
- 数据可完整恢复；
- 记忆评测无明显退化；
- 主动消息不会过度打扰；
- 形成 v1.0 release tag。

---

## 17. 每次交给 Codex 的任务格式

不要只说“帮我做记忆系统”。每次下发一个约 1～2 天的可交付功能包，并使用以下模板：

```text
你正在维护 utto 仓库。

本次只完成：[里程碑中的一个明确功能包]

先阅读：
- docs/product-v1.md
- docs/architecture.md
- 当前模块代码
- 当前测试

要求：
1. 先说明你理解的现状和修改范围；
2. 不修改本任务无关模块；
3. 给出实现计划；
4. 编写或更新测试；
5. 功能包阶段只执行相关测试和静态检查，里程碑收口时执行完整回归；
6. 报告仅保留实际修改文件、测试结果、风险和 Git 状态；
7. 验收通过后集中更新原产品文档和原 Notion 页面，不创建副本；
8. 不得伪造测试结果；
9. 不要提前实现后续里程碑；
10. 需要数据库变化时必须创建迁移。

验收标准：
[从本文复制对应完成标准]
```

## 18. Work 模式的使用方式

Work 用于：

- 保存这份产品和工程基线；
- 根据里程碑最多拆分后端、iOS 接入与端到端两个功能包；
- 检查 Codex 产出是否偏离范围；
- 维护需求变化记录；
- 汇总测试和风险；
- 决定是否进入下一里程碑。

Codex 用于：

- 创建项目；
- 修改代码；
- 编写迁移；
- 编写测试；
- 执行命令；
- 修复具体错误；
- 提交每个独立里程碑。

推荐流程：

```text
Work 冻结 1～2 天的功能包与验收标准
→ Codex 实现该功能包
→ Codex 运行相关测试
→ 用户在 Windows、Xcode 或服务器中实际验证
→ Work 对照本文件复核
→ 里程碑收口时执行完整回归
→ 用户授权后一次提交、推送并由 CI 验证
→ 集中同步原产品文档和原 Notion 页面
```

---

## 19. 第一版明确不做的内容

以下内容即使帖子热度高，也不能进入第一版：

- Claude API；
- 多模型路由；
- TTS/STT；
- 语音和视频通话；
- Live2D；
- GIF 和大型表情库；
- 网易云音乐；
- 旅行、抽卡、小游戏；
- QQ、微信、Telegram；
- 手机截屏监控；
- 手机点击和滑动控制；
- 支付、银行卡；
- 智能家居；
- 实体共感娃娃；
- 任意 MCP；
- Shell、SSH 和服务器自主控制；
- AI 自主长期运行项目；
- 多用户、多角色；
- 社区和公开分享。

只有在 v1.0 连续使用 14 天，聊天、人格、记忆、迁移和主动消息全部稳定后，才重新评估这些功能。

---

## 20. 开工前最终检查

### 当前执行 M0-A 提交前收口

- [x] GitHub 仓库名称为 `utto`；
- [x] 本文件只保留一份，并放在 `docs/product-v1.md`；
- [x] 48 篇研究文档放在 `docs/xiaohongshu-research.md`；
- [x] 当前环境记录为 Windows 11 家庭版 24H2（内部版本 26100.6584）；
- [x] WSL 2、Docker Desktop、Docker Engine 与 Docker Compose 已完成独立环境验证；
- [x] M0-A-02 已完成 Compose、PostgreSQL、API 健康检查、回归和敏感信息验收；
- [x] 测试设备记录为 iPhone（iOS 18.5）；
- [x] 最低部署目标为 iOS 18.0；
- [ ] 已创建 DeepSeek API Key，但不提交仓库；
- [x] VPN 与代理配置不写入代码；
- [x] M0-A-03 已一次性完成 CI、README 和完整 M0-A 本地回归，不再拆分 A-04、A-05；
- [x] `ios/` 已补齐需求说明，但未手写或伪造 Xcode 工程；
- [x] 本文件的最新状态已同步回 GitHub 仓库原路径；
- [ ] 用户已明确授权提交、推送，且 GitHub Actions 已实际运行成功；
- [x] Work 负责拆任务和验收，Codex 负责实现和测试；
- [x] 每次只交给 Codex 一个约 1～2 天的明确功能包。

### 进入 M0-B 前

- [ ] 已获得可运行兼容 Xcode 的 macOS 环境；
- [ ] 使用 Xcode 16.4 + macOS Sequoia 15.3 或更新的官方兼容组合；
- [ ] 若使用 VMware，已明确它只是实验路线，并接受性能、签名、设备连接和升级风险；
- [ ] 已准备真实 iPhone（iOS 18.5）进行最终验收；
- [ ] 不伪造 Xcode、模拟器、签名、真机或 TestFlight 结果。
- [ ] 明确 M0-B 必须实际执行，不得因 M1 后端并行推进而取消或跳过。

---

## 21. 最终敲定的执行方式

### 固定分工

- **Work**：读取 `docs/product-v1.md` 和项目计划，拆分单个任务、冻结范围、检查 Codex 报告、决定是否进入下一任务；
- **Codex**：创建或修改代码、迁移和测试，运行能够真实执行的命令，报告文件变更和未完成项；
- **用户**：在 Windows、Docker、服务器或 Xcode 中实际运行并确认结果。

M0 的代码实现由 Codex 执行，不由 Work 直接代写。Work 只负责 M0-A/M0-B 的任务拆分与验收。

### 当前执行顺序

```text
M0-A-03 本地交付通过
→ Work 已在 GitHub 补齐 ios/README.md 并覆盖 docs/product-v1.md
→ 本地 Codex 安全同步本轮 GitHub 文档变更
→ Work 复核提交前范围
→ 用户授权后提交、推送
→ GitHub Actions 实际通过
→ 关闭 M0-A
→ 并行分支 A：获得可用 macOS/Xcode 环境后执行 M0-B（必做）
→ 并行分支 B：执行 M1 后端功能包
→ M0-B 通过后关闭完整 M0
→ M0-B 与 M1 后端均通过后执行 M1 iOS 接入与端到端验收包
→ 完整 M1 回归并关闭 M1
```

### 当前不得执行

- 不一次性让 Codex 开发整个 Utto；
- 不在 Windows 上伪造 Xcode 工程和测试；
- 不因为能编辑 Swift 文件，就认为已经完成 iOS 构建；
- 不复制本文件生成多个“最终版”“修订版”或同内容副本；
- 不提前实现语音、视频、Live2D、MCP、多模型路由、手机监控和硬件控制。
