# Utto iOS 客户端需求说明

> 状态：M0-A 文档收口完成，作为 M0-B 的唯一 iOS 工程初始化输入。  
> 上位基线：[产品与工程基线](../docs/product-v1.md)。如两者冲突，以 `docs/product-v1.md` 为准。  
> 当前目录不得包含在 Windows 上手写或未经 Xcode 验证的工程文件。

## 1. 固定产品与平台约束

- App 名称、Product Name 与 Bundle Display Name：`Utto`；
- 关系主体：熠，但不得将“熠”硬编码在通用 UI、网络层或公共配置中；
- 客户端语言与 UI：Swift、SwiftUI；
- App 生命周期：SwiftUI App；
- 最低部署目标：iOS 18.0；
- 主要真机：iPhone，iOS 18.5；
- M0-B 工具链：至少使用支持 iOS 18.5 真机的 Xcode 16.4 与兼容 macOS，或更新的官方兼容组合；
- 第一版状态管理使用 Observation / `@Observable`，网络使用 `URLSession` + async/await；
- M0-B 不引入第三方依赖、TCA、RxSwift 或业务 SDK。

Bundle Identifier 必须由用户可用的 Apple Developer Team 和 Xcode 实际注册结果确定。不得在文档中伪造 Team ID、签名证书、Provisioning Profile 或已通过的签名状态。

## 2. 当前阶段边界

本文件在 M0-A 阶段只保存需求，不代表 iOS 工程已经创建、构建或运行。

M0-A 阶段禁止：

- 在 Windows 上手写或拼装 `.xcodeproj`、`.xcworkspace`；
- 声称已通过 Xcode、模拟器、签名、真机或 TestFlight；
- 提前实现配对、聊天、人格、记忆、主动消息、APNs、SwiftData 或 Keychain 业务；
- 提交 Apple 密钥、证书、Provisioning Profile、设备标识或个人账号信息。

## 3. M0-B 交付范围

M0-B 必须在真实可运行 Xcode 的 macOS 环境中完成：

1. 在 `ios/` 下使用 Xcode 创建真正的 Utto SwiftUI 工程；
2. 设置 Product Name 和 Bundle Display Name 为 `Utto`；
3. 设置 Deployment Target 为 iOS 18.0；
4. 保留最小 SwiftUI App 入口和空白 `ContentView`；
5. 建立一个基础单元测试 Target，并提供至少一个可实际运行的最小测试；
6. 使用 Xcode 完成工程构建和单元测试；
7. 在 iPhone（iOS 18.5）上实际安装并启动；
8. 记录真实 macOS、Xcode、Swift、设备系统版本与测试结果。

建议的最小工程结果：

```text
ios/
├── README.md
└── Utto/
    ├── Utto.xcodeproj
    ├── Utto/
    │   ├── UttoApp.swift
    │   ├── ContentView.swift
    │   └── Assets.xcassets
    └── UttoTests/
        └── UttoTests.swift
```

实际文件可随 Xcode 官方模板略有差异，但不得通过复制未知工程模板规避 Xcode 创建和验证。

## 4. M0-B 验收标准

- Xcode 能正常打开工程，项目引用无损坏；
- Debug 构建成功；
- 基础单元测试实际通过；
- App 在 iPhone（iOS 18.5）上安装并启动，显示最小空白界面；
- 未提前实现 M1 或后续业务；
- 仓库不包含签名私钥、证书、Provisioning Profile 或个人凭据；
- 完成报告只写真实结果；未完成的模拟器、签名或真机步骤必须明确标为未完成。

M0-B 未通过前，不得把“Swift 文件已生成”当作 iOS 工程初始化完成。完整 M0 只有在 M0-A 和 M0-B 均通过后才能关闭。

## 5. M1 预留边界

M0-B 通过后，M1 iOS 接入包才允许实现：

- 首次启动与服务器配对页；
- 服务器地址、一次性配对码和连接测试；
- device token 的 Keychain 存储；
- bootstrap 拉取；
- 与 M1 后端进行端到端验收。

这些内容不属于 M0-B，不得提前开发。

