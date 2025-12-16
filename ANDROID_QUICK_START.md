# Android 打包快速开始

## 🚀 最简步骤（使用 Android Studio）

### 1. 安装 Android Studio
- 下载：https://developer.android.com/studio
- 安装并完成初始设置（会自动下载 Android SDK）

### 2. 构建并同步
```powershell
cd client
npm run android:build
```

### 3. 打开 Android Studio
```powershell
npm run android:open
```

### 4. 在 Android Studio 中构建 APK
1. 选择 **Build > Generate Signed Bundle / APK**
2. 选择 **APK**
3. 创建或选择签名密钥
4. 选择 **release** 构建类型
5. 点击 **Finish**

### 5. 找到 APK 文件
`client/android/app/release/app-release.apk`

---

## 📦 命令行方式（无需 Android Studio）

### 前提条件
- 安装 JDK 17+
- 安装 Android SDK Command-line Tools
- 配置环境变量

### 构建命令
```powershell
cd client
npm run build
npm run cap:sync:android
npm run android:apk
```

APK 文件位置：`client/android/app/build/outputs/apk/release/app-release.apk`

---

## 🔑 配置自动签名（推荐）

### 1. 生成密钥
在 Android Studio 中：**Build > Generate Signed Bundle / APK > Create new**

### 2. 创建 key.properties
在 `client/android/` 目录创建 `key.properties`：

```properties
storePassword=您的密码
keyPassword=您的密码
keyAlias=lims-key
storeFile=D:\\Projects\\lims-v2\\android-release-key.jks
```

### 3. 更新 build.gradle
参考 `ANDROID_BUILD_GUIDE.md` 中的详细说明

### 4. 一键构建
```powershell
npm run android:apk
```

---

## 📱 安装到设备

### 方法一：USB 连接
```powershell
npm run android:install
```

### 方法二：直接安装 APK
1. 将 APK 传输到手机
2. 在手机上点击 APK 文件安装

---

## 🆘 常见问题

**构建失败？**
- 检查是否安装了 Android SDK
- 确认 `ANDROID_HOME` 环境变量已设置

**找不到 gradlew.bat？**
- 确保在 `client/android` 目录下运行命令

**需要更多帮助？**
- 查看 `ANDROID_BUILD_GUIDE.md` 获取详细说明



