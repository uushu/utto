# Utto Mobile

Utto 的 React Native + Expo 客户端。第一目标是在 Windows 开发机上直接通过 Expo Go 在 iPhone 真机运行，不再把本地 Xcode/macOS 作为客户端开发前置条件。

## 当前能力

- Expo SDK 54 + React Native 0.81 + TypeScript
- 首次设备配对：调用 `POST /v1/pair/exchange`
- 设备令牌：`expo-secure-store`
- 启动同步：调用 `GET /v1/bootstrap`
- 真实聊天：调用 `POST /v1/chat`，由服务器代理 DeepSeek
- 本机近期聊天缓存：AsyncStorage
- 四个一级入口：聊天、记忆、关系、设置

当前 `记忆` 页只是产品壳；服务端长期记忆抽取、召回和持久化尚未接入。

## 1. 安装依赖

要求 Node.js 20.19+。在 Windows PowerShell：

```powershell
Set-Location D:\utto_app\mobile
npm install
npm run typecheck
```

## 2. 让 iPhone 能访问本机 Utto API

手机和电脑连接同一个可信局域网。编辑仓库根目录 `.env`：

```dotenv
UTTO_API_BIND=0.0.0.0
DEEPSEEK_API_KEY=<你的 DeepSeek API Key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

不要提交 `.env`。

重新构建并启动后端：

```powershell
Set-Location D:\utto_app
docker compose --env-file .env -f infra/compose.yaml up --build -d --wait
```

获取 Windows 在当前局域网的 IPv4 地址，例如：

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object InterfaceAlias,IPAddress
```

在 iPhone Safari 中先验证：

```text
http://<电脑局域网IP>:8000/v1/health
```

应返回：

```json
{"status":"ok","service":"utto-server"}
```

如果访问不到，检查 Windows Defender Firewall 是否允许当前专用网络上的 TCP 8000 入站；不要把 8000 端口暴露到公网。

## 3. 生成一次性配对码

后端数据库运行在 Docker 网络里，所以直接在 `api` 容器中执行现有 CLI，确保配对码写入当前 PostgreSQL：

```powershell
Set-Location D:\utto_app
docker compose --env-file .env -f infra/compose.yaml exec api utto-pairing-code
```

记下终端输出的一次性配对码。它默认 15 分钟过期且只能使用一次。

## 4. 在 iPhone 上运行

App Store 安装 Expo Go，然后在 Windows：

```powershell
Set-Location D:\utto_app\mobile
npx expo start
```

用 iPhone 扫描 Expo QR Code。

首次打开 Utto：

1. `Utto API` 填 `http://<电脑局域网IP>:8000`
2. 输入刚生成的一次性配对码
3. 点击“连接 Utto”
4. 进入聊天页后直接给熠发消息

## 5. 当前边界

这一版是可运行的 M0/M1 客户端纵向切片，不宣称完成完整产品：

- 聊天历史目前以手机 AsyncStorage 为近期缓存，服务器消息表尚未实现
- `/v1/chat` 每次只把最近 20 条消息发送给 DeepSeek
- 服务端长期记忆、记忆编辑/删除、主动消息、APNs、导出仍未实现
- Expo Go 用于快速开发验证；准备 TestFlight/App Store 时切换到 EAS Development Build / EAS Build

DeepSeek API Key 永远只保存在服务器环境变量中，不写入 Expo 客户端。
