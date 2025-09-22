# 简化文件上传系统使用指南

## 概述

根据您的需求，我已经创建了一个简化的文件上传系统，直接嵌入到检测项目处理页面中，无需单独的文件管理模块。

## 功能特点

### 🎯 **简洁高效**
- 直接在检测项目列表中点击"文件"按钮即可管理文件
- 无需跳转页面，弹窗式文件管理
- 三大文件分类：委托单附件、实验原始数据、实验报告

### 🔐 **权限控制**
- **开单员 (sales)**: 可以上传委托单附件
- **实验员 (employee)**: 可以上传原始数据和报告
- **组长/主管 (leader/supervisor)**: 可以上传所有类型文件，删除文件
- **管理员 (admin)**: 完全权限

## 使用方法

### 1. 在检测项目处理页面
1. 进入"检测项目处理"页面
2. 在任意检测项目的操作列中点击"文件"按钮
3. 在弹出的文件管理窗口中：
   - 选择文件类别（委托单附件/实验原始数据/实验报告）
   - 点击"选择文件"按钮上传文件
   - 查看、下载或删除已有文件

### 2. 文件分类说明
- **委托单附件** 📄 - 开单员上传的委托单相关文件
- **实验原始数据** 🔬 - 实验员上传的实验数据
- **实验报告** 📊 - 实验员上传的实验报告

## 技术实现

### 组件结构
```
TestItems.jsx (检测项目处理页面)
├── 添加"文件"按钮到操作列
├── 文件查看弹窗
└── SimpleFileUpload.jsx (文件管理组件)
    ├── 三个分类标签页
    ├── 文件上传功能
    ├── 文件列表显示
    └── 文件下载/删除功能
```

### 权限控制逻辑
```javascript
// 根据用户角色显示不同功能
const canUpload = ['admin', 'leader', 'supervisor', 'employee', 'sales'].includes(userRole);
const canDelete = ['admin', 'leader', 'supervisor'].includes(userRole);
```

## 修复的问题

### 1. 401认证错误
- 修复了token获取方式，使用`localStorage.getItem('lims_user')`而不是`localStorage.getItem('token')`
- 确保所有API请求都包含正确的Authorization头

### 2. 文件分类简化
- 从7个分类简化为3个核心分类
- 更新了数据库表结构和后端验证

### 3. 界面集成
- 直接在检测项目列表中集成文件管理
- 使用弹窗方式，无需跳转页面
- 响应式设计，支持移动端

## 数据库更新

运行以下SQL更新文件分类：

```sql
-- 更新现有数据的分类
UPDATE project_files SET category = 'order_attachment' WHERE category IN ('order', 'test_item', 'sample');
UPDATE project_files SET category = 'raw_data' WHERE category IN ('raw_record', 'photo');
UPDATE project_files SET category = 'experiment_report' WHERE category IN ('outsourcing_report', 'other');

-- 修改表结构
ALTER TABLE project_files 
MODIFY COLUMN category ENUM('order_attachment','raw_data','experiment_report') NOT NULL COMMENT '文件类别';
```

## 部署步骤

1. ✅ 安装依赖: `npm install multer uuid`
2. ✅ 创建uploads目录
3. ✅ 更新数据库表结构
4. ✅ 重启服务器
5. ✅ 测试文件上传功能

## 测试方法

1. 登录系统
2. 进入"检测项目处理"页面
3. 点击任意检测项目的"文件"按钮
4. 尝试上传不同类别的文件
5. 测试文件下载和删除功能

## 故障排除

### 1. 401 Unauthorized
- 检查用户是否已登录
- 确认localStorage中有lims_user数据
- 检查token是否有效

### 2. 文件上传失败
- 检查服务器是否运行在端口3001
- 确认uploads目录存在且有写入权限
- 检查文件大小是否超过50MB限制

### 3. 文件下载失败
- 检查文件是否存在于服务器
- 确认文件路径正确
- 检查权限设置

这个简化版本更加符合您的需求：简洁、高效、直接集成在检测项目处理页面中，无需额外的文件管理模块。
