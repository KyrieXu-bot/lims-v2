-- 样品追踪表
CREATE TABLE IF NOT EXISTS `sample_tracking` (
  `tracking_id` int NOT NULL AUTO_INCREMENT,
  `test_item_id` int NOT NULL COMMENT '关联的检测项目ID',
  `order_id` varchar(100) NOT NULL COMMENT '委托单号',
  `category_name` varchar(255) NOT NULL COMMENT '大类名称',
  `sample_name` varchar(255) DEFAULT NULL COMMENT '样品名称',
  `material` varchar(255) DEFAULT NULL COMMENT '材质',
  `original_no` varchar(255) DEFAULT NULL COMMENT '样品原号',
  `barcode` varchar(255) NOT NULL COMMENT '扫码内容（可能是test_item_id或其他标识）',
  `current_status` enum('received','testing_completed','returned') NOT NULL DEFAULT 'received' COMMENT '当前状态：received-已接收，testing_completed-检测完成，returned-已回收',
  `lab_type` enum('mechanics','microscopy','physical_chemistry') NOT NULL COMMENT '实验室类型：mechanics-力学，microscopy-显微，physical_chemistry-物化',
  `received_by` varchar(100) DEFAULT NULL COMMENT '接收人员工号',
  `received_at` datetime DEFAULT NULL COMMENT '接收时间',
  `testing_completed_by` varchar(100) DEFAULT NULL COMMENT '检测完成人员工号',
  `testing_completed_at` datetime DEFAULT NULL COMMENT '检测完成时间',
  `returned_by` varchar(100) DEFAULT NULL COMMENT '回收人员工号',
  `returned_at` datetime DEFAULT NULL COMMENT '回收时间',
  `notes` text DEFAULT NULL COMMENT '备注信息',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tracking_id`),
  KEY `idx_test_item_id` (`test_item_id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_barcode` (`barcode`),
  KEY `idx_current_status` (`current_status`),
  KEY `idx_lab_type` (`lab_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品追踪表';

-- 样品回收信息表（用于记录寄回客户等信息）
CREATE TABLE IF NOT EXISTS `sample_return_info` (
  `return_info_id` int NOT NULL AUTO_INCREMENT,
  `tracking_id` int NOT NULL COMMENT '关联样品追踪ID',
  `test_item_id` int NOT NULL COMMENT '检测项目ID',
  `return_method` enum('pickup','delivery','disposal') NOT NULL COMMENT '回收方式：pickup-客户自取，delivery-寄回客户，disposal-销毁处理',
  `return_tracking_no` varchar(255) DEFAULT NULL COMMENT '寄送单号',
  `return_status` enum('pending','shipped','delivered','picked_up') DEFAULT 'pending' COMMENT '回收状态',
  `return_notes` text DEFAULT NULL COMMENT '回收备注',
  `returned_by` varchar(100) DEFAULT NULL COMMENT '处理人员工号',
  `returned_at` datetime DEFAULT NULL COMMENT '处理时间',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`return_info_id`),
  KEY `idx_tracking_id` (`tracking_id`),
  KEY `idx_test_item_id` (`test_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样品回收信息表';
