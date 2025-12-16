# iOS 应用图标更换指南

本指南将帮助您更换 iOS 应用的图标。

## 图标要求

iOS 应用图标需要满足以下要求：

1. **尺寸**：1024x1024 像素（@1x，即实际尺寸）
2. **格式**：PNG 格式（推荐）或 JPEG
3. **设计规范**：
   - 图标应该是正方形
   - 不要添加圆角（iOS 会自动添加）
   - 不要添加阴影或边框
   - 图标内容应该居中，四周留出约 10% 的安全边距
   - 背景可以是透明或纯色

## 方法一：使用 Xcode 图形界面（推荐）

### 步骤 1：准备图标文件

1. 准备一个 1024x1024 像素的 PNG 图标文件
2. 将文件命名为 `AppIcon.png`（或任何您喜欢的名称）

### 步骤 2：在 Xcode 中替换图标

1. 打开 Xcode 项目：
   ```bash
   cd client
   npx cap open ios
   ```

2. 在 Xcode 左侧导航栏中，找到并展开：
   - `App` > `App` > `Assets.xcassets` > `AppIcon`

3. 您会看到图标占位符，当前只有一个 1024x1024 的图标位置

4. **替换图标**：
   - 将您的图标文件拖拽到对应的图标槽位中
   - 或者点击图标槽位，在文件选择器中选择您的图标文件

5. **保存更改**：
   - Xcode 会自动保存更改
   - 图标文件会被复制到项目中

### 步骤 3：重新构建应用

1. 在 Xcode 中，选择菜单：**Product** > **Clean Build Folder**（或按 `Shift + Cmd + K`）
2. 重新运行应用：**Product** > **Run**（或按 `Cmd + R`）

## 方法二：直接替换文件

### 步骤 1：准备图标文件

准备一个 1024x1024 像素的 PNG 图标文件，命名为 `AppIcon-512@2x.png`

### 步骤 2：替换文件

1. 找到图标目录：
   ```
   client/ios/App/App/Assets.xcassets/AppIcon.appiconset/
   ```

2. 备份现有图标（可选）：
   ```bash
   cd client/ios/App/App/Assets.xcassets/AppIcon.appiconset/
   cp AppIcon-512@2x.png AppIcon-512@2x.png.backup
   ```

3. 替换图标文件：
   ```bash
   # 将您的新图标文件复制到该目录
   cp /path/to/your/icon.png AppIcon-512@2x.png
   ```

### 步骤 3：更新 Contents.json（如果需要）

如果您的图标文件名不同，需要更新 `Contents.json` 文件：

```json
{
  "images" : [
    {
      "filename" : "您的图标文件名.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### 步骤 4：重新构建应用

在 Xcode 中清理并重新构建应用。

## 方法三：使用 Capacitor Assets 工具（高级）

Capacitor 提供了命令行工具来生成所有尺寸的图标：

1. 准备一个 1024x1024 的源图标文件（例如：`icon.png`）

2. 安装 Capacitor Assets 工具（如果还没有）：
   ```bash
   npm install -g @capacitor/assets
   ```

3. 生成图标：
   ```bash
   cd client
   npx capacitor-assets generate --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#000000' --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#000000'
   ```

   或者直接使用源图标：
   ```bash
   # 将您的图标文件放在 client 目录下，命名为 icon.png
   npx capacitor-assets generate
   ```

4. 同步到 iOS：
   ```bash
   npx cap sync ios
   ```

## 验证图标

1. 在 Xcode 中运行应用
2. 在模拟器或真机上查看应用图标
3. 如果图标没有更新，尝试：
   - 删除应用并重新安装
   - 清理构建缓存（`Shift + Cmd + K`）
   - 重启模拟器/设备

## 常见问题

### Q: 图标显示不正确或模糊？

A: 确保图标尺寸是 1024x1024 像素，并且是 PNG 格式。

### Q: 图标没有更新？

A: 
1. 确保在 Xcode 中清理了构建缓存
2. 删除设备上的应用并重新安装
3. 检查图标文件是否正确替换

### Q: 需要为不同设备提供不同尺寸的图标吗？

A: 对于 iOS 13+，只需要一个 1024x1024 的图标即可，系统会自动生成其他尺寸。

### Q: 图标有圆角吗？

A: iOS 会自动为图标添加圆角，您不需要在图标设计中添加圆角。

## 图标设计建议

1. **简洁明了**：图标应该在小尺寸下也能清晰识别
2. **品牌一致性**：使用与您的品牌一致的颜色和风格
3. **避免文字**：图标中的文字在小尺寸下可能难以阅读
4. **测试不同背景**：iOS 允许用户选择深色/浅色背景，确保图标在两种背景下都好看

## 相关资源

- [Apple 人机界面指南 - 应用图标](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Capacitor Assets 文档](https://github.com/ionic-team/capacitor-assets)

