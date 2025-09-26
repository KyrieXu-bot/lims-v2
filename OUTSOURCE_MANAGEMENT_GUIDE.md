# 委外管理和委托单管理功能说明

## 功能概述

本次更新添加了两个重要的管理功能：

### 1. 委外管理 (Outsource Management)
- **访问权限**: 只有管理员和工号为'YWQXM'的用户可以访问
- **功能位置**: 导航栏中的"委外管理"菜单
- **主要功能**:
  - 查看所有委外检测项目
  - 填写委外方信息（供应商、对接人、联系电话、委外价格）
  - 上传委外报告
  - 填写寄回快递单号
  - 管理委外状态（待处理、进行中、已完成、已取消）

### 2. 委托单管理 (Order Management)
- **访问权限**: 所有角色都可以访问
- **功能位置**: 导航栏中的"委托单管理"菜单
- **主要功能**:
  - 查看所有委托单的统计信息
  - 分别查看内部委托和委外委托详情
  - 管理结算状态（未付款、部分付款、已付款）

## 数据库结构

### 新增表: outsource_info
```sql
CREATE TABLE outsource_info (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_item_id INT NOT NULL,
  outsource_supplier VARCHAR(255) COMMENT '委外供应商名称',
  outsource_contact VARCHAR(100) COMMENT '对接人',
  outsource_phone VARCHAR(20) COMMENT '对接人联系电话',
  outsource_price DECIMAL(10,2) COMMENT '委外价格',
  outsource_report_path VARCHAR(500) COMMENT '委外报告文件路径',
  return_tracking_number VARCHAR(100) COMMENT '寄回快递单号',
  outsource_status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_test_item (test_item_id),
  FOREIGN KEY (test_item_id) REFERENCES test_items(test_item_id) ON DELETE CASCADE
);
```

### 新增字段
- `orders.settlement_status`: 结算状态
- `test_items.discounted_unit_price`: 折扣后单价
- `test_items.remarks`: 备注
- `orders.remarks`: 备注

## API 端点

### 委外管理 API
- `GET /api/outsource` - 获取委外检测项目列表
- `PUT /api/outsource/:id` - 更新委外信息
- `POST /api/outsource/:id/report` - 上传委外报告
- `PUT /api/outsource/:id/tracking` - 更新快递单号
- `POST /api/outsource/:id/complete` - 完成委外检测

### 委托单管理 API
- `GET /api/orders` - 获取委托单列表
- `GET /api/orders/internal/:id` - 获取内部委托详情
- `GET /api/orders/outsource/:id` - 获取委外委托详情
- `PUT /api/orders/:id/settlement` - 更新结算状态
- `GET /api/orders/stats` - 获取统计信息

## 使用说明

### 委外管理流程
1. 检测项目状态为"委外"时，会出现在委外管理列表中
2. 秦肖蒙（YWQXM）或管理员可以：
   - 填写委外方信息（供应商、对接人、联系电话、价格）
   - 上传委外检测报告
   - 填写样品寄回的快递单号
   - 更新委外状态
   - 完成委外检测

### 委托单管理流程
1. 查看委托单统计信息（总数量、金额、付款状态等）
2. 点击"内部详情"查看内部检测项目详情
3. 点击"委外详情"查看委外检测项目详情
4. 管理员可以更新结算状态

## 权限控制

- **委外管理**: 只有管理员和工号为'YWQXM'的用户可见
- **委托单管理**: 所有角色都可以访问
- **结算状态更新**: 只有管理员可以修改

## 文件结构

```
client/src/pages/
├── outsource/
│   └── OutsourceManagement.jsx    # 委外管理页面
└── orders/
    └── OrderManagement.jsx        # 委托单管理页面

server/src/routes/
├── outsource.js                   # 委外管理后端路由
└── orders.js                      # 委托单管理后端路由
```

## 注意事项

1. 委外管理功能需要先运行数据库脚本 `outsource_schema.sql`
2. 文件上传功能需要配置相应的文件存储路径
3. 权限控制基于用户角色和工号，确保只有授权用户可以访问
4. 所有API都需要用户认证才能访问

## 后续扩展

根据业务需求，可以考虑添加以下功能：
- 委外供应商管理
- 委外费用统计
- 委托单导出功能
- 更详细的财务统计
- 委外进度跟踪

