# iOS 应用安装指南

本指南将帮助您将 LIMS v2.0 移动端应用安装到 iPhone 上。

## ⚠️ 重要提示

由于 iOS 应用构建需要 macOS 和 Xcode，如果您当前在 Windows 系统上，需要：
- **方法一**：使用 Mac 电脑进行构建和安装（推荐）
- **方法二**：使用 Capacitor Live Reload 在 iPhone 上测试（需要 Mac 和开发服务器）

---

## 方法一：在 Mac 上构建并安装到 iPhone（生产环境）

### 前置要求

1. **Mac 电脑**（macOS 10.15 或更高版本）
2. **Xcode**（从 App Store 安装最新版本）
3. **Apple Developer 账号**（免费账号也可以用于真机测试）
4. **iPhone**（通过 USB 连接到 Mac）
5. **Node.js** 和 **npm**（已安装）

### 步骤

#### 1. 准备项目

在 Mac 上克隆或复制项目到本地：

```bash
cd /path/to/lims-v2/client
npm install
```

#### 2. 构建 Web 应用

```bash
npm run build
```

这将生成 `dist` 文件夹，包含构建好的 Web 应用。

#### 3. 同步到 iOS 平台

```bash
npx cap sync ios
```

这个命令会：
- 将构建好的 Web 应用复制到 iOS 项目
- 更新 iOS 原生代码和依赖

#### 4. 打开 Xcode 项目

```bash
npx cap open ios
```

或者在 Finder 中打开 `client/ios/App/App.xcodeproj`

#### 5. 配置签名和 Bundle ID

在 Xcode 中：

1. 选择项目文件（左侧导航栏最顶部的 "App"）
2. 选择 "App" target
3. 进入 "Signing & Capabilities" 标签页
4. 勾选 "Automatically manage signing"
5. 选择您的 Team（Apple Developer 账号）
6. 确认 Bundle Identifier 为 `com.jitri.lims`（或修改为您自己的）

#### 6. 选择目标设备

在 Xcode 顶部工具栏：
- 点击设备选择器（显示 "Any iOS Device" 的地方）
- 选择您的 iPhone（需要已通过 USB 连接并信任此电脑）

#### 7. 构建并运行

- 点击 Xcode 左上角的 **▶️ 运行按钮**，或按 `Cmd + R`
- 首次安装需要在 iPhone 上信任开发者：
  - 打开 iPhone 的 **设置 > 通用 > VPN与设备管理**（或 **设备管理**）
  - 点击您的开发者账号
  - 点击 **信任**

#### 8. 完成

应用将自动安装到您的 iPhone 上并启动！

---

## 方法二：使用 Capacitor Live Reload（开发测试）

这个方法允许您在开发时实时在 iPhone 上查看更改，无需每次重新构建。

### 前置要求

- Mac 电脑
- iPhone 和 Mac 连接到**同一个 Wi-Fi 网络**
- Xcode（已安装）

### 步骤

#### 1. 启动开发服务器

在 Mac 上，确保后端服务器正在运行，然后启动前端开发服务器：

```bash
cd client
npm run dev
```

开发服务器将在 `http://localhost:5173` 启动。

#### 2. 查找 Mac 的本地 IP 地址

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

或者：
- 打开 **系统偏好设置 > 网络**
- 查看 Wi-Fi 的 IP 地址（例如：`192.168.1.100`）

#### 3. 更新 Capacitor 配置

编辑 `client/capacitor.config.json`，将 `server.url` 更新为您的 Mac 的 IP 地址：

```json
{
  "appId": "com.jitri.lims",
  "appName": "limsV2.0",
  "webDir": "dist",
  "server": {
    "url": "http://YOUR_MAC_IP:5173",
    "cleartext": true
  }
}
```

**注意**：将 `YOUR_MAC_IP` 替换为您的 Mac 的实际 IP 地址（例如：`http://192.168.1.100:5173`）

#### 4. 同步配置

```bash
npx cap sync ios
```

#### 5. 在 Xcode 中运行

```bash
npx cap open ios
```

然后按照方法一的步骤 5-7 配置并运行应用。

#### 6. 测试 Live Reload

- 在 Xcode 中运行应用
- 应用启动后，它会连接到开发服务器
- 现在当您修改代码时，应用会自动刷新显示最新更改

---

## 常见问题

### Q: 我没有 Mac，可以在 Windows 上构建 iOS 应用吗？

A: 不可以。iOS 应用构建必须使用 macOS 和 Xcode。您可以考虑：
- 使用 Mac 虚拟机（需要 macOS 许可证，不推荐）
- 使用云 Mac 服务（如 MacStadium、MacinCloud）
- 借用或使用 Mac 电脑

### Q: 应用无法连接到服务器

A: 检查以下几点：
1. 确保 iPhone 和服务器在同一网络
2. 检查防火墙设置
3. 确认 `capacitor.config.json` 中的服务器地址正确
4. 如果使用 HTTPS，确保 `cleartext: true` 已设置（仅开发环境）

### Q: 签名错误

A: 
1. 确保在 Xcode 中选择了正确的 Team
2. 免费 Apple ID 也可以用于真机测试（每年限制 3 个应用）
3. 如果 Bundle ID 冲突，修改 `capacitor.config.json` 中的 `appId`

### Q: 如何更新应用？

A: 
1. 修改代码后运行 `npm run build`
2. 运行 `npx cap sync ios`
3. 在 Xcode 中重新构建并运行

---

## 生产环境部署

### 构建 IPA 文件（用于 TestFlight 或 App Store）

1. 在 Xcode 中，选择 **Product > Archive**
2. 等待归档完成
3. 在 Organizer 窗口中，选择您的归档
4. 点击 **Distribute App**
5. 选择分发方式：
   - **App Store Connect**：上传到 App Store 或 TestFlight
   - **Ad Hoc**：直接分发给特定设备
   - **Enterprise**：企业内部分发
   - **Development**：开发测试

---

## 下一步

安装成功后，您可以：
- 测试移动端界面和功能
- 根据实际使用情况调整 UI/UX
- 配置推送通知（如需要）
- 准备提交到 App Store（如需要）

---

## 相关资源

- [Capacitor iOS 文档](https://capacitorjs.com/docs/ios)
- [Xcode 使用指南](https://developer.apple.com/xcode/)
- [Apple Developer 文档](https://developer.apple.com/documentation/)





