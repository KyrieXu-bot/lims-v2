# 中文文件名乱码问题修复说明

## 问题描述

在上传包含中文字符的文件时，可能会出现文件名乱码的问题，这通常是由于编码处理不当导致的。

## 修复方案

### 1. 后端编码处理

#### 添加文件名解码函数
```javascript
// 处理中文文件名编码的辅助函数
function decodeFileName(originalName) {
  try {
    // 尝试从latin1解码为utf8
    return Buffer.from(originalName, 'latin1').toString('utf8');
  } catch (error) {
    // 如果解码失败，返回原始名称
    console.warn('文件名解码失败:', error.message);
    return originalName;
  }
}
```

#### 在multer配置中使用解码函数
```javascript
filename: (req, file, cb) => {
  // 处理中文文件名编码问题
  const originalName = decodeFileName(file.originalname);
  const uniqueName = `${uuidv4()}_${originalName}`;
  cb(null, uniqueName);
}
```

#### 在文件上传处理中使用解码函数
```javascript
// 处理中文文件名编码
const originalName = decodeFileName(req.file.originalname);

// 存储到数据库时使用解码后的文件名
const [result] = await pool.query(
  `INSERT INTO project_files 
   (category, filename, filepath, order_id, test_item_id, sample_id, uploaded_by) 
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [category, originalName, req.file.path, ...]
);
```

#### 在文件下载时设置正确的响应头
```javascript
// 设置正确的响应头，支持中文文件名
res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
res.download(file.filepath, file.filename);
```

### 2. 数据库配置

确保数据库连接使用正确的字符集：
```javascript
pool = mysql.createPool({
  // ... 其他配置
  charset: 'utf8mb4'  // 支持完整的UTF-8字符集
});
```

### 3. 前端处理

前端组件会自动处理从后端返回的正确编码的文件名，无需额外处理。

## 修复的文件

1. **server/src/routes/files.js**
   - 添加了`decodeFileName`辅助函数
   - 在multer配置中处理文件名编码
   - 在文件上传和下载时使用正确的编码
   - 设置正确的HTTP响应头

2. **数据库配置**
   - 确认使用utf8mb4字符集（已在db.js中配置）

## 测试方法

### 1. 使用测试页面
访问 `/files/test` 页面（如果添加了测试路由）进行中文文件名测试。

### 2. 手动测试步骤
1. 准备包含中文的文件（如：`测试文档.pdf`、`实验数据.xlsx`等）
2. 在检测项目处理页面点击"文件"按钮
3. 上传包含中文的文件
4. 检查上传后文件名是否正确显示
5. 测试文件下载功能，确认下载的文件名是否正确

### 3. 数据库验证
检查数据库中的`project_files`表，确认`filename`字段存储的是正确的中文文件名。

## 编码处理原理

### 问题原因
- 浏览器在上传文件时，文件名可能以latin1编码发送
- 服务器直接使用原始文件名会导致中文字符显示为乱码
- 需要将latin1编码的文件名转换为UTF-8编码

### 解决方案
1. **解码**: 使用`Buffer.from(originalName, 'latin1').toString('utf8')`将latin1编码转换为UTF-8
2. **存储**: 在数据库中存储UTF-8编码的文件名
3. **下载**: 使用RFC 6266标准的`filename*=UTF-8''`格式设置下载文件名

## 注意事项

1. **向后兼容**: 如果解码失败，会返回原始文件名，确保系统不会崩溃
2. **错误处理**: 添加了try-catch来处理可能的编码错误
3. **日志记录**: 解码失败时会记录警告日志，便于调试

## 验证结果

修复后，系统应该能够：
- ✅ 正确显示包含中文的文件名
- ✅ 正确存储中文文件名到数据库
- ✅ 正确下载包含中文的文件名
- ✅ 在各种浏览器中正常工作
