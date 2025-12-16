# Android 应用打包指南（Windows）

本指南将帮助您在 Windows 系统上将 LIMS v2.0 打包为 Android APK 文件。

## 🛠️ 推荐工具

### 方案一：Android Studio（推荐 ⭐）

**优点：**
- 官方开发工具，功能最完整
- 图形化界面，操作简单
- 内置 Gradle 构建系统
- 支持模拟器和真机调试
- 可以生成签名 APK 和 AAB（用于 Google Play）

**下载地址：**
- 官网：https://developer.android.com/studio
- 大小：约 1GB
- 系统要求：Windows 7/8/10/11，至少 8GB RAM

**安装步骤：**
1. 下载 Android Studio 安装包
2. 运行安装程序，选择"标准安装"
3. 安装完成后启动，会自动下载 Android SDK
4. 等待 SDK 下载完成（首次安装可能需要较长时间）

### 方案二：命令行方式（轻量级）

**优点：**
- 不需要安装完整的 Android Studio
- 只需要 JDK 和 Android SDK
- 适合 CI/CD 自动化构建

**缺点：**
- 需要手动配置环境变量
- 没有图形界面

### 方案三：使用 WSL2（可选）

如果您熟悉 Linux 环境，可以在 WSL2 中安装 Android SDK 和 Gradle。

---

## 📋 前置要求

### 必需软件

1. **Java Development Kit (JDK)**
   - 版本：JDK 17 或更高（推荐 JDK 17 LTS）
   - 下载：https://adoptium.net/ 或 Oracle JDK
   - 安装后需要配置 `JAVA_HOME` 环境变量

2. **Node.js 和 npm**
   - 您应该已经安装了（用于构建 Web 应用）

3. **Android SDK**
   - 如果使用 Android Studio，会自动安装
   - 如果使用命令行，需要单独下载

---

## 🚀 完整打包步骤（使用 Android Studio）

### 第一步：安装 Android Studio

1. 从官网下载并安装 Android Studio
2. 启动 Android Studio，完成初始设置
3. 在欢迎界面，点击 **More Actions > SDK Manager**
4. 确保安装以下组件：
   - Android SDK Platform 36（或您项目配置的版本）
   - Android SDK Build-Tools
   - Android SDK Command-line Tools
   - Android SDK Platform-Tools

### 第二步：配置环境变量（可选但推荐）

将以下路径添加到系统环境变量 `PATH`：

```
%LOCALAPPDATA%\Android\Sdk\platform-tools
%LOCALAPPDATA%\Android\Sdk\tools
%LOCALAPPDATA%\Android\Sdk\tools\bin
```

### 第三步：构建 Web 应用

在项目根目录打开 PowerShell 或 CMD：

```powershell
cd client
npm install
npm run build
```

这会生成 `dist` 文件夹。

### 第四步：同步到 Android

```powershell
npm run cap:sync:android
```

或者使用便捷命令：

```powershell
npm run android:build
```

### 第五步：在 Android Studio 中打开项目

```powershell
npm run cap:open:android
```

或者手动打开：
- 启动 Android Studio
- 选择 **File > Open**
- 选择 `client/android` 文件夹

### 第六步：配置签名（用于发布）

#### 6.1 生成签名密钥

在 Android Studio 中：
1. 选择 **Build > Generate Signed Bundle / APK**
2. 选择 **APK** 或 **Android App Bundle**
3. 如果没有密钥，点击 **Create new...**
4. 填写密钥信息：
   - Key store path: 选择保存位置（例如：`D:\Projects\lims-v2\android-release-key.jks`）
   - Password: 设置密钥库密码
   - Key alias: 设置密钥别名（例如：`lims-key`）
   - Key password: 设置密钥密码
   - Validity: 25 年（推荐）
   - Certificate: 填写您的信息

**⚠️ 重要：请妥善保管密钥文件，丢失后无法更新应用！**

#### 6.2 配置自动签名（推荐）

创建 `client/android/key.properties` 文件（**不要提交到 Git**）：

```properties
storePassword=您的密钥库密码
keyPassword=您的密钥密码
keyAlias=lims-key
storeFile=D:\\Projects\\lims-v2\\android-release-key.jks
```

然后修改 `client/android/app/build.gradle`，在 `android` 块之前添加：

