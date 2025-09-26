-- 委外信息表
CREATE TABLE IF NOT EXISTS outsource_info (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_item_id BIGINT UNSIGNED NOT NULL,
  outsource_supplier VARCHAR(255) COMMENT '委外供应商名称',
  outsource_contact VARCHAR(100) COMMENT '对接人',
  outsource_phone VARCHAR(20) COMMENT '对接人联系电话',
  outsource_price DECIMAL(10,2) COMMENT '委外价格',
  outsource_report_path VARCHAR(500) COMMENT '委外报告文件路径',
  return_tracking_number VARCHAR(100) COMMENT '寄回快递单号',
  outsource_status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '委外状态',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_test_item (test_item_id),
  FOREIGN KEY (test_item_id) REFERENCES test_items(test_item_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 为orders表添加结算状态字段
ALTER TABLE orders 
ADD COLUMN settlement_status ENUM('unpaid', 'paid', 'partial') DEFAULT 'unpaid' COMMENT '结算状态';

-- 为test_items表添加折扣后单价字段
ALTER TABLE test_items 
ADD COLUMN discounted_unit_price DECIMAL(10,2) COMMENT '折扣后单价';

-- 为test_items表添加备注字段
ALTER TABLE test_items 
ADD COLUMN remarks TEXT COMMENT '备注';

-- 为orders表添加备注字段
ALTER TABLE orders 
ADD COLUMN remarks TEXT COMMENT '备注';
