-- 设备预约功能表结构
-- 请在确认线上库表名/字符集后手动执行；Codex 未执行本脚本。

CREATE TABLE IF NOT EXISTS `equipment_bookings` (
  `booking_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '预约ID',
  `equipment_id` int NOT NULL COMMENT '设备ID，对应 equipment.equipment_id',
  `booker_id` varchar(20) NOT NULL COMMENT '预约人，对应 users.user_id',
  `start_time` datetime(3) NOT NULL COMMENT '预约开始时间，允许跨天',
  `end_time` datetime(3) NOT NULL COMMENT '预约结束时间，必须晚于开始时间',
  `order_id` varchar(20) DEFAULT NULL COMMENT '可选绑定委托单号',
  `test_item_id` bigint unsigned DEFAULT NULL COMMENT '可选绑定检测项目ID',
  `note` varchar(800) DEFAULT NULL COMMENT '预约备注',
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active' COMMENT '预约状态',
  `cancelled_by` varchar(20) DEFAULT NULL COMMENT '取消人',
  `cancelled_at` datetime(3) DEFAULT NULL COMMENT '取消时间',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`booking_id`),
  KEY `idx_equipment_bookings_equipment_time` (`equipment_id`, `status`, `start_time`, `end_time`),
  KEY `idx_equipment_bookings_booker_time` (`booker_id`, `status`, `start_time`),
  KEY `idx_equipment_bookings_order` (`order_id`),
  KEY `idx_equipment_bookings_test_item` (`test_item_id`),
  KEY `fk_equipment_bookings_cancelled_by` (`cancelled_by`),
  CONSTRAINT `fk_equipment_bookings_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`equipment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_booker` FOREIGN KEY (`booker_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_cancelled_by` FOREIGN KEY (`cancelled_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_equipment_bookings_test_item` FOREIGN KEY (`test_item_id`) REFERENCES `test_items` (`test_item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_equipment_bookings_time` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备预约记录';

-- 可选：如果希望设备列表按部门检索更快，可以补充这个索引。
-- ALTER TABLE `equipment` ADD INDEX `idx_equipment_department_status` (`department_id`, `status`);
