# Android 应用签名配置指南

## 📦 当前状态

您已经成功生成了 **Debug APK**，可以直接用于测试！

- **Debug APK 位置**：`client/android/app/build/outputs/apk/debug/app-debug.apk`
- **特点**：使用调试签名，无需配置，可直接安装测试

---

## 🚀 方案一：直接使用 Debug APK（推荐用于测试）

### 安装 Debug APK

**方法 1：通过命令行（最快）**
```powershell
cd client/android
.\gradlew.bat installDebug
```

**方法 2：手动安装**
1. 找到文件：`client/android/app/build/outputs/apk/debug/app-debug.apk`
2. 传输到 Android 设备
3. 在设备上点击 APK 文件安装

### Debug APK 的优缺点

✅ **优点：**
- 无需配置签名
- 可以直接安装测试
- 适合开发和内部测试

❌ **缺点：**
- 不能发布到应用商店
- 使用调试签名（不安全）
- 某些功能可能受限

---

## 🔐 方案二：配置签名生成 Release APK（用于发布）

如果您需要生成 Release APK（用于发布或分发给用户），需要配置签名密钥。

### 步骤 1：生成签名密钥

#### 方法 A：使用 Android Studio（图形界面，推荐）

1. 在 Android Studio 中，选择 **Build > Generate Signed Bundle / APK**
2. 选择 **APK**
3. 点击 **Create new...** 按钮
4. 填写密钥信息：
   - **Key store path**: 选择保存位置（例如：`D:\Projects\lims-v2\android-release-key.jks`）
   - **Password**: 设置密钥库密码（请记住！）
   - **Key alias**: 设置密钥别名（例如：`lims-key`）
   - **Key password**: 设置密钥密码（可以与密钥库密码相同）
   - **Validity**: 25 年（推荐）
   - **Certificate**: 填写您的信息
     - First and Last Name: 您的姓名或公司名
     - Organizational Unit: 部门（可选）
     - Organization: 公司名（可选）
     - City: 城市
     - State: 省份
     - Country Code: CN（中国）
5. 点击 **OK** 创建密钥

#### 方法 B：使用命令行（高级）

```powershell
# 进入 Java bin 目录（JDK 安装路径）
cd "C:\Program Files\Java\jdk-17\bin"

# 生成密钥
keytool -genkey -v -keystore D:\Projects\lims-v2\android-release-key.jks -alias lims-key -keyalg RSA -keysize 2048 -validity 10000

# 按提示输入信息
# - 密钥库密码
# - 密钥密码
# - 姓名、组织等信息
```

### 步骤 2：配置自动签名

创建 `client/android/key.properties` 文件（**不要提交到 Git**）：

```properties
storePassword=您的密钥库密码
keyPassword=您的密钥密码
keyAlias=lims-key
storeFile=D:\\Projects\\lims-v2\\android-release-key.jks
```

**⚠️ 重要：**
- 将路径中的反斜杠改为双反斜杠 `\\` 或使用正斜杠 `/`
- 确保路径是绝对路径
- 这个文件包含敏感信息，不要提交到版本控制

### 步骤 3：更新 build.gradle

修改 `client/android/app/build.gradle`，在 `android` 块之前添加：

```gradle
// 加载签名配置
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

apply plugin: 'com.android.application'

android {
    namespace = "com.jitri.lims"
    compileSdk = rootProject.ext.compileSdkVersion
    
    // 签名配置
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
    
    defaultConfig {
        applicationId "com.jitri.lims"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        // ... 其他配置
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

### 步骤 4：生成 Release APK

#### 方法 A：使用 Android Studio

1. **Build > Generate Signed Bundle / APK**
2. 选择 **APK**
3. 现在应该能看到您的密钥配置
4. 选择 **release** 构建类型
5. 点击 **Finish**
6. APK 将位于：`client/android/app/release/app-release.apk`

#### 方法 B：使用命令行

```powershell
cd client/android
.\gradlew.bat assembleRelease
```

Release APK 位置：`client/android/app/build/outputs/apk/release/app-release.apk`

---

## 🔒 密钥安全提示

**⚠️ 非常重要：**

1. **备份密钥文件**：密钥文件（.jks）丢失后无法恢复，无法更新应用
2. **保护密码**：妥善保管密钥库密码和密钥密码
3. **不要提交到 Git**：确保 `key.properties` 和 `.jks` 文件在 `.gitignore` 中
4. **多份备份**：建议将密钥文件备份到安全的地方（加密存储）

---

## 📝 快速参考

### 当前可用的 APK

- ✅ **Debug APK**（已生成）：`client/android/app/build/outputs/apk/debug/app-debug.apk`
- ❌ **Release APK**（需要签名）：配置签名后生成

### 安装命令

```powershell
# 安装 Debug 版本
cd client/android
.\gradlew.bat installDebug

# 安装 Release 版本（配置签名后）
.\gradlew.bat installRelease
```

### 检查签名配置

```powershell
# 检查 APK 签名信息
cd client/android
.\gradlew.bat signingReport
```

---

## 🎯 建议

**对于测试和预览：**
- ✅ 直接使用 Debug APK
- ✅ 无需配置签名
- ✅ 可以立即安装测试

**对于发布和分发：**
- 🔐 配置签名密钥
- 📦 生成 Release APK
- 🚀 准备发布到应用商店

---

## ❓ 常见问题

### Q: Debug APK 和 Release APK 有什么区别？

**Debug APK：**
- 使用调试签名
- 包含调试信息
- 文件较大
- 不能发布到应用商店

**Release APK：**
- 使用发布签名
- 已优化（如果启用混淆）
- 文件较小
- 可以发布到应用商店

### Q: 我可以一直使用 Debug APK 吗？

可以用于开发和测试，但：
- 不能发布到应用商店
- 不适合分发给最终用户
- 安全性较低

### Q: 忘记密钥密码怎么办？

无法恢复。如果丢失：
- 无法更新已发布的应用
- 需要创建新密钥
- 需要重新发布应用（使用新的包名或作为新应用）

### Q: 如何更新应用版本号？

修改 `client/android/app/build.gradle`：

```gradle
defaultConfig {
    versionCode 2  // 递增此数字（每次发布必须增加）
    versionName "1.0.1"  // 更新版本名称
}
```

---

现在您可以选择：
1. **直接使用 Debug APK 进行测试**（最简单）
2. **配置签名生成 Release APK**（用于发布）

祝您测试顺利！🎉


