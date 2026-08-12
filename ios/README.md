# Utto 原生 iOS 路线（暂停）

> 状态：2026-08-11 起不再作为 Utto 第一版客户端的主线实现。当前主线客户端位于 [`mobile/`](../mobile/)，采用 React Native + Expo + TypeScript，可在 Windows 开发机上通过 Expo Go 直接进行 iPhone 真机验证。

这个目录保留此前 SwiftUI / Xcode 路线的历史边界，避免丢失已经完成的环境研究。这里目前没有经过 Xcode 创建或验证的 `.xcodeproj`，也不应在 Windows 上手写伪造原生工程。

## 为什么暂停

原路线要求在进入客户端业务开发前先获得可用的 macOS + Xcode 环境。实际执行中，VMware、OpenCore、macOS Recovery、Xcode 兼容与真机工具链成为主要阻塞，而这些工作没有直接验证 Utto 的核心陪伴体验。

第一版改为 Expo 后：

- Windows 可以直接完成客户端开发；
- iPhone 可通过 Expo Go 做快速真机验证；
- 现有 FastAPI、PostgreSQL、设备配对和关系数据继续复用；
- DeepSeek API Key 仍只保存在服务器；
- 后续需要 TestFlight / App Store 时，再使用 EAS Build / EAS Submit 或恢复原生 iOS 工程。

## 当前主线

请从 [`mobile/README.md`](../mobile/README.md) 开始。

当前移动端纵向链路为：

```text
Expo iPhone Client
    │
    ├── POST /v1/pair/exchange
    ├── GET  /v1/bootstrap
    └── POST /v1/chat
              │
              ▼
        FastAPI Server
              │
              ▼
      DeepSeek V4 Flash
```

## 未来何时恢复原生路线

只有当 Utto 的聊天、关系连续性、记忆和主动消息体验已经通过实际使用验证，并且确实出现 Expo 无法合理满足的原生需求时，再评估 SwiftUI 客户端。届时必须在真实可运行的 Xcode 环境中创建、构建、签名和真机验收，不能把未经 Xcode 验证的 Swift 文件视为完成。