```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

在 `android` 块中添加 `signingConfigs`：

```gradle
android {
    // ... 其他配置
    
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### 第七步：构建 APK

#### 方法一：使用 Android Studio（图形界面）

1. 选择 **Build > Generate Signed Bundle / APK**
2. 选择 **APK**
3. 选择签名配置（如果已配置）
4. 选择 **release** 构建类型
5. 点击 **Finish**
6. 等待构建完成
7. APK 文件将位于：`client/android/app/release/app-release.apk`

#### 方法二：使用命令行（更快）

在 `client/android` 目录下：

```powershell
# Windows
.\gradlew.bat assembleRelease

# 如果使用 Git Bash 或 WSL
./gradlew assembleRelease
```

构建完成后，APK 文件位于：
`client/android/app/build/outputs/apk/release/app-release.apk`

### 第八步：安装到设备

#### 方法一：通过 USB 连接

1. 在 Android 设备上启用 **开发者选项**：
   - 设置 > 关于手机 > 连续点击"版本号" 7 次
2. 启用 **USB 调试**：
   - 设置 > 系统 > 开发者选项 > USB 调试
3. 连接设备到电脑
4. 在 Android Studio 中点击运行按钮，或使用命令：

```powershell
cd client/android
.\gradlew.bat installRelease
```

#### 方法二：直接安装 APK

1. 将 APK 文件传输到 Android 设备
2. 在设备上打开文件管理器
3. 点击 APK 文件进行安装
4. 如果提示"未知来源"，需要在设置中允许安装未知应用

---

## 🔧 命令行方式（不使用 Android Studio）

如果您不想安装完整的 Android Studio，可以只安装必要的组件：

### 1. 安装 JDK

下载并安装 JDK 17，配置 `JAVA_HOME` 环境变量。

### 2. 安装 Android SDK Command-line Tools

1. 下载：https://developer.android.com/studio#command-tools
2. 解压到：`C:\Android\sdk`
3. 运行 SDK Manager 安装必要的组件：

```powershell
# 设置环境变量
$env:ANDROID_HOME = "C:\Android\sdk"
$env:PATH += ";$env:ANDROID_HOME\tools\bin;$env:ANDROID_HOME\platform-tools"

# 安装 SDK
sdkmanager "platform-tools" "platforms;android-36" "build-tools;34.0.0"
```

### 3. 构建 APK

```powershell
cd client
npm run build
npm run cap:sync:android
cd android
.\gradlew.bat assembleRelease
```

---

## 📦 构建类型说明

### Debug APK
- 用于开发和测试
- 包含调试信息
- 未签名或使用调试签名
- 构建命令：`gradlew assembleDebug`

### Release APK
- 用于发布
- 已优化和混淆（如果启用）
- 需要签名
- 构建命令：`gradlew assembleRelease`

### Android App Bundle (AAB)
- Google Play 推荐格式
- 文件更小，支持动态分发
- 只能通过 Google Play 安装
- 构建命令：`gradlew bundleRelease`

---

## 🐛 常见问题

### Q: 构建失败，提示找不到 SDK

**解决方案：**
1. 检查 `ANDROID_HOME` 环境变量是否正确设置
2. 在 `android/local.properties` 文件中添加：
   ```properties
   sdk.dir=C:\\Users\\YourUsername\\AppData\\Local\\Android\\Sdk
   ```

### Q: Gradle 下载缓慢

**解决方案：**
1. 配置 Gradle 使用国内镜像（修改 `android/gradle/wrapper/gradle-wrapper.properties`）
2. 或使用代理

### Q: 签名错误

**解决方案：**
1. 确保 `key.properties` 文件路径正确（使用双反斜杠或正斜杠）
2. 检查密码是否正确
3. 确保密钥文件存在

### Q: 应用安装后无法打开

**解决方案：**
1. 检查 `capacitor.config.json` 中的服务器地址是否正确
2. 确保设备可以访问服务器（同一网络或使用公网地址）
3. 检查 AndroidManifest.xml 中的权限配置

### Q: 如何更新应用版本号？

修改 `client/android/app/build.gradle`：

```gradle
defaultConfig {
    versionCode 2  // 递增此数字
    versionName "1.0.1"  // 更新版本名称
}
```

---

## 📱 测试建议

### 在真机上测试

1. **连接设备**：通过 USB 连接 Android 设备
2. **启用 USB 调试**：在设备上启用开发者选项和 USB 调试
3. **运行应用**：在 Android Studio 中点击运行，或使用 `gradlew installRelease`

### 使用模拟器

1. 在 Android Studio 中打开 **AVD Manager**
2. 创建虚拟设备
3. 启动模拟器
4. 运行应用

---

## 🚀 发布到应用商店

### Google Play Store

1. 构建 AAB 文件：`gradlew bundleRelease`
2. 登录 Google Play Console
3. 创建新应用或更新现有应用
4. 上传 AAB 文件
5. 填写应用信息、截图等
6. 提交审核

### 其他应用商店

- 华为应用市场
- 小米应用商店
- OPPO 软件商店
- vivo 应用商店
- 应用宝等

每个商店都有自己的上传和审核流程。

---

## 📝 下一步

打包成功后，您可以：
- 在真机上测试应用功能
- 根据测试结果优化 UI/UX
- 配置应用图标和启动画面
- 准备应用商店上架材料
- 设置自动更新机制

---

## 🔗 相关资源

- [Android Studio 官方文档](https://developer.android.com/studio)
- [Capacitor Android 文档](https://capacitorjs.com/docs/android)
- [Gradle 构建指南](https://developer.android.com/studio/build)
- [Android 应用签名](https://developer.android.com/studio/publish/app-signing)



