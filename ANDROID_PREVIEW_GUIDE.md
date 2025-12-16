# Android 应用预览指南

成功构建 APK 后，您可以通过以下几种方式在设备上预览应用。

## 📱 方法一：在 Android Studio 中直接运行（推荐）

### 使用模拟器

1. **创建虚拟设备（如果还没有）**
   - 在 Android Studio 中，点击 **Tools > Device Manager**
   - 点击 **Create Device**
   - 选择设备型号（如 Pixel 5）
   - 选择系统镜像（推荐 API 33 或更高）
   - 完成创建

2. **启动模拟器**
   - 在 Device Manager 中选择设备
   - 点击 **▶️ 运行按钮**

3. **运行应用**
   - 在 Android Studio 顶部工具栏选择刚创建的模拟器
   - 点击 **▶️ 运行按钮**，或按 `Shift + F10`
   - 应用会自动安装并启动

### 使用真机（USB 连接）

1. **启用开发者选项**
   - 在 Android 设备上：**设置 > 关于手机**
   - 连续点击 **版本号** 7 次
   - 返回设置，找到 **开发者选项**

2. **启用 USB 调试**
   - 进入 **开发者选项**
   - 开启 **USB 调试**
   - 连接设备到电脑（使用 USB 线）

3. **信任电脑**
   - 设备上会弹出"允许 USB 调试"提示
   - 勾选"始终允许来自这台计算机"
   - 点击 **确定**

4. **在 Android Studio 中运行**
   - 连接后，设备会出现在设备列表中
   - 选择您的设备
   - 点击 **▶️ 运行按钮**
   - 应用会自动安装并启动

---

## 📦 方法二：直接安装 APK 文件

### 步骤

1. **找到 APK 文件**
   - Debug APK: `client/android/app/build/outputs/apk/debug/app-debug.apk`
   - Release APK: `client/android/app/build/outputs/apk/release/app-release.apk`

2. **传输到设备**
   - **方法 A**：通过 USB 传输
     - 连接设备到电脑
     - 将 APK 文件复制到设备的下载文件夹
   - **方法 B**：通过云盘/邮件
     - 上传 APK 到云盘（如 Google Drive、OneDrive）
     - 在设备上下载
   - **方法 C**：通过 ADB 安装（命令行）
     ```powershell
     cd client/android
     .\gradlew.bat installDebug
     # 或
     .\gradlew.bat installRelease
     ```

3. **在设备上安装**
   - 打开文件管理器
   - 找到 APK 文件
   - 点击 APK 文件
   - 如果提示"未知来源"，需要允许安装：
     - **设置 > 安全 > 允许安装未知应用**
     - 或 **设置 > 应用 > 特殊访问权限 > 安装未知应用**
   - 点击 **安装**

4. **启动应用**
   - 安装完成后，在应用列表中找到 **limsV2.0**
   - 点击启动

---

## 🔧 方法三：使用命令行安装（快速）

### 前提条件
- 设备已通过 USB 连接
- 已启用 USB 调试
- 已安装 Android SDK Platform-Tools（Android Studio 会自动安装）

### 安装命令

```powershell
# 进入 Android 项目目录
cd client/android

# 安装 Debug 版本
.\gradlew.bat installDebug

# 或安装 Release 版本（需要先构建）
.\gradlew.bat installRelease
```

或者使用 ADB 直接安装：

```powershell
# 检查设备是否连接
adb devices

# 安装 APK
adb install client/android/app/build/outputs/apk/debug/app-debug.apk

# 或 Release 版本
adb install client/android/app/build/outputs/apk/release/app-release.apk
```

---

## 🌐 重要：配置服务器连接

您的应用配置了服务器地址：`http://192.168.9.46:3004`

### 确保服务器可访问

1. **检查服务器是否运行**
   ```powershell
   # 在服务器上检查
   curl http://192.168.9.46:3004/api/health
   # 或访问浏览器
   # http://192.168.9.46:3004
   ```

2. **确保设备可以访问服务器**
   - **模拟器**：使用 `10.0.2.2` 代替 `localhost`（但您的配置是 IP 地址，应该可以直接访问）
   - **真机**：确保设备和服务器在同一网络，或使用公网 IP

3. **如果服务器地址不同**
   - 修改 `client/capacitor.config.json` 中的 `server.url`
   - 重新构建并同步：
     ```powershell
     cd client
     npm run build
     npm run cap:sync:android
     ```

### 开发模式（Live Reload）

如果想在开发时实时查看更改：

1. **启动开发服务器**
   ```powershell
   cd client
   npm run dev
   ```

2. **查找电脑的 IP 地址**
   ```powershell
   # Windows PowerShell
   ipconfig
   # 找到 IPv4 地址，例如：192.168.1.100
   ```

3. **更新 Capacitor 配置**
   编辑 `client/capacitor.config.json`：
   ```json
   {
     "server": {
       "url": "http://192.168.1.100:5173",
       "cleartext": true
     }
   }
   ```

4. **同步配置**
   ```powershell
   npm run cap:sync:android
   ```

5. **在 Android Studio 中运行应用**
   - 应用会连接到开发服务器
   - 代码更改会自动刷新

---

## 🐛 常见问题

### Q: 应用安装后无法打开或闪退

**可能原因：**
1. 服务器无法访问
2. 网络权限未配置
3. 应用签名问题

**解决方案：**
1. 检查 `AndroidManifest.xml` 中的网络权限：
   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
   ```
2. 检查服务器是否可访问
3. 查看 Logcat 日志（Android Studio > Logcat）

### Q: 应用显示空白页面

**可能原因：**
1. 服务器连接失败
2. Web 资源未正确加载

**解决方案：**
1. 检查网络连接
2. 在 Android Studio 的 Logcat 中查看错误信息
3. 确认 `dist` 文件夹已正确同步到 `android/app/src/main/assets/public`

### Q: 无法连接到服务器

**解决方案：**
1. **模拟器**：如果服务器在本地，使用 `10.0.2.2` 代替 `localhost`
2. **真机**：确保设备和服务器在同一 Wi-Fi 网络
3. 检查防火墙设置
4. 确认服务器地址和端口正确

### Q: ADB 找不到设备

**解决方案：**
1. 检查 USB 连接
2. 确认已启用 USB 调试
3. 安装设备驱动程序（如果需要）
4. 尝试不同的 USB 端口或 USB 线
5. 重启 ADB：
   ```powershell
   adb kill-server
   adb start-server
   adb devices
   ```

---

## 📊 查看应用日志

在 Android Studio 中查看实时日志：

1. 打开 **Logcat** 窗口（底部工具栏）
2. 选择您的设备
3. 选择应用包名：`com.jitri.lims`
4. 查看日志输出

或使用命令行：

```powershell
# 查看所有日志
adb logcat

# 只查看应用日志
adb logcat | grep "lims"

# 清除日志
adb logcat -c
```

---

## 🚀 快速预览命令

已为您添加了便捷命令（在 `package.json` 中）：

```powershell
# 构建、同步并打开 Android Studio
npm run android:open

# 构建并同步
npm run android:build

# 构建 Release APK
npm run android:apk

# 安装到设备
npm run android:install
```

---

## 📝 下一步

预览成功后，您可以：
- ✅ 测试所有功能
- ✅ 检查移动端 UI/UX
- ✅ 测试网络连接和 API 调用
- ✅ 收集用户反馈
- ✅ 优化性能和体验
- ✅ 准备发布到应用商店

---

## 💡 提示

- **首次运行**：应用可能需要一些时间来加载资源
- **网络测试**：确保在不同网络环境下测试（Wi-Fi、移动数据）
- **性能监控**：使用 Android Studio 的 Profiler 监控应用性能
- **崩溃报告**：考虑集成崩溃报告工具（如 Firebase Crashlytics）

祝您测试顺利！🎉


